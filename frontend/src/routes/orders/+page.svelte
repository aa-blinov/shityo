<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '@monos/ui';
	import { Trash2 } from 'lucide-svelte';
	import ChoiceChips from '$lib/components/ChoiceChips.svelte';
	import { locale, t } from '$lib/i18n';
	import { fullDate, matches, shortDate } from '$lib/format';
	import { listClients, type Client } from '$lib/clients';
	import { listStaff } from '$lib/atelier';
	import { session, type User } from '$lib/session.svelte';
	import {
		STAGES,
		deleteProject,
		loadProjects,
		updateProject,
		type DesignProject,
		type Stage
	} from '$lib/projects';
	import type { PageData } from './$types';

	/**
	 * Реестр заказов: все проекты ателье одной таблицей. Здесь ищут старый
	 * заказ, смотрят, у кого что в работе, и двигают стадию, не открывая
	 * редактор. Активные заказы по умолчанию, готовые - по фильтру.
	 */
	let { data }: { data: PageData } = $props();

	let projects = $state<DesignProject[]>([]);
	let clients = $state<Client[]>([]);
	let staff = $state<User[]>([]);
	let loading = $state(true);
	let issue = $state('');
	let query = $state('');
	let stageFilter = $state<'active' | 'done' | 'all'>('active');
	let who = $state('all');
	// Новый заказ начинается здесь же, как в карточке клиента: основа и кнопка.
	let newModel = $state('');
	$effect(() => {
		if (!newModel) newModel = data.items[0]?.id ?? '';
	});

	const clientNames = $derived(new Map(clients.map((client) => [client.id, client.name])));
	const modelName = (id: string) => $t(`model.${id}.name`);

	const visible = $derived(
		projects.filter((project) => {
			const stage = project.stage ?? 'draft';
			if (stageFilter === 'active' && stage === 'done') return false;
			if (stageFilter === 'done' && stage !== 'done') return false;
			if (who === 'mine' && project.assigneeId !== session.me?.user.id) return false;
			if (who === 'none' && project.assigneeId) return false;
			if (who !== 'all' && who !== 'mine' && who !== 'none' && project.assigneeId !== who) return false;
			return matches(
				query,
				project.name,
				project.clientId ? clientNames.get(project.clientId) : '',
				modelName(project.model)
			);
		})
	);

	async function refresh() {
		try {
			[projects, clients, staff] = await Promise.all([loadProjects(data.items), listClients(), listStaff()]);
			issue = '';
		} catch {
			issue = 'registry.loadError';
		} finally {
			loading = false;
		}
	}
	onMount(refresh);

	async function change(project: DesignProject, patch: { stage?: Stage; assigneeId?: string }) {
		try {
			const saved = await updateProject(project.id, patch, data.items);
			projects = projects.map((item) => (item.id === saved.id ? saved : item));
			issue = '';
		} catch {
			issue = 'registry.saveError';
		}
	}

	async function remove(project: DesignProject) {
		if (!confirm($t('orders.confirmDelete', { name: project.name }))) return;
		try {
			await deleteProject(project.id);
			projects = projects.filter((item) => item.id !== project.id);
		} catch {
			issue = 'registry.saveError';
		}
	}
</script>

<svelte:head>
	<title>{$t('orders.title')} — Shityo</title>
</svelte:head>

