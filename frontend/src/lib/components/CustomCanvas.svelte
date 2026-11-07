<script lang="ts">
	import { pathFromPoints, bboxOfPoints, offsetPolygon } from '$lib/geometry';
	import { outlinePoints, type CustomPiece, type CustomPoint } from '$lib/custom';

	interface Props {
		pieces: CustomPiece[];
		selectedId: string | null;
		selectedPoint: { pieceId: string; index: number } | null;
		onSelectPiece: (id: string | null) => void;
		onSelectPoint: (pieceId: string, index: number) => void;
		onMovePoint: (pieceId: string, index: number, x: number, y: number) => void;
	}

	let { pieces, selectedId, selectedPoint, onSelectPiece, onSelectPoint, onMovePoint }: Props =
		$props();

	const GRID_MM = 50;

	let svg: SVGSVGElement | undefined = $state();
	let dragging = $state<{ pieceId: string; index: number } | null>(null);

	const allPoints = $derived(pieces.flatMap((piece) => piece.outline));
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
	const viewBox = $derived(`${box.x} ${box.y} ${box.width} ${box.height}`);

	const gridLines = $derived.by(() => {
		const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
		const startX = Math.floor(box.x / GRID_MM) * GRID_MM;
		const endX = box.x + box.width;
		const startY = Math.floor(box.y / GRID_MM) * GRID_MM;
		const endY = box.y + box.height;
		for (let x = startX; x <= endX; x += GRID_MM) {
			lines.push({ x1: x, y1: box.y, x2: x, y2: endY });
		}
		for (let y = startY; y <= endY; y += GRID_MM) {
			lines.push({ x1: box.x, y1: y, x2: endX, y2: y });
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
		(event.currentTarget as Element).setPointerCapture?.(event.pointerId);
	}

	function moveDrag(event: PointerEvent, shiftKey: boolean) {
		if (!dragging) return;
		const point = pointerToMm(event);
		onMovePoint(dragging.pieceId, dragging.index, snap(point.x, !shiftKey), snap(point.y, !shiftKey));
	}

	function endDrag() {
		dragging = null;
	}

	function piecePath(piece: CustomPiece): string {
		return pathFromPoints(outlinePoints(piece), true);
	}

	function allowancePath(piece: CustomPiece): string {
		if (piece.seam_allowance_mm <= 0) return '';
		const points = outlinePoints(piece);
		return pathFromPoints(offsetPolygon(points, piece.seam_allowance_mm), true);
	}

	function backgroundClick(event: MouseEvent) {
		const target = event.target as Element | null;
		if (!target?.closest('.piece')) onSelectPiece(null);
	}
</script>

<div class="canvas-shell">
	<svg
		bind:this={svg}
		class="canvas"
		{viewBox}
		role="application"
		aria-label="Поле конструктора"
		data-testid="custom-canvas"
		onpointerdown={backgroundClick}
	>
		<rect
			x={box.x}
			y={box.y}
			width={box.width}
			height={box.height}
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
			>
				{#if piece.seam_allowance_mm > 0}
					<path class="allowance" d={allowancePath(piece)} />
				{/if}
				<path
					class="outline"
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
	.canvas-shell {
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
	.piece .outline {
		fill: color-mix(in srgb, var(--ui-accent) 8%, transparent);
		stroke: var(--ui-ink);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.piece.selected .outline {
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
