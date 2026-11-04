<script lang="ts">

	import { BufferAttribute, BufferGeometry, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { buildBodyModel } from '$lib/cloth/body';
	import { buildMannequin, lightStudio, cottonTexture, clothMaterial } from '$lib/cloth/studio';
	import { buildGarment } from '$lib/cloth/assembly';
	import { createSimulation, type ClothPiece } from '$lib/cloth/physics';
	import { createContactSurface } from '$lib/cloth/surface';
	import { t } from '$lib/i18n';
	import type { Piece } from '$lib/types';

	interface Props {
		measurements: Record<string, number>;
		pieces: Piece[];
	}

	let { measurements, pieces }: Props = $props();


	let container: HTMLDivElement | undefined = $state();
	let failed = $state(false);

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


				const model = buildBodyModel(measurements);

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

                scene.add(buildMannequin(model));
                const weave=cottonTexture(renderer);
                disposers.push(()=>weave.dispose());
                const fabricColor=pieces.some(p=>p.id==='collar')?'#d1c4ad':pieces.some(p=>p.id==='sleeve')?'#617c7d':pieces.some(p=>p.id==='skirt')?'#927b69':'#414b52';

                // Детали лекала -> мягкие тела.
				const garment = buildGarment(pieces, measurements);
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
                    const mat = clothMaterial(fabricColor,weave);
                    const mesh=new Mesh(geometry,mat);
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

				const sim = await createSimulation(built, seams, pins, model);
                if (cancelled) { sim.dispose(); return; }
                disposers.push(() => sim.dispose());
                const triangles = sim.partTriangles();
                const maps = sim.partVertexMap();
                const surfaces = meshes.map(({id,geometry})=>{
                    const surface=createContactSurface(triangles.get(id)??[],maps.get(id)!,model,id.startsWith('collar')?3:(/^(front|back)-/.test(id)?1:(id==='front'||id==='back'?2:1)),id==='collar-1'?1:(id==='collar--1'?-1:0));
                    geometry.setAttribute('position',new BufferAttribute(surface.positions,3));
                    geometry.setAttribute('uv',new BufferAttribute(new Float32Array(surface.positions.length/3*2),2));
                    geometry.setIndex(surface.triangles);
                    return {geometry,surface};
                });
                const writePositions = () => {
                    dirty=true;renderer.shadowMap.needsUpdate=true;
                    const positions=sim.positions();
                    for(const {geometry,surface} of surfaces) {
                        surface.update(positions);
                        geometry.getAttribute('position').needsUpdate=true;
                        const uv=geometry.getAttribute('uv') as BufferAttribute;
                        for(let i=0;i<uv.count;i++) uv.setXY(i,surface.positions[i*3]*4,surface.positions[i*3+1]*4);
                        uv.needsUpdate=true;
                        geometry.computeVertexNormals();
                        geometry.computeBoundingSphere();
                    }
                };
				writePositions();

				let frame = 0;
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
					while (accumulated >= STEP && steps < 2 && simulationSteps < 180) {
						sim.step(STEP);
						accumulated -= STEP;
						steps += 1;
                        simulationSteps += 1;
					}
					if (accumulated > STEP * 3) accumulated = 0;
                    if (steps > 0 && (simulationSteps % 12 === 0 || simulationSteps === 180)) writePositions();
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
		return startScene();
	});

</script>

<div class="preview" data-testid="preview-3d">
	<div class="canvas" bind:this={container}></div>
	<div class="overlay">
		<span class="badge">{$t('preview3d.badge')}</span>
		<span class="hint">{$t('preview3d.hint')}</span>
	</div>
	{#if failed}
		<p class="error">{$t('preview3d.failed')}</p>
	{/if}
</div>

<style>
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

    .overlay {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 9px 12px;
        background: #f8f7f3;
        border-top: 1px solid #d4d4cd;
        pointer-events: none;
    }
    .badge {
        color: #303a3c;
        font-size: 11px;
        font-weight: 600;
    }
    .hint {
        max-width: 70ch;
        color: #48504f;
        font-size: 11px;
        line-height: 1.4;
    }

	.error {
		position: absolute;
		top: 12px;
		left: 12px;
		color: var(--ui-danger-text);
		font-size: 12px;
	}
</style>
