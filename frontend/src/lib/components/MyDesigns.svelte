<script lang="ts">
  import {onMount} from 'svelte';
  import {Button} from '@monos/ui';
  import {t} from '$lib/i18n';
  import {loadProjects,saveProject,validateProject,deleteProject,type DesignProject} from '$lib/projects';
  import type {CatalogItem} from '$lib/types';
  let {catalog}:{catalog:CatalogItem[]}=$props();
  let projects=$state<DesignProject[]>([]),issue=$state('');
  onMount(()=>{try{projects=loadProjects(catalog);}catch{issue='project.storageError';}});
  async function importFile(event:Event){
   const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];if(!file)return;
   try{if(file.size>100_000)throw new Error();const project=validateProject(JSON.parse(await file.text()),catalog);project.id=crypto.randomUUID();project.updated=new Date().toISOString();saveProject(project,catalog);projects=loadProjects(catalog);issue='';}catch{issue='project.invalid';}finally{input.value='';}
  }
  function remove(id:string){try{deleteProject(id,catalog);projects=loadProjects(catalog);}catch{issue='project.storageError';}}
</script>
<section class="my-designs" aria-labelledby="my-designs-title" data-testid="my-designs">
 <div class="section-head">
  <h2 id="my-designs-title">{$t('project.myDesigns')}</h2>
  <span class="count num">{projects.length}</span>
  <span class="spacer"></span>
  <label class="import"><input class="file-input" type="file" accept=".json,application/json" onchange={importFile} data-testid="project-import"/><span>{$t('project.import')}</span></label>
 </div>
 <p class="scope">{$t('project.scope')}</p>
 {#if issue}<p role="alert">{$t(issue)}</p>{/if}
 {#if projects.length}<ul>{#each projects as project (project.id)}<li><a href={`/pattern/${project.model}?project=${project.id}`}>{project.name}</a><span class="model">{$t(`model.${project.model}.name`)}</span><Button size="sm" variant="quiet" onclick={()=>remove(project.id)} aria-label={`${$t('project.delete')} ${project.name}`}>{$t('project.delete')}</Button></li>{/each}</ul>
 {:else}<p class="hint">{$t('project.empty')}</p>{/if}
</section>
<style>
 .my-designs{margin-top:var(--space-6);}
 .section-head{display:flex;align-items:baseline;gap:var(--space-3);padding-bottom:6px;border-bottom:1px solid var(--ui-line);}
 h2{margin:0;font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .count{font-size:11px;color:var(--ui-ink-muted);}
 .spacer{flex:1;}
 .scope{margin:var(--space-2) 0 0;font-size:11.5px;line-height:1.5;color:var(--ui-ink-soft);}
 .import{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-soft);display:inline-flex;align-items:center;border:1px solid var(--ui-line);padding:4px 10px;cursor:pointer;}
 .import:hover{color:var(--ui-accent);border-color:var(--ui-accent);}
 .file-input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}
 ul{padding:0;list-style:none;margin:var(--space-2) 0 0;}
 li{display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap;border-bottom:1px solid color-mix(in srgb,var(--ui-line) 65%,transparent);padding:6px 0;font-size:12.5px;}
 a{color:var(--ui-ink);text-decoration:underline;text-underline-offset:3px;}
 a:hover{color:var(--ui-accent);}
 .model{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ui-ink-muted);}
 .hint{margin-top:var(--space-2);font-size:11.5px;color:var(--ui-ink-muted);}
 @media(max-width:760px){.import{display:none;}}
</style>
