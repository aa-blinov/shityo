<script lang="ts">
 import { t, hasKey } from '$lib/i18n';
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
 $effect(()=>onHighlight([a?.value,b?.value].filter((v):v is string=>!!v)));
</script>
<section class="inspector" aria-labelledby="inspect-title" data-testid="seam-inspector">
 <h2 id="inspect-title">{$t('inspect.title')}</h2>
 <div class="seam-picker">
  <span class="label">{$t('inspect.choose')}</span>
  <div class="seam-list">
   <div class="seam-header">
    <span class="seam-header-name">{$t('inspect.seam')}</span>
    <span class="seam-header-badge">{$t('inspect.first')}</span>
    <span class="seam-header-badge">{$t('inspect.second')}</span>
   </div>
   {#each edges as edge (edge.value)}
    <div class="seam-row" class:on={first === edge.value || second === edge.value}>
     <button
      type="button"
      class="seam-option"
      onclick={() => { first = edge.value; }}
     >{edge.label}</button>
     <div class="badges">
      <button
       type="button"
       class="badge"
       class:on={first === edge.value}
       aria-pressed={first === edge.value}
       onclick={() => (first = edge.value)}>A</button>
      <button
       type="button"
       class="badge"
       class:on={second === edge.value}
       aria-pressed={second === edge.value}
       onclick={() => (second = edge.value)}>B</button>
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
 <p class="hint">{$t('inspect.abHint')}</p>
 <p class="hint">{$t('inspect.hint')}</p>
</section>
<style>
 .inspector{display:flex;flex-direction:column;gap:var(--space-2);min-width:0;}
 .seam-picker{display:flex;flex-direction:column;gap:4px;}
 .label{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .seam-list{display:flex;flex-direction:column;max-height:220px;overflow-y:auto;border:1px solid var(--ui-line);}
 .seam-header{display:flex;align-items:center;padding:4px 8px;border-bottom:1px solid var(--ui-line);background:color-mix(in srgb,var(--ui-ink) 3%,var(--ui-surface));font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .seam-header-name{flex:1;}
 .seam-header-badge{width:28px;text-align:center;}
 .seam-row{display:flex;align-items:stretch;border-bottom:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);}
 .seam-row:last-child{border-bottom:0;}
 .seam-row.on{background:var(--ui-ink);}
 .seam-row.on .seam-option{color:var(--ui-bg);}
 .seam-option{flex:1;background:transparent;border:0;padding:6px 8px;text-align:left;font-size:11px;line-height:1.4;color:var(--ui-ink-soft);cursor:pointer;white-space:normal;}
 .seam-option:hover{color:var(--ui-ink);background:color-mix(in srgb,var(--ui-ink) 3%,transparent);}
 .seam-row.on .seam-option:hover{color:var(--ui-bg);}
 .badges{display:flex;flex-shrink:0;border-left:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);}
 .badge{width:28px;background:transparent;border:0;border-right:1px solid color-mix(in srgb,var(--ui-line) 60%,transparent);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ui-ink-muted);cursor:pointer;}
 .badge:last-child{border-right:0;}
 .badge:hover{color:var(--ui-ink);background:color-mix(in srgb,var(--ui-ink) 3%,transparent);}
 .badge.on{background:var(--ui-accent);color:var(--ui-bg);}
 .seam-row.on .badge{color:var(--ui-bg);}
 .pair{font-size:12px;font-weight:600;color:var(--ui-ink);margin:0;}
 .read{margin-top:var(--space-1);}
 .right{text-align:right;}
 .differ td{color:var(--ui-accent);}
 p{margin:0;font-size:12px;line-height:1.5;}
 .hint{color:var(--ui-ink-muted);font-size:11px;line-height:1.5;}
</style>
