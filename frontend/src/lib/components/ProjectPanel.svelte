<script lang="ts">
 import {onMount} from 'svelte';
 import {Button} from '@monos/ui';
 import {ArrowUpRight,Copy,Redo2,Undo2} from 'lucide-svelte';
 import {t} from '$lib/i18n';
 import {createClient,listClients,type Client} from '$lib/clients';
 import {listStaff} from '$lib/atelier';
 import type {User} from '$lib/session.svelte';
 import {STAGES,type Stage} from '$lib/projects';
 /**
  * Шапка проекта над панелями: название, чей это заказ и на какой он стадии,
  * состояние сохранения, отмена и повтор. Всё, что нужно в каждом подходе
  * подгонки, видно без раскрытия.
  */
 let {blockedByErrors=0,name,onName,onSave,onDuplicate,onUndo,onRedo,canUndo,canRedo,disabled,issue,dirty,saved,clientId,onClient,stage,onStage,assigneeId='',onAssignee=()=>{}}:{name:string;onName:(name:string)=>void;onSave:()=>void;onDuplicate:()=>void;onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;disabled:boolean;blockedByErrors?:number;issue:string;dirty:boolean;saved:boolean;clientId:string;onClient:(id:string)=>void;stage:Stage;onStage:(stage:Stage)=>void;assigneeId?:string;onAssignee?:(id:string)=>void}=$props();
 // Причина серой кнопки видна сразу: ошибки построения не дают сохранить.
 const statusText=$derived(issue?$t(issue):blockedByErrors?$t('project.blocked',{count:blockedByErrors}):!saved?$t('project.newShort'):dirty?$t('project.unsavedShort'):$t('project.savedShort'));
 const tone=$derived((issue && issue!=='project.saved' && issue!=='project.autosaved')||blockedByErrors?'issue':!saved||dirty?'pending':'ok');
 let clients=$state<Client[]>([]);
 // Клиент, созданный в разделе мерок, появляется в списке при открытии.
 async function refreshClients(){try{clients=await listClients();}catch{clients=[];}}
 // Ответственный мастер: заказы ателье делятся между сотрудниками.
 let staff=$state<User[]>([]);
 onMount(()=>{void refreshClients();listStaff().then(list=>staff=list.filter(u=>u.active||u.id===assigneeId)).catch(()=>staff=[]);});
 let adding=$state(false),newName=$state('');
 /** Новый клиент прямо из шапки проекта: заводится и сразу становится заказчиком. */
 async function addClient(){const n=newName.trim();if(!n){adding=false;return;}try{const c=await createClient(n);await refreshClients();onClient(c.id);}catch{/* сервер недоступен - клиент не заводится */}newName='';adding=false;}
