<script lang="ts">
	import { Button, TextField, SelectField } from '@monos/ui';
	import { library, librarySections, patternName, librarySources } from '$lib/library';
	import { searchPatterns } from '$lib/pattern-search';
	import SourceImage from '$lib/components/SourceImage.svelte';
	import { locale, t } from '$lib/i18n';

	let query = $state(''),
		section = $state('all'),
		provider = $state('all');
	const sourceOptions = $derived([
		{ value: 'all', label: $t('library.allSources') },
		...librarySources.map((source) => ({ value: source.id, label: source.name }))
	]);
	const sectionOptions = $derived(
		['all', ...librarySections].map((id) => ({
			value: id,
			label: `${$t(`library.section.${id}`)} (${id === 'all' ? library.length : library.filter((p) => p.section === id).length})`
		}))
	);
	const filtered = $derived(searchPatterns(library, query, section, provider));
</script>

<svelte:head>
	<title>Shityo — {$t('library.title')}</title>
</svelte:head>

<div class="page">
	<header class="head">
		<div class="title-row">
			<h1 id="library-title">{$t('library.title')}</h1>
			<span class="count num">{$t('library.total', { count: library.length })}</span>
			<a class="back" href="/">← {$t('library.ourEditor')}</a>
		</div>
		<p class="lead">{$t('library.about')}</p>
	</header>

	<div class="library-tools">
		<TextField
			id="library-search"
			data-testid="library-search"
			size="sm"
			label={$t('library.search')}
			value={query}
			oninput={(event: Event) => (query = (event.currentTarget as HTMLInputElement).value)}
		/>
		<SelectField
			id="library-section"
			size="sm"
			label={$t('library.sections')}
			value={section}
			options={sectionOptions}
			variant="boxed"
			onchange={(event) => (section = event.currentTarget.value)}
		/>
		<SelectField
			id="library-source"
			size="sm"
			label={$t('library.source')}
			value={provider}
			options={sourceOptions}
			variant="boxed"
			onchange={(event) => (provider = event.currentTarget.value)}
		/>
	</div>
	<p class="library-count num" role="status">{$t('library.found', { count: filtered.length })}</p>

	{#each librarySections as model (model)}
		{@const presets = filtered.filter((p) => p.section === model)}
		{#if presets.length}
			<section class="library-section" aria-labelledby={`library-${model}`}>
				<div class="section-head">
					<h3 id={`library-${model}`}>{$t(`library.section.${model}`)}</h3>
					<span class="count num">{presets.length}</span>
				</div>
				<div class="preset-grid">
					{#each presets as preset (preset.id)}
						<article class="preset" data-testid="library-preset" data-preset={preset.id}>
							<a
								class="preview-link"
								href={`/library/${preset.id}`}
								tabindex="-1"
								aria-hidden="true"
								><SourceImage
									src={preset.image}
									srcset={preset.image_srcset}
									sizes="(max-width:700px) 96px, 120px"
									alt=""
								/></a
							>
							<div class="preset-content">
								<h4>
									<a href={`/library/${preset.id}`} data-testid={`preset-${preset.id}`}
										>{patternName(preset, $locale)}</a
									>
								</h4>
								<p class="meta">{$t('library.author')}: {preset.author}</p>
								{#if preset.difficulty !== null}
									<p class="meta num">{$t('library.difficulty')}: {preset.difficulty}/5</p>
								{/if}
								<span class="preset-type">{preset.source} · {$t('library.external')}</span>
							</div>
						</article>
					{/each}
				</div>
			</section>
		{/if}
	{/each}

	{#if !filtered.length}
		<div class="empty">
			<h3>{$t('library.empty')}</h3>
			<p>{$t('library.emptyHint')}</p>
			<Button
				size="sm"
				onclick={() => {
					query = '';
					section = 'all';
					provider = 'all';
				}}>{$t('library.reset')}</Button
			>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1180px;
		margin: 0 auto;
		padding: var(--space-6);
	}

	.title-row {
		display: flex;
		align-items: baseline;
		gap: var(--space-4);
		flex-wrap: wrap;
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--ui-line);
	}

	h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}

	.count {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}

	.back {
		margin-left: auto;
		font-size: 11px;
		color: var(--ui-ink-soft);
		text-decoration: none;
	}

	.back:hover {
		color: var(--ui-accent);
	}

	.lead {
		margin: var(--space-2) 0 0;
		color: var(--ui-ink-soft);
		font-size: 12px;
		max-width: 66ch;
	}

	.library-tools {
		margin-top: var(--space-4);
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(200px, 260px) minmax(150px, 200px);
		gap: var(--space-3);
		align-items: end;
	}

	.library-count {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
		margin: var(--space-3) 0 0;
	}

	.library-section {
		margin-top: var(--space-6);
	}

	.section-head {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		padding-bottom: 6px;
		border-bottom: 1px solid var(--ui-line);
	}

	.section-head h3 {
		margin: 0;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.preset {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-3) var(--space-3) 0;
		min-width: 0;
		border-bottom: 1px solid color-mix(in srgb, var(--ui-line) 60%, transparent);
	}

	.preset:hover .preset-content h4 a {
		color: var(--ui-accent);
	}

	.preview-link {
		display: block;
		width: 88px;
		flex-shrink: 0;
		aspect-ratio: 3/4;
		overflow: hidden;
		background: var(--ui-surface-2);
	}

	.preview-link :global(img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: saturate(0.92);
	}

	.preset-content {
		min-width: 0;
	}

	h4 {
		margin: 0 0 3px;
		font-size: 12.5px;
		line-height: 1.4;
	}

	h4 a {
		color: var(--ui-ink);
		text-decoration: none;
	}

	.meta {
		font-size: 10.5px;
		line-height: 1.5;
		margin: 0;
		color: var(--ui-ink-muted);
	}

	.preset-type {
		display: block;
		margin-top: 4px;
		font-size: 9.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ui-ink-muted);
	}

	.empty {
		padding: var(--space-6) 0;
	}

	.empty h3 {
		margin: 0;
		font-size: 14px;
	}

	.empty p {
		font-size: 12px;
		color: var(--ui-ink-soft);
	}

	@media (max-width: 760px) {
		.page {
			padding: var(--space-4) var(--space-3);
		}
		.library-tools {
			grid-template-columns: minmax(0, 1fr);
		}
		.preset-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.preview-link {
			width: 72px;
		}
	}
</style>
