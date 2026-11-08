<script lang="ts">
	import { Button } from '@monos/ui';
	import { t } from '$lib/i18n';

	const storageKey = 'shityo.onboarding.v1';
	let open = $state(false);
	let overlay = $state<HTMLDivElement | null>(null);

	$effect(() => {
		try {
			open = localStorage.getItem(storageKey) !== 'done';
		} catch {
			open = false;
		}
	});

	$effect(() => {
		if (open && overlay) {
			const focusable = overlay.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			focusable[0]?.focus();
		}
	});

	function dismiss() {
		open = false;
		try {
			localStorage.setItem(storageKey, 'done');
		} catch {
			// ignore
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open || !overlay) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			dismiss();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusable = Array.from(
			overlay.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => !el.matches(':disabled') && el.offsetParent !== null);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="overlay" bind:this={overlay} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" data-testid="onboarding">
		<div class="card">
			<h2 id="onboarding-title">{$t('onboarding.title')}</h2>
			<ol>
				<li><span class="num">1</span><span class="text">{$t('onboarding.step1')}</span></li>
				<li><span class="num">2</span><span class="text">{$t('onboarding.step2')}</span></li>
				<li><span class="num">3</span><span class="text">{$t('onboarding.step3')}</span></li>
			</ol>
			<div class="actions">
				<Button size="sm" variant="primary" onclick={dismiss}>{$t('onboarding.start')}</Button>
				<Button size="sm" variant="secondary" onclick={dismiss}>{$t('onboarding.skip')}</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		background: color-mix(in srgb, var(--ui-bg) 85%, transparent);
	}

	.card {
		width: min(420px, 100%);
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		padding: var(--space-6);
		box-shadow: 0 1px 0 var(--ui-line) inset;
	}

	h2 {
		margin: 0 0 var(--space-4);
		font-size: 18px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ui-ink);
	}

	ol {
		list-style: none;
		margin: 0 0 var(--space-5);
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}

	.num {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
		font-size: 12px;
		font-weight: 700;
		color: var(--ui-ink);
	}

	.text {
		padding-top: var(--space-half);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
	}
</style>
