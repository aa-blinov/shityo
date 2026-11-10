import type {CatalogItem} from './types';
import {measurementRange} from './labels';
import {call} from './api';

export interface DesignState {measurements:Record<string,number>;params:Record<string,string|number>;overrides:Record<string,number>;}
/**
 * Вложение проекта. Новый файл приходит из браузера как dataUrl; после
 * сохранения он лежит в хранилище ателье, и у него появляется url.
 */
export interface AttachedFile {id:string;name:string;type:string;size:number;uploadedAt:string;dataUrl?:string;url?:string;}
/**
 * Стадии заказа в ателье: от снятия мерок до готового изделия. Необязательны:
 * проект без стадии считается «построением».
 */
export const STAGES=['measure','draft','toile','cut','sew','done'] as const;
export type Stage=typeof STAGES[number];
/** Проект - одно изделие клиента; у клиента может быть сколько угодно проектов. */
export interface DesignProject extends DesignState {version:1;id:string;name:string;model:string;updated:string;files?:AttachedFile[];clientId?:string;stage?:Stage;assigneeId?:string;updatedBy?:string;createdAt?:string;}
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
 for(const [k,v] of Object.entries(p.overrides))if(!['shoulder_tip_x','armhole_depth'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<=0||v>100||!['tee','longsleeve','shirt'].includes(p.model))throw new Error('project.invalid');
 if(p.clientId!==undefined && p.clientId!=='' && (typeof p.clientId!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.clientId)))throw new Error('project.invalid');
 if(p.stage!==undefined && !(STAGES as readonly string[]).includes(p.stage))throw new Error('project.invalid');
 if(p.assigneeId!==undefined && (typeof p.assigneeId!=='string' || p.assigneeId.length>80))throw new Error('project.invalid');
 if(p.files!==undefined){
  if(!Array.isArray(p.files) || p.files.length>MAX_FILES)throw new Error('project.invalid');
  const seen=new Set<string>();
  for(const f of p.files){
   if(!f || typeof f!=='object' || typeof f.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(f.id) || typeof f.name!=='string' || !f.name.trim() || f.name.length>200 || typeof f.type!=='string' || typeof f.size!=='number' || !Number.isFinite(f.size) || f.size<=0 || f.size>MAX_FILE_BYTES || !((typeof f.dataUrl==='string' && f.dataUrl.startsWith('data:')) || (typeof f.url==='string' && f.url.startsWith('/api/files/'))) || typeof f.uploadedAt!=='string' || !Number.isFinite(Date.parse(f.uploadedAt)) || seen.has(f.id))throw new Error('project.invalid');
   seen.add(f.id);
  }
 }
 return structuredClone(p);
}
/**
 * Проекты ателье с сервера. Запись, которая не прошла проверку на клиенте
 * (например, после смены пределов мерок), не прячет остальные: она
 * пропускается здесь и остаётся в базе как есть.
 */
export async function loadProjects(catalog:CatalogItem[]):Promise<DesignProject[]>{
 const raw=await call<unknown[]>('GET','/projects');
 const valid:DesignProject[]=[];
 for(const p of raw){try{valid.push(validateProject(p,catalog));}catch{/* повреждённая запись: не показывается, но и не удаляется */}}
 return valid;
}
export async function getProject(id:string,catalog:CatalogItem[]):Promise<DesignProject>{
 return validateProject(await call<unknown>('GET',`/projects/${encodeURIComponent(id)}`),catalog);
}
/** Сохранить проект. Сервер возвращает его с адресами вложений и своим временем. */
export async function saveProject(project:DesignProject,catalog:CatalogItem[]):Promise<DesignProject>{
 const valid=validateProject(project,catalog);
 return validateProject(await call<unknown>('PUT',`/projects/${encodeURIComponent(valid.id)}`,valid),catalog);
}
/** Стадия, клиент или ответственный мастер: остальное в проекте не трогается. */
export async function updateProject(id:string,patch:{stage?:Stage;clientId?:string;assigneeId?:string},catalog:CatalogItem[]):Promise<DesignProject>{
 return validateProject(await call<unknown>('PATCH',`/projects/${encodeURIComponent(id)}`,patch),catalog);
}
export async function updateProjectStage(id:string,stage:Stage,catalog:CatalogItem[]){return updateProject(id,{stage},catalog);}
export async function deleteProject(id:string):Promise<void>{await call('DELETE',`/projects/${encodeURIComponent(id)}`);}

/** Вложение из хранилища ателье как data URL: резервная копия JSON самодостаточна. */
async function inlineFile(file:AttachedFile):Promise<AttachedFile>{
 if(file.dataUrl || !file.url)return file;
 const blob=await (await fetch(file.url,{credentials:'same-origin'})).blob();
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
 const {url:_url,...rest}=file;
 return {...rest,dataUrl};
}
export async function downloadProject(project:DesignProject){
 const files=await Promise.all((project.files??[]).map(inlineFile));
 const {updatedBy:_by,createdAt:_created,...rest}=project;
 const url=URL.createObjectURL(new Blob([JSON.stringify({...rest,files},null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`shityo-${project.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/**
 * История версий проекта: снимок мерок, параметров и правок точек при каждом
 * сохранении (и автосохранении). Сервер хранит последние 30; одинаковая с
 * последней версия не дублируется. Файлы в снимки не входят.
 */
export interface ProjectVersion {id:string;at:string;name:string;state:DesignState;}
export async function listVersions(projectId:string):Promise<ProjectVersion[]>{
 return call<ProjectVersion[]>('GET',`/projects/${encodeURIComponent(projectId)}/versions`);
}
export async function addVersion(projectId:string,name:string,state:DesignState):Promise<ProjectVersion[]>{
 return call<ProjectVersion[]>('POST',`/projects/${encodeURIComponent(projectId)}/versions`,{name,state:structuredClone(state)});
}

const autosaveKey='shityo.autosave.v1';
export function autosaveEnabled():boolean{try{return localStorage.getItem(autosaveKey)!=='off';}catch{return true;}}
export function setAutosave(on:boolean){try{localStorage.setItem(autosaveKey,on?'on':'off');}catch{/* без хранилища настройка живёт до перезагрузки */}}
