<script lang="ts">
 import {locale,t} from '$lib/i18n';
 import {patternName} from '$lib/library';
 import SourceImage from '$lib/components/SourceImage.svelte';
 import type {PageData} from './$types';
 let {data}:{data:PageData}=$props();
 const pattern=$derived(data.pattern);
</script>
<svelte:head><title>{patternName(pattern,$locale)} — Shityo</title></svelte:head>
<article class="detail">
 <a href="/">{$t('library.back')}</a>
 <div class="intro">
  <a class="photo" href={pattern.image} target="_blank" rel="noopener noreferrer" aria-label={$t('library.openImage')}><SourceImage src={pattern.image} srcset={pattern.image_srcset} sizes="(max-width:650px) 100vw, 360px" eager alt={pattern.name}/></a>
  <div class="info">
   <h1>{patternName(pattern,$locale)}</h1>
   <p class="original">{pattern.name}</p>
   <p>{$t('library.author')}: <strong>{pattern.author}</strong></p>
   {#if pattern.difficulty!==null}<p>{$t('library.difficulty')}: {pattern.difficulty}/5</p>{/if}
   <p>{$t('library.source')}: <a href={pattern.url} target="_blank" rel="noopener noreferrer">{pattern.source}</a></p>
   <p>{$t(pattern.source==='FreeSewing'?'library.externalNotice':'library.publisherNotice')}</p>
   {#if pattern.access==='email-required'}<p>{$t('library.emailRequired')}</p>{/if}
   <div class="actions">
    {#if pattern.editor_url}<a class="primary" data-testid="source-draft" href={pattern.editor_url} target="_blank" rel="noopener noreferrer">{$t('library.draftAtSource')}</a>{/if}
    <a data-testid="source-pattern" href={pattern.url} target="_blank" rel="noopener noreferrer">{$t('library.instructions')}</a>
   </div>
   <p class="caption">{$t('library.imageCredit')}</p>
  </div>
 </div>
 <section aria-labelledby="examples-title">
  <h2 id="examples-title">{$t('library.examples')}</h2>
  {#if pattern.examples.length}
   <div class="examples">
    {#each pattern.examples as example (example.url)}
     <a href={example.url} target="_blank" rel="noopener noreferrer" class="example" data-testid="source-example">
      <div class="example-photo"><SourceImage src={example.image} alt={example.title}/></div>
      <span>{example.title}</span>
     </a>
    {/each}
   </div>
  {:else}<p>{$t('library.noExamples')}</p>{/if}
 </section>
 <details class="provenance"><summary>{$t('library.provenance')}</summary>
  <p>{$t('library.checked')}: {pattern.verified_on}</p>
  {#if pattern.code_license}<p>{$t('library.codeLicense')}: {pattern.code_license} · {pattern.source_version}</p>
  <a href={pattern.code_url??pattern.url} target="_blank" rel="noopener noreferrer">{$t('library.codeSource')}</a>{/if}
  <p>{$t('library.photoRights')}</p>
 </details>
</article>
<style>
 .detail{max-width:1100px;margin:auto;padding:var(--space-6) var(--space-4);font-size:14px;line-height:1.6;}
 a{color:var(--ui-ink);text-decoration:underline;text-underline-offset:3px;}a:hover{color:var(--ui-accent);}
 .intro{display:grid;grid-template-columns:minmax(220px,360px) minmax(0,1fr);gap:var(--space-6);margin:var(--space-6) 0;}
 .photo :global(img){object-fit:contain;}
 .photo{display:block;aspect-ratio:3/4;overflow:hidden;border-radius:var(--ui-radius);background:var(--ui-surface);}
 h1{font-size:24px;line-height:1.4;margin:0 0 var(--space-2);}h2{font-size:20px;margin:var(--space-6) 0 var(--space-3);}
 p{margin:0 0 var(--space-3);}.original,.caption{font-size:12px;color:var(--ui-ink-soft);}
 .actions{display:flex;gap:var(--space-3);flex-wrap:wrap;margin:var(--space-6) 0;}.actions a{padding:var(--space-3);border:1px solid var(--ui-line);border-radius:var(--ui-radius);}.primary{font-weight:700;background:var(--ui-surface);}
 .examples{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-4);}.example-photo{aspect-ratio:1;overflow:hidden;border-radius:var(--ui-radius);margin-bottom:var(--space-2);}.example span{font-size:13px;}
 .provenance{margin-top:var(--space-6);padding:var(--space-3);border-top:1px solid var(--ui-line);font-size:12px;}.provenance summary{cursor:pointer;margin-bottom:var(--space-3);}
 @media(max-width:650px){.intro{grid-template-columns:minmax(0,1fr);gap:var(--space-4);}.photo{max-height:400px;aspect-ratio:auto;}.photo :global(img){object-fit:contain;}.examples{grid-template-columns:minmax(0,1fr);}.detail{padding:var(--space-4) var(--space-3);}}
</style>
