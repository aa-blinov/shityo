<script lang="ts">
 import { onMount } from 'svelte';
 import { Button, TextField, SelectField } from '@monos/ui';
 import { t } from '$lib/i18n';
 import { measurementRange } from '$lib/labels';
 let {values,keys,onApply}:{values:Record<string,number>;keys:string[];onApply:(values:Record<string,number>)=>void}=$props();
 type Profile={name:string;values:Record<string,number>};
 let profiles=$state<Profile[]>([]),name=$state(''),selected=$state(''),message=$state('');
 const storage='shityo.client-measurements.v1';
 const options=$derived([{value:'',label:$t('clients.choose')},...profiles.map(p=>({value:p.name,label:p.name}))]);
 function validValues(value:unknown):value is Record<string,number>{return !!value && typeof value==='object' && !Array.isArray(value) && Object.values(value).every(v=>typeof v==='number' && Number.isFinite(v));}
 onMount(()=>{try{const saved=JSON.parse(localStorage.getItem(storage)??'[]');if(Array.isArray(saved))profiles=saved.filter(p=>typeof p?.name==='string' && validValues(p.values));}catch{message='clients.storageError';}});
 function persist(next:Profile[]){try{localStorage.setItem(storage,JSON.stringify(next));profiles=next;return true;}catch{message='clients.storageError';return false;}}
 function save(){const label=name.trim();if(!label)return;
  if(keys.some(k=>{const r=measurementRange(k);return !Number.isFinite(values[k]) || values[k]<r.min || values[k]>r.max;})){message='clients.invalid';return;}
  const previous=profiles.find(p=>p.name===label);
  const next=[...profiles.filter(p=>p.name!==label),{name:label,values:{...previous?.values,...values}}];
  if(persist(next)){selected=label;message='clients.saved';}
 }
 function apply(){const profile=profiles.find(p=>p.name===selected);if(!profile)return;
  const available=Object.fromEntries(keys.filter(k=>{const r=measurementRange(k);return Number.isFinite(profile.values[k]) && profile.values[k]>=r.min && profile.values[k]<=r.max;}).map(k=>[k,profile.values[k]]));
  onApply(available);message=Object.keys(available).length===keys.length?'clients.applied':'clients.partial';
 }
 function remove(){if(persist(profiles.filter(p=>p.name!==selected))){selected='';message='clients.deleted';}}
</script>
<div class="profiles-wrap">
 <details class="profiles" data-testid="client-profiles" open><summary>{$t('clients.title')}</summary><div class="profile-fields">
  <SelectField id="client-profile" label={$t('clients.profile')} {options} value={selected} onchange={e=>{selected=e.currentTarget.value;name=selected;message='';}}/>
  <div class="actions"><Button size="sm" disabled={!selected} onclick={apply}>{$t('clients.apply')}</Button><Button size="sm" variant="quiet" disabled={!selected} onclick={remove}>{$t('clients.delete')}</Button></div>
  <TextField id="client-name" label={$t('clients.name')} value={name} oninput={(event:Event)=>name=(event.currentTarget as HTMLInputElement).value}/>
  <Button size="sm" disabled={!name.trim()} onclick={save}>{$t('clients.save')}</Button>
  <p class="hint">{$t('clients.local')}</p>
  <p role="status">{message?$t(message):''}</p>
 </div></details>
</div>
<style>
 .profiles{min-width:0;}summary{cursor:pointer;font-size:14px;font-weight:600;} .profile-fields{display:flex;flex-direction:column;gap:12px;padding-top:12px;}.actions{display:flex;gap:8px;flex-wrap:wrap;}
 p{margin:0;font-size:12px;line-height:1.5;}.hint{color:var(--ui-ink-soft);}
</style>
