import type {CatalogItem} from './types';
import {measurementRange} from './labels';

export interface DesignState {measurements:Record<string,number>;params:Record<string,string|number>;overrides:Record<string,number>;}
export interface AttachedFile {id:string;name:string;type:string;size:number;dataUrl:string;uploadedAt:string;}
/**
 * Стадии заказа в ателье: от снятия мерок до готового изделия. Необязательны:
 * проект без стадии считается «построением».
 */
export const STAGES=['measure','draft','toile','cut','sew','done'] as const;
export type Stage=typeof STAGES[number];
/** Проект - одно изделие клиента; у клиента может быть сколько угодно проектов. */
export interface DesignProject extends DesignState {version:1;id:string;name:string;model:string;updated:string;files?:AttachedFile[];clientId?:string;stage?:Stage;}
const key='shityo.design-projects.v1';
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 10;
export function validateProject(raw:unknown,catalog:CatalogItem[]):DesignProject {
 if(!raw || typeof raw!=='object')throw new Error('project.invalid');
 const p=raw as DesignProject;
 const item=catalog.find(i=>i.id===p.model);
 if(p.version!==1 || !item || typeof p.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) || typeof p.name!=='string' || !p.name.trim() || p.name.length>120 || typeof p.updated!=='string' || !Number.isFinite(Date.parse(p.updated)))throw new Error('project.invalid');
 for(const field of ['measurements','params','overrides'] as const)if(!p[field] || typeof p[field]!=='object' || Array.isArray(p[field]))throw new Error('project.invalid');
 for(const k of item.measurements)if(!(k in p.measurements))p.measurements[k]=item.default_measurements[k]; for(const k of item.measurements){const r=measurementRange(k),v=p.measurements[k];if(typeof v!=='number'||!Number.isFinite(v)||v<r.min||v>r.max)throw new Error('project.invalid');}
 if(Object.keys(p.measurements).some(k=>!item.measurements.includes(k)))throw new Error('project.invalid');
 for(const [k,spec] of Object.entries(item.params)){
  // Проект, сохранённый до появления параметра (например, пола), получает
  // значение по умолчанию, а не отклоняется.
  if(!(k in p.params))p.params[k]=k in item.default_measurements?p.measurements[k]:spec.default;
  const v=p.params[k];
  if(spec.type==='number' && (typeof v!=='number'||!Number.isFinite(v)||v<(spec.min??-Infinity)||v>(spec.max??Infinity)))throw new Error('project.invalid');
  if(spec.type==='select' && !spec.options?.some(o=>o.value===v))throw new Error('project.invalid');
 }
 for(const k of item.measurements)if(k in item.params && p.measurements[k]!==p.params[k])throw new Error('project.invalid');
 if(Object.keys(p.params).some(k=>!Object.hasOwn(item.params,k)))throw new Error('project.invalid');
 for(const [k,v] of Object.entries(p.overrides))if(!['shoulder_tip_x','armhole_depth'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<=0||v>100||!['tee','shirt'].includes(p.model))throw new Error('project.invalid');
 if(p.clientId!==undefined && p.clientId!=='' && (typeof p.clientId!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.clientId)))throw new Error('project.invalid');
 if(p.stage!==undefined && !(STAGES as readonly string[]).includes(p.stage))throw new Error('project.invalid');
 if(p.files!==undefined){
  if(!Array.isArray(p.files) || p.files.length>MAX_FILES)throw new Error('project.invalid');
  const seen=new Set<string>();
  for(const f of p.files){
   if(!f || typeof f!=='object' || typeof f.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(f.id) || typeof f.name!=='string' || !f.name.trim() || f.name.length>200 || typeof f.type!=='string' || typeof f.size!=='number' || !Number.isFinite(f.size) || f.size<=0 || f.size>MAX_FILE_BYTES || typeof f.dataUrl!=='string' || !f.dataUrl.startsWith('data:') || typeof f.uploadedAt!=='string' || !Number.isFinite(Date.parse(f.uploadedAt)) || seen.has(f.id))throw new Error('project.invalid');
   seen.add(f.id);
  }
 }
 return structuredClone(p);
}
function readRaw():unknown[]{
 const raw=JSON.parse(localStorage.getItem(key)??'[]');
 if(!Array.isArray(raw))throw new Error('project.storageError');
 return raw;
}
function rawId(p:unknown):string{return p && typeof p==='object' && typeof (p as {id?:unknown}).id==='string'?(p as {id:string}).id:'';}
/**
 * Проекты, которые прошли проверку. Повреждённая запись (например, после
 * смены допустимых пределов мерок) не прячет остальные проекты: она
 * пропускается здесь и остаётся в хранилище как есть.
 */
