<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Card, TextField } from '@monos/ui';
	import { t } from '$lib/i18n';
	import {
		accountStats,
		defaultAccount,
		exportAll,
		loadAccount,
		saveAccount,
		type AccountProfile
	} from '$lib/account';

	let profile = $state<AccountProfile>(defaultAccount());
	let stats = $state({ designs: 0, clients: 0, custom: 0 });
	let message = $state('');
	let issue = $state('');

	onMount(() => {
		try {
			profile = loadAccount();
			stats = accountStats();
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
			<a class="link" href="/">{$t('account.openDesigns')}</a>
			<a class="link" href="/pattern/custom">{$t('account.openCustom')}</a>
		</div>
	</header>

	<div class="grid">
		<Card>
			<section class="panel" aria-labelledby="profile-title">
				<h2 id="profile-title">{$t('account.profile')}</h2>
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
				{#if message}<p class="ok" role="status">{$t(message)}</p>{/if}
				{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}
			</section>
		</Card>

		<div class="stack">
			<Card>
				<section class="panel" aria-labelledby="summary-title">
					<h2 id="summary-title">{$t('account.summary')}</h2>
					<ul class="stats">
						<li>
							<span class="num">{stats.designs}</span>
							<span>{$t('account.designs')}</span>
						</li>
						<li>
							<span class="num">{stats.clients}</span>
							<span>{$t('account.clients')}</span>
						</li>
						<li>
							<span class="num">{stats.custom}</span>
							<span>{$t('account.custom')}</span>
						</li>
					</ul>
				</section>
			</Card>

			<Card>
				<section class="panel" aria-labelledby="data-title">
					<h2 id="data-title">{$t('account.data')}</h2>
					<p class="hint">{$t('account.localNote')}</p>
					<Button variant="quiet" onclick={exportData}>{$t('account.export')}</Button>
				</section>
			</Card>
		</div>
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
	.link {
		font-size: 12px;
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.link:hover {
		color: var(--ui-accent);
	}
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
		gap: var(--space-4);
		align-items: start;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--ui-line);
	}
	.stats {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.stats li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: 12px;
		color: var(--ui-ink-soft);
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 55%, transparent);
		padding-bottom: 6px;
	}
	.stats .num {
		font-size: 22px;
		font-weight: 700;
		color: var(--ui-ink);
	}
	.hint,
	.ok,
	.error {
		margin: 0;
		font-size: 12px;
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
