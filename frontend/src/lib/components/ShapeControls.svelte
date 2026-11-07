<script lang="ts">
 import {Card,TextField,Button} from '@monos/ui';
 import {t} from '$lib/i18n';
 import type {Piece} from '$lib/types';
 let {pieces,overrides,onChange,onReset}:{pieces:Piece[];overrides:Record<string,number>;onChange:(key:string,value:number)=>void;onReset:()=>void}=$props();
 const controls=$derived.by(()=>{
  const front=pieces.find(p=>p.id==='front');if(!front)return [];
  return [{key:'shoulder_tip_x',edge:'плечо',axis:'x' as const},{key:'armhole_depth',edge:'пройма',axis:'y' as const}].flatMap(item=>{
   const edge=front.seam_edges.find(e=>e.label===item.edge);const point=edge?.points.at(-1);return point?[{key:item.key,value:overrides[item.key]??point[item.axis]/10}]:[];
  });
 });
</script>
{#if controls.length}<Card><details open><summary>{$t('project.shape')}</summary><div class="fields">
 <p>{$t('project.shapeHint')}</p>
 {#each controls as control (control.key)}<TextField id={`shape-${control.key}`} label={$t(`project.${control.key}`)} type="number" value={String(Math.round(control.value*10)/10)} min="0.1" max="100" step="0.1" onchange={e=>{const value=Number(e.currentTarget.value);if(Number.isFinite(value)&&value>0&&value<=100)onChange(control.key,value);}}/>{/each}
 <Button size="sm" variant="secondary" disabled={!Object.keys(overrides).length} onclick={onReset}>{$t('project.resetShape')}</Button>
</div></details></Card>{/if}
<style>summary{cursor:pointer;font-size:14px;font-weight:600;}.fields{display:flex;flex-direction:column;gap:var(--space-3);padding-top:var(--space-3);}p{margin:0;font-size:12px;line-height:1.5;color:var(--ui-ink-soft);}</style>
