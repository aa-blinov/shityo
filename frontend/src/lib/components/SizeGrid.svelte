<script lang="ts">
	import Term from '$lib/components/Term.svelte';
	import { t } from '$lib/i18n';
	import { heightsOf, rowHeight, rowsForHeight } from '$lib/sizes';
	import type { SizeGridRow } from '$lib/types';

	/**
	 * Типовой размер по ГОСТ: рост и размер отдельными кнопками, как в
	 * обозначении типовой фигуры (164-92-98). Щелчок подставляет мерки.
	 */
	interface Props {
		rows: SizeGridRow[];
		onApply: (row: SizeGridRow) => void;
		/** Текущие мерки: совпадающий размер подсвечивается. */
		values?: Record<string, number>;
	}

	let { rows, onApply, values = {} }: Props = $props();

	function matches(row: SizeGridRow): boolean {
		const entries = Object.entries(row.measurements);
		return entries.length > 0 && entries.every(([key, value]) => values[key] === value);
	}

	const current = $derived(rows.find(matches));
	const heights = $derived(heightsOf(rows));
	let chosenHeight = $state<number | null>(null);
	// Рост: выбранный кнопкой, иначе рост совпавшей строки, иначе по мерке роста.
	const height = $derived(
		chosenHeight ?? (current ? rowHeight(current) : rowHeight(rowsForHeight(rows, values.height)[0] ?? rows[0]))
	);
	const visible = $derived(rowsForHeight(rows, height));

	function pickHeight(next: number) {
		chosenHeight = next;
		// Тот же размер в другом росте: обхваты прежние, длины - нового роста.
		const size = current?.size;
		const row = size ? rowsForHeight(rows, next).find((r) => r.size === size) : undefined;
		if (row) onApply(row);
	}

	function title(row: SizeGridRow): string {
		const girths = Object.entries(row.measurements)
			.slice(0, 3)
			.map(([key, value]) => `${$t(`measure.${key}`)} ${value}`)
			.join(', ');
		return row.designation ? `${row.designation}: ${girths}` : girths;
	}
</script>

<div class="sizes" data-testid="size-grid-panel">
	<span class="label">{$t('sizes.quick')}</span>
	{#if rows.length === 0}
		<p class="hint">{$t('sizes.empty')}</p>
	{:else}
		{#if heights.length > 1}
			<span class="sub"><Term id="rost">{$t('sizes.height')}</Term></span>
			<div class="chips" role="group" aria-label={$t('sizes.height')} data-testid="size-heights">
				{#each heights as h (h)}
					<button
						type="button"
						class="chip num"
						class:on={h === height}
						aria-pressed={h === height}
						data-height={h}
						onclick={() => pickHeight(h)}>{h}</button
					>
				{/each}
			</div>
		{/if}
		<span class="sub"><Term id="razmer">{$t('sizes.size')}</Term></span>
		<div class="chips" data-testid="size-grid" role="group" aria-label={$t('sizes.quick')}>
			{#each visible as row (`${row.size}:${rowHeight(row)}`)}
				{@const on = matches(row)}
				<button
					type="button"
					class="chip num"
					class:on
					aria-pressed={on}
					data-testid="size-row"
					data-size={row.size}
					title={title(row)}
					onclick={() => onApply(row)}>{row.size}</button
				>
			{/each}
		</div>
		{#if current?.designation}
			<p class="designation num" data-testid="size-designation">{$t('sizes.designation', { value: current.designation })}</p>
		{/if}
	{/if}
</div>

<style>
	.sizes {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.label {
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.sub {
		margin-top: var(--space-1);
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	/* Ровная сетка: все ростовки и размеры одной ширины и в одну строку на
	   обычной ширине панели, без одиноких «194» и «58» на новой строке. */
	.chips {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(30px, 1fr));
		gap: 2px;
	}
	.chip {
		min-width: 0;
		padding: var(--space-1) 0;
		text-align: center;
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		font-size: 12px;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--ui-ink-soft);
		color: var(--ui-ink);
	}
	.chip:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: 1px;
	}
	.chip.on {
		background: var(--ui-accent);
		border-color: var(--ui-accent);
		color: var(--ui-surface);
	}
	.hint,
	.designation {
		margin: 0;
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
</style>
