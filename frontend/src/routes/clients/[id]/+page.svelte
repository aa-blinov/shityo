<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button, TextField } from '@monos/ui';
	import { Trash2 } from 'lucide-svelte';
	import Crumbs from '$lib/components/Crumbs.svelte';
	import { hasKey, locale, t } from '$lib/i18n';
	import { fullDate, shortDate } from '$lib/format';
	import { measurementRange } from '$lib/labels';
	import { session } from '$lib/session.svelte';
	import {
		createSnapshot,
		deleteClient,
		deleteSnapshot,
		getClient,
		listSnapshots,
		updateClient,
		type Client,
		type MeasurementSnapshot
	} from '$lib/clients';
	import { listStaff } from '$lib/atelier';
	import { STAGES, loadProjects, updateProject, type DesignProject, type Stage } from '$lib/projects';
	import type { User } from '$lib/session.svelte';
	import type { PageData } from './$types';

	/**
	 * Карточка клиента: контакты, история мерок и все его заказы.
	 *
	 * Мерки снимают с человека, а не с изделия, поэтому их история живёт
	 * здесь. Две съёмки сравниваются построчно с разницей; заказ, построенный
	 * по мерке, которая потом изменилась, помечается - его стоит пересобрать
	 * перед следующей примеркой.
	 */
	let { data }: { data: PageData } = $props();
	const clientId = $derived(page.params.id ?? '');

	let client = $state<Client | null>(null);
	let snapshots = $state<MeasurementSnapshot[]>([]);
	let projects = $state<DesignProject[]>([]);
	let staff = $state<User[]>([]);
	let missing = $state(false);
	let issue = $state('');
	let message = $state('');

	let name = $state('');
	let phone = $state('');
	let notes = $state('');
	const dirty = $derived(!!client && (name !== client.name || phone !== client.phone || notes !== client.notes));

	let left = $state('');
	let right = $state('');
	let model = $state('');
	let adding = $state(false);
	let label = $state('');
	let draft = $state<Record<string, string>>({});

	const latest = $derived(snapshots[0]);
	const allKeys = $derived([...new Set(data.items.flatMap((item) => item.measurements))]);
	const staffNames = $derived(new Map(staff.map((user) => [user.id, user.name])));
	const measureName = (key: string) => (hasKey(`measure.${key}`) ? $t(`measure.${key}`) : key);

	const compare = $derived.by(() => {
		const a = snapshots.find((item) => item.id === left);
		const b = snapshots.find((item) => item.id === right);
		if (!a) return [];
		const keys = [...new Set([...Object.keys(a.values), ...Object.keys(b?.values ?? {})])];
		keys.sort((x, y) => allKeys.indexOf(x) - allKeys.indexOf(y));
		return keys.map((key) => {
			const now = a.values[key];
			const before = b?.values[key];
			const diff = now !== undefined && before !== undefined ? Math.round((now - before) * 10) / 10 : null;
			return { key, now, before, diff };
		});
	});

	/** Заказ построен по старым меркам: съёмка новее заказа и общие мерки разошлись. */
	function outdated(project: DesignProject): boolean {
		if (!latest || project.stage === 'done') return false;
		if (Date.parse(latest.createdAt) <= Date.parse(project.updated)) return false;
		return Object.entries(latest.values).some(
			([key, value]) => key in project.measurements && Math.abs(project.measurements[key] - value) >= 0.1
		);
	}

	function fill(from: Client) {
		client = from;
		name = from.name;
		phone = from.phone;
		notes = from.notes;
	}

	async function load() {
		try {
			const [found, history, all, people] = await Promise.all([
				getClient(clientId),
				listSnapshots(clientId),
				loadProjects(data.items),
				listStaff()
			]);
			fill(found);
			snapshots = history;
			projects = all.filter((project) => project.clientId === clientId);
			staff = people;
			left = history[0]?.id ?? '';
			right = history[1]?.id ?? '';
			model = data.items[0]?.id ?? '';
		} catch (error) {
			if ((error as { status?: number }).status === 404) missing = true;
			else issue = 'registry.loadError';
		}
	}
	onMount(load);

	async function saveContacts() {
		try {
			fill(await updateClient(clientId, { name, phone, notes }));
			message = 'clients.notesSaved';
			issue = '';
		} catch {
			issue = 'registry.saveError';
		}
	}

	async function remove() {
		if (!client) return;
		if (!confirm($t('clients.confirmDelete', { name: client.name, count: snapshots.length }))) return;
		try {
			await deleteClient(clientId);
			await goto('/clients');
		} catch {
			issue = 'registry.saveError';
		}
	}

	function startSnapshot() {
		draft = Object.fromEntries(allKeys.map((key) => [key, latest?.values[key] !== undefined ? String(latest.values[key]) : '']));
		label = '';
		adding = true;
	}

	const draftValues = $derived.by(() => {
		const values: Record<string, number> = {};
		const invalid: string[] = [];
		for (const [key, raw] of Object.entries(draft)) {
			if (!raw.trim()) continue;
			const value = Number(raw.replace(',', '.'));
			const range = measurementRange(key);
			if (!Number.isFinite(value) || value < range.min || value > range.max) invalid.push(key);
			else values[key] = value;
		}
		return { values, invalid };
	});

	async function saveSnapshot() {
		if (draftValues.invalid.length || !Object.keys(draftValues.values).length) return;
		try {
			await createSnapshot(clientId, label || new Date().toLocaleDateString($locale), draftValues.values);
			snapshots = await listSnapshots(clientId);
			right = left;
			left = snapshots[0]?.id ?? '';
			adding = false;
			message = 'clients.saved';
		} catch {
			issue = 'registry.saveError';
		}
	}

	async function removeSnapshot(snapshot: MeasurementSnapshot) {
		if (!confirm($t('clientCard.confirmSnapshot', { label: snapshot.label }))) return;
		try {
			await deleteSnapshot(clientId, snapshot.id);
			snapshots = snapshots.filter((item) => item.id !== snapshot.id);
			if (left === snapshot.id) left = snapshots[0]?.id ?? '';
			if (right === snapshot.id) right = snapshots.find((item) => item.id !== left)?.id ?? '';
		} catch {
			issue = 'registry.saveError';
		}
	}

	async function setStage(project: DesignProject, stage: Stage) {
		try {
			const saved = await updateProject(project.id, { stage }, data.items);
			projects = projects.map((item) => (item.id === saved.id ? saved : item));
		} catch {
			issue = 'registry.saveError';
		}
	}

	function value(event: Event): string {
		return (event.currentTarget as HTMLInputElement).value;
	}
