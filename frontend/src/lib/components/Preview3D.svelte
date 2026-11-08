<script lang="ts">

	import { BufferAttribute, BufferGeometry, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { buildBodyModel } from '$lib/cloth/body';
	import { buildMannequin, lightStudio, fabricLook } from '$lib/cloth/studio';
	import { COLOURS, FINISHES, defaultColour, defaultFinish, finishById, isHex, surfaceUVs, type FinishId } from '$lib/cloth/appearance';
	import { untrack } from 'svelte';
	import { buildGarment } from '$lib/cloth/assembly';
	import { FABRIC_DEFAULTS, fabricFor, measuredFabric, type Fabric } from '$lib/cloth/fabrics';
	import type { BodyGender } from '$lib/cloth/body';
	import { createSimulation, type ClothPiece } from '$lib/cloth/physics';
	import { computeBodyFieldGpu, createGpuSimulation, gpuDevice } from '$lib/cloth/gpu';
	import { createContactSurface } from '$lib/cloth/surface';
	import { t } from '$lib/i18n';
	import type { Piece } from '$lib/types';

	interface Props {
		measurements: Record<string, number>;
		pieces: Piece[];
		/** Модель из каталога: платье и жилет - верх без рукавов, а не низ. */
		model?: string;
		/** Пол фигуры манекена; без него угадывается по меркам. */
		gender?: BodyGender;
	}

	let { measurements, pieces, model: garmentModel, gender }: Props = $props();


	let container: HTMLDivElement | undefined = $state();
	// Полотно: класс по изделию и его измеренные параметры. Швея вводит
	// растяжение и плотность своей ткани - симуляция считает по ним.
	let fabricId = $state<Fabric['id'] | null>(null);
	let stretch = $state<number | null>(null);
	let warp = $state<number | null>(null);
	let weight = $state<number | null>(null);
	const currentId = $derived(fabricId ?? fabricFor(garmentModel).id);
	const currentStretch = $derived(stretch ?? FABRIC_DEFAULTS[currentId].weft);
	const currentWarp = $derived(warp ?? FABRIC_DEFAULTS[currentId].warp);
	const currentWeight = $derived(weight ?? FABRIC_DEFAULTS[currentId].weight);
	function pickFabric(id: Fabric['id']) {
		fabricId = id;
		stretch = null;
		warp = null;
		weight = null;
	}
	let failed = $state(false);
	/** Где считается ткань: на видеокарте (WebGPU) или на процессоре. */
	let backend = $state<'gpu' | 'cpu' | ''>('');
	let settled = $state(false);
	/** Габариты осевшей ткани, мм: для сверки видеокарты с процессором. */
	let extent = $state('');

	// Цвет и фактура: швея прикидывает, как вещь будет смотреться в её ткани.
	// Выбор запоминается в браузере - удобство, а не данные проекта.
	const LOOK_KEY = 'shityo.fabric-look.v1';
	function readLook(): { colour: string | null; finish: FinishId | null } {
		try {
			const raw = JSON.parse(localStorage.getItem(LOOK_KEY) ?? 'null');
			return {
				colour: isHex(raw?.colour) ? raw.colour : null,
				finish: finishById(raw?.finish)?.id ?? null
			};
		} catch {
			return { colour: null, finish: null };
		}
	}
	const savedLook = typeof localStorage === 'undefined' ? { colour: null, finish: null } : readLook();
	let colour = $state<string | null>(savedLook.colour);
	let finish = $state<FinishId | null>(savedLook.finish);
	const currentColour = $derived(
		colour ??
			defaultColour(
				garmentModel,
				pieces.some((p) => p.id === 'collar'),
				pieces.some((p) => p.id === 'sleeve')
			)
	);
	const currentFinish = $derived(finish ?? defaultFinish(currentId));
	function rememberLook() {
		try {
			localStorage.setItem(LOOK_KEY, JSON.stringify({ colour, finish }));
		} catch {
			/* хранилище недоступно: выбор живёт до перезагрузки */
		}
	}
	function pickColour(value: string) {
		if (!isHex(value)) return;
		colour = value.toLowerCase();
		rememberLook();
	}
	function pickFinish(id: FinishId) {
		finish = id;
		rememberLook();
	}
	/** Перекрасить ткань открытой сцены; null, пока сцена не собрана. */
	let repaint: ((colour: string, finish: FinishId) => void) | null = null;
	let appliedColour = $state('');
	let appliedFinish = $state('');

	/**
	 * 3D-превью с ограниченной геометрической драпировкой на XPBD.
	 *
	 * Детали лекала становятся мягкими телами, швы соединяют их между
	 * собой, плечи закреплены, ткань падает под гравитацией и огибает тело.
	 *
	 * Это геометрическая драпировка, а не промышленная примерка: качество
	 * зависит от разрешения сетки и от точности совпадения швов.
	 */

	/**
	 * Собрать сцену.
	 *
	 * Возвращает функцию очистки. Сцена пересобирается, когда меняются мерки
	 * или детали: иначе 3D-превью продолжал бы показывать старую фигуру.
	 */
	function startScene(): () => void {
        if (!container) return () => {};
        let cancelled = false;
        const disposers: (() => void)[] = [];
        const cleanup = () => { while (disposers.length) disposers.pop()?.(); };
        failed = false;

		(async () => {
			try {
				const width = Math.max(container?.clientWidth ?? 640, 1);
				const height = Math.max(container?.clientHeight ?? 480, 1);

				const renderer = new WebGLRenderer({ antialias: true });
				renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
				renderer.setSize(width, height);
				container?.appendChild(renderer.domElement);

				disposers.push(() => { renderer.dispose(); renderer.domElement.remove(); });
                const scene = new Scene();
                disposers.push(() => {
                    scene.traverse((object) => {
                        if (object instanceof Mesh) {
                            object.geometry.dispose();
                            const materials = Array.isArray(object.material) ? object.material : [object.material];
                            materials.forEach((material) => material.dispose());
                        }
                    });
                    scene.clear();
                });


				// Портновский манекен: руки - только под рукав, ноги - только под брюки.
				const parts = {
					arms: pieces.some((piece) => piece.id === 'sleeve'),
					legs: garmentModel === 'trousers'
				};
				const model = buildBodyModel(measurements, { gender, parts });

				disposers.push(lightStudio(renderer,scene,model));
				const camera = new PerspectiveCamera(32, width / height, 0.05, 50);
				camera.position.set(model.height*0.20, model.height * 0.56, model.height * 1.95);
				camera.lookAt(0, model.height * 0.52, 0);
                let dirty=true;
                const controls = new OrbitControls(camera, renderer.domElement);
                controls.addEventListener('change',()=>{dirty=true;});
                controls.target.set(0, model.height * 0.52, 0);
                controls.minDistance = model.height * 0.6;
                controls.maxDistance = model.height * 4;
                controls.update();
                disposers.push(() => controls.dispose());

                // Поле тела (поверхность манекена и столкновений) - на видеокарте,
                // если она есть: два миллиона узлов за миллисекунды вместо 0,4 с.
                // ?cloth=cpu - считать на процессоре даже при WebGPU (отладка, сверка).
                const forceCpu = new URLSearchParams(location.search).get('cloth') === 'cpu';
                const device = forceCpu ? null : await gpuDevice();
                if (cancelled) return;
                if (device)
                    await computeBodyFieldGpu(device, model).catch((err) => console.warn('WebGPU body field unavailable, using CPU', err));
                if (cancelled) return;
                scene.add(buildMannequin(model));
                const look=fabricLook(renderer);
                disposers.push(()=>{look.dispose();repaint=null;});
                const paint=(c:string,f:FinishId)=>{look.apply(c,f);appliedColour=c;appliedFinish=f;dirty=true;};
                untrack(()=>paint(currentColour,currentFinish));
                repaint=paint;

                // Детали лекала -> мягкие тела.
				const garment = buildGarment(pieces, measurements, { model: garmentModel, gender, body: model });
				const built: ClothPiece[] = garment.parts.map((part) => ({
					id: part.id,
					verts: part.verts,
					tris: part.tris,
					world: part.world
				}));
				const meshes: { id: string; geometry: BufferGeometry }[] = [];

				for (const part of garment.parts) {
					const geometry = new BufferGeometry();
					geometry.setAttribute(
						'position',
						new BufferAttribute(new Float32Array(part.verts.length * 3), 3)
					);
					geometry.setIndex(part.tris);
                    const mesh=new Mesh(geometry,look.material);
                    mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
					meshes.push({ id: part.id, geometry });
				}

				// Швы: детали сшиваются по подписанным отрезкам.
				const seams: { a: string; b: string; pair: { a: number[]; b: number[] } }[] =
					garment.seams.map((seam) => ({
						a: seam.a,
						b: seam.b,
						pair: { a: seam.pairs.map((p) => p[0]), b: seam.pairs.map((p) => p[1]) }
					}));

				// Плечи держат ткань: закрепляется весь плечевой шов, иначе
				// деталь висит на одной точке и распахивается.
				const pins = garment.pins;

				// На видеокарте, если браузер даёт WebGPU; иначе - тот же солвер на процессоре.
				const fabric = measuredFabric(currentId, currentStretch, currentWarp, currentWeight);
				const sim =
					(device &&
						(await createGpuSimulation(device, built, seams, pins, model, fabric).catch((err) => {
							console.warn('WebGPU cloth unavailable, using CPU', err);
							return null;
						}))) ||
					(await createSimulation(built, seams, pins, model, fabric));
				backend = sim.backend;
				settled = false;
                if (cancelled) { sim.dispose(); return; }
                disposers.push(() => sim.dispose());
                const triangles = sim.partTriangles();
                const maps = sim.partVertexMap();
                const flatOf=new Map(garment.parts.map(part=>[part.id,part.verts]));
                // Поверхность для отрисовки: пока ткань оседает - обычная сетка,
                // на последнем кадре перед и спинка измельчаются ещё раз, чтобы
                // треугольники не срезали скругление плеча.
                const levelsFor=(id:string,final:boolean)=>id.startsWith('collar')?3:(/^(front|back)-/.test(id)?(final?2:1):(id==='front'||id==='back'?(final?3:2):(id.startsWith('sleeve')&&final?2:1)));
                const makeSurface=(id:string,geometry:BufferGeometry,final:boolean)=>{
                    const surface=createContactSurface(triangles.get(id)??[],maps.get(id)!,model,levelsFor(id,final),id==='collar-1'?1:(id==='collar--1'?-1:0),garment.sleeveless??false);
                    geometry.setAttribute('position',new BufferAttribute(surface.positions,3));
                    // Развёртка по плоскому лекалу: принт идёт по долевой в реальном масштабе.
                    geometry.setAttribute('uv',new BufferAttribute(surfaceUVs(flatOf.get(id)??[],surface.parents),2));
                    geometry.setIndex(surface.triangles);
                    return surface;
                };
                const surfaces = meshes.map(({id,geometry})=>({id,geometry,surface:makeSurface(id,geometry,false)}));
                const refine=()=>{
                    for(const entry of surfaces) if(levelsFor(entry.id,true)!==levelsFor(entry.id,false)) entry.surface=makeSurface(entry.id,entry.geometry,true);
                };
                const writePositions = () => {
                    dirty=true;renderer.shadowMap.needsUpdate=true;
                    const positions=sim.positions();
                    for(const {geometry,surface} of surfaces) {
                        surface.update(positions);
                        geometry.getAttribute('position').needsUpdate=true;
                        geometry.computeVertexNormals();
                        geometry.computeBoundingSphere();
                    }
                };
				writePositions();

				let frame = 0;
				let syncing: Promise<void> = Promise.resolve();
				let last = performance.now();
				// Фиксированный шаг физики: скорость ткани не должна зависеть от
				// частоты кадров. За кадр делаем не больше двух шагов, иначе на
				// слабой машине симуляция начинает есть время кадра.
				const STEP = 1 / 60;
				let accumulated = 0;
                let simulationSteps = 0;
				const animate = () => {
					frame = requestAnimationFrame(animate);
					const now = performance.now();
					accumulated += Math.min((now - last) / 1000, 1 / 15);
					last = now;
					let steps = 0;
					// На видеокарте шаг дешёвый: ткань оседает быстрее реального
					// времени, по 6 шагов за кадр. На процессоре - не больше двух.
					const perFrame = sim.backend === 'gpu' ? 6 : 2;
					while ((sim.backend === 'gpu' || accumulated >= STEP) && steps < perFrame && simulationSteps < 180) {
						sim.step(STEP);
						accumulated = Math.max(0, accumulated - STEP);
						steps += 1;
                        simulationSteps += 1;
					}
					if (accumulated > STEP * 3) accumulated = 0;
                    // Промежуточная отрисовка: поверхность ткани пересчитывается на
                    // процессоре (30-60 мс), на видеокарте шаги быстрее неё - реже.
                    const every = sim.backend === 'gpu' ? 30 : 12;
                    if (steps > 0 && (simulationSteps % every === 0 || simulationSteps === 180)) {
                        const final = simulationSteps === 180;
                        // Позиции с видеокарты читаются асинхронно; финальное
                        // чтение ждёт предыдущее, чтобы не потерять последний кадр.
                        syncing = syncing.then(() => sim.sync()).then(() => {
                            if (cancelled) return;
                            if (final) refine();
                            writePositions();
                            if (final) {
                                const pos = sim.positions();
                                const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
                                for (let i = 0; i < pos.length; i += 3)
                                    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
                                extent = [0, 1, 2].flatMap((k) => [Math.round(lo[k] * 1000), Math.round(hi[k] * 1000)]).join(',');
                                settled = true;
                            }
                        });
                    }
					if(dirty) {renderer.render(scene,camera);dirty=false;}
				};
				animate();

				const resize = () => {
					if (!container) return;
					const w = container.clientWidth || width;
					const h = container.clientHeight || height;
					renderer.setSize(w, h);
					camera.aspect = w / h;
					camera.updateProjectionMatrix();
                    dirty=true;
				};
				const observer = new ResizeObserver(resize);
				observer.observe(container as HTMLDivElement);

                disposers.push(() => { cancelAnimationFrame(frame); observer.disconnect(); });
			} catch (err) {
				cleanup();
                if (!cancelled) { console.error('3D preview failed', err); failed = true; }
			}
		})();

		return () => { cancelled = true; cleanup(); };
	}

	// Сцена пересобирается на каждое изменение мерок и деталей: иначе
	// превью продолжал бы показывать прежнюю фигуру и прежнее лекало.
	$effect(() => {
		void measurements;
		void pieces;
		void currentId;
		void currentStretch;
		void currentWarp;
		void currentWeight;
		return startScene();
	});

	// Цвет и фактура перекрашивают ткань без пересчёта драпировки.
	$effect(() => {
		const c = currentColour;
		const f = currentFinish;
		if (repaint && (c !== appliedColour || f !== appliedFinish)) repaint(c, f);
	});

</script>

<div class="preview" data-testid="preview-3d" data-colour={appliedColour} data-finish={appliedFinish} data-backend={backend} data-settled={settled} data-extent={extent}>
	<div class="canvas" bind:this={container}></div>
	<div class="fabric" data-testid="fabric-panel">
		<span class="fabric-label">{$t('preview3d.fabric')}</span>
		<div class="fabric-kinds" role="group" aria-label={$t('preview3d.fabric')}>
			{#each ['knit', 'woven', 'heavy'] as const as id (id)}
				<button
					type="button"
					class:on={currentId === id}
					aria-pressed={currentId === id}
					data-testid="fabric-{id}"
					onclick={() => pickFabric(id)}>{$t(`preview3d.fabric.${id}`)}</button
				>
			{/each}
		</div>
		<span class="fabric-label">{$t('preview3d.colour')}</span>
		<div class="swatches" role="group" aria-label={$t('preview3d.colour')}>
			{#each COLOURS as swatch (swatch.id)}
				<button
					type="button"
					class="swatch"
					class:on={currentColour === swatch.hex}
					style:--swatch={swatch.hex}
					aria-pressed={currentColour === swatch.hex}
					aria-label={$t(`preview3d.colour.${swatch.id}`)}
					data-tip={$t(`preview3d.colour.${swatch.id}`)}
					data-testid="colour-{swatch.id}"
					onclick={() => pickColour(swatch.hex)}
				></button>
			{/each}
			<label class="swatch custom" data-tip={$t('preview3d.colour.custom')}>
				<input
					type="color"
					value={currentColour}
					aria-label={$t('preview3d.colour.custom')}
					data-testid="colour-custom"
					oninput={(e) => pickColour(e.currentTarget.value)}
				/>
			</label>
		</div>
		<span class="fabric-label">{$t('preview3d.finish')}</span>
		<div class="fabric-kinds finishes" role="group" aria-label={$t('preview3d.finish')}>
			{#each FINISHES as item (item.id)}
				<button
					type="button"
					class:on={currentFinish === item.id}
					aria-pressed={currentFinish === item.id}
					data-testid="finish-{item.id}"
					data-tip={$t(`preview3d.finish.${item.id}.tip`)}
					onclick={() => pickFinish(item.id)}>{$t(`preview3d.finish.${item.id}`)}</button
				>
			{/each}
		</div>
		<label class="fabric-row">
			<span>{$t('preview3d.stretch')}</span>
			<input
				type="number"
				min="0"
				max="40"
				step="1"
				value={currentStretch}
				data-testid="fabric-stretch"
				onchange={(e) => (stretch = Number(e.currentTarget.value))}
			/>
		</label>
		<label class="fabric-row">
			<span>{$t('preview3d.warp')}</span>
			<input
				type="number"
				min="0"
				max="40"
				step="1"
				value={currentWarp}
				data-testid="fabric-warp"
				onchange={(e) => (warp = Number(e.currentTarget.value))}
			/>
		</label>
		<label class="fabric-row">
			<span>{$t('preview3d.weight')}</span>
			<input
				type="number"
				min="50"
				max="800"
				step="10"
				value={currentWeight}
				data-testid="fabric-weight"
				onchange={(e) => (weight = Number(e.currentTarget.value))}
			/>
		</label>
	</div>
	{#if failed}
		<p class="error">{$t('preview3d.failed')}</p>
	{/if}
</div>

<style>
	.fabric {
		position: absolute;
		top: var(--space-3);
		right: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		width: 200px;
		padding: var(--space-2);
		background: color-mix(in srgb, var(--ui-surface) 92%, transparent);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		font-size: 12px;
	}
	.fabric-label {
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.fabric-kinds {
		display: flex;
		gap: var(--space-1);
	}
	.fabric-kinds button {
		flex: 1;
		padding: var(--space-1) var(--space-half);
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		font: inherit;
		font-size: 11px;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.fabric-kinds button.on {
		background: var(--ui-accent);
		border-color: var(--ui-accent);
		color: var(--ui-surface);
	}
	.finishes {
		flex-wrap: wrap;
	}
	.finishes button {
		flex: 1 1 30%;
	}
	.swatches {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: var(--space-1);
	}
	.swatch {
		position: relative;
		aspect-ratio: 1;
		padding: 0;
		background: var(--swatch);
		border: 1px solid color-mix(in srgb, var(--ui-ink) 18%, transparent);
		border-radius: 50%;
		cursor: pointer;
	}
	.swatch.on {
		outline: 2px solid var(--ui-accent);
		outline-offset: 2px;
	}
	.swatch:focus-visible {
		outline: 2px solid var(--ui-accent);
		outline-offset: 2px;
	}
	.swatch.custom {
		overflow: hidden;
		background: conic-gradient(#c0504d, #d9b44a, #6a9a5b, #4a7bb7, #8a5aa8, #c0504d);
	}
	.swatch.custom input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.fabric-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 56px;
		align-items: center;
		gap: var(--space-2);
		color: var(--ui-ink-soft);
	}
	.fabric-row input {
		width: 100%;
		padding: var(--space-half) var(--space-1);
		background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
		border: 1px solid transparent;
		font: inherit;
		text-align: right;
		color: var(--ui-ink);
	}
	.fabric-row input:hover {
		border-color: var(--ui-line);
	}
	.fabric-row input:focus {
		outline: none;
		border-color: var(--ui-accent);
	}
	.preview {
		position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden;
		width: 100%;
		height: 100%;
		min-height: 420px;
        background: #e7e5df;
        color: #303a3c;
	}

	.canvas {
        flex: 1;
        min-height: 0;
        width: 100%;
    }

	.error {
		position: absolute;
		top: 12px;
		left: 12px;
		color: var(--ui-danger-text);
		font-size: 13px;
	}
</style>
