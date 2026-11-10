<script lang="ts">
	import { pathFromPoints, bboxOfPoints, offsetPolygon } from '$lib/geometry';
	import { IconButton } from '@monos/ui';
	import { Maximize, Minus, Plus } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import { cutOutline, edgePolyline, outlinePoints, type CustomPiece, type CustomPoint } from '$lib/custom';

	interface Props {
		pieces: CustomPiece[];
		selectedId: string | null;
		selectedPoint: { pieceId: string; index: number } | null;
		onSelectPiece: (id: string | null) => void;
		onSelectPoint: (pieceId: string, index: number) => void;
		onMovePoint: (pieceId: string, index: number, x: number, y: number) => void;
		/** Подсвеченные срезы (сверка швов): деталь и id среза. */
		highlight?: { piece: string; edge: string }[];
	}

	let {
		pieces,
		selectedId,
		selectedPoint,
		onSelectPiece,
		onSelectPoint,
		onMovePoint,
		highlight = []
	}: Props = $props();

	const off = (piece: CustomPiece) => piece.offset ?? { x: 0, y: 0 };

	const GRID_MM = 50;

	let svg: SVGSVGElement | undefined = $state();
	let dragging = $state<{ pieceId: string; index: number } | null>(null);
	let dragOffset = { x: 0, y: 0 };

	// Детали показываются со сдвигом раскладки; геометрия остаётся своей.
	const allPoints = $derived(
		pieces.flatMap((piece) => piece.outline.map((p) => ({ x: p.x + off(piece).x, y: p.y + off(piece).y })))
	);
	const box = $derived.by(() => {
		if (allPoints.length === 0) return { x: 0, y: 0, width: 600, height: 800 };
		const bbox = bboxOfPoints(allPoints);
		const margin = 120;
		return {
			x: bbox.x - margin,
			y: bbox.y - margin,
			width: Math.max(bbox.width + margin * 2, 100),
			height: Math.max(bbox.height + margin * 2, 100)
		};
	});
	// Масштаб и сдвиг вида, как в редакторе лекала: колесо приближает к
	// курсору, перетаскивание пустого поля двигает вид.
	let zoom = $state(1);
	let pan = $state({ x: 0, y: 0 });
	let panning = $state<{ x: number; y: number } | null>(null);
	const viewW = $derived(box.width / zoom);
	const viewH = $derived(box.height / zoom);
	const viewX = $derived(box.x + box.width / 2 - viewW / 2 + pan.x);
	const viewY = $derived(box.y + box.height / 2 - viewH / 2 + pan.y);
	const viewBox = $derived(`${viewX} ${viewY} ${viewW} ${viewH}`);

	function setZoom(next: number, anchor?: CustomPoint) {
		const clamped = Math.min(20, Math.max(0.5, next));
		if (anchor) {
			// Точка под курсором остаётся на месте.
			const k = zoom / clamped;
			const cx = viewX + viewW / 2;
			const cy = viewY + viewH / 2;
			pan = { x: pan.x + (anchor.x - cx) * (1 - k), y: pan.y + (anchor.y - cy) * (1 - k) };
		}
		zoom = clamped;
	}

	function fit() {
		zoom = 1;
		pan = { x: 0, y: 0 };
	}

	function wheel(event: WheelEvent) {
		event.preventDefault();
		setZoom(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), pointerToMm(event as unknown as PointerEvent));
	}

	function startPan(event: PointerEvent) {
		const target = event.target as Element | null;
		if (target?.closest('.piece')) return;
		panning = pointerToMm(event);
		(event.currentTarget as Element).setPointerCapture?.(event.pointerId);
	}

	function movePan(event: PointerEvent) {
		if (!panning) return;
		const point = pointerToMm(event);
		pan = { x: pan.x + panning.x - point.x, y: pan.y + panning.y - point.y };
	}

	// Сетка покрывает видимую часть поля: при сдвиге и отдалении не кончается.
	const gridLines = $derived.by(() => {
		const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
		const left = viewX;
		const top = viewY;
		const right = viewX + viewW;
		const bottom = viewY + viewH;
		const step = viewW / GRID_MM > 200 ? GRID_MM * 4 : GRID_MM;
		for (let x = Math.floor(left / step) * step; x <= right; x += step) {
			lines.push({ x1: x, y1: top, x2: x, y2: bottom });
		}
		for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
			lines.push({ x1: left, y1: y, x2: right, y2: y });
		}
		return lines;
	});

	function pointerToMm(event: PointerEvent): CustomPoint {
		if (!svg) return { x: 0, y: 0 };
		const ctm = svg.getScreenCTM();
		if (!ctm) return { x: 0, y: 0 };
		const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
		return { x: point.x, y: point.y };
	}

	function snap(value: number, enabled: boolean): number {
		return enabled ? Math.round(value / 5) * 5 : Math.round(value * 10) / 10;
	}

	function startDrag(event: PointerEvent, pieceId: string, index: number) {
		event.stopPropagation();
		dragging = { pieceId, index };
		dragOffset = off(pieces.find((piece) => piece.id === pieceId)!);
		(event.currentTarget as Element).setPointerCapture?.(event.pointerId);
	}

	function moveDrag(event: PointerEvent, shiftKey: boolean) {
		if (!dragging) return;
		const point = pointerToMm(event);
		onMovePoint(
			dragging.pieceId,
			dragging.index,
			snap(point.x - dragOffset.x, !shiftKey),
			snap(point.y - dragOffset.y, !shiftKey)
		);
	}

	function endDrag() {
		dragging = null;
	}

	function piecePath(piece: CustomPiece): string {
		return pathFromPoints(outlinePoints(piece), true);
	}

	function allowancePath(piece: CustomPiece): string {
		const custom = (piece.edges ?? []).some((edge) => edge.allowanceMm !== null && edge.allowanceMm !== undefined);
		const fold = piece.internal_lines.some((line) => line.type === 'fold');
		if (piece.seam_allowance_mm <= 0 && !custom) return '';
		// Свои припуски срезов и сгиб - линия реза как на печати.
		if (custom || fold) return pathFromPoints(cutOutline(piece), true);
		return pathFromPoints(offsetPolygon(outlinePoints(piece), piece.seam_allowance_mm), true);
	}

	function linePath(points: CustomPoint[], closed = false): string {
		return pathFromPoints(points, closed);
	}

	function highlighted(piece: CustomPiece) {
		return (piece.edges ?? []).filter((edge) =>
			highlight.some((ref) => ref.piece === piece.id && ref.edge === edge.id)
		);
	}

	function backgroundClick(event: MouseEvent) {
		const target = event.target as Element | null;
		if (!target?.closest('.piece')) onSelectPiece(null);
	}