</script>
<div class="project" data-testid="project-panel">
 <!-- Название - во всю ширину панели, как заголовок документа: рядом с
      кнопками ему оставалось несколько букв. Под ним - состояние сохранения,
      ниже - действия. -->
 <label class="sr-only" for="project-name">{$t('project.name')}</label>
 <input id="project-name" class="name" value={name} maxlength="120" placeholder={$t('project.name')} title={name||$t('project.name')} onchange={e=>onName(e.currentTarget.value)}/>
 <p class="status tone-{tone}" role="status" data-testid="project-status">{statusText}</p>
 <div class="actions-row">
  <!-- Отмена, повтор и копия - иконки у «Сохранить»: под рукой, как в любом редакторе. -->
  <div class="tools" role="group" aria-label={$t('project.history')}>
   <button type="button" class="tool" disabled={!canUndo} onclick={onUndo} data-testid="project-undo" aria-label={$t('project.undo')} data-tip={`${$t('project.undo')} (Ctrl+Z)`}><Undo2 size={15} strokeWidth={1.8}/></button>
   <button type="button" class="tool" disabled={!canRedo} onclick={onRedo} data-testid="project-redo" aria-label={$t('project.redo')} data-tip={`${$t('project.redo')} (Ctrl+Shift+Z)`}><Redo2 size={15} strokeWidth={1.8}/></button>
   <button type="button" class="tool" disabled={disabled||!name.trim()} onclick={onDuplicate} data-testid="project-duplicate" aria-label={$t('project.duplicate')} data-tip={$t('project.duplicate')}><Copy size={14} strokeWidth={1.8}/></button>
  </div>
  <Button size="sm" variant={dirty||!saved?'primary':'secondary'} class={dirty||!saved?'cta':''} disabled={disabled||!name.trim()} onclick={onSave} data-testid="project-save" data-tip={`${$t('project.save')} (Ctrl+S)`}>{$t('project.save')}</Button>
 </div>
 <div class="facts">
  <div class="fact">
   <span class="fact-head"><label class="fact-label" for="project-client">{$t('project.client')}</label>{#if clientId && !adding}<a class="card-link" href={`/clients/${encodeURIComponent(clientId)}`} data-testid="project-client-card">{$t('project.clientCard')}<ArrowUpRight size={12} strokeWidth={1.8} aria-hidden="true"/></a>{/if}</span>
   {#if adding}
    <form class="add-client" onsubmit={e=>{e.preventDefault();addClient();}}>
     <!-- svelte-ignore a11y_autofocus -->
     <input class="client-input" bind:value={newName} maxlength="120" placeholder={$t('board.newClientPlaceholder')} aria-label={$t('board.newClient')} autofocus data-testid="project-new-client" onkeydown={e=>{if(e.key==='Escape'){adding=false;}}}/>
    </form>
   {:else}
   <select id="project-client" value={clientId} onfocus={()=>void refreshClients()} onchange={e=>{const v=e.currentTarget.value;if(v==='__new'){adding=true;e.currentTarget.value=clientId;return;}onClient(v);}} data-testid="project-client">
    <option value="">{$t('project.noClient')}</option>
    {#each clients as client (client.id)}<option value={client.id}>{client.name}</option>{/each}
    <option value="__new">{$t('board.newClient')}…</option>
   </select>
   {/if}
  </div>
  <label class="fact">
   <span class="fact-label">{$t('project.stage')}</span>
   <select value={stage} onchange={e=>onStage(e.currentTarget.value as Stage)} data-testid="project-stage">
    {#each STAGES as value (value)}<option {value}>{$t(`stage.${value}`)}</option>{/each}
   </select>
  </label>
  {#if staff.length>1}
  <label class="fact wide">
   <span class="fact-label">{$t('project.assignee')}</span>
   <select value={assigneeId} onchange={e=>onAssignee(e.currentTarget.value)} data-testid="project-assignee">
    <option value="">{$t('project.noAssignee')}</option>
    {#each staff as user (user.id)}<option value={user.id}>{user.name}</option>{/each}
   </select>
  </label>
  {/if}
 </div>
</div>
<style>
 .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}
 .project{display:flex;flex-direction:column;gap:var(--space-2);padding-bottom:var(--space-3);border-bottom:1px solid var(--ui-ink);}
 .actions-row{display:flex;align-items:center;gap:var(--space-2);}
 .actions-row :global(button[data-testid="project-save"]){flex:1;}
 .name{width:100%;min-width:0;background:transparent;border:0;border-bottom:1px solid transparent;padding:var(--space-1) 0;font:inherit;font-size:15px;font-weight:700;color:var(--ui-ink);text-overflow:ellipsis;}
 .name:hover{border-bottom-color:var(--ui-line);}
 .name:focus{outline:none;border-bottom-color:var(--ui-accent);}
 .facts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--space-2);}
 .fact{display:flex;flex-direction:column;gap:var(--space-half);min-width:0;}
 .fact.wide{grid-column:1 / -1;}
 .fact-head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);}
 .card-link{display:inline-flex;align-items:center;gap:2px;font-size:12px;color:var(--ui-ink-soft);text-decoration:underline;text-underline-offset:3px;}
 .card-link:hover{color:var(--ui-ink);}
 .fact-label{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .client-input{width:100%;height:30px;padding:0 var(--space-2);background:var(--ui-surface);border:1px solid var(--ui-accent);border-radius:var(--ui-radius);font:inherit;font-size:13px;color:var(--ui-ink);outline:none;}
 select{min-width:0;height:30px;padding:0 var(--space-2);font:inherit;font-size:13px;color:var(--ui-ink);cursor:pointer;}
 select:hover{border-color:var(--ui-line);}
 select:focus-visible{outline:none;border-color:var(--ui-accent);}
 .status{margin:calc(var(--space-2) * -1) 0 0;font-size:12px;line-height:1.4;color:var(--ui-ink-muted);min-width:0;}
 .status.tone-pending{color:var(--ui-accent-text);}
 .status.tone-issue{color:var(--ui-danger);}
 .tools{display:flex;border:1px solid var(--ui-line);border-radius:var(--ui-radius);overflow:hidden;flex-shrink:0;}
 .tool{width:28px;height:28px;display:grid;place-items:center;background:transparent;border:0;border-right:1px solid var(--ui-line);color:var(--ui-ink-soft);cursor:pointer;padding:0;}
 .tool:last-child{border-right:0;}
 .tool:hover:not(:disabled){color:var(--ui-accent);background:color-mix(in srgb,var(--ui-accent) 8%,transparent);}
 .tool:disabled{opacity:.35;cursor:default;}
</style>
