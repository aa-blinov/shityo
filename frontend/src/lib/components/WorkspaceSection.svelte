<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Раздел боковой панели. Шаг показывает порядок подгонки: мерки, посадка,
	 * фасон, точки. Свёрнутый раздел остаётся в DOM: тесты и поиск по странице
	 * находят его поля.
	 */
	interface Props {
		title: string;
		step?: number;
		/** Короткое состояние справа: выбранная посадка, число замечаний. */
		meta?: string;
		tone?: 'neutral' | 'danger' | 'warning' | 'success';
		open?: boolean;
		testid?: string;
		children: Snippet;
	}

	let { title, step, meta = '', tone = 'neutral', open = true, testid, children }: Props = $props();

	// Свёрнутый или раскрытый раздел запоминается: швея настраивает панель
	// один раз. Хранилище может быть недоступно - тогда просто по умолчанию.
	const storageKey = $derived(testid ? `shityo.section.${testid}` : '');
	let remembered = $state<boolean | null>(null);
	$effect(() => {
		if (!storageKey) return;
		try {
			const value = localStorage.getItem(storageKey);
			remembered = value === null ? null : value === '1';
		} catch {
			remembered = null;
		}
	});
	function onToggle(event: Event) {
		const isOpen = (event.currentTarget as HTMLDetailsElement).open;
		if (isOpen === (remembered ?? open)) return;
		// Состояние держится и без хранилища: иначе смена подписи раздела
		// (число замечаний, размер) свернула бы раскрытый раздел.
		remembered = isOpen;
		if (!storageKey) return;
		try {
			localStorage.setItem(storageKey, isOpen ? '1' : '0');
		} catch {
			// без хранилища раздел просто не запоминается
		}
	}
</script>

<details class="section" open={remembered ?? open} ontoggle={onToggle} data-testid={testid}>
	<summary>
		{#if step}<span class="step num" aria-hidden="true">{step}</span>{/if}
		<span class="title">{title}</span>
		{#if meta}<span class="meta tone-{tone}">{meta}</span>{/if}
		<span class="chev" aria-hidden="true"></span>
	</summary>
	<div class="body">{@render children()}</div>
</details>

<style>
	.section {
		border-top: 1px solid var(--ui-line);
		min-width: 0;
	}
	.section:first-child {
		border-top: 0;
	}
	summary {
		list-style: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) 0;
		min-height: 24px;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: 2px;
	}
	.step {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
		display: inline-grid;
		place-items: center;
		border: 1px solid var(--ui-ink);
		border-radius: var(--ui-radius);
		font-size: 11px;
		font-weight: 700;
		color: var(--ui-ink);
	}
	.title {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink);
		white-space: nowrap;
	}
	.meta {
		margin-left: auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--ui-ink-soft);
	}
	.meta.tone-danger {
		color: var(--ui-danger, var(--ui-accent));
	}
	.meta.tone-warning {
		color: var(--ui-warning, var(--ui-accent));
	}
	.meta.tone-success {
		color: var(--ui-success, var(--ui-ink-soft));
	}
	.chev {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-right: 1px solid var(--ui-ink-muted);
		border-bottom: 1px solid var(--ui-ink-muted);
		transform: rotate(-45deg);
		margin: 0 var(--space-half) 0 var(--space-1);
		transition: transform 0.15s;
	}
	.meta + .chev {
		margin-left: var(--space-1);
	}
	.title + .chev {
		margin-left: auto;
	}
	details[open] > summary .chev {
		transform: rotate(45deg);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-bottom: var(--space-4);
		min-width: 0;
	}
</style>
