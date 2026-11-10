<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { ArrowUpRight } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import { glossaryEntry } from '$lib/glossary';

	/**
	 * Профессиональный термин в интерфейсе: пунктирное подчёркивание и
	 * подсказка с коротким определением из справочника. Вне кнопок по щелчку
	 * открывается карточка с определением прямо на месте: работа не прерывается,
	 * а полная статья открывается только явной ссылкой в карточке. Внутри кнопки
	 * (link={false}) - только подсказка, чтобы не вкладывать кнопку в кнопку.
	 */
	interface Props {
		id: string;
		link?: boolean;
		children: Snippet;
	}

	let { id, link = true, children }: Props = $props();
	const entry = $derived(glossaryEntry(id));
	// Один термин может встретиться на странице несколько раз: id карточки уникален.
	const propsId = $props.id();
	const uid = `term-card-${propsId}`;

	let open = $state(false);
	let trigger = $state<HTMLButtonElement>();
	let card = $state<HTMLDivElement>();
	let place = $state({ x: 0, y: 0 });

	// Карточка позиционируется по экрану, поэтому не обрезается панелями с
	// overflow: hidden; масштаб интерфейса учитывается, как у подсказок.
	async function toggle() {
		if (open) {
			open = false;
			return;
		}
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const scale = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
		const width = 300 * scale;
		const x = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
		place = { x: x / scale, y: (rect.bottom + 6) / scale };
		open = true;
		// У нижнего края экрана карточка открывается над термином.
		await tick();
		const height = card?.getBoundingClientRect().height ?? 0;
		if (rect.bottom + 6 + height > window.innerHeight - 8 && rect.top - 6 - height >= 8) {
			place = { x: x / scale, y: (rect.top - 6 - height) / scale };
		}
	}

	function outside(event: PointerEvent) {
		const target = event.target as Node;
		if (open && !card?.contains(target) && !trigger?.contains(target)) open = false;
	}
</script>

<svelte:document
	onpointerdown={outside}
	onkeydown={(event) => {
		if (open && event.key === 'Escape') {
			open = false;
			trigger?.focus();
		}
	}}
/>
<svelte:window onscroll={() => (open = false)} onresize={() => (open = false)} />

{#if !entry}
	{@render children()}
{:else if link}
	<button
		type="button"
		class="term"
		bind:this={trigger}
		aria-expanded={open}
		aria-controls={uid}
		data-tip={open ? undefined : entry.short}
		data-testid="term-{entry.id}"
		onclick={toggle}>{@render children()}</button
	>{#if open}<div
			class="card"
			id={uid}
			role="dialog"
			aria-label={entry.term}
			bind:this={card}
			style={`left:${place.x}px;top:${place.y}px`}
			data-testid="term-card"
		>
			<strong class="name">{entry.term}{#if entry.abbr}<span class="abbr">, {entry.abbr}</span>{/if}</strong>
			<p>{entry.short}</p>
			<a class="more" href={`/guide#${entry.id}`} target="_blank" rel="noopener" data-testid="term-more"
				>{$t('guide.open')}<ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true" /></a
			>
		</div>{/if}
{:else}
	<span class="term" data-tip={entry.short} title={entry.short} data-testid="term-{entry.id}">{@render children()}</span>
{/if}

<style>
	.term {
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		color: inherit;
		text-decoration: underline dotted;
		text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
		text-underline-offset: 3px;
		text-decoration-thickness: 1px;
		cursor: help;
	}
	button.term:hover,
	button.term[aria-expanded='true'] {
		color: var(--ui-accent-text);
		text-decoration-color: var(--ui-accent);
	}
	.card {
		position: fixed;
		z-index: 90;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 300px;
		padding: var(--space-3);
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		box-shadow: 0 6px 20px color-mix(in srgb, var(--ui-ink) 10%, transparent);
		font-size: 13px;
		line-height: 1.5;
		letter-spacing: 0;
		text-transform: none;
		text-align: left;
		color: var(--ui-ink);
		white-space: normal;
	}
	.name {
		font-weight: 600;
	}
	.abbr {
		font-weight: 400;
		color: var(--ui-ink-soft);
	}
	.card p {
		margin: 0;
		color: var(--ui-ink-soft);
	}
	.more {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		align-self: flex-start;
		font-size: 12px;
		color: var(--ui-ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.more:hover {
		color: var(--ui-accent-text);
	}
</style>
