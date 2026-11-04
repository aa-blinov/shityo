<script lang="ts">
	import { Card, SelectField, TextField } from '@monos/ui';
	import { hasKey, t } from '$lib/i18n';
	import type { ParamDescriptor } from '$lib/types';

	interface Props {
		/** Parameter descriptions from the catalogue. */
		descriptors: Record<string, ParamDescriptor>;
		/** Current parameter values. */
		values: Record<string, string | number>;
		onChange: (key: string, value: string | number) => void;
	}

	let { descriptors, values, onChange }: Props = $props();


	const controls = $derived(
		Object.entries(descriptors).map(([key, descriptor]) => ({
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

<Card data-testid="param-panel">
	<div class="panel">
	<h2>{$t('params.title')}</h2>
	{#each controls as control (control.key)}
		<div class="field">
			{#if control.descriptor.type === 'select'}
				<SelectField
					id="param-{control.key}"
					data-testid="param-{control.key}"
					label={control.label}
					value={String(control.value)}
					options={(control.descriptor.options ?? []).map((option) => ({
						value: option.value,
						label: optionLabel(control.key, option.value, option.label)
					}))}
					onchange={(event) => onChange(control.key, event.currentTarget.value)}
				/>
			{:else}
				<TextField
					id="param-{control.key}"
					data-testid="param-{control.key}"
					label={control.label}
					type="number"
					value={String(Number(control.value))}
					min={control.descriptor.min}
					max={control.descriptor.max}
					step={control.descriptor.step ?? 1}
					hint={control.descriptor.unit ? `(${unitLabel(control.descriptor.unit)})` : ''}
					onchange={(event) => handleNumber(control.key, event.currentTarget.value)}
				/>
			{/if}
		</div>
	{/each}
	{#if controls.length === 0}
		<p class="hint">{$t('params.empty')}</p>
	{/if}
	</div>
</Card>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-input);
	}

	h2 {
		margin: 0;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ui-ink-soft);
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
</style>
