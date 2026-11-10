<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '@monos/ui';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { importData } from '$lib/atelier';
	import { browserPayload, markMigrated, pendingCounts } from '$lib/browser-data';

	/**
	 * Предложение перенести то, что осталось в этом браузере, в ателье.
	 * Показывается один раз на браузер; данные в браузере не удаляются,
	 * сервер пропускает уже перенесённые записи.
	 */
	let counts = $state({ projects: 0, clients: 0, custom: 0 });
	let busy = $state(false);
	let result = $state('');
	let issue = $state('');
	const visible = $derived(counts.projects + counts.clients + counts.custom > 0 || !!result);

	onMount(() => {
		counts = pendingCounts();
	});

	async function migrate() {
		busy = true;
		issue = '';
		try {
			const done = await importData(browserPayload());
			markMigrated();
			counts = { projects: 0, clients: 0, custom: 0 };
			result = $t('migrate.done', {
				projects: done.projects,
				clients: done.clients,
				custom: done.custom,
				skipped: done.skipped
			});
			await invalidateAll();
		} catch {
			issue = 'migrate.failed';
		} finally {
			busy = false;
		}
	}

	function later() {
		markMigrated();
		counts = { projects: 0, clients: 0, custom: 0 };
	}
</script>

{#if visible}
	<div class="banner" role="region" aria-label={$t('migrate.title')} data-testid="migration-banner">
		{#if result}
			<p role="status">{result}</p>
			<Button size="sm" variant="quiet" onclick={() => (result = '')}>{$t('app.close')}</Button>
		{:else}
			<p>
				{$t('migrate.text', { projects: counts.projects, clients: counts.clients, custom: counts.custom })}
			</p>
			<Button size="sm" disabled={busy} onclick={migrate} data-testid="migrate-run">{$t('migrate.run')}</Button>
			<Button size="sm" variant="quiet" disabled={busy} onclick={later}>{$t('migrate.later')}</Button>
			{#if issue}<p class="error" role="alert">{$t(issue)}</p>{/if}
		{/if}
	</div>
{/if}

<style>
	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-6);
		border-bottom: 1px solid var(--ui-line);
		background: var(--ui-surface-2);
		font-size: 13px;
	}
	p {
		flex: 1 1 40ch;
		margin: 0;
		line-height: 1.5;
	}
	.error {
		flex-basis: 100%;
		color: var(--ui-danger-text);
	}
</style>
