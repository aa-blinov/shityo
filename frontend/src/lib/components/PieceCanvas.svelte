<script lang="ts">
	import { Button, IconButton } from '@monos/ui';
	import { Maximize, Minus, Plus } from 'lucide-svelte';
	import {
		arrowHead,
		dartTriangle,
		layoutPieces,
		offsetPolygon,
		pathFromPoints,
		notchTicks,
		unionBBox,
		round
	} from '$lib/geometry';
	import { hasKey, t } from '$lib/i18n';
	import type { Piece, Point } from '$lib/types';

	interface Props {
		pieces: Piece[];
        highlighted?: string[];
		selectedId: string | null;
		zoom: number;
		pan: { x: number; y: number };
		toggles: { seam: boolean; grain: boolean; notches: boolean; internal: boolean };
		onSelect: (id: string | null) => void;
		onZoom: (zoom: number) => void;
		onPan: (pan: { x: number; y: number }) => void;
		onOverrideChange: (key: string, value: number) => void;
	}

	let {
		pieces,
        highlighted = [],
		selectedId,
		zoom,
		pan,
		toggles,
		onSelect,
		onZoom,
		onPan,
		onOverrideChange
	}: Props = $props();

	const SEAM_ALLOWANCE_MM = 10;

	/**
	 * Подпись детали на чертеже. Имя переводится по идентификатору: сервер
	 * отдаёт русское, а чертёж должен читаться на языке интерфейса.
	 */
	function pieceLabel(piece: Piece): string {
		const key = `piece.${piece.id}`;
		return hasKey(key) ? $t(key) : piece.name;
	}

	let measuring=$state(false);
 let ruler=$state<Point[]>([]);
 let svgElement:SVGSVGElement;
 function sheetPoint(event:PointerEvent):Point {
  const ctm=svgElement.getScreenCTM();
  return ctm?new DOMPoint(event.clientX,event.clientY).matrixTransform(ctm.inverse()):{x:0,y:0};
 }
 let dragging = $state(false);
	/** Точка чертежа, которую тянут (null - тянут холст). */
	let activeHandle = $state<string | null>(null);
	let dragStart = { x: 0, y: 0 };


	const placed = $derived(layoutPieces(pieces));
	/** \u0421\u0434\u0432\u0438\u0433 \u0440\u0430\u0441\u043a\u043b\u0430\u0434\u043a\u0438 \u043f\u0435\u0440\u0435\u0434\u0430: \u0442\u043e\u0447\u043a\u0430 \u043b\u0435\u0436\u0438\u0442 \u043d\u0430 \u0441\u0442\u043e\u0440\u043e\u043d\u0435 \u043b\u0435\u043a\u0430\u043b\u0430 \u0434\u0435\u0442\u0430\u043b\u0438 \u0434\u043e\u043b\u0436\u043d\u0430 \u043e\u0442\u0435\u043a\u0430\u0442\u044c \u043e\u0442 \u0441\u0432\u043e\u0435\u0433\u043e \u0448\u0432\u0430. */
	const frontOffset = $derived(
		placed.find((item) => item.piece.id === 'front')?.offset ?? { x: 0, y: 0 }
	);
	// Припуск на швы лежит за контуром детали, поэтому в границы вида он
	// тоже должен входить - иначе края деталей срезаются по краю окна.
	const contentBox = $derived.by(() => {
		if (placed.length === 0) {
			return { x: 0, y: 0, width: 100, height: 100 };
		}
		const box = unionBBox(placed.map((p) => p.bbox));
		const margin = toggles.seam ? Math.max(...pieces.map(p=>p.seam_allowance_mm ?? SEAM_ALLOWANCE_MM)) : 0;
		return {
			x: box.x - margin,
			y: box.y - margin,
			width: box.width + margin * 2,
			height: box.height + margin * 2
		};
	});

	const viewW = $derived(Math.max(contentBox.width / zoom, 10));
	const viewH = $derived(Math.max(contentBox.height / zoom, 10));
	const viewX = $derived(contentBox.x + contentBox.width / 2 - viewW / 2 + pan.x);
	const viewY = $derived(contentBox.y + contentBox.height / 2 - viewH / 2 + pan.y);

	function toSheet(piece: Piece, point: Point): Point {
		const found = placed.find((p) => p.piece.id === piece.id);
		const offset = found?.offset ?? { x: 0, y: 0 };
		return { x: point.x + offset.x, y: point.y + offset.y };
	}

	function outlinePath(piece: Piece): string {
		const found = placed.find((p) => p.piece.id === piece.id);
		const offset = found?.offset ?? { x: 0, y: 0 };
		return pathFromPoints(piece.outline.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })));
	}

	function allowancePath(piece: Piece): string {
		const found = placed.find((p) => p.piece.id === piece.id);
		const offset = found?.offset ?? { x: 0, y: 0 };
		const shifted = piece.outline.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
		// Припуск приходит вместе с деталью: если он отличается от
		// умолчания, экран должен показать то же, что уйдёт на печать.
		const allowance = piece.seam_allowance_mm ?? SEAM_ALLOWANCE_MM;
		return pathFromPoints(offsetPolygon(shifted, allowance));
	}

	function grainline(piece: Piece) {
		const a = toSheet(piece, { x: piece.grainline.x1, y: piece.grainline.y1 });
		const b = toSheet(piece, { x: piece.grainline.x2, y: piece.grainline.y2 });
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		return {
			line: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
			headStart: arrowHead(a.x, a.y, -dx, -dy),
			headEnd: arrowHead(b.x, b.y, dx, dy)
		};
	}

	function pieceNotches(piece: Piece) {
		const found = placed.find((p) => p.piece.id === piece.id);
		const offset = found?.offset ?? { x: 0, y: 0 };
		return notchTicks(piece).map((tick) => ({
			...tick,
			x1: tick.x1 + offset.x,
			y1: tick.y1 + offset.y,
			x2: tick.x2 + offset.x,
			y2: tick.y2 + offset.y
		}));
	}

	function dartPaths(piece: Piece): string[] {
		return piece.internal_lines
			.filter((line) => line.type === 'dart' && line.points.length >= 2)
			.map((line) => {
                if(line.points.length>=3) return pathFromPoints(line.points.map(p=>toSheet(piece,p)),true);
				const base = toSheet(piece, line.points[0]);
				const tip = toSheet(piece, line.points[line.points.length - 1]);
				return pathFromPoints(dartTriangle(base, tip));
			});
	}

	function internalPath(piece: Piece): string {
		const lines = piece.internal_lines.filter((line) => line.type !== 'dart' && line.type !== 'fold');
		if (lines.length === 0) return '';
		return lines
			.map((line) => pathFromPoints(line.points.map((p) => toSheet(piece, p)), false))
			.join(' ');
	}

	/**
	 * Точки, которые двигает редактор: плечевая точка и подмышка.
	 *
	 * Координаты - в системе лекала (миллиметры детали), поэтому при
	 * перетаскивании минусуется сдвиг раскладки.
	 */
	const handles = $derived.by(() => {
		const front = placed.find((item) => item.piece.id === 'front');
		if (!front) return [];
		const edge = (label: string) =>
			front.piece.seam_edges?.find((item) => item.label === label)?.points ?? [];
		const list: { key: string; x: number; y: number }[] = [];
		const shoulder = edge('\u043f\u043b\u0435\u0447\u043e');
		if (shoulder.length) {
			const point = shoulder[shoulder.length - 1];
			list.push({ key: 'shoulder_tip_x', x: point.x, y: point.y });
		}
		const armhole = edge('\u043f\u0440\u043e\u0439\u043c\u0430');
		if (armhole.length) {
			const point = armhole[armhole.length - 1];
			list.push({ key: 'armhole_depth', x: point.x, y: point.y });
		}
		return list;
	});

	/** Точка в системе лекала: миллиметры полотна. */
	function piecePoint(event: PointerEvent): { x: number; y: number } {
		const svg = event.currentTarget as SVGSVGElement;
		const ctm = svg.getScreenCTM();
		if (!ctm) return { x: 0, y: 0 };
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
		const front = placed.find((item) => item.piece.id === 'front');
		return {
			x: point.x - (front?.offset.x ?? 0),
			y: point.y - (front?.offset.y ?? 0)
		};
	}

	function handleDragStart(event: PointerEvent, key: string) {
		if(measuring)return;
        event.stopPropagation();
		activeHandle = key;
		(event.currentTarget as Element).setPointerCapture?.(event.pointerId);
	}

	function handleDragMove(event: PointerEvent) {
		if (!activeHandle) return;
		const point = piecePoint(event);
		// Значения уходят в сантиметрах - так же, как мерки.
		const value =
			activeHandle === 'shoulder_tip_x' ? point.x / 10 : point.y / 10;
		onOverrideChange(activeHandle, Math.round(value * 10) / 10);
	}

	function handleDragEnd() {
		activeHandle = null;
	}

	function handlePointerDown(event: PointerEvent) {
        if(measuring){const point=sheetPoint(event);ruler=ruler.length===1?[ruler[0],point]:[point];return;}
		dragging = true;
		dragStart = sheetPoint(event);
		(event.target as Element).setPointerCapture?.(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragging) return;
		const point=sheetPoint(event);
        onPan({x:pan.x+dragStart.x-point.x,y:pan.y+dragStart.y-point.y});
	}

	function handlePointerUp() {
		dragging = false;
	}

	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
		onZoom(Math.min(20, Math.max(0.1, zoom * factor)));
	}

	function handleBackgroundClick(event: MouseEvent) {
		const target = event.target as Element | null;
		// The grid rect covers the whole sheet, so a click is "on a piece"
		// only when it hits one of the piece groups.
		if (!target?.closest('.piece')) onSelect(null);
	}
