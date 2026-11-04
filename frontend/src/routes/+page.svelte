<script lang="ts">
	import { Badge, Button, Card, TextField, SelectField } from '@monos/ui';
	import { library,librarySections,patternName,librarySources } from '$lib/library';
 import { searchPatterns } from '$lib/pattern-search';
 import MyDesigns from '$lib/components/MyDesigns.svelte';
 import SourceImage from '$lib/components/SourceImage.svelte';
 import { locale,hasKey, t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();


	const items = $derived(data.items);
 let query=$state(''),section=$state('all'),provider=$state('all');
 const sourceOptions=$derived([{value:'all',label:$t('library.allSources')},...librarySources.map(source=>({value:source.id,label:source.name}))]);
 const sectionOptions=$derived(['all',...librarySections].map(id=>({value:id,label:`${$t(`library.section.${id}`)} (${id==='all'?library.length:library.filter(p=>p.section===id).length})`})));
 const filtered=$derived(searchPatterns(library,query,section,provider));
</script>

<svelte:head>
	<title>Shityo — {$t('catalog.title')}</title>
</svelte:head>

<div class="page">
	<header class="head">
		<h1>{$t('catalog.title')}</h1>
		<p class="lead">
			{$t('catalog.lead')}
			{#if data.source === 'fixture'}
				<span class="offline">{$t('catalog.offline')}</span>
			{/if}
		</p>
	</header>

	<MyDesigns catalog={items}/>
 <section class="library" aria-labelledby="library-title">
  <div class="library-heading"><h2 id="library-title">{$t('library.title')}</h2><span>{$t('library.total',{count:library.length})}</span></div>
  <p class="lead">{$t('library.about')}</p><a class="editor-jump" href="#base-title">{$t('library.ourEditor')}</a>
  <div class="library-tools">
   <TextField id="library-search" data-testid="library-search" label={$t('library.search')} value={query} oninput={(event:Event)=>query=(event.currentTarget as HTMLInputElement).value}/>
   <SelectField id="library-section" label={$t('library.sections')} value={section} options={sectionOptions} variant="boxed" onchange={event=>section=event.currentTarget.value}/>
   <SelectField id="library-source" label={$t('library.source')} value={provider} options={sourceOptions} variant="boxed" onchange={event=>provider=event.currentTarget.value}/>
  </div>
  <p class="library-count" role="status">{$t('library.found',{count:filtered.length})}</p>
  {#each librarySections as model (model)}
   {@const presets=filtered.filter(p=>p.section===model)}
   {#if presets.length}
    <section class="library-section" aria-labelledby={`library-${model}`}>
     <h3 id={`library-${model}`}>{$t(`library.section.${model}`)}</h3>
     <div class="preset-grid">
      {#each presets as preset (preset.id)}
       <article class="preset" data-testid="library-preset" data-preset={preset.id}>
        <a class="preview-link" href={`/library/${preset.id}`} tabindex="-1" aria-hidden="true"><SourceImage src={preset.image} srcset={preset.image_srcset} sizes="(max-width:700px) 96px, 120px" alt=""/></a>
        <div class="preset-content"><h4><a href={`/library/${preset.id}`} data-testid={`preset-${preset.id}`}>{patternName(preset,$locale)}</a></h4>
         <p>{$t('library.author')}: {preset.author}</p>{#if preset.difficulty!==null}<p>{$t('library.difficulty')}: {preset.difficulty}/5</p>{/if}<span class="preset-type">{preset.source} · {$t('library.external')}</span>
        </div>
       </article>
      {/each}
     </div>
    </section>
   {/if}
  {/each}
  {#if !filtered.length}<div class="empty"><h3>{$t('library.empty')}</h3><p>{$t('library.emptyHint')}</p><Button size="sm" onclick={()=>{query='';section='all';provider='all';}}>{$t('library.reset')}</Button></div>{/if}
 </section>
 <section class="bases" aria-labelledby="base-title"><h2 id="base-title">{$t('library.bases')}</h2><p class="lead">{$t('library.basesHint')}</p>
 <div class="grid">
		{#each items as item (item.id)}
			<Card data-testid="model-card-{item.id}">
				<div class="model-card">
				<div class="card-head">
					<h2>{$t(`model.${item.id}.name`)}</h2>
					<Badge tone="accent">{$t(`model.${item.id}.category`)}</Badge>
				</div>
				<p class="desc">
					{hasKey(`model.${item.id}.description`)
						? $t(`model.${item.id}.description`)
						: item.description}
				</p>
				<dl>
					<div>
						<dt>{$t('catalog.pieces')}</dt>
						<dd data-testid="model-pieces-{item.id}">{item.pieces.length}</dd>
					</div>
					<div>
						<dt>{$t('catalog.measures')}</dt>
						<dd>{item.measurements.length}</dd>
					</div>
					<div>
						<dt>{$t('catalog.gender')}</dt>
						<dd>{item.genders.map((g) => $t(`gender.${g}`)).join(', ')}</dd>
					</div>
				</dl>
				<div class="badges">
					{#each item.pieces as piece (piece)}
						<Badge tone="neutral">{$t(`piece.${piece}`)}</Badge>
					{/each}
				</div>
				<a class="open" href="/pattern/{item.id}" data-testid="open-{item.id}">
					{$t('catalog.open')}
				</a>
				</div>
			</Card>
		{/each}
	</div>
</section>
</div>

<style>
 .editor-jump{display:inline-block;margin-top:var(--space-3);color:var(--ui-ink);font-size:13px;text-decoration:underline;text-underline-offset:3px;}
 .library{margin-top:var(--space-6);}.library-heading{display:flex;align-items:baseline;gap:var(--space-3);flex-wrap:wrap;}.library-heading h2,.bases h2{font-size:20px;margin:0 0 var(--space-2);}.library-heading span,.library-count{font-size:12px;color:var(--ui-ink-soft);}

 .library-tools{margin-top:var(--space-4);display:grid;grid-template-columns:minmax(0,1fr) minmax(210px,280px) minmax(150px,210px);gap:var(--space-3);align-items:end;}
 .library-section{margin-top:var(--space-6);}.library-section h3{margin:0 0 var(--space-3);font-size:16px;}.preset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3);}
 .preset{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--ui-line);border-radius:var(--ui-radius);background:var(--ui-surface);min-width:0;}
 .preset-content{min-width:0;}.preview-link{display:block;width:120px;flex-shrink:0;aspect-ratio:3/4;overflow:hidden;border-radius:var(--ui-radius);}.preview-link :global(img){width:100%;height:100%;object-fit:cover;}.preset h4{margin:0 0 var(--space-2);font-size:14px;line-height:1.5;}.preset h4 a{color:var(--ui-ink);text-decoration:underline;text-underline-offset:3px;}.preset h4 a:hover{color:var(--ui-accent);}.preset p{font-size:12px;line-height:1.6;margin:0 0 var(--space-2);color:var(--ui-ink-soft);}.preset-type{font-size:11px;color:var(--ui-ink-soft);}
 .empty{padding:var(--space-6) 0;}.empty h3{margin:0;}.empty p{font-size:13px;}.bases{margin-top:var(--space-6);padding-top:var(--space-6);border-top:1px solid var(--ui-line);}
 @media(max-width:700px){.library-tools{grid-template-columns:minmax(0,1fr);}.preview-link{width:96px;}.preset-grid{grid-template-columns:minmax(0,1fr);}.page{padding:var(--space-4) var(--space-3) !important;}}

	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: var(--ui-space-roomy) var(--ui-space-comfortable) var(--ui-space-section);
	}

	.head h1 {
		margin: 0 0 var(--ui-space-tight);
		font-size: 24px;
	}

	.lead {
		margin: 0;
		color: var(--ui-ink-soft);
		font-size: 13px;
		max-width: 70ch;
	}

	.offline {
		color: var(--ui-warning-text);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--ui-space-comfortable);
		margin-top: var(--ui-space-roomy);
	}

	.model-card {
		display: flex;
		flex-direction: column;
		gap: var(--ui-space-input);
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ui-space-snug);
	}

	.card-head h2 {
		margin: 0;
		font-size: 18px;
	}

	.desc {
		margin: 0;
		color: var(--ui-ink-soft);
		font-size: 13px;
	}

	dl {
		display: flex;
		gap: var(--ui-space-comfortable);
		margin: 0;
	}

	dt {
		font-size: 11px;
		color: var(--ui-ink-muted);
	}

	dd {
		margin: 0;
		font-weight: 600;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ui-space-tight);
	}

	.open {
        display:block;text-align:center;padding:12px;font-size:13px;font-weight:600;color:var(--ui-ink);
		margin-top: auto;
		text-decoration: none;
	}
</style>
