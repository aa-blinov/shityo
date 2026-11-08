<script lang="ts">
	import { locale, t } from '$lib/i18n';
	import Term from '$lib/components/Term.svelte';
	import { MEASURE_TERMS } from '$lib/glossary';
	import { measurementRange } from '$lib/labels';
	import type { Snippet } from 'svelte';

	interface Props {
		keys: string[];
		values: Record<string, number>;
		defaults: Record<string, number>;
		onChange: (key: string, value: number) => void;
		/** Consequences of this measurement on the selected piece. */
		summary?: string;
		/** Источник мерок (клиент, типовой размер) между крупной цифрой и списком. */
		source?: Snippet;
	}

	let { keys, values, defaults, onChange, summary, source }: Props = $props();

	const GROUPS = [
		{
			id: 'circumferences',
			keys: ['bust', 'waist', 'hip', 'neck', 'biceps', 'wrist', 'thigh', 'knee', 'ankle']
		},
		{ id: 'shoulder', keys: ['shoulder_width', 'shoulder_slope', 'sleeve_length', 'arm_length'] },
		{ id: 'lengths', keys: [] }
	] as const;

	const grouped = $derived(
		GROUPS.map((group, index) => ({
			id: group.id,
			controls: keys
				.filter((key) => {
					const known = GROUPS.some((g) => (g.keys as readonly string[]).includes(key));
					return index === GROUPS.length - 1 ? !known : (group.keys as readonly string[]).includes(key);
				})
				.map((key) => ({
					key,
					label: $t(`measure.${key}`),
					value: values[key] ?? 0,
					base: defaults[key] ?? values[key] ?? 0,
					range: measurementRange(key)
				}))
		})).filter((group) => group.controls.length)
	);

	let selected = $state('');
	let previewValue: number | null = $state(null);
	const active = $derived(
		grouped.flatMap((group) => group.controls).find((control) => control.key === selected) ??
			grouped[0]?.controls[0]
	);
	const displayValue = $derived(
		previewValue !== null && active ? previewValue : active?.value ?? 0
	);
	const delta = $derived(active ? Math.round((displayValue - active.base) * 10) / 10 : 0);
	const valueText = $derived(active ? format(displayValue) : '');
	// Один кегль для целых и дробных значений: цифра не прыгает по высоте
	// при переходе 106 -> 106,5. Пять знаков помещаются в колонку.
	const figureSize = 54;
	const percent = $derived(
		active
			? ((displayValue - active.range.min) / Math.max(1, active.range.max - active.range.min)) * 100
			: 0
	);

	function select(key: string) {
		selected = key;
		previewValue = null;
	}

	function commitSlider(value: string) {
		if (!active) return;
		const parsed = Number(value);
		if (Number.isFinite(parsed)) onChange(active.key, parsed);
		previewValue = null;
	}

	let inputTimer: ReturnType<typeof setTimeout> | undefined;
	function handleInput(key: string, raw: string) {
		if (inputTimer) clearTimeout(inputTimer);
		inputTimer = setTimeout(() => {
			const parsed = Number(raw);
			if (Number.isFinite(parsed)) onChange(key, parsed);
		}, 200);
	}

	function format(value: number): string {
		// Дробная часть через запятую в русском интерфейсе.
		const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
		return $locale === 'ru' ? text.replace('.', ',') : text;
	}
</script>