</script>

<svelte:head>
	<title>{client?.name ?? $t('clientsPage.title')} — Shityo</title>
</svelte:head>

<div class="registry">
	<div class="trail">
		<Crumbs trail={[{ label: 'app.clients', href: '/clients' }]}>
			<span class="current">{client?.name ?? $t('clientCard.title')}</span>
		</Crumbs>
	</div>

	{#if missing}
		<p class="registry-empty">{$t('clientCard.missing')}</p>
	{:else if client}
		<div class="registry-title">
			<h1 data-testid="client-name">{client.name}</h1>
			<span class="count">{$t('clientCard.since', { date: shortDate(client.createdAt, $locale) })}</span>
		</div>

		{#if issue}<p class="registry-error" role="alert">{$t(issue)}</p>{/if}
		{#if message}<p class="ok" role="status">{$t(message)}</p>{/if}

		<div class="layout">
			<section class="registry-section contacts" aria-labelledby="contacts-title">
				<div class="registry-head"><h2 id="contacts-title">{$t('clientCard.contacts')}</h2></div>
				<div class="fields">
					<TextField id="client-card-name" label={$t('clientCard.name')} value={name} oninput={(e: Event) => (name = value(e))} />
					<TextField id="client-card-phone" type="tel" label={$t('clientsPage.phone')} value={phone} oninput={(e: Event) => (phone = value(e))} />
					<label class="notes">
						<span>{$t('clients.notes')}</span>
						<textarea rows="4" maxlength="500" bind:value={notes} placeholder={$t('clientCard.notesPlaceholder')}></textarea>
					</label>
					<div class="actions">
						<Button size="sm" disabled={!dirty || !name.trim()} onclick={saveContacts} data-testid="client-card-save">{$t('project.save')}</Button>
						{#if session.isOwner}
							<button type="button" class="delete" onclick={remove} data-testid="client-card-delete">{$t('clients.deleteClient')}</button>
						{/if}
					</div>
				</div>
			</section>

			<section class="registry-section orders" aria-labelledby="client-orders-title">
				<div class="registry-head">
					<h2 id="client-orders-title">{$t('clientCard.orders')}</h2>
					<span class="registry-muted num">{projects.length}</span>
					<span class="spacer"></span>
					<select class="registry-field" bind:value={model} aria-label={$t('board.base')} data-testid="client-card-model">
						{#each data.items as item (item.id)}<option value={item.id}>{$t(`model.${item.id}.name`)}</option>{/each}
					</select>
					<Button size="sm" onclick={() => goto(`/pattern/${model}?new=1&client=${encodeURIComponent(clientId)}&from=${encodeURIComponent(`/clients/${clientId}`)}`)} data-testid="client-card-new-order">
						{$t('landing.continue.new')}
					</Button>
				</div>
				{#if projects.length}
					<ul class="registry-rows order-rows" data-testid="client-orders">
						{#each projects as project (project.id)}
							<li>
								<a class="registry-link" href={`/pattern/${project.model}?project=${encodeURIComponent(project.id)}&from=${encodeURIComponent(`/clients/${clientId}`)}`}>{project.name}</a>
								<span class="registry-caps">{$t(`model.${project.model}.name`)}</span>
								<select value={project.stage ?? 'draft'} aria-label={`${$t('project.stage')}: ${project.name}`} onchange={(e) => setStage(project, e.currentTarget.value as Stage)}>
									{#each STAGES as stage (stage)}<option value={stage}>{$t(`stage.${stage}`)}</option>{/each}
								</select>
								<span class="registry-muted">{project.assigneeId ? (staffNames.get(project.assigneeId) ?? '') : ''}</span>
								<span class="registry-muted" title={fullDate(project.updated, $locale)}>{shortDate(project.updated, $locale)}</span>
								{#if outdated(project)}
									<span class="flag" data-testid="order-outdated" title={$t('clientCard.outdatedHint')}>{$t('clientCard.outdated')}</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="registry-empty">{$t('board.noProjects')}</p>
				{/if}
			</section>
		</div>

		<section class="registry-section" aria-labelledby="measures-title">
			<div class="registry-head">
				<h2 id="measures-title">{$t('clientCard.measures')}</h2>
				<span class="registry-muted num">{snapshots.length}</span>
				<span class="spacer"></span>
				{#if !adding}
					<Button size="sm" onclick={startSnapshot} data-testid="snapshot-new">{$t('clientCard.newSnapshot')}</Button>
				{/if}
			</div>

			{#if adding}
				<div class="new-snapshot" data-testid="snapshot-form">
					<TextField id="snapshot-label" label={$t('clients.newSnapshotLabel')} placeholder={$t('clients.newSnapshotPlaceholder')} value={label} oninput={(e: Event) => (label = value(e))} />
					<p class="registry-muted">{$t('clientCard.snapshotHint')}</p>
					<div class="grid">
						{#each allKeys as key (key)}
							{@const range = measurementRange(key)}
							<label class="measure" class:bad={draftValues.invalid.includes(key)}>
								<span>{measureName(key)}</span>
								<input
									inputmode="decimal"
									bind:value={draft[key]}
									placeholder={`${range.min}-${range.max}`}
									data-testid={`snapshot-${key}`}
								/>
								<span class="unit">{$t('unit.cm')}</span>
							</label>
						{/each}
					</div>
					<div class="actions">
						<Button size="sm" disabled={!!draftValues.invalid.length || !Object.keys(draftValues.values).length} onclick={saveSnapshot} data-testid="snapshot-save">
							{$t('clients.saveSnapshot')}
						</Button>
						<Button size="sm" variant="quiet" onclick={() => (adding = false)}>{$t('app.cancel')}</Button>
					</div>
				</div>
			{/if}

			{#if snapshots.length}
				<div class="compare-head">
					<label>
						<span class="registry-caps">{$t('clientCard.now')}</span>
						<select class="registry-field" bind:value={left} data-testid="compare-left">
							{#each snapshots as snapshot (snapshot.id)}<option value={snapshot.id}>{snapshot.label}, {shortDate(snapshot.createdAt, $locale)}</option>{/each}
						</select>
					</label>
					<label>
						<span class="registry-caps">{$t('clientCard.before')}</span>
						<select class="registry-field" bind:value={right} data-testid="compare-right">
							<option value="">—</option>
							{#each snapshots.filter((item) => item.id !== left) as snapshot (snapshot.id)}<option value={snapshot.id}>{snapshot.label}, {shortDate(snapshot.createdAt, $locale)}</option>{/each}
						</select>
					</label>
				</div>
				<ul class="registry-rows compare" data-testid="compare-table">
					<li class="labels" aria-hidden="true">
						<span>{$t('clientCard.measure')}</span>
						<span>{$t('clientCard.now')}</span>
						<span>{$t('clientCard.before')}</span>
						<span>{$t('clientCard.diff')}</span>
					</li>
					{#each compare as row (row.key)}
						<li>
							<span>{measureName(row.key)}</span>
							<span class="num">{row.now ?? '—'}</span>
							<span class="num registry-muted">{row.before ?? '—'}</span>
							<span class="num diff" class:changed={!!row.diff} data-testid={`diff-${row.key}`}>
								{row.diff === null ? '' : row.diff > 0 ? `+${row.diff}` : row.diff}
							</span>
						</li>
					{/each}
				</ul>
				<details class="history">
					<summary>{$t('clientCard.history')}</summary>
					<ul class="registry-rows history-rows">
						{#each snapshots as snapshot (snapshot.id)}
							<li>
								<span>{snapshot.label}</span>
								<span class="registry-muted" title={fullDate(snapshot.createdAt, $locale)}>{shortDate(snapshot.createdAt, $locale)}</span>
								<span class="registry-muted num">{$t('clientCard.values', { count: Object.keys(snapshot.values).length })}</span>
								<button type="button" class="icon" aria-label={`${$t('clients.deleteSnapshot')} ${snapshot.label}`} onclick={() => removeSnapshot(snapshot)}>
									<Trash2 size={14} strokeWidth={1.7} />
								</button>
							</li>
						{/each}
					</ul>
				</details>
			{:else if !adding}
				<p class="registry-empty">{$t('clientCard.noMeasures')}</p>
			{/if}
		</section>
	{:else if issue}
		<p class="registry-error" role="alert">{$t(issue)}</p>
	{:else}
		<p class="registry-empty">{$t('registry.loading')}</p>
	{/if}
</div>

<style>
	/* Как «← Каталог» в тулбаре редактора: иконка lucide, не символ стрелки. */
	.trail {
		margin-bottom: var(--space-3);
	}
	.current {
		font-size: 13px;
		font-weight: 700;
		color: var(--ui-ink);
	}
	.ok {
		margin: 0 0 var(--space-2);
		font-size: 13px;
		color: var(--ui-success-text, var(--ui-ink-soft));
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr);
		gap: var(--space-6);
	}
	.layout .registry-section {
		margin-top: 0;
	}
	.spacer {
		flex: 1;
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-3);
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	/* Заметки - тем же подчёркнутым полем, что имя и телефон над ними. */
	textarea {
		padding: var(--space-2) var(--space-1);
		border: 0;
		border-bottom: 1px solid var(--ui-line);
		border-radius: 0;
		background: transparent;
		font: inherit;
		font-size: 13px;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ui-ink);
		resize: vertical;
	}
	textarea:focus-visible {
		outline: none;
		border-color: var(--ui-accent);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	/* Удаление клиента - тихая ссылка в стороне от «Сохранить», а не вторая кнопка рядом. */
	.delete {
		margin-left: auto;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: 12px;
		color: var(--ui-ink-muted);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.delete:hover,
	.delete:focus-visible {
		color: var(--ui-danger-text);
	}
	.order-rows > li {
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr) 72px 112px;
	}
	.flag {
		justify-self: end;
		padding: var(--space-half) var(--space-2);
		border: 1px solid var(--ui-accent);
		border-radius: var(--ui-radius);
		font-size: 10.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ui-accent-text, var(--ui-accent));
		white-space: nowrap;
	}
	.new-snapshot {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--ui-line);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-1) var(--space-4);
	}
	.measure {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 72px 24px;
		align-items: center;
		gap: var(--space-2);
		font-size: 12.5px;
	}
	.measure input {
		height: 28px;
		padding: 0 var(--space-2);
		border: 1px solid var(--ui-line);
		border-radius: var(--ui-radius);
		background: var(--ui-surface);
		font: inherit;
		text-align: right;
		color: var(--ui-ink);
	}
	.measure input:focus-visible {
		outline: none;
		border-color: var(--ui-accent);
	}
	.measure.bad input {
		border-color: var(--ui-danger-text);
	}
	.unit {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}
	.compare-head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		padding: var(--space-3) 0;
	}
	.compare-head label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.compare,
	.compare-head {
		max-width: 640px;
	}
	.compare > li {
		grid-template-columns: minmax(0, 2fr) 90px 90px 90px;
		min-height: 32px;
	}
	.compare .num {
		text-align: right;
	}
	.diff.changed {
		font-weight: 600;
		color: var(--ui-accent-text, var(--ui-accent));
	}
	.history {
		margin-top: var(--space-3);
	}
	.history summary {
		width: fit-content;
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.history-rows > li {
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 28px;
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
	@media (max-width: 900px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
