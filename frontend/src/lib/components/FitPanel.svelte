<script lang="ts">
	import Term from '$lib/components/Term.svelte';
	import { EASE_TERMS } from '$lib/glossary';
	import { hasKey, t } from '$lib/i18n';
	import {
		easeFactor,
		easeKeys,
		effectiveEase,
		matchPreset,
		presetEase,
		presetsFor,
		presetValues,
		type FitPreset
	} from '$lib/presets';
	import type { CatalogItem } from '$lib/types';

	/**
	 * Посадка: готовые пресеты и прибавки. Швея выбирает силуэт одной кнопкой,
	 * а потом подгоняет прибавки под ткань и клиента. Рядом с каждой прибавкой
	 * видно, сколько она даст в изделии с учётом посадки.
	 */
	interface Props {
		item: CatalogItem;
		params: Record<string, string | number>;
		/** Несколько параметров за раз: пресет должен попасть в историю одним шагом. */
		onApply: (values: Record<string, string | number>) => void;
		onChange: (key: string, value: number) => void;
	}

	let { item, params, onApply, onChange }: Props = $props();

	const presets = $derived(presetsFor(item));
	const match = $derived(matchPreset(item, params));
	const eases = $derived(easeKeys(item));
	const factor = $derived(easeFactor(item, params.fit));

	function presetName(preset: FitPreset): string {
		const own = `preset.${item.id}.${preset.id}`;
		return hasKey(own) ? $t(own) : $t(`preset.${preset.id}`);
	}

	function presetText(preset: FitPreset): string {
		const own = `preset.${item.id}.${preset.id}.text`;
		return hasKey(own) ? $t(own) : $t(`preset.${preset.id}.text`);
	}

	/** «грудь +4.4 · талия +2» - что пресет даст в изделии. */
	function easeLine(preset: FitPreset): string {
		const values = presetEase(item, preset);
		return Object.entries(values)
			.filter(([key, value]) => value !== null && key !== 'ease_length')
			.map(([key, value]) => `${$t(`fit.short.${key}`)} +${fmt(value as number)}`)
			.join(' · ');
	}

	function fmt(value: number): string {
		return Number.isInteger(value) ? String(value) : value.toFixed(1);
	}

	function resetEase() {
		if (!match.preset) return;
		onApply(presetValues(item, match.preset));
	}
</script>

<div class="fit" data-testid="fit-panel">
	{#if presets.length}
		<div class="presets" role="group" aria-label={$t('fit.presets')}>
			{#each presets as preset (preset.id)}
				{@const on = match.preset?.id === preset.id}
				<button
					type="button"
					class="preset"
					class:on
					aria-pressed={on}
					data-testid="preset-{preset.id}"
					title={presetText(preset)}
					onclick={() => onApply(presetValues(item, preset))}
				>
					<span class="name">{presetName(preset)}</span>
					<span class="ease num">{easeLine(preset) || presetText(preset)}</span>
				</button>
			{/each}
		</div>
		<p class="state" data-testid="fit-state">
			{#if match.preset}
				{presetText(match.preset)}
				{#if match.tuned}<span class="tuned">{$t('fit.tuned')}</span>{/if}
			{:else}
				{$t('fit.custom')}
			{/if}
		</p>
	{/if}

	{#if eases.length}
		<div class="ease-list">
			<div class="ease-head">
				<span>{$t('fit.ease')}</span>
				{#if factor !== null && factor !== 1}
					<span class="factor num">{$t('fit.factor', { factor: String(factor).replace('.', ',') })}</span>
				{/if}
			</div>
			{#each eases as key (key)}
				{@const spec = item.params[key]}
				{@const result = effectiveEase(item, params, key)}
				<label class="ease-row" for="param-{key}">
					<span class="ease-name"><Term id={EASE_TERMS[key] ?? ''} link={false}>{$t(`fit.short.${key}`)}</Term></span>
					<input
						class="ease-value num"
						type="number"
						id="param-{key}"
						data-testid="param-{key}"
						value={String(Number(params[key] ?? spec.default))}
						min={spec.min}
						max={spec.max}
						step={spec.step ?? 0.5}
						onchange={(event) => {
							const value = Number(event.currentTarget.value);
							if (Number.isFinite(value)) onChange(key, value);
						}}
					/>
					<span class="ease-result num" title={$t('fit.inGarmentTitle')}>
						{result === null ? '' : $t('fit.inGarment', { value: fmt(result) })}
					</span>
				</label>
			{/each}
			{#if match.tuned && match.preset}
				<button type="button" class="reset" onclick={resetEase}>{$t('fit.reset')}</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.fit {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-1);
	}
	.preset {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-half);
		min-width: 0;
		padding: var(--space-2) var(--space-2);
		text-align: left;
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		color: var(--ui-ink);
		cursor: pointer;
	}
	.preset:hover {
		border-color: var(--ui-ink-soft);
	}
	.preset:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: 1px;
	}
	.preset.on {
		background: var(--ui-accent);
		border-color: var(--ui-accent);
		color: var(--ui-surface);
	}
	.name {
		font-size: 13px;
		font-weight: 600;
		line-height: 1.3;
		max-width: 100%;
	}
	.ease {
		font-size: 11px;
		color: var(--ui-ink-muted);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.preset.on .ease {
		color: color-mix(in srgb, var(--ui-bg) 75%, transparent);
	}
	.state {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	.tuned {
		display: block;
		color: var(--ui-accent);
	}
	.ease-list {
		display: flex;
		flex-direction: column;
	}
	.ease-head {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		padding-bottom: var(--space-1);
		border-bottom: 1px solid var(--ui-line);
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.factor {
		letter-spacing: 0.04em;
		text-transform: none;
	}
	.ease-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 56px minmax(0, max-content);
		align-items: center;
		gap: var(--space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 55%, transparent);
	}
	.ease-name::first-letter {
		text-transform: uppercase;
	}
	.ease-name {
		padding: var(--space-1) 0;
		font-size: 13px;
		color: var(--ui-ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ease-value {
		width: 100%;
		background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
		border: 1px solid transparent;
		padding: var(--space-1) var(--space-1);
		text-align: right;
		font-size: 13px;
		font-weight: 600;
		color: var(--ui-ink);
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.ease-value::-webkit-outer-spin-button,
	.ease-value::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}
	.ease-value:hover {
		border-color: var(--ui-line);
	}

	.ease-value:focus {
		outline: none;
		border-color: var(--ui-accent);
		background: var(--ui-surface);
	}
	.ease-result {
		font-size: 12px;
		color: var(--ui-ink-muted);
		text-align: right;
		white-space: nowrap;
	}
	.reset {
		align-self: flex-start;
		margin-top: var(--space-2);
		padding: var(--space-1) 0;
		background: none;
		border: 0;
		font-size: 12px;
		text-decoration: underline;
		text-underline-offset: 3px;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.reset:hover {
		color: var(--ui-ink);
	}
</style>
