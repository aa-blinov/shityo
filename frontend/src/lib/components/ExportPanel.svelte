<script lang="ts">
 import { Button, Card, Checkbox, SelectField } from '@monos/ui';
 import { t, hasKey } from '$lib/i18n';
 import { exportUrl, getPrintPlan } from '$lib/api';
 import type { PaperOptions, PrintPlan } from '$lib/types';
 interface Props {
  model:string;measurements:Record<string,number>;params:Record<string,string|number>;
  overrides:Record<string,number>;disabled?:boolean;
 }
 let {model,measurements,params,overrides,disabled=false}:Props=$props();
 let page=$state<PaperOptions['page']>('A4');
 let orientation=$state<PaperOptions['orientation']>('portrait');
 let calibration=$state(true);
 let plan=$state<PrintPlan|null>(null);
 let loading=$state(false),issue=$state('');
 const paper=$derived<PaperOptions>({page,orientation,calibration:page!=='FULL' && calibration});
 const paperOptions=$derived([
  ...['A4','A3','A2','A1','A0'].map(value=>({value,label:value})),
  {value:'LETTER',label:'Letter'},{value:'LEGAL',label:'Legal'},
  {value:'FULL',label:$t('print.full')}
 ]);
 const orientations=$derived([{value:'portrait',label:$t('print.portrait')},{value:'landscape',label:$t('print.landscape')}]);
 const ready=$derived(!disabled && !loading && !!plan && !issue);
 const pdfUrl=$derived(exportUrl(model,'pdf',measurements,params,overrides,paper));
 const otherFormats=$derived(['svg','dxf'].map(format=>({format,url:exportUrl(model,format as 'svg'|'dxf',measurements,params,overrides,paper)})));
 function setPaper(value:string) {
  page=value as PaperOptions['page'];
  calibration=['A4','A3','LETTER','LEGAL'].includes(value);
 }
 function label(id:string,fallback:string){return hasKey(`piece.${id}`)?$t(`piece.${id}`):fallback;}
 $effect(()=>{
  const snapshot=JSON.stringify({model,measurements,params,overrides,paper});
  const blocked=disabled;
  plan=null;issue='';loading=!blocked;
  if(blocked)return;
  let cancelled=false;
  const timer=setTimeout(async()=>{
   try {
    const {paper:options,...request}=JSON.parse(snapshot);
    const next=await getPrintPlan(request,options);
    if(!cancelled)plan=next;
   } catch(error) {if(!cancelled)issue=error instanceof Error?error.message:String(error);}
   finally {if(!cancelled)loading=false;}
  },200);
  return ()=>{cancelled=true;clearTimeout(timer);};
 });
</script>

<Card data-testid="export-panel">
 <section class="panel" aria-labelledby="print-title">
  <h2 id="print-title">{$t('print.title')}</h2>
  <SelectField id="print-paper" data-testid="print-paper" label={$t('print.paper')} value={page} options={paperOptions} onchange={(event)=>setPaper(event.currentTarget.value)}/>
  {#if page!=='FULL'}
   <SelectField id="print-orientation" data-testid="print-orientation" label={$t('print.orientation')} value={orientation} options={orientations} onchange={(event)=>orientation=event.currentTarget.value as PaperOptions['orientation']}/>
   <Checkbox checked={calibration} on:change={(event)=>calibration=event.currentTarget.checked} id="print-calibration">{$t('print.calibration')}</Checkbox>
  {/if}
  <div class="status" aria-live="polite" aria-busy={loading} data-testid="print-status">
   {#if disabled}<p>{$t('print.pending')}</p>
   {:else if loading}<p>{$t('print.loading')}</p>
   {:else if issue}<p role="alert">{$t('print.unavailable',{reason:issue})}</p>
   {:else if plan}
    <p class="total" data-testid="print-page-count">{$t('print.count',{count:plan.page_count})}</p>
    <p>{$t('print.size',{width:Math.round(plan.width_mm*10)/10,height:Math.round(plan.height_mm*10)/10})}</p>
    {#if page!=='FULL'}<p>{$t('print.overlap',{value:plan.overlap_mm,margin:plan.margin_mm})}</p>{/if}
   {/if}
  </div>
  <Button full variant="primary" disabled={!ready} data-testid="print-open" onclick={()=>window.open(pdfUrl,'_blank','noopener,noreferrer')}>{$t('print.open')}</Button>
  {#if ready}
   <a class="download" data-testid="export-pdf" href={`${pdfUrl}&download=true`} download>{$t('print.download')}</a>
  {/if}
  <p class="scale">{$t('print.scale')}</p>
  {#if plan?.calibration}<p class="hint">{$t('print.guide')}</p>{/if}
  {#if plan}
   <details data-testid="print-assembly">
    <summary>{$t('print.assembly')}</summary>
    {#each plan.pieces as part (part.id)}
     <div class="piece-map">
      <h3>{label(part.id,part.name)}</h3>
      <p>{$t('print.layout',{rows:part.rows,columns:part.columns})}</p>
      <div class="sheets" style:grid-template-columns={`repeat(${part.columns},minmax(0,1fr))`}>
       {#each plan.sheets.filter(sheet=>sheet.piece_ids.includes(part.id)) as sheet (sheet.number)}
        <span class="sheet"><span>{sheet.tile??''}</span><strong>{sheet.number}</strong></span>
       {/each}
      </div>
     </div>
    {/each}
   </details>
  {/if}
  <details class="editors">
   <summary>{$t('print.editors')}</summary>
   <div class="row">
    {#each otherFormats as entry (entry.format)}
     <a data-testid={`export-${entry.format}`} href={entry.url} target="_blank" rel="noreferrer" download>{entry.format.toUpperCase()}</a>
    {/each}
   </div>
   <p class="hint">{$t('print.svgHint')}</p>
  </details>
 </section>
</Card>

<style>
 .panel{display:flex;flex-direction:column;gap:var(--ui-space-snug);min-width:0;}
 h2{margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ui-ink-soft);}
 p{margin:0;}
 .status,.hint,.scale{font-size:12px;line-height:1.5;color:var(--ui-ink-soft);}
 .total{font-size:14px;font-weight:600;color:var(--ui-ink);}
 .scale{color:var(--ui-ink);}
 .download,.row a{font-size:12px;text-decoration:underline;text-underline-offset:3px;color:var(--ui-ink);padding:6px 0;}
 .download{text-align:center;}
 summary{cursor:pointer;font-size:12px;color:var(--ui-ink);padding:6px 0;}
 .editors{border-top:1px solid var(--ui-line);padding-top:6px;}
 .row{display:flex;gap:var(--ui-space-base);}
 .piece-map{margin:8px 0 14px;}
 h3{font-size:12px;font-weight:600;margin:0;}
 .piece-map p{font-size:11px;color:var(--ui-ink-soft);margin:3px 0 6px;}
 .sheets{display:grid;gap:3px;max-width:250px;}
 .sheet{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:4px 6px;min-height:25px;border:1px solid var(--ui-line);border-radius:var(--ui-radius);font-size:10px;color:var(--ui-ink-soft);}
 .sheet strong{font-size:11px;color:var(--ui-ink);}
</style>
