<script lang="ts">
 import {onMount} from 'svelte';
 import {Button,SelectField} from '@monos/ui';
 import {t} from '$lib/i18n';
 import {goto} from '$app/navigation';
 import {loadProjects,saveProject,validateProject,deleteProject,type DesignProject} from '$lib/projects';
 import type {CatalogItem} from '$lib/types';
 let {catalog}:{catalog:CatalogItem[]}=$props();
 let projects=$state<DesignProject[]>([]),model=$state('tee'),issue=$state('');
 const options=$derived(catalog.map(item=>({value:item.id,label:$t(`model.${item.id}.name`)})));
 onMount(()=>{try{projects=loadProjects(catalog);}catch{issue='project.storageError';}});
 async function importFile(event:Event){
  const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
  try{if(file.size>100_000)throw new Error();const project=validateProject(JSON.parse(await file.text()),catalog);project.id=crypto.randomUUID();project.updated=new Date().toISOString();saveProject(project,catalog);projects=loadProjects(catalog);issue='';}catch{issue='project.invalid';}finally{input.value='';}
 }
 function remove(id:string){try{deleteProject(id,catalog);projects=loadProjects(catalog);}catch{issue='project.storageError';}}
</script>
<details class="my-designs" data-testid="my-designs"><summary><h2 id="my-designs-title">{$t('project.myDesigns')} ({projects.length})</h2></summary>

 <p>{$t('project.scope')}</p>
 <div class="create"><SelectField id="project-base" label={$t('project.base')} {options} value={model} onchange={e=>model=e.currentTarget.value}/><Button size="sm" onclick={()=>goto(`/pattern/${model}?new=1`)}>{$t('project.create')}</Button>
 <label class="import">{$t('project.import')}<input type="file" accept=".json,application/json" onchange={importFile} data-testid="project-import"/></label></div>
 {#if issue}<p role="alert">{$t(issue)}</p>{/if}
 {#if projects.length}<ul>{#each projects as project (project.id)}<li><a href={`/pattern/${project.model}?project=${project.id}`}>{project.name}</a><span>{$t(`model.${project.model}.name`)}</span><Button size="sm" variant="quiet" onclick={()=>remove(project.id)} aria-label={`${$t('project.delete')} ${project.name}`}>{$t('project.delete')}</Button></li>{/each}</ul>
 {:else}<p class="hint">{$t('project.empty')}</p>{/if}
</details>
<style>
 .my-designs{margin-top:var(--space-6);padding:var(--space-4);border:1px solid var(--ui-line);border-radius:var(--ui-radius);background:var(--ui-surface);}
 summary{cursor:pointer;}h2{display:inline;font-size:16px;margin:0 0 var(--space-2);}p{font-size:12px;line-height:1.6;margin:0 0 var(--space-3);color:var(--ui-ink-soft);}
 .create{display:flex;align-items:end;gap:var(--space-3);flex-wrap:wrap;}.create :global(.ui-select){min-width:150px;}
 .import{font-size:12px;display:flex;flex-direction:column;gap:4px;}input{max-width:230px;font-size:12px;}
 ul{padding:0;list-style:none;margin:var(--space-3) 0 0;}li{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;border-top:1px solid var(--ui-line);padding:var(--space-2) 0;font-size:13px;}a{color:var(--ui-ink);text-decoration:underline;text-underline-offset:3px;}li span{font-size:12px;color:var(--ui-ink-soft);}.hint{margin-top:var(--space-3);}
</style>
