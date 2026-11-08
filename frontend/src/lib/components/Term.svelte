<script lang="ts">
	import type { Snippet } from 'svelte';
	import { t } from '$lib/i18n';
	import { glossaryEntry } from '$lib/glossary';

	/**
	 * Профессиональный термин в интерфейсе: пунктирное подчёркивание и
	 * подсказка с коротким определением из справочника. Вне кнопок термин -
	 * ссылка на полную статью; внутри кнопки (link={false}) - только подсказка,
	 * чтобы не вкладывать ссылку в кнопку.
	 */
	interface Props {
		id: string;
		link?: boolean;
		children: Snippet;
	}

	let { id, link = true, children }: Props = $props();
	const entry = $derived(glossaryEntry(id));
	// Один термин может встретиться на странице несколько раз: id описания уникален.
	const propsId = $props.id();
	const uid = `term-def-${propsId}`;
	const tip = $derived(entry ? `${entry.short} ${$t('guide.more')}` : '');
</script>

{#if !entry}
	{@render children()}
{:else if link}
	<!-- Определение - описание ссылки, а не часть её имени: скринридер читает «Сгиб», затем пояснение. -->
	<a class="term" href={`/guide#${entry.id}`} target="_blank" rel="noopener" data-tip={tip} aria-describedby={uid} data-testid="term-{entry.id}">{@render children()}</a><span class="sr-only" id={uid}>{entry.short}</span>
{:else}
	<span class="term" data-tip={entry.short} title={entry.short} data-testid="term-{entry.id}">{@render children()}</span>
{/if}

<style>
	.term {
		color: inherit;
		text-decoration: underline dotted;
		text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
		text-underline-offset: 3px;
		text-decoration-thickness: 1px;
		cursor: help;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	a.term:hover {
		color: var(--ui-accent-text);
		text-decoration-color: var(--ui-accent);
	}
</style>
