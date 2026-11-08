<script lang="ts">
	import { RotateCcw } from 'lucide-svelte';
	import { locale, t } from '$lib/i18n';
	import type { ProjectVersion } from '$lib/projects';

	/**
	 * Настройки проекта и история версий: автосохранение и откат к любой
	 * сохранённой версии. Откат - обычная правка: её можно отменить.
	 */
	interface Props {
		versions: ProjectVersion[];
		autosave: boolean;
		saved: boolean;
		/** Есть правки после последнего сохранения. */
		dirty: boolean;
		onAutosave: (on: boolean) => void;
		onRestore: (version: ProjectVersion) => void;
	}

	let { versions, autosave, saved, dirty, onAutosave, onRestore }: Props = $props();

	function when(value: string): string {
		return new Date(value).toLocaleString($locale === 'ru' ? 'ru-RU' : 'en-US', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="versions" data-testid="project-versions">
	<label class="toggle">
		<input
			type="checkbox"
			checked={autosave}
			data-testid="autosave-toggle"
			onchange={(event) => onAutosave(event.currentTarget.checked)}
		/>
		<span>{$t('versions.autosave')}</span>
	</label>
	<p class="hint">{$t(saved ? 'versions.autosaveHint' : 'versions.firstSave')}</p>

	{#if versions.length}
		<ul>
			{#each versions as version, index (version.id)}
				<li>
					<span class="at num">{when(version.at)}</span>
					<span class="label">{index === 0 ? $t(dirty ? 'versions.lastSaved' : 'versions.current') : version.name}</span>
					{#if index > 0}
						<button
							type="button"
							class="restore"
							title={$t('versions.restore')}
							aria-label={`${$t('versions.restore')}: ${when(version.at)}`}
							data-testid="version-restore"
							onclick={() => onRestore(version)}
						>
							<RotateCcw size={13} strokeWidth={1.8} />
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">{$t('versions.empty')}</p>
	{/if}
</div>

<style>
	.versions {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: 13px;
		color: var(--ui-ink);
		cursor: pointer;
	}
	.toggle input {
		accent-color: var(--ui-accent);
	}
	.hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ui-ink-muted);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) 24px;
		align-items: center;
		gap: var(--space-2);
		min-height: 30px;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 55%, transparent);
		font-size: 12px;
	}
	.at {
		color: var(--ui-ink-soft);
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--ui-ink-muted);
	}
	li:first-child .label {
		color: var(--ui-accent-text);
	}
	.restore {
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--ui-radius);
		color: var(--ui-ink-soft);
		cursor: pointer;
	}
	.restore:hover {
		color: var(--ui-accent);
		border-color: var(--ui-line);
	}
	.restore:focus-visible {
		outline: 1px solid var(--ui-accent);
		outline-offset: 1px;
	}
</style>
