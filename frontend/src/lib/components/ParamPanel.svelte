<script lang="ts">
	import ChoiceChips from '$lib/components/ChoiceChips.svelte';
	import { hasKey, t } from '$lib/i18n';
	import type { ParamDescriptor } from '$lib/types';

	interface Props {
		/** Parameter descriptions from the catalogue. */
		descriptors: Record<string, ParamDescriptor>;
		/** Current parameter values. */
		values: Record<string, string | number>;
		onChange: (key: string, value: string | number) => void;
		/** Параметры, которые показывает другая панель (посадка и прибавки). */
		exclude?: (key: string) => boolean;
	}

	let { descriptors, values, onChange, exclude = () => false }: Props = $props();


	const controls = $derived(
		Object.entries(descriptors).filter(([key]) => !exclude(key)).map(([key, descriptor]) => ({
			key,
			label: $t(`param.${key}`),
			descriptor,
			value: values[key] ?? descriptor.default
		}))
	);

	/**
	 * Подпись варианта. У параметров-выборов значения известны
	 * («regular», «crew»), и у каждого есть свой ключ в словаре; у
	 * остальных подпись приходит с сервера.
	 */
	function optionLabel(paramKey: string, value: string, fallback: string): string {
		const key = `param.${paramKey}.${value}`;
		return hasKey(key) ? $t(key) : fallback;
	}

	/**
	 * Единица измерения. Сервер отдаёт «cm», в русском интерфейсе единица
	 * должна быть «см».
	 */
	function unitLabel(unit: string): string {
		const key = `unit.${unit}`;
		return hasKey(key) ? $t(key) : unit;
	}

	function handleNumber(key: string, raw: string) {
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		onChange(key, value);
	}
</script>

<div class="panel" data-testid="param-panel">
	{#each controls as control (control.key)}
		<div class="field">
			{#if control.descriptor.type === 'select'}
				<ChoiceChips
					testid="param-{control.key}"
					label={control.label}
					value={String(control.value)}
					options={(control.descriptor.options ?? []).map((option) => ({
						value: option.value,
						label: optionLabel(control.key, option.value, option.label)
					}))}
					onChange={(value) => onChange(control.key, value)}
				/>
			{:else}
				<!-- Числа - строкой, как мерки и прибавки: колонка читается одной таблицей. -->
				<label class="row" for="param-{control.key}">
					<span class="row-name" title={control.label}>{control.label}</span>
					<input
						class="row-value num"
						type="number"
						id="param-{control.key}"
						data-testid="param-{control.key}"
						value={String(Number(control.value))}
						min={control.descriptor.min}
						max={control.descriptor.max}
						step={control.descriptor.step ?? 1}
						onchange={(event) => handleNumber(control.key, event.currentTarget.value)}
					/>
					<span class="row-unit">{control.descriptor.unit ? unitLabel(control.descriptor.unit) : ''}</span>
				</label>
			{/if}
		</div>
	{/each}
	{#if controls.length === 0}
		<p class="hint">{$t('params.empty')}</p>
	{/if}
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 56px 28px;
		align-items: center;
		gap: var(--space-2);
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 55%, transparent);
	}

	.row-name {
		padding: var(--space-1) 0;
		font-size: 13px;
		color: var(--ui-ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-value {
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

	.row-value::-webkit-outer-spin-button,
	.row-value::-webkit-inner-spin-button {
		appearance: none;
		margin: 0;
	}

	.row-value:hover {
		border-color: var(--ui-line);
	}

	.row-value:focus {
		outline: none;
		border-color: var(--ui-accent);
		background: var(--ui-surface);
	}

	.row-unit {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}

	.hint {
		margin: 0;
		font-size: 13px;
		color: var(--ui-ink-muted);
	}
</style>
