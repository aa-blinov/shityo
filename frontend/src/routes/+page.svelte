<script lang="ts">
	import { Button } from '@monos/ui';
	import MyDesigns from '$lib/components/MyDesigns.svelte';
	import { goto } from '$app/navigation';
	import { hasKey, t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const items = $derived(data.items);
	// Группы, как их делит конструирование одежды: плечевые изделия, поясные
	// и трикотажный верх. Основа, которой нет в группах, попадает в «Другое».
	const GROUPS = [
		{ id: 'shoulder', models: ['shirt', 'dress', 'vest', 'coat'] },
		{ id: 'waist', models: ['trousers', 'skirt'] },
		{ id: 'knit', models: ['tee', 'longsleeve', 'sweatshirt', 'hoodie', 'jumper', 'cardigan'] }
	];
	const grouped = $derived([
		...GROUPS.map((group) => ({
			id: group.id,
			items: group.models.map((id) => items.find((item) => item.id === id)).filter((item) => !!item)
		})),
		{ id: 'other', items: items.filter((item) => !GROUPS.some((g) => g.models.includes(item.id))) }
	].filter((group) => group.items.length));

	const advantages = $derived([
		{ key: 'measurements' },
		{ key: 'seams' },
		{ key: 'export' }
	] as const);
</script>

<svelte:head>
	<title>Shityo — {$t('landing.hero.title')}</title>
	<meta name="description" content={$t('landing.hero.lead')} />
</svelte:head>

<div class="page">
	<header class="hero">
		<div class="hero-text">
			<h1>{$t('landing.hero.title')}</h1>
			<p class="lead">{$t('landing.hero.lead')}</p>
			{#if data.source === 'fixture'}
				<p class="offline">{$t('catalog.offline')}</p>
			{/if}
			<div class="hero-actions">
				<Button size="lg" class="cta" onclick={() => goto('/pattern/tee?new=1')} data-testid="hero-cta">
					{$t('landing.hero.cta')}
				</Button>
				<Button size="lg" variant="quiet" onclick={() => goto('/pattern/custom')} data-testid="hero-custom">
					{$t('custom.hero')}
				</Button>
				<a class="secondary" href="#bases">{$t('landing.hero.more')}</a>
			</div>
		</div>
		<div class="advantages" aria-labelledby="advantages-title">
			<h2 id="advantages-title" class="sr-only">{$t('landing.advantages.title')}</h2>
			{#each advantages as advantage (advantage.key)}
				<div class="advantage">
					<h3>{$t(`landing.advantage.${advantage.key}.title`)}</h3>
					<p>{$t(`landing.advantage.${advantage.key}.text`)}</p>
				</div>
			{/each}
		</div>
	</header>

	<section class="bases" id="bases" aria-labelledby="bases-title">
		<div class="section-head">
			<h2 id="bases-title">{$t('landing.bases.title')}</h2>
			<span class="count num">{items.length}</span>
		</div>
		<p class="hint">{$t('landing.bases.hint')}</p>

		{#each grouped as group (group.id)}
		<h3 class="group-title" data-testid="base-group-{group.id}">{$t(`landing.group.${group.id}`)}<span class="num">{group.items.length}</span></h3>
		<p class="group-hint">{$t(`landing.group.${group.id}.hint`)}</p>
		<div class="base-grid">
			{#each group.items as item (item.id)}
				<article class="base-card" data-testid="model-card-{item.id}">
					<div class="base-header">
						<h3>{$t(`model.${item.id}.name`)}</h3>
						<span class="category">{$t(`model.${item.id}.category`)}</span>
					</div>
					<p class="desc">
						{hasKey(`model.${item.id}.description`)
							? $t(`model.${item.id}.description`)
							: item.description}
					</p>
					<p class="suitable">
						<strong>{$t('landing.bases.suitable')}</strong>
						{$t(`model.${item.id}.suitable`)}
					</p>
					<p class="measurements">
						<strong>{$t('landing.bases.measurements')}</strong>
						{$t(`model.${item.id}.measurements`)}
					</p>
					<div class="pieces">
						{#each item.pieces as piece (piece)}
							<span class="piece">{hasKey(`piece.${piece}`) ? $t(`piece.${piece}`) : piece}</span>
						{/each}
					</div>
					<div class="meta-row">
						<span class="num" data-testid="model-pieces-{item.id}">
							{item.pieces.length} {$t('catalog.pieces')}
						</span>
						<span class="num">{item.measurements.length} {$t('catalog.measures')}</span>
						<span class="genders">
							{#each item.genders as gender, index (gender)}
								{index ? ', ' : ''}{$t(`gender.${gender}`)}
							{/each}
						</span>
					</div>
					<div class="actions">
						<a href="/pattern/{item.id}" data-testid="open-{item.id}">{$t('catalog.open')}</a>
						<Button
							size="sm"
							data-testid="create-{item.id}"
							onclick={() => goto(`/pattern/${item.id}?new=1`)}
						>
							{$t('project.create')}
						</Button>
					</div>
				</article>
			{/each}
		</div>
		{/each}
	</section>

	<MyDesigns catalog={items} />
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-8);
	}

	.hero {
		border-bottom: 1px solid var(--ui-line);
		padding-bottom: var(--space-6);
	}

	.hero-text {
		max-width: 72ch;
	}

	.hero h1 {
		margin: 0 0 var(--space-3);
		font-size: clamp(26px, 5vw, 40px);
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: -0.02em;
	}

	.lead {
		margin: 0 0 var(--space-4);
		color: var(--ui-ink-soft);
		font-size: 15px;
		line-height: 1.6;
	}

	.offline {
		margin: 0 0 var(--space-4);
		color: var(--ui-warning-text);
		font-size: 13px;
	}

	.hero-actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}

	.hero-actions .secondary {
		color: var(--ui-ink-soft);
		font-size: 13px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.hero-actions .secondary:hover {
		color: var(--ui-accent);
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
	}

	.count {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}

	.hint {
		margin: var(--space-2) 0 var(--space-4);
		color: var(--ui-ink-soft);
		font-size: 13px;
		line-height: 1.5;
		max-width: 72ch;
	}

	.bases {
		margin-top: var(--space-6);
	}

	.base-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.base-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		background: var(--ui-surface);
	}

	.base-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.base-header h3 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
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
	.category {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}

	.desc {
		margin: 0;
		color: var(--ui-ink-soft);
		font-size: 13.5px;
		line-height: 1.55;
	}

	.suitable,
	.measurements {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ui-ink);
	}

	.suitable strong,
	.measurements strong {
		display: block;
		font-weight: 600;
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		margin-bottom: var(--space-half);
	}

	.pieces {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.piece {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		border-bottom: 1px solid var(--ui-line);
		padding-bottom: 1px;
	}

	.meta-row {
		display: flex;
		gap: var(--space-4);
		flex-wrap: wrap;
		font-size: 12px;
		color: var(--ui-ink-muted);
		margin-top: auto;
		padding-top: var(--space-2);
	}

	.genders {
		color: var(--ui-ink-soft);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.actions a {
		color: var(--ui-ink-soft);
		font-size: 13px;
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

	@media (max-width: 920px) {
		.advantages {
			grid-template-columns: 1fr;
		}
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
	}
</style>
