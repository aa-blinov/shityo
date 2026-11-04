<script lang="ts">
	import { Card, TextField } from '@monos/ui';
	import { t } from '$lib/i18n';
	import { measurementRange } from '$lib/labels';

	interface Props {
		/** Measurement ids the current model consumes. */
		keys: string[];
		/** Current values in centimetres. */
		values: Record<string, number>;
		onChange: (key: string, value: number) => void;
	}

	let { keys, values, onChange }: Props = $props();


	const controls = $derived(
		keys.map((key) => {
			const range = measurementRange(key);
			return {
				key,
				label: $t(`measure.${key}`),
				value: values[key] ?? 0,
				min: range.min,
				max: range.max,
				step: range.step
			};
		})
	);

 const groups=$derived([
  {id:'circumferences',controls:controls.filter(c=>['bust','waist','hip','neck','biceps','wrist','thigh','knee','ankle'].includes(c.key))},
  {id:'shoulder',controls:controls.filter(c=>['shoulder_width','shoulder_slope','sleeve_length','arm_length'].includes(c.key))},
  {id:'lengths',controls:controls.filter(c=>!['bust','waist','hip','neck','biceps','wrist','thigh','knee','ankle','shoulder_width','shoulder_slope','sleeve_length','arm_length'].includes(c.key))}
 ].filter(group=>group.controls.length));
 function handleInput(key: string, raw: string) {
		const value = Number(raw);
		if (!Number.isFinite(value)) return;
		onChange(key, value);
	}
</script>

<Card data-testid="measure-panel">
	<div class="panel">
	<h2>{$t('measures.title')}</h2>
	{#each groups as group (group.id)}
 <details open><summary>{$t(`measures.${group.id}`)}</summary><div class="group-fields">
 {#each group.controls as control (control.key)}
		<div class="field">
			<TextField
				id="measurement-{control.key}"
				data-testid="measurement-{control.key}"
				label={control.label}
				type="number"
				value={String(control.value)}
				min={control.min}
				max={control.max}
				step={control.step}
				onchange={(event) => handleInput(control.key, event.currentTarget.value)}
			/>
		</div>
	{/each}
 </div></details>
 {/each}
	{#if controls.length === 0}
		<p class="hint">{$t('measures.empty')}</p>
	{/if}
	</div>
</Card>

<style>
 summary{cursor:pointer;font-size:13px;font-weight:600;padding:8px 0;}
 .group-fields{display:flex;flex-direction:column;gap:12px;padding-top:8px;}
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
