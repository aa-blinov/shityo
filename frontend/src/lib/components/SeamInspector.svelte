<script lang="ts">
 import { Card, SelectField } from '@monos/ui';
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
 $effect(()=>onHighlight([a?.value,b?.value].filter((v):v is string=>!!v)));
</script>
<Card>
 <section class="inspector" aria-labelledby="inspect-title" data-testid="seam-inspector">
  <h2 id="inspect-title">{$t('inspect.title')}</h2>
  <SelectField id="seam-first" label={$t('inspect.first')} {options} value={first} onchange={e=>first=e.currentTarget.value}/>
  <SelectField id="seam-second" label={$t('inspect.second')} {options} value={second} onchange={e=>second=e.currentTarget.value}/>
  <div aria-live="polite">
   {#if a}<p data-testid="seam-length-a">A: {(a.length/10).toFixed(2)} {$t('inspect.cm')}</p>{/if}
   {#if b}<p>B: {(b.length/10).toFixed(2)} {$t('inspect.cm')}</p>{/if}
   {#if a && b}<p data-testid="seam-difference">{$t('inspect.difference')}: {(Math.abs(a.length-b.length)/10).toFixed(2)} {$t('inspect.cm')}</p>{/if}
  </div>
  <p class="hint">{$t('inspect.hint')}</p>
 </section>
</Card>
<style>
 .inspector{display:flex;flex-direction:column;gap:12px;min-width:0;}
 h2{margin:0;font-size:14px;}p{margin:0;font-size:13px;font-variant-numeric:tabular-nums;}
 .hint{font-size:12px;line-height:1.5;color:var(--ui-ink-soft);}
</style>
