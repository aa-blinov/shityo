<script lang="ts">
	import { Badge, Button } from '@monos/ui';
	import MyDesigns from '$lib/components/MyDesigns.svelte';
	import { goto } from '$app/navigation';
	import { hasKey, t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const items = $derived(data.items);
</script>

<svelte:head>
	<title>Shityo — {$t('catalog.title')}</title>
</svelte:head>

<div class="page">
	<header class="head">
		<h1>{$t('catalog.title')}</h1>
		<p class="lead">
			{$t('catalog.lead')}
			{#if data.source === 'fixture'}
				<span class="offline">{$t('catalog.offline')}</span>
			{/if}
		</p>
	</header>

	<MyDesigns catalog={items}/>

	<section class="bases" aria-labelledby="base-title">
		<div class="section-head">
			<h2 id="base-title">{$t('library.bases')}</h2>
			<span class="count num">{items.length}</span>
		</div>
		<p class="lead">{$t('library.basesHint')}</p>

		<table class="bases-table">
			<thead>
				<tr>
					<th scope="col">{$t('catalog.model')}</th>
					<th scope="col" class="right num-col">{$t('catalog.pieces')}</th>
					<th scope="col" class="right num-col">{$t('catalog.measures')}</th>
					<th scope="col">{$t('catalog.gender')}</th>
					<th scope="col"><span class="sr-only">{$t('catalog.open')}</span></th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					<tr data-testid="model-card-{item.id}">
						<td>
							<strong>{$t(`model.${item.id}.name`)}</strong>
							<span class="desc">
								{hasKey(`model.${item.id}.description`)
									? $t(`model.${item.id}.description`)
									: item.description}
							</span>
							<span class="pieces">
								{#each item.pieces as piece (piece)}
									<span class="piece">{hasKey(`piece.${piece}`) ? $t(`piece.${piece}`) : piece}</span>
								{/each}
							</span>
						</td>
						<td class="right num" data-testid="model-pieces-{item.id}">{item.pieces.length}</td>
						<td class="right num">{item.measurements.length}</td>
						<td class="genders">
							{#each item.genders as gender, index (gender)}
								{index ? ', ' : ''}{$t(`gender.${gender}`)}
							{/each}
						</td>
						<td class="actions">
							<a href="/pattern/{item.id}" data-testid="open-{item.id}">{$t('catalog.open')}</a>
							<Button
								size="sm"
								data-testid="create-{item.id}"
								onclick={() => goto(`/pattern/${item.id}?new=1`)}
							>
								{$t('project.create')}
							</Button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<footer class="foot">
		<a href="/library">{$t('library.title')} · {$t('library.total', { count: 85 })}</a>
	</footer>
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-6);
	}

	.head {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--ui-line);
	}

	.head h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.lead {
		margin: 0;
		color: var(--ui-ink-soft);
		font-size: 12px;
		max-width: 62ch;
	}

	.offline {
		color: var(--ui-warning-text);
	}

	.bases {
		margin-top: var(--space-6);
	}

	.section-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--ui-line);
	}

	.section-head h2 {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}

	.count {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}

	.bases > .lead {
		margin: var(--space-2) 0 var(--space-3);
	}

	.bases-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	.bases-table th {
		text-align: left;
		font-size: 9.5px;
		font-weight: 500;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		padding: 0 var(--space-3) 6px 0;
		border-bottom: 1px solid var(--ui-line);
	}

	.bases-table td {
		padding: var(--space-3) var(--space-3) var(--space-3) 0;
		vertical-align: middle;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 65%, transparent);
	}

	.bases-table tr:hover td {
		background: color-mix(in srgb, var(--ui-ink) 2.5%, transparent);
	}

	.right {
		text-align: right;
	}

	.num-col {
		width: 88px;
		white-space: nowrap;
		text-align: right;
	}

	.num-col {
		width: 88px;
		white-space: nowrap;
		text-align: right;
	}

	.bases-table th.num-col {
		text-align: right;
	}

	strong {
		display: block;
		font-size: 14px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	.desc {
		display: block;
		color: var(--ui-ink-soft);
		font-size: 11.5px;
		line-height: 1.5;
		max-width: 54ch;
	}

	.pieces {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: 5px;
	}

	.piece {
		font-size: 9.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		border-bottom: 1px solid var(--ui-line);
		padding-bottom: 1px;
	}

	.genders {
		color: var(--ui-ink-soft);
		font-size: 11.5px;
	}

	.actions {
		white-space: nowrap;
	}

	.actions a {
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
		margin-right: var(--space-3);
		font-size: 11.5px;
	}

	.actions a:hover {
		color: var(--ui-accent);
	}

	.foot {
		margin-top: var(--space-6);
		padding-top: var(--space-3);
		border-top: 1px solid var(--ui-line);
		font-size: 11px;
	}

	.foot a {
		color: var(--ui-ink-soft);
		text-decoration: none;
	}

	.foot a:hover {
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

	@media (max-width: 760px) {
		.page {
			padding: var(--space-4) var(--space-3);
		}
		.bases-table thead {
			display: none;
		}
		.bases-table,
		.bases-table tbody,
		.bases-table tr,
		.bases-table td {
			display: block;
			width: 100%;
		}
		.bases-table tr {
			border-bottom: 1px solid var(--ui-line);
			padding: var(--space-3) 0;
		}
		.bases-table td {
			border: 0;
			padding: 0;
		}
		.bases-table td.right,
		.bases-table td.genders {
			display: inline-block;
			width: auto;
			margin-right: var(--space-4);
			color: var(--ui-ink-muted);
		}
		.actions {
			margin-top: var(--space-2);
		}
	}
</style>
