<script lang="ts">
	import { onMount } from 'svelte';
	import { ExternalLink, Search } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import { GLOSSARY, SECTIONS, type GlossaryEntry } from '$lib/glossary';

	/**
	 * Справочник по лекалам: путь заказа по шагам и словарь терминов. Каждая
	 * статья - определение из ГОСТ или учебника с источником и подсказка, где
	 * это в Shityo. Термины в интерфейсе ведут сюда по ссылке.
	 */
	let query = $state('');
	let active = $state('');

	const STEPS = [
		{ id: 'client', terms: [] },
		{ id: 'measure', terms: ['tipovaya_figura', 'razmer', 'rost', 'sg3'] },
		{ id: 'block', terms: ['bazovaya_konstrukciya', 'chertezh_konstrukcii'] },
		{ id: 'fit', terms: ['pribavka_na_svobodnoe_obleganie', 'siluet'] },
		{ id: 'check', terms: ['sopryazhenie_srezov', 'posadka_po_okatu'] },
		{ id: 'save', terms: [] },
		{ id: 'print', terms: ['lekalo', 'pripusk_na_shov', 'nadsechka', 'dolevaya_nit'] },
		{ id: 'toile', terms: ['maket_mulyazh', 'primerka', 'balans', 'defekty_posadki'] }
	] as const;

	const found = $derived(
		query.trim()
			? GLOSSARY.filter((entry) =>
					`${entry.term} ${entry.abbr ?? ''} ${entry.short} ${entry.full} ${entry.ui ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
				)
			: GLOSSARY
	);
	const bySection = $derived(
		SECTIONS.map((section) => ({
			section,
			entries: found.filter((entry) => entry.section === section)
		})).filter((group) => group.entries.length)
	);
	const known = $derived(new Set(GLOSSARY.map((entry) => entry.id)));

	function host(url: string): string {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	}

	onMount(() => {
		// Подсветка статьи, на которую пришли по ссылке из интерфейса.
		// Переход к статье сбрасывает поиск: иначе карточка может быть скрыта фильтром.
		const sync = () => {
			active = decodeURIComponent(location.hash.slice(1));
			if (active && !active.startsWith('section-') && active !== 'path') query = '';
		};
		sync();
		window.addEventListener('hashchange', sync);
		if (active) document.getElementById(active)?.scrollIntoView({ block: 'center' });
		return () => window.removeEventListener('hashchange', sync);
	});

	function termLabel(id: string): string {
		return GLOSSARY.find((entry) => entry.id === id)?.term ?? id;
	}
</script>

<svelte:head>
	<title>{$t('guide.title')} — Shityo</title>
</svelte:head>

<div class="guide">
	<aside class="nav" aria-label={$t('guide.contents')}>
		<label class="search">
			<Search size={14} strokeWidth={1.8} />
			<input
				type="search"
				placeholder={$t('guide.search')}
				aria-label={$t('guide.search')}
				bind:value={query}
				data-testid="guide-search"
			/>
		</label>
		{#if query.trim()}<p class="found" aria-live="polite">{$t('guide.found', { count: found.length })}</p>{/if}
		<a class="nav-link" href="#path">{$t('guide.path')}</a>
		{#each bySection as group (group.section)}
			<a class="nav-link" href={`#section-${group.section}`}>{$t(`guide.section.${group.section}`)}<span class="num">{group.entries.length}</span></a>
		{/each}
	</aside>

	<main class="content">
		<header class="intro">
			<h1>{$t('guide.title')}</h1>
			<p>{$t('guide.lead')}</p>
		</header>

		{#if !query.trim()}
			<section id="path" class="path" aria-labelledby="path-title">
				<h2 id="path-title">{$t('guide.path')}</h2>
				<ol>
					{#each STEPS as step, index (step.id)}
						<li>
							<span class="step-n num">{index + 1}</span>
							<div>
								<h3>{$t(`guide.step.${step.id}`)}</h3>
								<p>{$t(`guide.step.${step.id}.text`)}</p>
								<p class="step-terms">
									{#each step.terms.filter((id) => known.has(id)) as id (id)}
										<a href={`#${id}`}>{termLabel(id)}</a>
									{/each}
								</p>
							</div>
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		{#each bySection as group (group.section)}
			<section id={`section-${group.section}`} class="section" aria-labelledby={`title-${group.section}`}>
				<h2 id={`title-${group.section}`}>{$t(`guide.section.${group.section}`)}</h2>
				<div class="cards">
					{#each group.entries as entry (entry.id)}
						{@render card(entry)}
					{/each}
				</div>
			</section>
		{:else}
			<p class="empty">{$t('guide.nothing')}</p>
		{/each}

		<p class="sources">{$t('guide.sourcesNote')}</p>
	</main>
</div>

{#snippet card(entry: GlossaryEntry)}
	<article id={entry.id} class="card" class:active={active === entry.id} data-testid="guide-entry">
		<h3>{entry.term}{#if entry.abbr}<span class="abbr">{entry.abbr}</span>{/if}</h3>
		<p class="full">{entry.full}</p>
		{#if entry.ui}
			<div class="ui">
				<span class="ui-label">{$t('guide.inApp')}</span>
				<p>{entry.ui}</p>
			</div>
		{/if}
		<a class="source" href={entry.url} target="_blank" rel="noopener noreferrer">
			{entry.source}<span class="host">{host(entry.url)}</span><ExternalLink size={12} strokeWidth={1.8} />
		</a>
	</article>
{/snippet}

<style>
	.guide {
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		gap: var(--space-8);
		max-width: 1160px;
		margin: 0 auto;
		padding: var(--space-6);
	}
	.nav {
		position: sticky;
		top: var(--space-4);
		align-self: start;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: calc(100dvh - 120px);
		overflow-y: auto;
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
		padding: 0 var(--space-2);
		height: 34px;
		background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
		border: 1px solid transparent;
		border-radius: var(--ui-radius);
		color: var(--ui-ink-muted);
	}
	.search:focus-within {
		border-color: var(--ui-accent);
		background: var(--ui-surface);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font: inherit;
		font-size: 14px;
		color: var(--ui-ink);
		outline: none;
	}
	.found {
		margin: 0 0 var(--space-2);
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.nav-link {
		display: flex;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		border-left: 2px solid transparent;
		font-size: 14px;
		color: var(--ui-ink-soft);
		text-decoration: none;
	}
	.nav-link:hover {
		color: var(--ui-ink);
		border-left-color: var(--ui-accent);
	}
	.nav-link .num {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		min-width: 0;
	}
	.intro h1 {
		margin: 0;
		font-size: clamp(28px, 4vw, 40px);
		letter-spacing: -0.02em;
	}
	.intro p {
		margin: var(--space-2) 0 0;
		max-width: 62ch;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ui-ink-soft);
	}
	h2 {
		margin: 0 0 var(--space-4);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
		font-size: 13px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.path ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-3);
	}
	.path li {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
	}
	.step-n {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		background: var(--ui-accent);
		color: var(--ui-surface);
		border-radius: 50%;
		font-weight: 700;
	}
	.path h3,
	.card h3 {
		margin: 0;
		font-size: 16px;
		line-height: 1.3;
	}
	.path p {
		margin: var(--space-1) 0 0;
		font-size: 14px;
		line-height: 1.55;
		color: var(--ui-ink-soft);
	}
	.step-terms {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
	}
	.step-terms a,
	.source {
		color: var(--ui-accent-text);
		text-decoration: underline dotted;
		text-underline-offset: 3px;
	}
	.section {
		scroll-margin-top: var(--space-4);
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: var(--space-3);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--ui-surface);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		scroll-margin-top: var(--space-8);
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.card.active {
		border-color: var(--ui-accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 18%, transparent);
	}
	.abbr {
		margin-left: var(--space-2);
		padding: 0 var(--space-1);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		font-size: 12px;
		font-weight: 600;
		color: var(--ui-ink-soft);
		vertical-align: 2px;
	}
	.full {
		margin: 0;
		font-size: 14px;
		line-height: 1.6;
		color: var(--ui-ink);
	}
	.ui {
		padding: var(--space-2) var(--space-3);
		background: color-mix(in srgb, var(--ui-accent) 7%, transparent);
		border-left: 2px solid var(--ui-accent);
	}
	.ui-label {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-accent-text);
	}
	.ui p {
		margin: var(--space-half) 0 0;
		font-size: 13px;
		line-height: 1.55;
	}
	.source {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-top: auto;
		font-size: 12px;
	}
	.host {
		color: var(--ui-ink-muted);
	}
	.empty,
	.sources {
		margin: 0;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ui-ink-muted);
	}
	@media (max-width: 1000px) {
		.guide {
			grid-template-columns: 1fr;
		}
		.nav {
			position: static;
			max-height: none;
			flex-direction: row;
			flex-wrap: wrap;
		}
		.search {
			flex-basis: 100%;
		}
	}
</style>