</script>

<div class="canvas-wrap">
	<div class="canvas-toolbar">
  <Button size="sm" variant="secondary" data-testid="ruler-toggle" aria-pressed={measuring} onclick={()=>{measuring=!measuring;ruler=[];}}>{$t('canvas.ruler')}</Button>
		<IconButton
			label={$t('canvas.zoomIn')}
			size="sm"
			onclick={() => onZoom(Math.min(20, zoom * 1.25))}
		>
			<Plus size={14} />
		</IconButton>
		<IconButton
			label={$t('canvas.zoomOut')}
			size="sm"
			onclick={() => onZoom(Math.max(0.1, zoom / 1.25))}
		>
			<Minus size={14} />
		</IconButton>
		<IconButton
			label={$t('canvas.fit')}
			size="sm"
			onclick={() => {
				onZoom(1);
				onPan({ x: 0, y: 0 });
			}}
		>
			<Maximize size={14} />
		</IconButton>
		<span class="hint">{Math.round(zoom * 100)}%</span>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<svg
		bind:this={svgElement}
        data-testid="pattern-canvas"
		class="canvas"
		viewBox={`${round(viewX)} ${round(viewY)} ${round(viewW)} ${round(viewH)}`}
		preserveAspectRatio="xMidYMid meet"
		role="application"
		aria-label={$t('canvas.ariaLabel')}
		onpointerdown={handlePointerDown}
		onpointermove={activeHandle ? handleDragMove : handlePointerMove}
		onpointerup={activeHandle ? handleDragEnd : handlePointerUp}
		onpointercancel={activeHandle ? handleDragEnd : handlePointerUp}
		onwheel={handleWheel}
		onclick={handleBackgroundClick}
		onkeydown={(event) => {
			if (event.key === 'Escape') {onSelect(null);ruler=[];measuring=false;}
		}}
	>
		<defs>
			<pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
				<path d="M 50 0 L 0 0 0 50" fill="none" stroke="var(--ui-line)" stroke-width="1" />
			</pattern>
		</defs>
		<rect x={round(viewX)} y={round(viewY)} width={round(viewW)} height={round(viewH)} fill="url(#grid)" />


		{#each placed as item (item.piece.id)}
			{@const piece = item.piece}
			{@const selected = selectedId === piece.id}
			<g
				class="piece"
				class:selected
				data-piece-id={piece.id}
				onclick={(event) => {
					event.stopPropagation();
					onSelect(piece.id);
				}}
				role="button"
				tabindex="0"
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') onSelect(piece.id);
				}}
			>
				{#if toggles.seam}
					<path class="allowance" d={allowancePath(piece)} />
				{/if}
				<path class="cut" d={outlinePath(piece)} />
				<path class="seam" d={outlinePath(piece)} />

				{#if toggles.internal}
                    {#each piece.internal_lines.filter(line=>line.type==='fold') as fold,i (i)}
                     <path class="fold" d={pathFromPoints(fold.points.map(p=>toSheet(piece,p)),false)}/>
                    {/each}
					{#each dartPaths(piece) as dart, i (i)}
						<path class="dart" d={dart} />
					{/each}
					{#if internalPath(piece)}
						<path class="internal" d={internalPath(piece)} />
					{/if}
				{/if}

				{#if toggles.notches}
					{#each pieceNotches(piece) as tick, i (i)}
						<line class="notch" x1={round(tick.x1)} y1={round(tick.y1)} x2={round(tick.x2)} y2={round(tick.y2)} />
					{/each}
				{/if}

				{#if toggles.grain && (piece.grainline.x1 !== piece.grainline.x2 || piece.grainline.y1 !== piece.grainline.y2)}
					{@const gl = grainline(piece)}
					<line class="grain" x1={round(gl.line.x1)} y1={round(gl.line.y1)} x2={round(gl.line.x2)} y2={round(gl.line.y2)} />
					<path class="grain" d={pathFromPoints(gl.headStart)} />
					<path class="grain" d={pathFromPoints(gl.headEnd)} />
				{/if}

				<text class="label" x={round(item.bbox.x + 6)} y={round(item.bbox.y + 30)}>
					{pieceLabel(piece)}
					{#if piece.cut > 1}({piece.cut}){/if}
				</text>
			</g>
		{/each}
        {#each placed as item (item.piece.id)}
         {#each item.piece.seam_edges as edge,i (i)}
          {#if highlighted.includes(`${item.piece.id}:${i}`)}
           <path class="highlight-seam" d={pathFromPoints(edge.points.map(p=>toSheet(item.piece,p)),false)}/>
          {/if}
         {/each}
        {/each}
        {#if ruler.length===2}
         <line class="ruler-line" x1={ruler[0].x} y1={ruler[0].y} x2={ruler[1].x} y2={ruler[1].y}/>
        {/if}
        {#each ruler as point,i (i)}<circle class="ruler-point" cx={point.x} cy={point.y} r={4/zoom}/>{/each}
		<!-- Точки редактора: их тянут, чтобы двигать геометрию лекала. -->
		{#each handles as handle (handle.key)}
			<circle
				class="handle"
				cx={handle.x + frontOffset.x}
				cy={handle.y + frontOffset.y}
				r={activeHandle === handle.key ? 9 : 7}
				onpointerdown={(event) => handleDragStart(event, handle.key)}
				onpointermove={handleDragMove}
				onpointerup={handleDragEnd}
				onpointercancel={handleDragEnd}
				data-testid="edit-handle-{handle.key}"
				role="button"
				tabindex="0"
				aria-label={$t('canvas.handle')}
			/>
		{/each}
	</svg>
 <div class="canvas-footer">
  {#if measuring}<p role="status" data-testid="ruler-result">{ruler.length===2?`${(Math.hypot(ruler[1].x-ruler[0].x,ruler[1].y-ruler[0].y)/10).toFixed(2)} ${$t('inspect.cm')}`:$t('canvas.rulerHint')}</p>{/if}
  <details><summary>{$t('canvas.legend')}</summary><ul>
   <li><span class="sample base"></span>{$t('canvas.baseLine')}</li>
   <li><span class="sample allowance-sample"></span>{$t('canvas.cutLine')}</li>
   <li><span class="sample grain-sample"></span>{$t('workspace.layerGrain')}</li>
   <li><span class="sample fold-sample"></span>{$t('canvas.foldLine')}</li>
   <li><span class="sample internal-sample"></span>{$t('workspace.layerInternal')}</li>
   <li><span class="sample notch-sample"></span>{$t('workspace.layerNotches')}</li>
  </ul><p>{$t('canvas.gridNote')}</p></details>
 </div>
</div>

<style>
 .fold{fill:none;stroke:var(--ui-ink);stroke-width:1;stroke-dasharray:10 3 2 3;vector-effect:non-scaling-stroke;}
 .fold-sample{border-color:var(--ui-ink);border-top-style:dashed;}
 .highlight-seam{fill:none;stroke:var(--ui-accent);stroke-width:4;vector-effect:non-scaling-stroke;pointer-events:none;}
 .ruler-line{stroke:var(--ui-ink);stroke-width:2;stroke-dasharray:6 3;vector-effect:non-scaling-stroke;pointer-events:none;}
 .ruler-point{fill:var(--ui-ink);pointer-events:none;}
 .canvas-footer{position:absolute;bottom:8px;left:8px;max-width:calc(100% - 16px);font-size:12px;background:var(--ui-surface);padding:8px;border:1px solid var(--ui-line);border-radius:var(--ui-radius);}
 .canvas-footer p{margin:4px 0;}.canvas-footer summary{cursor:pointer;}
 .canvas-footer ul{list-style:none;padding:0;margin:8px 0;display:flex;flex-wrap:wrap;gap:8px 16px;}
 .canvas-footer li{display:flex;align-items:center;gap:6px;}
 .sample{width:22px;border-top:2px dashed var(--ui-accent);}
 .allowance-sample{border-top:2px dotted var(--ui-warning);}.grain-sample{border-top:2px solid var(--ui-success);}.internal-sample{border-color:var(--ui-ink-muted);}.notch-sample{width:5px;height:10px;border-top:0;border-left:2px solid var(--ui-warning);}

	.canvas-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 320px;
		background: var(--ui-bg);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		overflow: hidden;
	}

	.canvas-toolbar {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		gap: var(--ui-space-field);
		align-items: center;
		z-index: 2;
	}

	.handle {
		fill: var(--ui-accent, var(--ui-ink));
		stroke: var(--ui-canvas, var(--ui-bg));
		stroke-width: 2;
		cursor: grab;
	}

	.canvas {
		width: 100%;
		height: 100%;
		display: block;
		cursor: grab;
		touch-action: none;
	}

	.canvas:active {
		cursor: grabbing;
	}

	.cut {
		fill: var(--ui-surface-2);
		stroke: var(--ui-line-strong);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.seam {
		fill: none;
		stroke: var(--ui-accent);
		stroke-width: 1;
		stroke-dasharray: 6 4;
		vector-effect: non-scaling-stroke;
	}

	.allowance {
		fill: none;
		stroke: var(--ui-warning);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		vector-effect: non-scaling-stroke;
	}

	.piece.selected .cut {
		fill: color-mix(in srgb, var(--ui-accent) 22%, var(--ui-surface-2));
		stroke: var(--ui-accent);
		stroke-width: 2.5;
	}

	.notch {
		stroke: var(--ui-warning);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.grain {
		stroke: var(--ui-success);
		stroke-width: 1.5;
		fill: var(--ui-success);
		vector-effect: non-scaling-stroke;
	}

	.dart {
		fill: var(--ui-success);
		stroke: var(--ui-success);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}

	.internal {
		fill: none;
		stroke: var(--ui-ink-muted);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		vector-effect: non-scaling-stroke;
	}

	.label {
		fill: var(--ui-ink-muted);
		font-size: 22px;
		pointer-events: none;
		user-select: none;
	}
</style>
