<script lang="ts">
 import { t, hasKey } from '$lib/i18n';
 import Term from '$lib/components/Term.svelte';
 import { curveLength } from '$lib/seam-measure';
 import type { Piece } from '$lib/types';
 let {pieces,onHighlight}:{pieces:Piece[];onHighlight:(keys:string[])=>void}=$props();
 let first=$state(''),second=$state('');
 const edges=$derived(pieces.flatMap(piece=>piece.seam_edges.map((edge,i)=>({
  value:`${piece.id}:${i}`,label:`${hasKey(`piece.${piece.id}`)?$t(`piece.${piece.id}`):piece.name}, ${edge.label}`,
  length:curveLength(edge.points)
 }))));
 const a=$derived(edges.find(e=>e.value===first));
 const b=$derived(edges.find(e=>e.value===second));
 const diff=$derived(a&&b?Math.abs(a.length-b.length)/10:null);
 const pairLabel=$derived(a&&b?$t('inspect.pair',{a:a.label,b:b.label}):'');
 /**
  * Щелчок по названию шва: сначала заполняется A, потом B; повторный щелчок
  * по выбранному шву снимает выбор. A и B тоже включаются и выключаются.
  */
 function pick(value:string){
  if(first===value){first='';return;}
  if(second===value){second='';return;}
  if(!first)first=value;else second=value;
 }
 $effect(()=>onHighlight([a?.value,b?.value].filter((v):v is string=>!!v)));
</script>
<section class="inspector" aria-label={$t('inspect.title')} data-testid="seam-inspector">
 <div class="seam-picker">
  <span class="label">{$t('inspect.choose')}</span>
  <div class="seam-list">
   <div class="seam-header">
    <span class="seam-header-name">{$t('inspect.seam')}</span>
    <!-- Колонки узкие: в шапке те же буквы, что на кнопках, полное слово в подсказке. -->
    <span class="seam-header-badge" title={$t('inspect.first')}>A</span>
    <span class="seam-header-badge" title={$t('inspect.second')}>B</span>
   </div>
   {#each edges as edge (edge.value)}
    <div class="seam-row" class:on={first === edge.value || second === edge.value}>
     <button
      type="button"
      class="seam-option"
      onclick={() => pick(edge.value)}
     >{edge.label}</button>
     <div class="badges">
      <button
       type="button"
       class="badge"
       class:on={first === edge.value}
       aria-pressed={first === edge.value}
       title={`${$t('inspect.first')}: ${edge.label}`}
       onclick={() => (first = first === edge.value ? '' : edge.value)}>A</button>
      <button
       type="button"
       class="badge"
       class:on={second === edge.value}
       aria-pressed={second === edge.value}
       title={`${$t('inspect.second')}: ${edge.label}`}
       onclick={() => (second = second === edge.value ? '' : edge.value)}>B</button>
     </div>
    </div>
   {/each}
  </div>
 </div>
 {#if a || b}
 <p class="pair" aria-live="polite">{pairLabel || $t('inspect.choose')}</p>
 <table class="read" aria-live="polite">
  <thead><tr><th>{$t('inspect.seam')}</th><th class="right">{$t('inspect.cm')}</th></tr></thead>
  <tbody>
   <tr>
    <td>{a?.label ?? $t('inspect.choose')}</td>
    <td class="right num" data-testid="seam-length-a">{a?(a.length/10).toFixed(2):'—'}</td>
   </tr>
   <tr>
    <td>{b?.label ?? $t('inspect.choose')}</td>
    <td class="right num">{b?(b.length/10).toFixed(2):'—'}</td>
   </tr>
   <tr class:differ={diff!==null&&diff>0}>
    <td>{$t('inspect.difference')}</td>
    <td class="right num" data-testid="seam-difference">{diff!==null?diff.toFixed(2):'—'}</td>
   </tr>
  </tbody>
 </table>
 {/if}
 <p class="hint">{$t('inspect.abHint')} <Term id="sopryazhenie_srezov">{$t('inspect.why')}</Term></p>
 <p class="hint">{$t('inspect.hint')}</p>
</section>
<style>
 .inspector{display:flex;flex-direction:column;gap:var(--space-2);min-width:0;}
 .seam-picker{display:flex;flex-direction:column;gap:var(--space-1);}
 .label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ui-ink-muted);}
 /* Шапка и строки - одна сетка с одинаковыми колонками: буквы A и B стоят
    ровно над своими кнопками, полоса прокрутки не сдвигает колонки. */
 .seam-list{--cols:minmax(0,1fr) 30px 30px;display:flex;flex-direction:column;max-height:220px;overflow-y:auto;scrollbar-gutter:stable;border:1px solid var(--ui-line);}
 .seam-header{position:sticky;top:0;z-index:1;display:grid;grid-template-columns:var(--cols);align-items:center;border-bottom:1px solid var(--ui-line);background:color-mix(in srgb,var(--ui-ink) 3%,var(--ui-surface));font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .seam-header-name{padding:var(--space-1) var(--space-2);}
 .seam-header-badge{align-self:stretch;display:grid;place-items:center;border-left:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);letter-spacing:0;}
 .seam-row{display:grid;grid-template-columns:var(--cols);align-items:stretch;border-bottom:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);}
 .seam-row:last-child{border-bottom:0;}
 .seam-row.on{background:var(--ui-accent);}
 .seam-row.on .seam-option{color:var(--ui-surface);}
 .seam-option{min-width:0;background:transparent;border:0;padding:var(--space-2) var(--space-2);text-align:left;font-size:12px;line-height:1.4;color:var(--ui-ink-soft);cursor:pointer;white-space:normal;}
 .seam-option:hover{color:var(--ui-ink);background:color-mix(in srgb,var(--ui-ink) 3%,transparent);}
 .seam-row.on .seam-option:hover{color:var(--ui-surface);}
 .badges{display:contents;}
 .badge{background:transparent;border:0;border-left:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ui-ink-muted);cursor:pointer;}
 .badge:hover{color:var(--ui-ink);background:color-mix(in srgb,var(--ui-ink) 3%,transparent);}
 .badge.on{background:var(--ui-accent);color:var(--ui-surface);}
 .seam-row.on .badge{color:var(--ui-surface);}
 .pair{font-size:13px;font-weight:600;color:var(--ui-ink);margin:0;}
 .read{margin-top:var(--space-1);}
 .right{text-align:right;}
 .differ td{color:var(--ui-accent);}
 p{margin:0;font-size:13px;line-height:1.5;}
 .hint{color:var(--ui-ink-muted);font-size:12px;line-height:1.5;}
</style>