<section class="hero" data-testid="measure-panel" aria-labelledby="measure-title">
	<h2 id="measure-title" class="sr-only">{$t('measures.title')}</h2>

	<!-- Сначала - чьи мерки (клиент, типовой размер), потом их правка. -->
	{@render source?.()}

	{#if active}
		<div class="active">
			<div class="active-head">
				<button class="active-name" onclick={() => select(active.key)}>{active.label}</button>
				{#if delta !== 0}
					<span class="delta is-delta">{delta > 0 ? '+' : ''}{format(delta)} {$t('unit.cm')}</span>
				{/if}
			</div>
			<div class="figure">
				<span class="num value" style={`font-size:${figureSize}px`}>{valueText}</span>
				<span class="unit">{$t('unit.cm')}</span>
			</div>
			<input
				class="slider"
				type="range"
				min={active.range.min}
				max={active.range.max}
				step={active.range.step}
				value={displayValue}
				style={`--pct:${Math.min(100, Math.max(0, percent))}%`}
				oninput={(event) => (previewValue = Number(event.currentTarget.value))}
				onchange={(event) => commitSlider(event.currentTarget.value)}
				aria-label={active.label}
			/>
			<div class="scale num">
				<span>{format(active.range.min)}</span>
				<span>{format(active.range.max)}</span>
			</div>
			{#if summary}
				<p class="answer num" data-testid="measure-answer">{summary}</p>
			{/if}
		</div>
	{/if}

	<div class="list">
		{#each grouped as group (group.id)}
			<div class="group">
				<span class="group-head label">{$t(`measures.${group.id}`)}</span>
				{#each group.controls as control (control.key)}
					<div class="row" class:on={active?.key === control.key}>
						<button class="row-name" onclick={() => select(control.key)}>
							<Term id={MEASURE_TERMS[control.key] ?? ''} link={false}>{control.label}</Term>
						</button>
						<input
							class="row-value num"
							type="number"
							id="measurement-{control.key}"
							data-testid="measurement-{control.key}"
							value={Number.isInteger(control.value) ? String(control.value) : control.value.toFixed(1)}
							min={control.range.min}
							max={control.range.max}
							step={control.range.step}
							oninput={(event) => handleInput(control.key, event.currentTarget.value)}
							aria-label={control.label}
						/>
					</div>
				{/each}
			</div>
		{/each}
		{#if !grouped.length}
			<p class="empty">{$t('measures.empty')}</p>
		{/if}
	</div>
</section>

<style>
	.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}

	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}

	.active {
		display: flex;
		flex-direction: column;
		gap: var(--space-half);
		padding: var(--space-3) 0 var(--space-2);
		border-top: 1px solid var(--ui-line);
		border-bottom: 1px solid var(--ui-line);
	}

	.active-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.active-name {
		background: none;
		border: 0;
		padding: 0;
		font-size: 11px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		cursor: default;
		text-align: left;
	}

	.delta {
		font-family: var(--ui-font);
		font-size: 11px;
		letter-spacing: 0.06em;
		color: var(--ui-ink-muted);
		font-variant-numeric: tabular-nums;
	}

	.delta.is-delta {
		color: var(--ui-accent);
	}

	.figure {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: var(--space-half) 0 var(--space-2);
	}

	.value {
		white-space: nowrap;
		line-height: 0.82;
		font-weight: 700;
		letter-spacing: -0.045em;
	}

	.unit {
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		padding-top: var(--space-2);
	}

	.slider {
		appearance: none;
		width: 100%;
		height: 18px;
		background: transparent;
		cursor: ew-resize;
	}

	.slider::-webkit-slider-runnable-track {
		height: 2px;
		background: linear-gradient(
			to right,
			var(--ui-accent) 0 var(--pct),
			var(--ui-line) var(--pct) 100%
		);
	}

	.slider::-moz-range-track {
		height: 2px;
		background: var(--ui-line);
	}

	.slider::-moz-range-progress {
		height: 2px;
		background: var(--ui-accent);
	}

	.slider::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		margin-top: -6px;
		border-radius: var(--ui-radius);
		background: var(--ui-accent);
		border: 3px solid var(--ui-bg);
		box-shadow: 0 0 0 1px var(--ui-accent);
	}

	.slider::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: var(--ui-radius);
		background: var(--ui-accent);
		border: 3px solid var(--ui-bg);
		box-shadow: 0 0 0 1px var(--ui-accent);
	}

	.scale {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--ui-ink-muted);
		margin-top: -2px;
	}

	.answer {
		margin: var(--space-2) 0 0;
		font-size: 12px;
		color: var(--ui-ink-soft);
		letter-spacing: 0.01em;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.group {
		display: flex;
		flex-direction: column;
	}

	.group-head {
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--ui-line);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 62px;
		align-items: center;
		gap: var(--space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 55%, transparent);
	}

	.row.on .row-name,
	.row.on .row-value {
		color: var(--ui-accent);
	}

	.row-name {
		background: none;
		border: 0;
		padding: var(--space-1) 0;
		text-align: left;
		font-size: 13px;
		color: var(--ui-ink-soft);
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-name:hover {
		color: var(--ui-ink);
	}

	.row-value {
		background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
		border: 1px solid transparent;
		padding: var(--space-1) var(--space-1);
		text-align: right;
		font-size: 13px;
		font-weight: 600;
		color: var(--ui-ink);
		width: 100%;
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.row-value:hover {
		border-color: var(--ui-line);
	}

	.row-value::-webkit-outer-spin-button,
	.row-value::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.row-value:focus {
		outline: none;
		border-color: var(--ui-accent);
		background: var(--ui-surface);
	}

	.empty {
		font-size: 13px;
		color: var(--ui-ink-muted);
		margin: 0;
	}
</style>
