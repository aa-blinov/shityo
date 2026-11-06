<script lang="ts">
 import { SelectField } from '@monos/ui';
 import { t, hasKey } from '$lib/i18n';
 import { curveLength } from '$lib/seam-measure';
 import type { Piece } from '$lib/types';
 let {pieces,onHighlight}:{pieces:Piece[];onHighlight:(keys:string[])=>void}=$props();
 let first=$state(''),second=$state('');
 const edges=$derived(pieces.flatMap(piece=>piece.seam_edges.map((edge,i)=>({
  value:`${piece.id}:${i}`,label:`${hasKey(`piece.${piece.id}`)?$t(`piece.${piece.id}`):piece.name} · ${edge.label}`,
  length:curveLength(edge.points)
 }))));
 const options=$derived([{value:'',label:$t('inspect.choose')},...edges]);
 const a=$derived(edges.find(e=>e.value===first));
 const b=$derived(edges.find(e=>e.value===second));
 const diff=$derived(a&&b?Math.abs(a.length-b.length)/10:null);
 $effect(()=>onHighlight([a?.value,b?.value].filter((v):v is string=>!!v)));
</script>
<section class="inspector" aria-labelledby="inspect-title" data-testid="seam-inspector">
 <h2 id="inspect-title">{$t('inspect.title')}</h2>
 <div class="pair">
  <div class="seam-picker">
   <span class="label">{$t('inspect.first')}</span>
   <div class="seam-list" role="listbox" aria-label={$t('inspect.first')}>
    {#each edges as edge (edge.value)}
     <button
      type="button"
      class="seam-option"
      class:on={first === edge.value}
      aria-pressed={first === edge.value}
      onclick={() => first = edge.value}
     >{edge.label}</button>
    {/each}
   </div>
  </div>
  <div class="seam-picker">
   <span class="label">{$t('inspect.second')}</span>
   <div class="seam-list" role="listbox" aria-label={$t('inspect.second')}>
    {#each edges as edge (edge.value)}
     <button
      type="button"
      class="seam-option"
      class:on={second === edge.value}
      aria-pressed={second === edge.value}
      onclick={() => second = edge.value}
     >{edge.label}</button>
    {/each}
   </div>
  </div>
 </div>
 {#if a || b}
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
 <p class="hint">{$t('inspect.hint')}</p>
</section>
<style>
 .inspector{display:flex;flex-direction:column;gap:var(--space-2);min-width:0;}
 .pair{display:flex;flex-direction:column;gap:var(--space-3);}
 .seam-picker{display:flex;flex-direction:column;gap:4px;}
 .label{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .seam-list{display:flex;flex-direction:column;max-height:120px;overflow-y:auto;border:1px solid var(--ui-line);}
 .seam-option{background:transparent;border:0;border-bottom:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);padding:6px 8px;text-align:left;font-size:11px;line-height:1.4;color:var(--ui-ink-soft);cursor:pointer;white-space:normal;}
 .seam-option:last-child{border-bottom:0;}
 .seam-option:hover{color:var(--ui-ink);background:color-mix(in srgb,var(--ui-ink) 3%,transparent);}
 .seam-option.on{background:var(--ui-ink);color:var(--ui-bg);}
 .read{margin-top:var(--space-1);}
 .right{text-align:right;}
 .differ td{color:var(--ui-accent);}
 p{margin:0;font-size:12px;line-height:1.5;}
 .hint{color:var(--ui-ink-muted);font-size:11px;line-height:1.5;}
</style>
