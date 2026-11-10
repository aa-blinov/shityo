<script lang="ts">
 import { onMount } from 'svelte';
 import { Button, TextField } from '@monos/ui';
 import { ChevronRight } from 'lucide-svelte';
 import ChoiceChips from '$lib/components/ChoiceChips.svelte';
 import { t } from '$lib/i18n';
 import { measurementRange } from '$lib/labels';
 import {
  listClients, createClient, updateClient, deleteClient,
  listSnapshots, createSnapshot, deleteSnapshot,
  type Client, type MeasurementSnapshot
 } from '$lib/clients';
 import { session } from '$lib/session.svelte';
 let {values,keys,onApply,initialClientId='',open=false}:{values:Record<string,number>;keys:string[];onApply:(values:Record<string,number>)=>void;initialClientId?:string;open?:boolean}=$props();
 let clients=$state<Client[]>([]),snapshots=$state<MeasurementSnapshot[]>([]);
 let selectedClientId=$state(''),selectedSnapshotId=$state('');
 let newClientName=$state(''),newClientNotes=$state(''),newSnapshotLabel=$state('');
 let message=$state('');
 // Раскрытие хранится здесь: атрибут open пересчитывается вместе с
 // заголовком, и после создания клиента блок захлопнулся бы сам.
 let expanded=$state<boolean|null>(null);
 // Пустое значение - «новый клиент»: под кнопками появляется форма создания.
 const clientOptions=$derived([...clients.map(c=>({value:c.id,label:c.name,title:c.notes||c.name})),{value:'',label:$t('clients.newClient')}]);
 const snapshotOptions=$derived(snapshots.map(s=>({value:s.id,label:s.label,title:new Date(s.createdAt).toLocaleString()})));
 const selectedClient=$derived(clients.find(c=>c.id===selectedClientId));
 async function refresh(){try{clients=await listClients();snapshots=selectedClientId?await listSnapshots(selectedClientId):[];}catch{message='clients.storageError';}}
 onMount(async()=>{await refresh();if(initialClientId&&clients.some(c=>c.id===initialClientId))await selectClient(initialClientId);});
 $effect(()=>{if(selectedClient){newClientNotes=selectedClient.notes;}else{newClientNotes='';}});
 async function selectClient(id:string){selectedClientId=id;selectedSnapshotId='';message='';try{snapshots=id?await listSnapshots(id):[];}catch{snapshots=[];message='clients.storageError';}}
 async function createNewClient(){const name=newClientName.trim();if(!name){message='clients.nameRequired';return;}try{const created=await createClient(name,newClientNotes);newClientName='';newClientNotes='';await refresh();await selectClient(created.id);message='clients.created';}catch{message='clients.storageError';}}
 async function saveNotes(){if(!selectedClientId)return;try{await updateClient(selectedClientId,{notes:newClientNotes});await refresh();message='clients.notesSaved';}catch{message='clients.storageError';}}
 function validCurrent(){return keys.every(k=>{const r=measurementRange(k);return Number.isFinite(values[k])&&values[k]>=r.min&&values[k]<=r.max;});}
 async function saveSnapshot(){if(!selectedClientId){message='clients.chooseClient';return;}if(!validCurrent()){message='clients.invalid';return;}try{await createSnapshot(selectedClientId,newSnapshotLabel.trim()||new Date().toLocaleDateString(),values);newSnapshotLabel='';await refresh();message='clients.saved';}catch{message='clients.storageError';}}
 function applySnapshot(){const snapshot=snapshots.find(s=>s.id===selectedSnapshotId);if(!snapshot)return;const available=Object.fromEntries(keys.filter(k=>{const r=measurementRange(k);return Number.isFinite(snapshot.values[k])&&snapshot.values[k]>=r.min&&snapshot.values[k]<=r.max;}).map(k=>[k,snapshot.values[k]]));onApply(available);message=Object.keys(available).length===keys.length?'clients.applied':'clients.partial';}
 // Удаление стирает всю историю мерок клиента: только после подтверждения.
 async function removeClient(){if(!selectedClientId)return;const records=snapshots.length;if(!confirm($t('clients.confirmDelete',{name:selectedClient?.name??'',count:records})))return;try{await deleteClient(selectedClientId);selectedClientId='';selectedSnapshotId='';snapshots=[];await refresh();message='clients.deleted';}catch{message=session.isOwner?'clients.storageError':'clients.ownerOnly';}}
 async function removeSnapshot(){if(!selectedClientId||!selectedSnapshotId)return;try{await deleteSnapshot(selectedClientId,selectedSnapshotId);selectedSnapshotId='';await refresh();message='clients.snapshotDeleted';}catch{message='clients.storageError';}}
 function inputValue(e:Event){return (e.currentTarget as HTMLInputElement).value;}
</script>
<div class="profiles-wrap">
 <details class="profiles" data-testid="client-profiles" open={expanded ?? open} ontoggle={e=>expanded=e.currentTarget.open}><summary><ChevronRight class="chevron" size={14} aria-hidden="true" /><span>{$t('clients.title')}</span>{#if selectedClient}<span class="who">{selectedClient.name}</span>{/if}</summary><div class="profile-fields">
  <ChoiceChips testid="client-profile" label={$t('clients.client')} options={clientOptions} value={selectedClientId} onChange={(id)=>void selectClient(id)}/>
  {#if selectedClient}
   <a class="card-link" href={`/clients/${selectedClient.id}`}>{$t('clients.openCard')}</a>
   <TextField id="client-notes" size="sm" label={$t('clients.notes')} placeholder={$t('clients.notes')} value={newClientNotes} oninput={(e:Event)=>newClientNotes=inputValue(e)}/>
   <div class="actions"><Button size="sm" variant="quiet" onclick={saveNotes}>{$t('clients.saveNotes')}</Button>{#if session.isOwner}<Button size="sm" variant="danger" onclick={removeClient} data-testid="client-delete">{$t('clients.deleteClient')}</Button>{/if}</div>
   {#if snapshotOptions.length}<ChoiceChips testid="client-snapshot" label={$t('clients.snapshot')} options={snapshotOptions} value={selectedSnapshotId} onChange={value=>{selectedSnapshotId=value;message='';}}/>{/if}
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
 summary{cursor:pointer;font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--ui-ink-muted);padding-bottom:var(--space-2);border-bottom:1px solid var(--ui-line);list-style:none;display:flex;align-items:center;gap:var(--space-2);}
 summary::-webkit-details-marker{display:none;}
 summary :global(.chevron){flex:none;transition:transform .15s;}
 details[open]>summary :global(.chevron){transform:rotate(90deg);}
 .who{margin-left:auto;letter-spacing:.02em;text-transform:none;font-weight:600;color:var(--ui-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
 .profile-fields{display:flex;flex-direction:column;gap:var(--space-2);padding-top:var(--space-2);}
 .actions{display:flex;gap:var(--space-2);flex-wrap:wrap;}
 .card-link{font-size:12px;color:var(--ui-ink-soft);text-decoration:underline;text-underline-offset:3px;width:fit-content;}
 .card-link:hover{color:var(--ui-accent);}
 p{margin:0;font-size:12px;line-height:1.45;}
 .why{margin:0;font-size:11px;line-height:1.4;color:var(--ui-ink-soft);}
 .hint{color:var(--ui-ink-muted);font-size:11px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
</style>
