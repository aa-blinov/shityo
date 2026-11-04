<script lang="ts">
	import { Button, Card } from '@monos/ui';
	import { hasKey, t } from '$lib/i18n';
	import type { SizeGridRow } from '$lib/types';

	interface Props {
		rows: SizeGridRow[];
		onApply: (row: SizeGridRow) => void;
	}

	let { rows, onApply }: Props = $props();


	/**
	 * Показываем только опорные мерки: полный набор и так редактируется
	 * в панели мерок, а в таблице он превращал её в нечитаемую полосу.
	 * Габариты деталей видно в списке деталей, поэтому в таблицу они не
	 * идут - иначе колонки не помещаются в панель.
	 */
	const SHOWN_MEASUREMENTS = ['bust'];

	const measurementKeys = $derived.by(() => {
		const keys = new Set<string>();
		for (const row of rows) {
			for (const key of Object.keys(row.measurements)) keys.add(key);
		}
		return [...keys].filter((key) => SHOWN_MEASUREMENTS.includes(key));
	});

	const dimensionKeys = $derived.by(() => {
		const keys = new Set<string>();
		for (const row of rows) {
			for (const key of Object.keys(row.dimensions)) keys.add(key);
		}
		return [...keys].filter((key) => key === 'front_width_cm');
	});

	/** Короткая подпись измерения для узкой таблицы. */
	function shortMeasureTitle(key: string): string {
		const shortKey = `measure.${key}.short`;
		return hasKey(shortKey) ? $t(shortKey) : $t(`measure.${key}`);
	}

	/** Заголовок измерения: «bust» -> «Обхват груди». */
	function measureTitle(key: string): string {
		return $t(`measure.${key}`);
	}

	/** Заголовок габарита: «front_width_cm» -> «Перед, ширина». */
	function dimensionTitle(key: string): string {
		const [piece, ...rest] = key.split('_');
		const name = $t(`piece.${piece}`);
		const what = rest.map((part) => $t(`dimension.${part}`)).join(', ');
		return what ? `${name}, ${what}` : name;
	}

	/** Короткая подпись габарита для узкой таблицы. */
	function shortDimensionTitle(key: string): string {
		if (key === 'front_width_cm') return $t('sizes.width');
		return dimensionTitle(key);
	}
</script>

<Card data-testid="size-grid-panel">
	<div class="panel">
	<h2>{$t('sizes.title')}</h2>
	{#if rows.length === 0}
		<p class="hint">{$t('sizes.empty')}</p>
	{:else}
		<div class="scroll">
			<table data-testid="size-grid">
				<thead>
					<tr>
						<th>{$t('sizes.size')}</th>
						{#each measurementKeys as key (key)}
							<th title={measureTitle(key)}>{shortMeasureTitle(key)}</th>
						{/each}
						{#each dimensionKeys as key (key)}
							<th title={key}>{shortDimensionTitle(key)}</th>
						{/each}
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.size)}
						<tr data-testid="size-row" data-size={row.size}>
							<td>{row.size}</td>
							{#each measurementKeys as key (key)}
								<td>{row.measurements[key] ?? '—'}</td>
							{/each}
							{#each dimensionKeys as key (key)}
								<td>{row.dimensions[key] ?? '—'}</td>
							{/each}
							<td>
								<Button variant="secondary" size="sm" onclick={() => onApply(row)}>
									{$t('sizes.apply')}
								</Button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
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

	.scroll {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}

	th,
	td {
		text-align: left;
		padding: var(--ui-space-tight) var(--ui-space-field);
		border-bottom: 1px solid var(--ui-line);
		white-space: nowrap;
	}

	th {
		color: var(--ui-ink-muted);
		font-weight: 500;
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
</style>