export function loadProjects(catalog:CatalogItem[]):DesignProject[]{
 const valid:DesignProject[]=[];
 for(const p of readRaw()){try{valid.push(validateProject(p,catalog));}catch{/* повреждённая запись: не показывается, но и не удаляется */}}
 return valid;
}
/** Сколько записей в хранилище не прошли проверку. */
export function damagedProjects(catalog:CatalogItem[]):number{return readRaw().length-loadProjects(catalog).length;}
/** Сохранить проект. Чужие записи пишутся обратно без перепроверки - повреждённая не блокирует сохранение. */
export function saveProject(project:DesignProject,catalog:CatalogItem[]){
 const valid=validateProject(project,catalog);
 localStorage.setItem(key,JSON.stringify([valid,...readRaw().filter(p=>rawId(p)!==valid.id)]));
 return valid;
}
/**
 * Сменить только стадию: остальные поля берутся из хранилища в момент записи,
 * поэтому правки из другой вкладки не затираются старым снимком.
 */
export function updateProjectStage(id:string,stage:Stage,catalog:CatalogItem[]){
 const current=loadProjects(catalog).find(p=>p.id===id);
 if(!current)throw new Error('project.loadError');
 return saveProject({...current,stage,updated:new Date().toISOString()},catalog);
}
export function deleteProject(id:string,_catalog:CatalogItem[]){localStorage.setItem(key,JSON.stringify(readRaw().filter(p=>rawId(p)!==id)));deleteVersions(id);}
export function downloadProject(project:DesignProject){
 const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`shityo-${project.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/**
 * История версий проекта: снимок мерок, параметров и правок точек при каждом
 * сохранении (и автосохранении). Хранится отдельно от проектов, чтобы старые
 * резервные копии JSON оставались совместимыми; файлы в снимки не входят.
 */
export interface ProjectVersion {id:string;at:string;name:string;state:DesignState;}
const versionsKey='shityo.design-versions.v1';
const MAX_VERSIONS=30;
function readVersions():Record<string,ProjectVersion[]>{
 try{const raw=JSON.parse(localStorage.getItem(versionsKey)??'{}');return raw && typeof raw==='object' && !Array.isArray(raw)?raw:{};}catch{return {};}
}
function validVersion(v:unknown):v is ProjectVersion{
 if(!v || typeof v!=='object')return false;
 const x=v as ProjectVersion;
 return typeof x.id==='string' && typeof x.at==='string' && Number.isFinite(Date.parse(x.at)) && typeof x.name==='string' && !!x.state && typeof x.state==='object' && ['measurements','params','overrides'].every(k=>{const f=(x.state as unknown as Record<string,unknown>)[k];return !!f && typeof f==='object' && !Array.isArray(f);});
}
export function listVersions(projectId:string):ProjectVersion[]{
 const list=readVersions()[projectId];
 return Array.isArray(list)?list.filter(validVersion):[];
}
/** Добавить версию; одинаковая с последней не дублируется. */
export function addVersion(projectId:string,name:string,state:DesignState):ProjectVersion[]{
 const all=readVersions();
 const list=listVersions(projectId);
 if(list[0] && JSON.stringify(list[0].state)===JSON.stringify(state) && list[0].name===name)return list;
 const next=[{id:crypto.randomUUID(),at:new Date().toISOString(),name,state:structuredClone(state)},...list].slice(0,MAX_VERSIONS);
 all[projectId]=next;
 localStorage.setItem(versionsKey,JSON.stringify(all));
 return next;
}
export function deleteVersions(projectId:string){const all=readVersions();delete all[projectId];localStorage.setItem(versionsKey,JSON.stringify(all));}

const autosaveKey='shityo.autosave.v1';
export function autosaveEnabled():boolean{try{return localStorage.getItem(autosaveKey)!=='off';}catch{return true;}}
export function setAutosave(on:boolean){try{localStorage.setItem(autosaveKey,on?'on':'off');}catch{/* без хранилища настройка живёт до перезагрузки */}}
