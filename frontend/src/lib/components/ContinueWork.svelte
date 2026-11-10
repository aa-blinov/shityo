<script lang="ts">
	import { Button } from '@monos/ui';
	import { locale, t } from '$lib/i18n';
	import { saveProject, validateProject, type DesignProject } from '$lib/projects';
	import type { Client } from '$lib/clients';
	import type { CatalogItem } from '$lib/types';

	/**
	 * Начало рабочего дня: заказы в работе, по одному щелчку до редактора.
	 *
	 * Портной возвращается к тем же клиентам на вторую и третью примерку,
	 * поэтому на главной первыми стоят незавершённые проекты, свежие сверху.
	 * Полный список - в реестре заказов. Пока проектов нет, блок показывает
	 * только пояснение и импорт резервной копии.
	 */
	let {
		catalog,
		projects,
		clients,
		issue = '',
		onchange,
		onnew
	}: {
		catalog: CatalogItem[];
		projects: DesignProject[];
		clients: Client[];
		issue?: string;
		onchange: () => void | Promise<void>;
		onnew: () => void;
	} = $props();

	const LIMIT = 8;
	let importIssue = $state('');

	const active = $derived(
		projects
			.filter((project) => project.stage !== 'done')
			.sort((a, b) => b.updated.localeCompare(a.updated))
	);
	const shown = $derived(active.slice(0, LIMIT));
	const clientNames = $derived(new Map(clients.map((client) => [client.id, client.name])));
	const dateFormat = $derived(
		new Intl.DateTimeFormat($locale, { day: 'numeric', month: 'short' })
	);
	const hasWork = $derived(projects.length > 0 || clients.length > 0);

	function date(value: string): string {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? '' : dateFormat.format(parsed);
	}

	async function importFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		try {
			if (file.size > 100_000) throw new Error();
			const project = validateProject(JSON.parse(await file.text()), catalog);
			project.id = crypto.randomUUID();
			project.updated = new Date().toISOString();
			await saveProject(project, catalog);
			importIssue = '';
			await onchange();
		} catch {
			importIssue = 'project.invalid';
		} finally {
			input.value = '';
		}
	}
</script>

<section class="work" aria-labelledby="work-title" data-testid="my-designs">
	<div class="section-head">
		<h2 id="work-title">
			{hasWork ? $t('landing.continue.title') : $t('project.myDesigns')}
		</h2>
		<span class="count num">{hasWork ? active.length : 0}</span>
		<span class="spacer"></span>
		<label class="import">
			<input
				class="file-input"
				type="file"
				accept=".json,application/json"
				onchange={importFile}
				data-testid="project-import"
			/>
			<span>{$t('project.import')}</span>
		</label>
		{#if hasWork}
			<a class="all" href="/orders">{$t('landing.continue.all')}</a>
			<Button size="sm" onclick={onnew} data-testid="continue-new">{$t('landing.continue.new')}</Button>
		{/if}
	</div>

	{#if issue || importIssue}<p class="alert" role="alert">{$t(importIssue || issue)}</p>{/if}

	{#if !hasWork}
		<p class="hint">{$t('project.scope')}</p>
		<p class="hint muted">{$t('project.empty')}</p>
	{:else if shown.length}
		<ul class="rows">
			{#each shown as project (project.id)}
				<li>
					<a class="name" href={`/pattern/${project.model}?project=${project.id}`}>{project.name}</a>
					<span class="client">
						{(project.clientId && clientNames.get(project.clientId)) || $t('landing.continue.noClient')}
					</span>
					<span class="model">{$t(`model.${project.model}.name`)}</span>
					<span class="stage">{$t(`stage.${project.stage ?? 'draft'}`)}</span>
					<span class="date num">{date(project.updated)}</span>
				</li>
			{/each}
		</ul>
		{#if active.length > LIMIT}
			<p class="hint"><a href="/orders">{$t('landing.continue.more', { count: active.length - LIMIT })}</a></p>
		{/if}
	{:else}
		<p class="hint muted">{$t('landing.continue.empty')}</p>
	{/if}
</section>

<style>
	.work {
		margin-top: var(--space-6);
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--ui-line);
	}
	h2 {
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
	.spacer {
		flex: 1;
	}
	/* Опорный блок для скрытого поля файла: без него поле позиционировалось от
	   страницы, оказывалось внизу каталога и давало второй скролл документа. */
	.import {
		position: relative;
		display: inline-flex;
		align-items: center;
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--ui-line);
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.import:hover,
	.import:focus-within {
		color: var(--ui-accent);
		border-color: var(--ui-accent);
	}
	.file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}
	.all {
		font-size: 13px;
		color: var(--ui-ink-soft);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.all:hover {
		color: var(--ui-accent);
	}
	.alert {
		margin: var(--space-2) 0 0;
		font-size: 13px;
		color: var(--ui-danger-text);
	}
	.hint {
		margin: var(--space-2) 0 0;
		max-width: 72ch;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	.hint a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.muted {
		color: var(--ui-ink-muted);
	}
	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.rows li {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 64px;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-2) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 65%, transparent);
		font-size: 13.5px;
	}
	.name {
		overflow: hidden;
		font-weight: 600;
		color: var(--ui-ink);
		text-overflow: ellipsis;
		white-space: nowrap;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.name:hover {
		color: var(--ui-accent);
	}
	.client {
		overflow: hidden;
		color: var(--ui-ink);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.model,
	.stage {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	.date {
		font-size: 12px;
		text-align: right;
		color: var(--ui-ink-muted);
	}
	@media (max-width: 760px) {
		.import {
			display: none;
		}
		.rows li {
			grid-template-columns: minmax(0, 1fr) auto;
			row-gap: var(--space-half);
		}
		.name {
			grid-area: 1 / 1;
		}
		.date {
			grid-area: 1 / 2;
		}
		.client {
			grid-area: 2 / 1;
			font-size: 12.5px;
			color: var(--ui-ink-soft);
		}
		.stage {
			grid-area: 2 / 2;
			text-align: right;
		}
		.model {
			display: none;
		}
	}
</style>
