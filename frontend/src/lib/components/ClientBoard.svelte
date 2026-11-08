<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronRight, Plus, Trash2, Upload } from 'lucide-svelte';
	import ChoiceChips from '$lib/components/ChoiceChips.svelte';
	import { locale, t } from '$lib/i18n';
	import { createClient, listClients, listSnapshots, type Client } from '$lib/clients';
	import {
		STAGES,
		damagedProjects,
		deleteProject,
		loadProjects,
		saveProject,
		updateProjectStage,
		validateProject,
		type DesignProject,
		type Stage
	} from '$lib/projects';
	import type { CatalogItem } from '$lib/types';

	/**
	 * Заказы по клиентам: клиент - его проекты - стадия каждого. Ателье видит,
	 * у кого что в работе, и открывает нужное изделие в один щелчок. Проекты
	 * без клиента собраны в отдельную группу.
	 */
	let { catalog }: { catalog: CatalogItem[] } = $props();

	interface Group {
		id: string;
		client: Client | null;
		records: number;
		projects: DesignProject[];
	}

	let clients = $state<Client[]>([]);
	let projects = $state<DesignProject[]>([]);
	let records = $state<Record<string, number>>({});
	let filter = $state<'all' | 'active' | 'done'>('active');
	// Группы раскрыты, пока мастер сам их не свернёт: заказы видны сразу.
	let open = $state<Record<string, boolean>>({});
	let newClient = $state('');
	let newModel = $state<Record<string, string>>({});
	let issue = $state('');
	let damaged = $state(0);

	function refresh() {
		try {
			clients = listClients();
			projects = loadProjects(catalog);
			records = Object.fromEntries(clients.map((c) => [c.id, listSnapshots(c.id).length]));
			damaged = damagedProjects(catalog);
			issue = '';
		} catch {
			issue = 'project.storageError';
		}
	}
	onMount(() => {
		refresh();
		// Правки из другой вкладки (второй мастер, редактор рядом) видны сразу.
		const sync = (event: StorageEvent) => {
			if (event.key?.startsWith('shityo.')) refresh();
		};
		window.addEventListener('storage', sync);
		return () => window.removeEventListener('storage', sync);
	});

	const visible = $derived(
		projects.filter((p) =>
			filter === 'all' ? true : filter === 'done' ? p.stage === 'done' : p.stage !== 'done'
		)
	);
	const groups = $derived<Group[]>([
		...clients.map((client) => ({
			id: client.id,
			client,
			records: records[client.id] ?? 0,
			projects: visible.filter((p) => p.clientId === client.id)
		})),
		{
			id: '',
			client: null,
			records: 0,
			projects: visible.filter((p) => !p.clientId || !clients.some((c) => c.id === p.clientId))
		}
	]);

	function date(value: string): string {
		return new Date(value).toLocaleDateString($locale === 'ru' ? 'ru-RU' : 'en-US', {
			day: 'numeric',
			month: 'short'
		});
	}

	function setStage(project: DesignProject, stage: Stage) {
		try {
			updateProjectStage(project.id, stage, catalog);
			refresh();
		} catch {
			issue = 'project.storageError';
		}
	}

	function remove(project: DesignProject) {
		if (!confirm($t('board.confirmDelete', { name: project.name }))) return;
		try {
			deleteProject(project.id, catalog);
			refresh();
		} catch {
			issue = 'project.storageError';
		}
	}

	function addClient() {
		const name = newClient.trim();
		if (!name) return;
		try {
			const client = createClient(name);
			newClient = '';
			refresh();
			open[client.id] = true;
		} catch {
			issue = 'clients.storageError';
		}
	}

	function startProject(clientId: string) {
		const model = newModel[clientId] || catalog[0]?.id;
		if (!model) return;
		const query = clientId ? `?new=1&client=${encodeURIComponent(clientId)}` : '?new=1';
		void goto(`/pattern/${model}${query}`);
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			// Проект с вложениями: до 10 файлов по 1 МБ в base64.
			if (file.size > 15_000_000) throw new Error();
			const project = validateProject(JSON.parse(await file.text()), catalog);
			project.id = crypto.randomUUID();
			project.updated = new Date().toISOString();
			saveProject(project, catalog);
			refresh();
		} catch {
			issue = 'project.invalid';
		} finally {
			input.value = '';
		}
	}
