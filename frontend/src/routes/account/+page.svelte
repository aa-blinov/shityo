<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Card, TextField } from '@monos/ui';
	import ClientBoard from '$lib/components/ClientBoard.svelte';
	import { locale, t } from '$lib/i18n';
	import { exportAll, defaultAccount, loadAccount, saveAccount, type AccountProfile } from '$lib/account';
	import { listClients, listSnapshots } from '$lib/clients';
	import { loadProjects as loadCustom } from '$lib/custom';
	import type { PageData } from './$types';

	/**
	 * Кабинет - рабочий стол мастера: сначала свои лекала, клиенты и
	 * выкройки с нуля, ниже - резервная копия и профиль. Всё живёт в браузере.
	 */
	let { data }: { data: PageData } = $props();

	interface ClientRow {
		id: string;
		name: string;
		records: number;
		last: string;
	}

	let profile = $state<AccountProfile>(defaultAccount());
	let clients = $state<ClientRow[]>([]);
	let custom = $state<{ id: string; name: string; pieces: number; updated: string }[]>([]);
	let message = $state('');
	let issue = $state('');

	function date(value: string): string {
		const parsed = Date.parse(value);
		return Number.isFinite(parsed)
			? new Date(parsed).toLocaleDateString($locale === 'ru' ? 'ru-RU' : 'en-US')
			: '';
	}

	onMount(() => {
		try {
			profile = loadAccount();
			clients = listClients().map((client) => {
				const records = listSnapshots(client.id);
				return {
					id: client.id,
					name: client.name,
					records: records.length,
					last: records[0]?.createdAt ?? client.createdAt
				};
			});
			custom = loadCustom().map((project) => ({
				id: project.id,
				name: project.name,
				pieces: project.pieces.length,
				updated: project.updated
			}));
		} catch {
			issue = 'account.storageError';
		}
	});

	function persist() {
		issue = '';
		try {
			profile = saveAccount(profile);
			message = 'account.saved';
		} catch {
			issue = 'account.storageError';
		}
	}

	function exportData() {
		try {
			exportAll();
			message = 'account.exported';
		} catch {
			issue = 'account.storageError';
		}
	}

	function input(event: Event): string {
		return (event.currentTarget as HTMLInputElement).value;
	}
</script>

<svelte:head>
	<title>{$t('account.title')} — Shityo</title>
</svelte:head>

<div class="page">
	<header class="head">
		<div>
			<h1>{$t('account.title')}</h1>
			<p class="lead">{$t('account.lead')}</p>
		</div>
		<div class="head-actions">
			<a class="new" href="/#bases" data-testid="account-new">{$t('account.newPattern')}</a>
			<a class="link" href="/pattern/custom">{$t('account.openCustom')}</a>
		</div>
	</header>

	{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}

	<ClientBoard catalog={data.items} />

	<section class="block" aria-labelledby="custom-title" data-testid="account-custom">
		<div class="block-head">
			<h2 id="custom-title">{$t('account.custom')}</h2>
			<span class="count num">{custom.length}</span>
		</div>
		{#if custom.length}
			<ul class="rows">
				{#each custom as project (project.id)}
					<li>
						<a class="row-name" href="/pattern/custom">{project.name}</a>
						<span class="row-meta num">{$t('account.pieces', { count: project.pieces })}</span>
						<span class="row-meta num">{date(project.updated)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">{$t('account.noCustom')}</p>
		{/if}
	</section>

	<div class="grid">
		<Card>
			<section class="panel" aria-labelledby="data-title">
				<h2 id="data-title">{$t('account.data')}</h2>
				<p class="hint">{$t('account.localNote')}</p>
				<Button class="cta" onclick={exportData}>{$t('account.export')}</Button>
				{#if message === 'account.exported'}<p class="ok" role="status">{$t(message)}</p>{/if}
			</section>
		</Card>

		<Card>
			<details class="panel profile">
				<summary><h2 id="profile-title">{$t('account.profile')}</h2></summary>
				<p class="hint">{$t('account.profileHint')}</p>
				<TextField
					id="account-name"
					label={$t('account.name')}
					placeholder={$t('account.namePlaceholder')}
					value={profile.name}
					oninput={(event: Event) => (profile.name = input(event))}
				/>
				<TextField
					id="account-organization"
					label={$t('account.organization')}
					placeholder={$t('account.organizationPlaceholder')}
					value={profile.organization}
					oninput={(event: Event) => (profile.organization = input(event))}
				/>
				<TextField
					id="account-city"
					label={$t('account.city')}
					placeholder={$t('account.cityPlaceholder')}
					value={profile.city}
					oninput={(event: Event) => (profile.city = input(event))}
				/>
				<TextField
					id="account-notes"
					label={$t('account.notes')}
					placeholder={$t('account.notesPlaceholder')}
					value={profile.notes}
					oninput={(event: Event) => (profile.notes = input(event))}
				/>
				<Button onclick={persist}>{$t('account.save')}</Button>
				{#if message === 'account.saved'}<p class="ok" role="status">{$t(message)}</p>{/if}
			</details>
		</Card>
	</div>
</div>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-8);
	}
	.head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		margin-bottom: var(--space-6);
	}
	h1 {
		margin: 0;
		font-size: clamp(28px, 5vw, 44px);
		letter-spacing: -0.03em;
	}
	.lead {
		margin: var(--space-2) 0 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
		max-width: 46ch;
	}
	.head-actions {
		display: flex;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.new {
		display: inline-flex;
		align-items: center;
		min-height: 36px;
		padding: 0 var(--space-4);
		background: var(--ui-accent);
		border: 1px solid var(--ui-accent);
		border-radius: var(--ui-radius);
		color: var(--ui-surface);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
	}
	.new:hover {
		background: var(--ui-accent-text);
		border-color: var(--ui-accent-text);
	}
	.head-actions {
		align-items: center;
	}
	.block {
		margin-top: var(--space-6);
	}
	.block-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
	}
	.block-head h2 {
		border: 0;
		padding: 0;
	}
	.count {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.rows {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
	}
	.rows li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: var(--space-4);
		align-items: baseline;
		padding: var(--space-2) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 65%, transparent);
		font-size: 13.5px;
	}
	.row-name {
		color: var(--ui-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	a.row-name:hover {
		color: var(--ui-accent);
	}
	.row-meta {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.empty {
		margin: var(--space-2) 0 0;
		font-size: 13px;
		color: var(--ui-ink-muted);
	}
	.profile summary {
		cursor: pointer;
		list-style: none;
	}
	.profile summary::-webkit-details-marker {
		display: none;
	}
	.profile[open] summary {
		margin-bottom: var(--space-3);
	}
	.link {
		font-size: 13px;
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.link:hover {
		color: var(--ui-accent);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		margin-top: var(--space-8);
		gap: var(--space-4);
		align-items: start;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
	}
	.hint,
	.ok,
	.error {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
	}
	.hint {
		color: var(--ui-ink-soft);
	}
	.ok {
		color: var(--ui-accent);
	}
	.error {
		color: var(--ui-danger-text, #b42318);
	}
	@media (max-width: 760px) {
		.page {
			padding: var(--space-4);
		}
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
