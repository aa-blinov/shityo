<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '@monos/ui';
	import { locale, t } from '$lib/i18n';
	import { fullDate, matches, shortDate } from '$lib/format';
	import { createClient, listClients, type Client } from '$lib/clients';
	import { loadProjects, type DesignProject } from '$lib/projects';
	import type { PageData } from './$types';

	/**
	 * Реестр клиентов ателье. По строке видно, когда снимали мерки, сколько
	 * заказов в работе и когда был последний: этого хватает, чтобы решить,
	 * пора ли звать на перемерку. Новый клиент сразу открывается карточкой.
	 */
	let { data }: { data: PageData } = $props();

	let clients = $state<Client[]>([]);
	let projects = $state<DesignProject[]>([]);
	let loading = $state(true);
	let issue = $state('');
	let query = $state('');
	let newName = $state('');
	let newPhone = $state('');

	interface Row {
		client: Client;
		active: number;
		lastOrder: string | null;
	}

	const rows = $derived.by<Row[]>(() => {
		const byClient = new Map<string, DesignProject[]>();
		for (const project of projects) {
			if (!project.clientId) continue;
			byClient.set(project.clientId, [...(byClient.get(project.clientId) ?? []), project]);
		}
		return clients
			.filter((client) => matches(query, client.name, client.phone, client.notes))
			.map((client) => {
				const own = byClient.get(client.id) ?? [];
				return {
					client,
					active: own.filter((project) => project.stage !== 'done').length,
					lastOrder: own.map((project) => project.updated).sort().at(-1) ?? null
				};
			});
	});

	onMount(async () => {
		try {
			[clients, projects] = await Promise.all([listClients(), loadProjects(data.items)]);
		} catch {
			issue = 'registry.loadError';
		} finally {
			loading = false;
		}
	});

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (!newName.trim()) return;
		try {
			const client = await createClient(newName, '', newPhone.trim());
			await goto(`/clients/${client.id}`);
		} catch {
			issue = 'registry.saveError';
		}
	}
</script>

<svelte:head>
	<title>{$t('clientsPage.title')} — Shityo</title>
</svelte:head>

<div class="registry">
	<div class="registry-title">
		<h1>{$t('clientsPage.title')}</h1>
		<span class="count num" data-testid="clients-count">{clients.length}</span>
	</div>

	<div class="registry-tools">
		<input
			class="registry-search"
			type="search"
			placeholder={$t('clientsPage.search')}
			aria-label={$t('clientsPage.search')}
			bind:value={query}
			data-testid="clients-search"
		/>
		<span class="spacer"></span>
		<form class="add" onsubmit={add}>
			<input
				class="registry-field"
				placeholder={$t('clientsPage.newName')}
				aria-label={$t('clientsPage.newName')}
				maxlength="120"
				bind:value={newName}
				data-testid="clients-new-name"
			/>
			<input
				class="registry-field phone"
				type="tel"
				placeholder={$t('clientsPage.phone')}
				aria-label={$t('clientsPage.phone')}
				maxlength="40"
				bind:value={newPhone}
			/>
			<Button size="sm" type="submit" disabled={!newName.trim()} data-testid="clients-add">{$t('board.newClient')}</Button>
		</form>
	</div>

	{#if issue}<p class="registry-error" role="alert">{$t(issue)}</p>{/if}

	{#if loading}
		<p class="registry-empty">{$t('registry.loading')}</p>
	{:else if !clients.length}
		<p class="registry-empty">{$t('clientsPage.empty')}</p>
	{:else if !rows.length}
		<p class="registry-empty">{$t('registry.nothingFound')}</p>
	{:else}
		<ul class="registry-rows clients" data-testid="clients-list">
			<li class="labels" aria-hidden="true">
				<span>{$t('clientsPage.client')}</span>
				<span>{$t('clientsPage.phone')}</span>
				<span>{$t('clientsPage.measured')}</span>
				<span>{$t('clientsPage.active')}</span>
				<span>{$t('clientsPage.lastOrder')}</span>
			</li>
			{#each rows as row (row.client.id)}
				<li data-testid="client-row">
					<a class="registry-link" href={`/clients/${row.client.id}`}>{row.client.name}</a>
					<span class="registry-muted num">{row.client.phone}</span>
					<span class="registry-muted" title={fullDate(row.client.lastMeasuredAt, $locale)}>
						{row.client.lastMeasuredAt ? shortDate(row.client.lastMeasuredAt, $locale) : $t('clientsPage.noMeasures')}
					</span>
					<span class="num" class:zero={!row.active}>{row.active}</span>
					<span class="registry-muted">{shortDate(row.lastOrder, $locale)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.spacer {
		flex: 1;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.phone {
		width: 150px;
	}
	.clients > li {
		grid-template-columns: minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr);
	}
	.zero {
		color: var(--ui-ink-muted);
	}
</style>