</script>

<div class="canvas-shell">
	<div class="canvas-toolbar">
		<IconButton label={$t('canvas.zoomIn')} size="sm" onclick={() => setZoom(zoom * 1.25)} data-testid="custom-zoom-in"><Plus size={14} /></IconButton>
		<IconButton label={$t('canvas.zoomOut')} size="sm" onclick={() => setZoom(zoom / 1.25)}><Minus size={14} /></IconButton>
		<IconButton label={$t('canvas.fit')} size="sm" onclick={fit} data-testid="custom-zoom-fit"><Maximize size={14} /></IconButton>
		<span class="hint num" data-testid="custom-zoom">{Math.round(zoom * 100)}%</span>
	</div>
	<svg
		bind:this={svg}
		class="canvas"
		class:panning={!!panning}
		{viewBox}
		role="application"
		aria-label="Поле конструктора"
		data-testid="custom-canvas"
		onpointerdown={(event) => {
			backgroundClick(event);
			startPan(event);
		}}
		onpointermove={movePan}
		onpointerup={() => (panning = null)}
		onpointercancel={() => (panning = null)}
		onwheel={wheel}
	>
		<rect
			x={viewX}
			y={viewY}
			width={viewW}
			height={viewH}
			class="paper"
		/>
		<g class="grid" aria-hidden="true">
			{#each gridLines as line, index (index)}
				<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
			{/each}
		</g>

		{#each pieces as piece (piece.id)}
			<g
				class="piece"
				class:selected={piece.id === selectedId}
				data-testid={`custom-piece-${piece.id}`}
				transform={`translate(${off(piece).x} ${off(piece).y})`}
			>
				{#if allowancePath(piece)}
					<path class="allowance" d={allowancePath(piece)} />
				{/if}
				<path
					class="contour"
					d={piecePath(piece)}
					role="button"
					tabindex="0"
					aria-label={piece.name}
					onclick={(event) => {
						event.stopPropagation();
						onSelectPiece(piece.id);
					}}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onSelectPiece(piece.id);
						}
					}}
				/>
				{#each piece.internal_lines as line, index (index)}
					{#if line.points.length >= 2}
						<path
							class="line {line.type}"
							d={linePath(line.points, line.type === 'dart' && line.points.length > 3)}
							data-testid={line.type === 'dart' ? 'custom-dart' : line.type === 'fold' ? 'custom-fold' : undefined}
						/>
					{/if}
				{/each}
				{#each highlighted(piece) as edge (edge.id)}
					<path class="edge-hi" d={linePath(edgePolyline(piece, edge))} />
				{/each}
				{#each piece.notches as notch, index (index)}
					<g class="notch">
						<line x1={notch.x - 8} y1={notch.y} x2={notch.x + 8} y2={notch.y} />
						<line x1={notch.x} y1={notch.y - 8} x2={notch.x} y2={notch.y + 8} />
					</g>
				{/each}
				{#if piece.grainline}
					<g class="grain">
						<line
							x1={piece.grainline.x1}
							y1={piece.grainline.y1}
							x2={piece.grainline.x2}
							y2={piece.grainline.y2}
						/>
					</g>
				{/if}
				{#each piece.outline as point, index (index)}
					<circle
						class="handle"
						class:active={selectedPoint?.pieceId === piece.id && selectedPoint?.index === index}
						cx={point.x}
						cy={point.y}
						r={selectedId === piece.id ? 7 : 5}
						role="button"
						tabindex="0"
						aria-label={`${piece.name}: ${index + 1}`}
						onpointerdown={(event) => startDrag(event, piece.id, index)}
						onpointermove={(event) => moveDrag(event, event.shiftKey)}
						onpointerup={endDrag}
						onpointercancel={endDrag}
						onclick={(event) => {
							event.stopPropagation();
							onSelectPoint(piece.id, index);
						}}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								onSelectPoint(piece.id, index);
							}
						}}
					/>
				{/each}
			</g>
		{/each}
	</svg>
</div>

<style>
	.canvas-toolbar {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.hint {
		font-size: 12px;
		color: var(--ui-ink-soft);
	}
	.canvas.panning {
		cursor: grabbing;
	}
	.canvas-shell {
		position: relative;
		flex: 1;
		min-height: 0;
		min-width: 0;
		display: flex;
		background: var(--ui-bg);
	}
	.canvas {
		width: 100%;
		height: 100%;
		touch-action: none;
		cursor: default;
	}
	.paper {
		fill: var(--ui-surface);
		stroke: var(--ui-line);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.grid line {
		stroke: color-mix(in srgb, var(--ui-line) 55%, transparent);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.piece .contour {
		fill: color-mix(in srgb, var(--ui-accent) 8%, transparent);
		stroke: var(--ui-ink);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.piece.selected .contour {
		fill: color-mix(in srgb, var(--ui-accent) 14%, transparent);
		stroke: var(--ui-accent);
	}
	.piece .allowance {
		fill: none;
		stroke: var(--ui-ink-muted);
		stroke-width: 1;
		stroke-dasharray: 6 4;
		vector-effect: non-scaling-stroke;
	}
	.line {
		fill: none;
		stroke: var(--ui-ink-soft);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.line.dart,
	.line.buttonhole,
	.line.button {
		stroke: var(--ui-ink);
		stroke-dasharray: none;
	}
	.line.fold {
		stroke: var(--ui-ink);
		stroke-width: 1.5;
		stroke-dasharray: 10 3 2 3;
	}
	.edge-hi {
		fill: none;
		stroke: var(--ui-accent);
		stroke-width: 4;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}
	.notch line {
		stroke: var(--ui-accent);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.grain line {
		stroke: var(--ui-ink-soft);
		stroke-width: 1;
		stroke-dasharray: 10 6;
		vector-effect: non-scaling-stroke;
	}
	.handle {
		fill: var(--ui-surface);
		stroke: var(--ui-ink);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
		cursor: grab;
	}
	.handle:hover,
	.handle.active {
		fill: var(--ui-accent);
		stroke: var(--ui-accent);
	}
	.piece.selected .handle {
		stroke: var(--ui-accent);
	}
</style>