<div class="registry">
	<div class="registry-title">
		<h1>{$t('orders.title')}</h1>
		<span class="count num" data-testid="orders-count">{visible.length === projects.length ? projects.length : $t('orders.shown', { shown: visible.length, total: projects.length })}</span>
		<span class="spacer"></span>
		<select class="registry-field base" bind:value={newModel} aria-label={$t('board.base')} data-testid="orders-model">
			{#each data.items as item (item.id)}<option value={item.id}>{$t(`model.${item.id}.name`)}</option>{/each}
		</select>
		<Button size="sm" disabled={!newModel} onclick={() => goto(`/pattern/${newModel}?new=1&from=/orders`)} data-testid="orders-new">
			{$t('landing.continue.new')}
		</Button>
	</div>

	<div class="registry-tools">
		<input
			class="registry-search"
			type="search"
			placeholder={$t('orders.search')}
			aria-label={$t('orders.search')}
			bind:value={query}
			data-testid="orders-search"
		/>
		<ChoiceChips
			testid="orders-stage"
			label={$t('project.stage')}
			hideLabel
			value={stageFilter}
			options={[
				{ value: 'active', label: $t('board.active') },
				{ value: 'done', label: $t('board.done') },
				{ value: 'all', label: $t('board.all') }
			]}
			onChange={(value) => (stageFilter = value as typeof stageFilter)}
		/>
		<select class="registry-field who" bind:value={who} aria-label={$t('project.assignee')} data-testid="orders-who">
			<option value="all">{$t('orders.everyone')}</option>
			<option value="mine">{$t('orders.mine')}</option>
			<option value="none">{$t('project.noAssignee')}</option>
			{#each staff as user (user.id)}<option value={user.id}>{user.name}</option>{/each}
		</select>
	</div>

	{#if issue}<p class="registry-error" role="alert">{$t(issue)}</p>{/if}

	{#if loading}
		<p class="registry-empty">{$t('registry.loading')}</p>
	{:else if !projects.length}
		<p class="registry-empty">{$t('orders.empty')}</p>
	{:else if !visible.length}
		<p class="registry-empty">{$t('registry.nothingFound')}</p>
	{:else}
		<ul class="registry-rows orders" data-testid="orders-list">
			<li class="labels" aria-hidden="true">
				<span>{$t('orders.order')}</span>
				<span>{$t('project.client')}</span>
				<span>{$t('orders.base')}</span>
				<span>{$t('project.assignee')}</span>
				<span>{$t('project.stage')}</span>
				<span>{$t('orders.updated')}</span>
				<span></span>
			</li>
			{#each visible as project (project.id)}
				<li data-testid="order-row" data-stage={project.stage ?? 'draft'}>
					<a class="registry-link" href={`/pattern/${project.model}?project=${encodeURIComponent(project.id)}&from=/orders`}>{project.name}</a>
					{#if project.clientId && clientNames.has(project.clientId)}
						<a class="client" href={`/clients/${project.clientId}`}>{clientNames.get(project.clientId)}</a>
					{:else}
						<span class="registry-muted">{$t('landing.continue.noClient')}</span>
					{/if}
					<span class="registry-caps">{modelName(project.model)}</span>
					<select
						value={project.assigneeId ?? ''}
						aria-label={`${$t('project.assignee')}: ${project.name}`}
						onchange={(e) => change(project, { assigneeId: e.currentTarget.value })}
					>
						<option value="">{$t('project.noAssignee')}</option>
						{#each staff as user (user.id)}<option value={user.id}>{user.name}</option>{/each}
					</select>
					<select
						value={project.stage ?? 'draft'}
						aria-label={`${$t('project.stage')}: ${project.name}`}
						data-testid="order-stage"
						onchange={(e) => change(project, { stage: e.currentTarget.value as Stage })}
					>
						{#each STAGES as stage (stage)}<option value={stage}>{$t(`stage.${stage}`)}</option>{/each}
					</select>
					<span class="registry-muted num" title={`${fullDate(project.updated, $locale)}${project.updatedBy ? `, ${project.updatedBy}` : ''}`}>
						{shortDate(project.updated, $locale)}
					</span>
					<button
						type="button"
						class="icon row-danger"
						aria-label={`${$t('project.delete')} ${project.name}`}
						data-tip={$t('project.delete')}
						onclick={() => remove(project)}
					>
						<Trash2 size={14} strokeWidth={1.7} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.base {
		width: auto;
		min-width: 180px;
	}
	.who {
		width: auto;
		min-width: 160px;
	}
	.orders > li {
		grid-template-columns:
			minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.2fr)
			88px 28px;
	}
	.orders > li[data-stage='done'] .registry-link {
		font-weight: 400;
		color: var(--ui-ink-soft);
	}
	.client {
		overflow: hidden;
		color: var(--ui-ink);
		text-decoration: none;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.client:hover {
		color: var(--ui-accent);
		text-decoration: underline;
	}
	.icon {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ui-ink-muted);
		cursor: pointer;
	}
	.icon:hover {
		color: var(--ui-danger-text);
	}
	@media (max-width: 1000px) {
		.orders > li {
			grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 88px 28px;
		}
		.orders > li > :nth-child(3),
		.orders > li > :nth-child(4) {
			display: none;
		}
	}
</style>
