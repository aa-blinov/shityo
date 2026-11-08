<script lang="ts">
	/**
	 * Выбор одного варианта кнопками. В узких боковых панелях заменяет
	 * выпадающие списки: все варианты видны сразу, выбор - один щелчок.
	 */
	interface Option {
		value: string;
		label: string;
		title?: string;
	}

	interface Props {
		label: string;
		options: Option[];
		value: string;
		onChange: (value: string) => void;
		testid?: string;
		/** Варианты растягиваются на всю ширину (2-3 коротких варианта). */
		full?: boolean;
		/** Подпись над кнопками не показывается, но остаётся для чтения с экрана. */
		hideLabel?: boolean;
	}

	let { label, options, value, onChange, testid, full = false, hideLabel = false }: Props = $props();
</script>

<div class="choice">
	<span class="label" class:sr-only={hideLabel}>{label}</span>
	<div class="chips" class:full role="group" aria-label={label} data-testid={testid}>
		{#each options as option (option.value)}
			<button
				type="button"
				class="chip"
				class:on={value === option.value}
				aria-pressed={value === option.value}
				data-value={option.value}
				title={option.title}
				onclick={() => {
					if (option.value !== value) onChange(option.value);
				}}>{option.label}</button
			>
		{/each}
	</div>
</div>

<style>
	.choice {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.label {
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.chips.full .chip {
		flex: 1;
	}
	.chip {
		min-width: 34px;
		max-width: 100%;
		padding: var(--space-1) var(--space-2);
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		font: inherit;
		font-size: 12px;
		color: var(--ui-ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
</style>
