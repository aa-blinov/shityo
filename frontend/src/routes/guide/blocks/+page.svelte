<script lang="ts">
	import { onMount } from 'svelte';
	import Crumbs from '$lib/components/Crumbs.svelte';
	import { hasKey, t } from '$lib/i18n';
	import { getBlocksReport, type BlockCheckRow, type BlockReport } from '$lib/api';

	/**
	 * Паспорта основ: методика, пары швов и сверка с типовыми размерами.
	 * Отчёт строит сервер по паспортам (backend/app/blocks); страница его
	 * только показывает. Основа с ошибкой раскрыта сразу.
	 */
	let reports = $state<BlockReport[]>([]);
	let loading = $state(true);
	let issue = $state('');

	onMount(async () => {
		try {
			reports = await getBlocksReport();
		} catch (error) {
			issue = error instanceof Error ? error.message : String(error);
		} finally {
			loading = false;
		}
	});

	const blockName = (report: BlockReport) =>
		hasKey(`model.${report.block}.name`) ? $t(`model.${report.block}.name`) : report.name;

	/** «sleeve.окат / front.пройма + back.пройма» - названиями деталей. */
	function rowName(row: BlockCheckRow): string {
		if (row.level !== 'seam') return row.name;
		return row.name
			.split(' / ')
			.map((side) =>
				side
					.split(' + ')
					.map((ref) => {
						const dot = ref.indexOf('.');
						const piece = ref.slice(0, dot);
						return `${hasKey(`piece.${piece}`) ? $t(`piece.${piece}`) : piece}: ${ref.slice(dot + 1)}`;
					})
					.join(' + ')
			)
			.join(' / ');
	}

	function value(row: BlockCheckRow): string {
		if (row.actual === null) return '';
		return `${String(row.actual).replace('.', ',')} ${row.unit}`;
	}

	function norm(row: BlockCheckRow): string {
		if (!row.expected) return '';
		const [low, high] = row.expected.map((v) => String(v).replace('.', ','));
		return low === high ? `${low} ${row.unit}` : `${low}…${high} ${row.unit}`;
	}
</script>

<svelte:head>
	<title>{$t('blocks.title')} — Shityo</title>
</svelte:head>

<div class="registry">
	<div class="trail">
		<Crumbs trail={[{ label: 'app.guide', href: '/guide' }]}><span class="current">{$t('blocks.title')}</span></Crumbs>
	</div>
	<div class="registry-title">
		<h1>{$t('blocks.title')}</h1>
		{#if reports.length}<span class="count num">{reports.length}</span>{/if}
	</div>
	<p class="lead">{$t('blocks.lead')}</p>
	<p class="hint">{$t('blocks.howTo')}</p>

	{#if loading}
		<p class="registry-empty" aria-live="polite">{$t('blocks.loading')}</p>
	{:else if issue}
		<p class="registry-error" role="alert">{$t('blocks.error', { reason: issue })}</p>
	{/if}

	{#each reports as report (report.block)}
		<details class="block" open={!report.ok} data-testid="block-{report.block}" data-ok={report.ok}>
			<summary>
				<span class="name">{blockName(report)}</span>
				<span class="kind" class:project={report.source.kind === 'project'}>{$t(`blocks.kind.${report.source.kind}`)}</span>
				<span class="registry-muted summary-counts">{$t('blocks.summary', report.counts)}</span>
				<span class="state" class:bad={!report.ok}>{report.ok ? $t('blocks.status.ok') : $t('blocks.status.fail')}</span>
			</summary>
			<p class="method">{report.source.method}{report.source.notes ? `. ${report.source.notes}` : ''}</p>
			<table>
				<thead>
					<tr>
						<th>{$t('blocks.col.check')}</th>
						<th>{$t('blocks.col.figure')}</th>
						<th class="num">{$t('blocks.col.value')}</th>
						<th class="num">{$t('blocks.col.norm')}</th>
						<th>{$t('blocks.col.result')}</th>
					</tr>
				</thead>
				<tbody>
					{#each report.rows as row, i (i)}
						<tr class={row.status}>
							<td>
								{rowName(row)}
								{#if row.note}<span class="note">{row.note}</span>{/if}
								{#if row.source}<span class="note">{row.source}</span>{/if}
							</td>
							<td class="registry-muted">{row.figure === 'вся сетка' ? $t('blocks.wholeGrid') : row.figure}</td>
							<td class="num">{value(row)}</td>
							<td class="num">{norm(row)}</td>
							<td class="result">{$t(`blocks.status.${row.status}`)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</details>
	{/each}
</div>

<style>
	.trail {
		margin-bottom: var(--space-3);
	}
	.current {
		font-size: 13px;
		font-weight: 700;
		color: var(--ui-ink);
	}
	.lead {
		max-width: 72ch;
		margin: 0 0 var(--space-2);
		font-size: 14px;
		line-height: 1.6;
		color: var(--ui-ink-soft);
	}
	.hint {
		margin: 0 0 var(--space-5);
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	.block {
		border-bottom: 1px solid var(--ui-line);
	}
	.block summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		cursor: pointer;
		list-style: none;
	}
	.block summary::-webkit-details-marker {
		display: none;
	}
	.name {
		font-size: 15px;
		font-weight: 600;
		color: var(--ui-ink);
	}
	.kind {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-soft);
	}
	.kind.project {
		color: var(--ui-ink-muted);
	}
	.summary-counts {
		flex: 1;
	}
	.state {
		font-size: 12px;
		color: var(--ui-ink-soft);
	}
	.state.bad,
	tr.fail .result {
		font-weight: 600;
		color: var(--ui-danger-text);
	}
	tr.accepted .result {
		color: var(--ui-accent-text);
	}
	.method {
		max-width: 80ch;
		margin: 0 0 var(--space-3);
		font-size: 13px;
		line-height: 1.5;
		color: var(--ui-ink-soft);
	}
	table {
		width: 100%;
		margin-bottom: var(--space-4);
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		padding: var(--space-1) var(--space-2) var(--space-1) 0;
		border-bottom: 1px solid var(--ui-line);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-align: left;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}
	td {
		padding: var(--space-2) var(--space-2) var(--space-2) 0;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 65%, transparent);
		vertical-align: top;
		color: var(--ui-ink);
	}
	.num {
		text-align: right;
		white-space: nowrap;
	}
	.note {
		display: block;
		margin-top: var(--space-half);
		font-size: 12px;
		color: var(--ui-ink-muted);
	}
	td.registry-muted {
		white-space: nowrap;
	}
</style>
