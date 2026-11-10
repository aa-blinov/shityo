<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import type { Crumb } from '$lib/navigation';
	import type { Snippet } from 'svelte';

	/**
	 * Крошки одинаковые на всех вложенных страницах: стрелка ведёт на
	 * ближайший уровень выше, дальше путь через косую черту, в конце -
	 * текущая страница (её передают через children).
	 */
	interface Props {
		trail: Crumb[];
		children?: Snippet;
		label?: string;
	}
	let { trail, children, label }: Props = $props();

	const text = (crumb: Crumb) => (crumb.raw ? crumb.label : $t(crumb.label));
	const parent = $derived([...trail].reverse().find((crumb) => crumb.href));
</script>

<nav class="crumbs" aria-label={label ?? $t('nav.crumbs')} data-testid="crumbs">
	{#if parent}
		<a class="back" href={parent.href} data-testid="crumbs-back" aria-label={`${$t('nav.back')}: ${text(parent)}`}>
			<ArrowLeft size={14} aria-hidden="true" />
		</a>
	{/if}
	{#each trail as crumb, i (i)}
		{#if i > 0}<span class="sep" aria-hidden="true">/</span>{/if}
		{#if crumb.href}
			<a class="link" href={crumb.href}>{text(crumb)}</a>
		{:else}
			<span class="link">{text(crumb)}</span>
		{/if}
	{/each}
	{#if children}
		<span class="sep" aria-hidden="true">/</span>
		{@render children()}
	{/if}
</nav>

<style>
	.crumbs {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		flex: 0 1 auto;
		font-size: 13px;
	}
	.back {
		display: inline-flex;
		align-items: center;
		color: var(--ui-ink-soft);
		text-decoration: none;
	}
	.link {
		color: var(--ui-ink-soft);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 24ch;
	}
	a.link:hover,
	.back:hover {
		color: var(--ui-ink);
	}
	.sep {
		color: var(--ui-ink-muted);
	}
</style>