</script>

<section class="board" aria-labelledby="board-title" data-testid="my-designs">
	<div class="board-head">
		<h2 id="board-title">{$t('board.title')}</h2>
		<span class="count num">{filter === 'all' ? projects.length : $t('board.shown', { shown: visible.length, total: projects.length })}</span>
		<span class="spacer"></span>
		<div class="filter">
			<ChoiceChips
				testid="board-filter"
				label={$t('board.filter')}
				hideLabel
				value={filter}
				options={[
					{ value: 'active', label: $t('board.active') },
					{ value: 'done', label: $t('board.done') },
					{ value: 'all', label: $t('board.all') }
				]}
				onChange={(value) => (filter = value as typeof filter)}
			/>
		</div>
		<label class="import" data-tip={$t('project.import')}>
			<input class="file-input" type="file" accept=".json,application/json" onchange={importFile} data-testid="project-import" />
			<Upload size={14} strokeWidth={1.7} /><span class="sr-only">{$t('project.import')}</span>
		</label>
	</div>
	<p class="scope">{$t('board.scope')}</p>
	{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}
	{#if damaged}<p class="error" role="status" data-testid="board-damaged">{$t('board.damaged', { count: damaged })}</p>{/if}

	<form class="new-client" onsubmit={(e) => { e.preventDefault(); addClient(); }}>
		<input
			class="field"
			placeholder={$t('board.newClientPlaceholder')}
			aria-label={$t('board.newClient')}
			bind:value={newClient}
			maxlength="120"
			data-testid="board-new-client"
		/>
		<button type="submit" class="add" disabled={!newClient.trim()}><Plus size={14} strokeWidth={2} />{$t('board.newClient')}</button>
	</form>

	<ul class="groups">
		{#each groups as group (group.id)}
			{#if group.client || group.projects.length}
				<li class="group" class:open={open[group.id] ?? true} data-testid="board-group">
					<button
						type="button"
						class="group-head"
						aria-expanded={open[group.id] ?? true}
						onclick={() => (open[group.id] = !(open[group.id] ?? true))}
					>
						<span class="chev"><ChevronRight size={14} strokeWidth={2} /></span>
						<span class="group-name">{group.client ? group.client.name : $t('board.noClient')}</span>
						{#if group.client}<span class="group-meta num">{$t('account.records', { count: group.records })}</span>{/if}
						<span class="group-meta num">{$t('board.projects', { count: group.projects.length })}</span>
					</button>
					{#if open[group.id] ?? true}
						<div class="group-body">
							{#if group.projects.length}
								<ul class="projects">
									{#each group.projects as project (project.id)}
										<li class="project" data-stage={project.stage ?? 'draft'}>
											<a class="project-name" href={`/pattern/${project.model}?project=${project.id}`}>{project.name}</a>
											<span class="project-model">{$t(`model.${project.model}.name`)}</span>
											<select
												class="stage"
												value={project.stage ?? 'draft'}
												aria-label={`${$t('project.stage')}: ${project.name}`}
												onchange={(e) => setStage(project, e.currentTarget.value as Stage)}
											>
												{#each STAGES as stage (stage)}<option value={stage}>{$t(`stage.${stage}`)}</option>{/each}
											</select>
											<span class="project-date num">{date(project.updated)}</span>
											<button type="button" class="icon" data-tip={$t('project.delete')} aria-label={`${$t('project.delete')} ${project.name}`} onclick={() => remove(project)}><Trash2 size={14} strokeWidth={1.7} /></button>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="empty">{$t('board.noProjects')}</p>
							{/if}
							<div class="new-project">
								<select bind:value={newModel[group.id]} aria-label={$t('board.base')} class="stage">
									{#each catalog as item (item.id)}<option value={item.id}>{$t(`model.${item.id}.name`)}</option>{/each}
								</select>
								<button type="button" class="add" onclick={() => startProject(group.id)} data-testid="board-new-project">
									<Plus size={14} strokeWidth={2} />{group.client ? $t('board.newProjectFor', { client: group.client.name }) : $t('account.newPattern')}
								</button>
							</div>
						</div>
					{/if}
				</li>
			{/if}
		{/each}
	</ul>
	{#if !projects.length && !clients.length}<p class="empty">{$t('project.empty')}</p>{/if}
</section>

<style>
	.board {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.board-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	.count {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.spacer {
		flex: 1;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.import {
		position: relative;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.import:focus-within {
		outline: 1px solid var(--ui-accent);
		outline-offset: 1px;
	}
	.import:hover {
		color: var(--ui-accent);
		border-color: var(--ui-accent);
	}
	/* Скрытое поле файла держится внутри кнопки импорта (у неё position:
	   relative), иначе оно уходит от страницы и даёт второй скролл. */
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}
	.scope,
	.empty,
	.error {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	.error {
		color: var(--ui-danger);
	}
	.new-client,
	.new-project {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.field {
		flex: 1;
		min-width: 180px;
		height: 32px;
		padding: 0 var(--space-2);
		background: color-mix(in srgb, var(--ui-ink) 4%, transparent);
		border: 1px solid transparent;
		border-radius: var(--ui-radius);
		font: inherit;
		font-size: 13px;
		color: var(--ui-ink);
	}
	.field:focus {
		outline: none;
		border-color: var(--ui-accent);
		background: var(--ui-surface);
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 32px;
		padding: 0 var(--space-3);
		background: transparent;
		border: 1px solid var(--ui-accent);
		border-radius: var(--ui-radius);
		color: var(--ui-accent-text);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.add:hover:not(:disabled) {
		background: var(--ui-accent);
		color: var(--ui-surface);
	}
	.add:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.groups,
	.projects {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.group {
		border-bottom: 1px solid var(--ui-line);
	}
	.group-head {
		width: 100%;
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) auto auto;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		background: none;
		border: 0;
		font: inherit;
		text-align: left;
		color: var(--ui-ink);
		cursor: pointer;
	}
	.group-head:hover .group-name {
		color: var(--ui-accent-text);
	}
	.chev {
		display: grid;
		place-items: center;
		color: var(--ui-ink-muted);
		transition: transform 0.15s;
	}
	.group.open .chev {
		transform: rotate(90deg);
	}
	.group-name {
		font-size: 15px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.group-meta {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.group-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: 0 0 var(--space-4) calc(18px + var(--space-3));
	}
	.project {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 150px auto 28px;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 60%, transparent);
		font-size: 13px;
	}
	/* Стадия - маленькая точка у названия: серая до работы с тканью, синяя
	   на макете, раскрое и пошиве, зелёная у готового. */
	.project-name::before {
		content: '';
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-right: var(--space-2);
		border-radius: 50%;
		background: var(--ui-line);
		vertical-align: 1px;
	}
	.project[data-stage='toile'] .project-name::before,
	.project[data-stage='cut'] .project-name::before,
	.project[data-stage='sew'] .project-name::before {
		background: var(--ui-accent);
	}
	.project[data-stage='done'] .project-name::before {
		background: var(--ui-success, #2f6b4a);
	}
	.project-name {
		color: var(--ui-ink);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.project-name:hover {
		color: var(--ui-accent-text);
	}
	.project-model,
	.project-date {
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.stage {
		height: 30px;
		min-width: 0;
		padding: 0 var(--space-2);
		border-radius: var(--ui-radius);
		font: inherit;
		font-size: 12px;
		color: var(--ui-ink);
		cursor: pointer;
	}
	.stage:hover {
		border-color: var(--ui-line);
	}
	.icon {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--ui-radius);
		color: var(--ui-ink-muted);
		cursor: pointer;
	}
	.icon:hover {
		color: var(--ui-danger);
		border-color: var(--ui-line);
	}
	@media (max-width: 760px) {
		.project {
			grid-template-columns: minmax(0, 1fr) 28px;
		}
		.project-model,
		.project-date {
			display: none;
		}
		.stage {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.group-body {
			padding-left: 0;
		}
	}
</style>
