<script lang="ts">
	import { Card, Notice } from '@monos/ui';
	import { hasKey, t } from '$lib/i18n';
	import type { Issue } from '$lib/types';

	interface Props {
		errors: Issue[];
		warnings: Issue[];
	}

	let { errors, warnings }: Props = $props();

	/**
	 * Текст замечания. Код известен валидатору, поэтому перевод строится по
	 * нему; если кода в словаре нет, показывается текст с сервера.
	 *
	 * Идентификатор меры или параметра внутри текста тоже переводится: в
	 * сообщении «мерка height = ...» пользователь должен видеть «Рост».
	 */
	function issueText(issue: Issue): string {
		const key = `issue.${issue.code}`;
		if (!hasKey(key)) return issue.text;
		return $t(key, translateNames(issue.params));
	}

	/** Подменяет идентификаторы мерок, параметров и рёбер на их названия. */
	function translateNames(params: Record<string, string | number>): Record<string, string | number> {
		const result: Record<string, string | number> = { ...params };
		for (const name of ['name', 'piece', 'piece_a', 'piece_b']) {
			const value = result[name];
			if (typeof value !== 'string') continue;
			for (const prefix of ['measure', 'param', 'piece']) {
				const candidate = `${prefix}.${value}`;
				if (hasKey(candidate)) {
					result[name] = $t(candidate);
					break;
				}
			}
		}
		for (const name of ['edge_a', 'edge_b']) {
			const value = result[name];
			if (typeof value !== 'string') continue;
			const candidate = `edge.${value}`;
			if (hasKey(candidate)) result[name] = $t(candidate);
		}
		return result;
	}
</script>

<Card data-testid="warnings-panel">
	<div class="panel">
	<h2>{$t('check.title')}</h2>
	{#if errors.length === 0 && warnings.length === 0}
		<Notice tone="success" title={$t('check.ok')} />
	{:else}
		{#if errors.length > 0}
			<Notice tone="danger" title={$t('check.errors')}>
				<ul data-testid="error-list">
					{#each errors as issue, i (i)}
						<li>{issueText(issue)}</li>
					{/each}
				</ul>
			</Notice>
		{/if}
		{#if warnings.length > 0}
			<Notice tone="warning" title={$t('check.warnings')}>
				<ul data-testid="warning-list">
					{#each warnings as issue, i (i)}
						<li>{issueText(issue)}</li>
					{/each}
				</ul>
			</Notice>
		{/if}
	{/if}
	</div>
</Card>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-snug);
	}

	h2 {
		margin: 0;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ui-ink-soft);
	}

	ul {
		margin: var(--ui-space-tight) 0 0;
		padding-left: var(--ui-space-comfortable);
		font-size: 12px;
	}
</style>
