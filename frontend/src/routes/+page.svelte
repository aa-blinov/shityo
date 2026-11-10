<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Button } from '@monos/ui';
	import ContinueWork from '$lib/components/ContinueWork.svelte';
	import GarmentSketch from '$lib/components/GarmentSketch.svelte';
	import { goto } from '$app/navigation';
	import { hasKey, t, tn } from '$lib/i18n';
	import { loadProjects, type DesignProject } from '$lib/projects';
	import { listClients, type Client } from '$lib/clients';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const items = $derived(data.items);
	// Группы, как их делит конструирование одежды: плечевые изделия, поясные,
	// трикотажный верх и бельё. Основа, которой нет в группах, попадает в «Другое».
	const GROUPS = [
		{ id: 'shoulder', models: ['shirt', 'dress', 'vest', 'coat'] },
		{ id: 'waist', models: ['trousers', 'skirt'] },
		{ id: 'knit', models: ['tee', 'longsleeve', 'sweatshirt', 'hoodie', 'jumper', 'cardigan'] },
		{ id: 'lingerie', models: ['briefs', 'boxers', 'bralette', 'slip'] }
	];
	const grouped = $derived(
		[
			...GROUPS.map((group) => ({
				id: group.id,
				items: group.models
					.map((id) => items.find((item) => item.id === id))
					.filter((item) => !!item)
			})),
			{ id: 'other', items: items.filter((item) => !GROUPS.some((g) => g.models.includes(item.id))) }
		].filter((group) => group.items.length)
	);

	const advantages = ['measurements', 'seams', 'export'] as const;
	// Порядок фигур один на всех карточках: женская, мужская, остальные.
	const GENDER_ORDER = ['female', 'male', 'unisex', 'kids'];
	const genders = (list: string[]) =>
		[...list].sort((a, b) => GENDER_ORDER.indexOf(a) - GENDER_ORDER.indexOf(b));

	/**
	 * Проекты и клиенты приходят с сервера ателье уже после отрисовки. До
	 * ответа страница показывает вводный экран; если работа уже есть,
	 * вместо него наверху встают заказы в работе: постоянному мастеру
	 * реклама не нужна, нужен вчерашний проект.
	 */
	let projects = $state<DesignProject[]>([]);
	let clients = $state<Client[]>([]);
	let ready = $state(false);
	let issue = $state('');
	const returning = $derived(ready && (projects.length > 0 || clients.length > 0));

	async function refresh() {
		try {
			[projects, clients] = await Promise.all([loadProjects(items), listClients()]);
			issue = '';
		} catch {
			issue = 'project.storageError';
		}
	}

	onMount(async () => {
		await refresh();
		ready = true;
	});

	let basesTitle = $state<HTMLElement>();
	async function chooseBase() {
		await tick();
		basesTitle?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		basesTitle?.focus({ preventScroll: true });
	}
</script>

<svelte:head>
	<title>Shityo — {$t('landing.hero.title')}</title>
	<meta name="description" content={$t('landing.hero.lead')} />
</svelte:head>

