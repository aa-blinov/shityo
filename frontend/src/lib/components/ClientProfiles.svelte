<script lang="ts">
 import { onMount } from 'svelte';
 import { Button, TextField, SelectField } from '@monos/ui';
 import { t } from '$lib/i18n';
 import { measurementRange } from '$lib/labels';
 import {
  listClients, createClient, updateClient, deleteClient,
  listSnapshots, createSnapshot, deleteSnapshot,
  type Client, type MeasurementSnapshot
 } from '$lib/clients';
 let {values,keys,onApply}:{values:Record<string,number>;keys:string[];onApply:(values:Record<string,number>)=>void}=$props();
 let clients=$state<Client[]>([]),snapshots=$state<MeasurementSnapshot[]>([]);
 let selectedClientId=$state(''),selectedSnapshotId=$state('');
 let newClientName=$state(''),newClientNotes=$state(''),newSnapshotLabel=$state('');
 let message=$state('');
 const clientOptions=$derived([{value:'',label:$t('clients.chooseClient')},...clients.map(c=>({value:c.id,label:c.name}))]);
 const snapshotOptions=$derived([{value:'',label:$t('clients.chooseSnapshot')},...snapshots.map(s=>({value:s.id,label:s.label}))]);
 const selectedClient=$derived(clients.find(c=>c.id===selectedClientId));
 function refresh(){clients=listClients();snapshots=selectedClientId?listSnapshots(selectedClientId):[];}
 onMount(refresh);
 $effect(()=>{if(selectedClient){newClientNotes=selectedClient.notes;}else{newClientNotes='';}});
 function selectClient(id:string){selectedClientId=id;selectedSnapshotId='';snapshots=id?listSnapshots(id):[];message='';}
 function createNewClient(){const name=newClientName.trim();if(!name){message='clients.nameRequired';return;}try{createClient(name,newClientNotes);newClientName='';newClientNotes='';refresh();const created=clients.find(c=>c.name===name);if(created)selectClient(created.id);message='clients.created';}catch{message='clients.storageError';}}
 function saveNotes(){if(!selectedClientId)return;try{updateClient(selectedClientId,{notes:newClientNotes});refresh();message='clients.notesSaved';}catch{message='clients.storageError';}}
 function validCurrent(){return keys.every(k=>{const r=measurementRange(k);return Number.isFinite(values[k])&&values[k]>=r.min&&values[k]<=r.max;});}
 function saveSnapshot(){if(!selectedClientId){message='clients.chooseClient';return;}if(!validCurrent()){message='clients.invalid';return;}try{createSnapshot(selectedClientId,newSnapshotLabel.trim()||new Date().toLocaleDateString(),values);newSnapshotLabel='';refresh();message='clients.saved';}catch{message='clients.storageError';}}
 function applySnapshot(){const snapshot=snapshots.find(s=>s.id===selectedSnapshotId);if(!snapshot)return;const available=Object.fromEntries(keys.filter(k=>{const r=measurementRange(k);return Number.isFinite(snapshot.values[k])&&snapshot.values[k]>=r.min&&snapshot.values[k]<=r.max;}).map(k=>[k,snapshot.values[k]]));onApply(available);message=Object.keys(available).length===keys.length?'clients.applied':'clients.partial';}
 function removeClient(){if(!selectedClientId)return;try{deleteClient(selectedClientId);selectedClientId='';selectedSnapshotId='';snapshots=[];refresh();message='clients.deleted';}catch{message='clients.storageError';}}
 function removeSnapshot(){if(!selectedClientId||!selectedSnapshotId)return;try{deleteSnapshot(selectedClientId,selectedSnapshotId);selectedSnapshotId='';refresh();message='clients.snapshotDeleted';}catch{message='clients.storageError';}}
 function inputValue(e:Event){return (e.currentTarget as HTMLInputElement).value;}
</script>
<div class="profiles-wrap">
 <details class="profiles" data-testid="client-profiles" open><summary>{$t('clients.title')}</summary><div class="profile-fields">
  <SelectField id="client-profile" size="sm" label={$t('clients.client')} options={clientOptions} value={selectedClientId} onchange={e=>selectClient(e.currentTarget.value)}/>
  {#if selectedClient}
   <TextField id="client-notes" size="sm" label={$t('clients.notes')} placeholder={$t('clients.notes')} value={newClientNotes} oninput={(e:Event)=>newClientNotes=inputValue(e)}/>
   <div class="actions"><Button size="sm" variant="quiet" onclick={saveNotes}>{$t('clients.saveNotes')}</Button><Button size="sm" variant="danger" onclick={removeClient}>{$t('clients.deleteClient')}</Button></div>
   <SelectField id="client-snapshot" size="sm" label={$t('clients.snapshot')} options={snapshotOptions} value={selectedSnapshotId} onchange={e=>{selectedSnapshotId=e.currentTarget.value;message='';}}/>
   <div class="actions"><Button size="sm" disabled={!selectedSnapshotId} onclick={applySnapshot}>{$t('clients.apply')}</Button><Button size="sm" variant="quiet" disabled={!selectedSnapshotId} onclick={removeSnapshot}>{$t('clients.deleteSnapshot')}</Button></div>
   <TextField id="snapshot-label" size="sm" label={$t('clients.newSnapshotLabel')} placeholder={$t('clients.newSnapshotPlaceholder')} value={newSnapshotLabel} oninput={(e:Event)=>newSnapshotLabel=inputValue(e)}/>
   <Button size="sm" disabled={!validCurrent()} onclick={saveSnapshot}>{$t('clients.saveSnapshot')}</Button>
  {:else}
   <TextField id="client-name" size="sm" label={$t('clients.name')} placeholder={$t('clients.namePlaceholder')} value={newClientName} oninput={(e:Event)=>newClientName=inputValue(e)}/>
   <TextField id="client-notes-new" size="sm" label={$t('clients.notes')} placeholder={$t('clients.notes')} value={newClientNotes} oninput={(e:Event)=>newClientNotes=inputValue(e)}/>
   <Button size="sm" disabled={!newClientName.trim()} onclick={createNewClient}>{$t('clients.createClient')}</Button>
   {#if !newClientName.trim()}<p class="why">{$t('clients.nameRequired')}</p>{/if}
  {/if}
  <p class="hint" title={$t('clients.local')}>{$t('clients.local')}</p>
  <p role="status">{message?$t(message):''}</p>
 </div></details>
</div>
<style>
 .profiles-wrap{min-width:0;}
 summary{cursor:pointer;font-size:10px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ui-ink-muted);padding-bottom:6px;border-bottom:1px solid var(--ui-line);list-style:none;display:flex;align-items:center;gap:6px;}
 summary::-webkit-details-marker{display:none;}
 summary::before{content:"›";display:inline-block;transform:rotate(90deg);font-size:11px;}
 .profile-fields{display:flex;flex-direction:column;gap:8px;padding-top:10px;}
 .actions{display:flex;gap:6px;flex-wrap:wrap;}
 p{margin:0;font-size:11px;line-height:1.45;}
 .why{margin:0;font-size:10px;line-height:1.4;color:var(--ui-ink-soft);}
 .hint{color:var(--ui-ink-muted);font-size:10px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
</style>
