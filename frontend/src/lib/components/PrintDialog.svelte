<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';

	/**
	 * Окно печати. Печать - последний шаг, а не постоянная панель: настройки
	 * бумаги нужны один раз за заказ, поэтому они открываются по кнопке и не
	 * занимают место рядом с чертежом.
	 */
	interface Props {
		onClose: () => void;
		children: Snippet;
	}

	let { onClose, children }: Props = $props();
	let dialog = $state<HTMLDivElement | null>(null);

	$effect(() => {
		const previous = document.activeElement as HTMLElement | null;
		dialog?.querySelector<HTMLElement>('button, [href], input')?.focus();
		return () => previous?.focus?.();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== 'Tab' || !dialog) return;
		const focusable = Array.from(
			dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, [href], summary')
		).filter((el) => !el.matches(':disabled'));
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="overlay" data-testid="print-dialog">
	<button type="button" class="backdrop" aria-label={$t('print.close')} tabindex="-1" onclick={onClose}></button>
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title" bind:this={dialog}>
		<header>
			<h2 id="print-dialog-title">{$t('print.title')}</h2>
			<button type="button" class="close" onclick={onClose} data-testid="print-close">{$t('print.close')}</button>
		</header>
		{@render children()}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		padding: var(--space-8) var(--space-4) var(--space-4);
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		background: color-mix(in srgb, var(--ui-bg) 70%, transparent);
		cursor: default;
	}
	.dialog {
		position: relative;
		width: min(380px, 100%);
		max-height: calc(100dvh - var(--space-8) - var(--space-4));
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
		background: var(--ui-surface);
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	h2 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ui-ink);
	}
	.close {
		background: none;
		border: 0;
		padding: var(--space-1) 0;
		font: inherit;
		font-size: 12px;
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.close:hover {
		color: var(--ui-ink);
	}
	@media (max-width: 767px) {
		.overlay {
			align-items: stretch;
			justify-content: center;
			padding: var(--space-3);
		}
		.dialog {
			max-height: none;
		}
	}
</style>