<div class="page">
	<header class="hero" class:compact={returning}>
		<h1>{$t('landing.hero.title')}</h1>
		{#if data.source === 'fixture'}
			<p class="offline">{$t('catalog.offline')}</p>
		{/if}
		{#if !returning}
			<p class="lead">{$t('landing.hero.lead')}</p>
			<div class="hero-actions">
				<Button size="lg" onclick={chooseBase} data-testid="hero-cta">{$t('landing.hero.cta')}</Button>
				<Button size="lg" variant="quiet" onclick={() => goto('/pattern/custom')} data-testid="hero-custom">
					{$t('custom.hero')}
				</Button>
			</div>
			<div class="advantages" aria-labelledby="advantages-title">
				<h2 id="advantages-title" class="sr-only">{$t('landing.advantages.title')}</h2>
				{#each advantages as key (key)}
					<div class="advantage">
						<h3>{$t(`landing.advantage.${key}.title`)}</h3>
						<p>{$t(`landing.advantage.${key}.text`)}</p>
					</div>
				{/each}
			</div>
		{/if}
	</header>

	{#if returning}
		<ContinueWork catalog={items} {projects} {clients} {issue} onchange={refresh} onnew={chooseBase} />
	{/if}

	<section class="bases" id="bases" aria-labelledby="bases-title">
		<div class="section-head">
			<h2 id="bases-title" tabindex="-1" bind:this={basesTitle}>{$t('landing.bases.title')}</h2>
			<span class="count num">{items.length}</span>
		</div>
		<p class="hint">{$t('landing.bases.hint')}</p>

		{#each grouped as group (group.id)}
			<h3 class="group-title" data-testid="base-group-{group.id}">
				{$t(`landing.group.${group.id}`)}<span class="num">{group.items.length}</span>
			</h3>
			<p class="group-hint">{$t(`landing.group.${group.id}.hint`)}</p>
			<div class="base-grid">
				{#each group.items as item (item.id)}
					<article class="base-card" data-testid="model-card-{item.id}">
						<div class="sketch"><GarmentSketch id={item.id} /></div>
						<div class="base-body">
							<div class="base-header">
								<h4>{$t(`model.${item.id}.name`)}</h4>
								<span class="category">{$t(`model.${item.id}.category`)}</span>
							</div>
							<p class="desc">
								{hasKey(`model.${item.id}.description`)
									? $t(`model.${item.id}.description`)
									: item.description}
							</p>
							<p class="meta num">
								<span data-testid="model-pieces-{item.id}">{$tn('catalog.pieces', item.pieces.length)}</span>
								<span>{$tn('catalog.measures', item.measurements.length)}</span>
								<span>{genders(item.genders).map((g) => $t(`gender.${g}`)).join(', ')}</span>
							</p>
							<details class="details">
								<summary>{$t('landing.bases.details')}</summary>
								<dl>
									<dt>{$t('landing.bases.suitable')}</dt>
									<dd>{$t(`model.${item.id}.suitable`)}</dd>
									<dt>{$t('landing.bases.pieces')}</dt>
									<dd>
										{item.pieces.map((piece) => (hasKey(`piece.${piece}`) ? $t(`piece.${piece}`) : piece)).join(', ')}
									</dd>
									<dt>{$t('landing.bases.measurements')}</dt>
									<dd>{$t(`model.${item.id}.measurements`)}</dd>
								</dl>
							</details>
							<div class="actions">
								<Button size="sm" data-testid="create-{item.id}" onclick={() => goto(`/pattern/${item.id}?new=1`)}>
									{$t('landing.bases.create')}
								</Button>
								<a href="/pattern/{item.id}" data-testid="open-{item.id}">{$t('landing.bases.view')}</a>
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/each}

		<h3 class="group-title" data-testid="base-group-custom">{$t('landing.group.custom')}</h3>
		<p class="group-hint">{$t('landing.group.custom.hint')}</p>
		<div class="base-grid">
			<article class="base-card" data-testid="model-card-custom">
				<div class="sketch"><GarmentSketch id="custom" /></div>
				<div class="base-body">
					<div class="base-header">
						<h4>{$t('custom.title')}</h4>
					</div>
					<p class="desc">{$t('landing.custom.desc')}</p>
					<div class="actions">
						<Button size="sm" data-testid="open-custom" onclick={() => goto('/pattern/custom')}>
							{$t('landing.custom.open')}
						</Button>
					</div>
				</div>
			</article>
		</div>
	</section>

	{#if ready && !returning}
		<ContinueWork catalog={items} {projects} {clients} {issue} onchange={refresh} onnew={chooseBase} />
	{/if}
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-8);
	}

	.hero {
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--ui-line);
	}

	.hero h1 {
		max-width: 72ch;
		margin: 0 0 var(--space-3);
		font-size: clamp(26px, 5vw, 40px);
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}

	/* Постоянному мастеру заголовок нужен как подпись, а не как обложка:
	   первый экран отдаётся заказам в работе. */
	.hero.compact {
		padding-bottom: 0;
		border-bottom: 0;
	}
	.hero.compact h1 {
		margin: 0;
		font-size: 20px;
		letter-spacing: 0;
	}

	.lead {
		max-width: 72ch;
		margin: 0 0 var(--space-4);
		font-size: 15px;
		line-height: 1.6;
		color: var(--ui-ink-soft);
	}

	.offline {
		margin: 0 0 var(--space-4);
		font-size: 13px;
		color: var(--ui-warning-text);
	}

	.hero-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}

	.advantages {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-4);
		margin-top: var(--space-6);
	}

	.advantage {
		padding: var(--space-4);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		background: var(--ui-surface);
	}

	.advantage h3 {
		margin: 0 0 var(--space-2);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink);
	}

	.advantage p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--ui-ink-soft);
	}

	.bases {
		margin-top: var(--space-6);
		scroll-margin-top: var(--space-6);
	}

	.section-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
	}

	.section-head h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		outline-offset: 4px;
	}

	.count {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}

	.hint {
		max-width: 72ch;
		margin: var(--space-2) 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}

	.group-title {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: var(--space-6) 0 var(--space-1);
		font-size: 16px;
	}
	.group-title .num {
		font-size: 12px;
		font-weight: 400;
		color: var(--ui-ink-muted);
	}
	.group-hint {
		margin: 0 0 var(--space-3);
		font-size: 13px;
		color: var(--ui-ink-soft);
	}

	.base-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.base-card {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		background: var(--ui-surface);
	}

	.sketch {
		padding-top: var(--space-1);
	}

	.base-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	.base-header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.base-header h4 {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
	}

	.category {
		font-size: 10.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}

	.desc {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		font-size: 12px;
		color: var(--ui-ink-muted);
	}

	.details summary {
		width: fit-content;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.details summary:hover {
		color: var(--ui-accent);
	}
	.details dl {
		margin: var(--space-2) 0 0;
		font-size: 12.5px;
		line-height: 1.5;
	}
	.details dt {
		margin-top: var(--space-2);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.details dt:first-child {
		margin-top: 0;
	}
	.details dd {
		margin: var(--space-half) 0 0;
		color: var(--ui-ink);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-top: auto;
		padding-top: var(--space-1);
	}

	.actions a {
		font-size: 13px;
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.actions a:hover {
		color: var(--ui-accent);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	@media (max-width: 1100px) {
		.base-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 920px) {
		.advantages {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 720px) {
		.base-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 760px) {
		.page {
			padding: var(--space-4) var(--space-3) var(--space-6);
		}
		.hero h1 {
			font-size: 26px;
		}
		.hero.compact h1 {
			font-size: 18px;
		}
	}
</style>
