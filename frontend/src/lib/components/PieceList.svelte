<script lang="ts">
	import { Badge, Card } from '@monos/ui';
	import { hasKey, t } from '$lib/i18n';
	import { formatAreaAsCm2, formatMmAsCm } from '$lib/geometry';
	import type { Piece } from '$lib/types';

	interface Props {
		pieces: Piece[];
		selectedId: string | null;
		onSelect: (id: string) => void;
	}

	let { pieces, selectedId, onSelect }: Props = $props();


	/**
	 * Имя детали переводится по её идентификатору: бэкенд отдаёт русское
	 * название, но в английском интерфейсе оно должно быть английским.
	 * Если идентификатор в словаре не знаем, показываем то, что прислал
	 * сервер.
	 */
	function pieceName(piece: Piece): string {
		const key = `piece.${piece.id}`;
		return hasKey(key) ? $t(key) : piece.name;
	}

	const front = $derived(pieces.find((p) => p.id === 'front'));
	const frontWidthCm = $derived(front ? front.bbox.width / 10 : null);
</script>

<Card data-testid="piece-list">
	<div class="panel">
	<h2>{$t('pieces.title')}</h2>
	{#if frontWidthCm !== null}
		<div class="front-width" data-testid="front-width" data-value={frontWidthCm}>
			{$t('pieces.frontWidth')}: <strong>{frontWidthCm.toFixed(1)}</strong> {$t('unit.cm')}
		</div>
	{/if}
	<ul>
		{#each pieces as piece (piece.id)}
			<li data-testid="piece-item" data-piece-id={piece.id} class:selected={selectedId === piece.id}>
				<button type="button" class="piece-button" onclick={() => onSelect(piece.id)}>
					<span class="name">
						{pieceName(piece)}
						{#if piece.cut > 1}<Badge tone="neutral">×{piece.cut}</Badge>{/if}
						{#if piece.mirrored}<Badge tone="neutral">{$t('pieces.mirrored')}</Badge>{/if}
					</span>
					<span class="dims">
						{$t('pieces.dimensions', {
							width: formatMmAsCm(piece.bbox.width),
							height: formatMmAsCm(piece.bbox.height),
							unit: $t('unit.cm')
						})},
						{$t('pieces.area', { area: formatAreaAsCm2(piece.area_mm2), unit: $t('unit.cm') })}
					</span>
				</button>
			</li>
		{/each}
	</ul>
	{#if pieces.length === 0}
		<p class="hint">{$t('pieces.empty')}</p>
	{/if}
	</div>
</Card>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-snug);
	}

	h2 {
		margin: 0;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ui-ink-soft);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		margin-bottom: var(--ui-space-tight);
	}

	.piece-button {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-hair);
		align-items: flex-start;
		text-align: left;
		background: var(--ui-surface-2);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		color: var(--ui-ink);
		padding: var(--ui-space-field) var(--ui-space-snug);
		cursor: pointer;
	}

	.piece-button:hover {
		border-color: var(--ui-line-strong);
	}

	li.selected .piece-button {
		border-color: var(--ui-ink-soft);
		background: color-mix(in srgb, var(--ui-ink) 12%, var(--ui-surface));
	}

	.name {
		display: flex;
		align-items: center;
		gap: var(--ui-space-field);
		font-weight: 600;
	}

	.dims {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}

	.front-width {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}

	.front-width strong {
		color: var(--ui-ink);
		font-size: 14px;
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
</style>
