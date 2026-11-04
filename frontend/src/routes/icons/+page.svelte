<script lang="ts">
	import { Card, SearchField } from '@monos/ui';
	import { t } from '$lib/i18n';
	import { ALL_ICONS, ICON_GROUPS } from '$lib/icons';

	let query = $state('');
	let copied = $state('');

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return null;
		return ALL_ICONS.filter((icon) => icon.name.toLowerCase().includes(needle));
	});

	const groups = $derived(
		filtered
			? [{ title: $t('icons.found'), icons: filtered }]
			: ICON_GROUPS.map((group) => ({ ...group, title: $t(`icons.group.${group.title}`) }))
	);

	async function copy(name: string) {
		try {
			await navigator.clipboard.writeText(name);
		} catch {
			// Буфер обмена может быть недоступен: тогда просто показываем имя.
		}
		copied = name;
		setTimeout(() => {
			if (copied === name) copied = '';
		}, 1200);
	}
</script>

<svelte:head>
	<title>Shityo — {$t('icons.title')}</title>
</svelte:head>

<div class="page">
	<header class="head">
		<h1>{$t('icons.title')}</h1>
		<p class="lead">{$t('icons.lead')}</p>
		<div class="search">
			<SearchField
				bind:value={query}
				placeholder={$t('icons.search')}
				label={$t('icons.search')}
			/>
		</div>
	</header>

	{#each groups as group (group.title)}
		<section>
			<h2>{group.title}</h2>
			<div class="icons">
				{#each group.icons as icon (icon.name)}
					<Card>
						<button
							type="button"
							class="icon"
							title={$t('icons.copy')}
							aria-label={$t('icons.copy')}
							onclick={() => copy(icon.name)}
						>
							<span class="glyph">
								<icon.component size={20} strokeWidth={1.7} />
							</span>
							<span class="name" class:copied={copied === icon.name}>
								{copied === icon.name ? $t('icons.copied') : icon.name}
							</span>
						</button>
					</Card>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--ui-space-roomy) var(--ui-space-roomy) var(--ui-space-section);
	}

	.head {
		display: grid;
		gap: var(--ui-space-snug);
		margin-bottom: var(--ui-space-roomy);
	}

	h1 {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	h2 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--ui-ink-muted);
		margin: var(--ui-space-roomy) 0 var(--ui-space-input);
	}

	.lead {
		color: var(--ui-ink-muted);
		font-size: 13px;
		max-width: 60ch;
	}

	.search {
		max-width: 320px;
		margin-top: var(--ui-space-tight);
	}

	.icons {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
		gap: var(--ui-space-input);
	}

	.icon {
		display: grid;
		justify-items: center;
		gap: var(--ui-space-snug);
		width: 100%;
		padding: var(--ui-space-comfortable) var(--ui-space-snug) var(--ui-space-input);
		background: transparent;
		border: 0;
		border-radius: var(--ui-radius);
		color: var(--ui-ink);
		cursor: pointer;
	}

	.icon:hover {
		background: var(--ui-surface-2);
	}

	.icon:focus-visible {
		outline: 2px solid var(--ui-ink-soft);
		outline-offset: 2px;
	}

	.glyph {
		color: var(--ui-ink);
	}

	.name {
		font-size: 11px;
		color: var(--ui-ink-muted);
		text-align: center;
		word-break: break-word;
	}

	.name.copied {
		color: var(--ui-accent, var(--ui-ink));
	}
</style>
