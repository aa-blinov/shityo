import type {CatalogItem} from './types';
import {measurementRange} from './labels';

export interface DesignState {measurements:Record<string,number>;params:Record<string,string|number>;overrides:Record<string,number>;}
export interface DesignProject extends DesignState {version:1;id:string;name:string;model:string;updated:string;}
const key='shityo.design-projects.v1';
export function validateProject(raw:unknown,catalog:CatalogItem[]):DesignProject {
 if(!raw || typeof raw!=='object')throw new Error('project.invalid');
 const p=raw as DesignProject;
 const item=catalog.find(i=>i.id===p.model);
 if(p.version!==1 || !item || typeof p.id!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(p.id) || typeof p.name!=='string' || !p.name.trim() || p.name.length>120 || typeof p.updated!=='string' || !Number.isFinite(Date.parse(p.updated)))throw new Error('project.invalid');
 for(const field of ['measurements','params','overrides'] as const)if(!p[field] || typeof p[field]!=='object' || Array.isArray(p[field]))throw new Error('project.invalid');
 for(const k of item.measurements)if(!(k in p.measurements))p.measurements[k]=item.default_measurements[k]; for(const k of item.measurements){const r=measurementRange(k),v=p.measurements[k];if(typeof v!=='number'||!Number.isFinite(v)||v<r.min||v>r.max)throw new Error('project.invalid');}
 if(Object.keys(p.measurements).some(k=>!item.measurements.includes(k)))throw new Error('project.invalid');
 for(const [k,spec] of Object.entries(item.params)){
  const v=p.params[k];
  if(spec.type==='number' && (typeof v!=='number'||!Number.isFinite(v)||v<(spec.min??-Infinity)||v>(spec.max??Infinity)))throw new Error('project.invalid');
  if(spec.type==='select' && !spec.options?.some(o=>o.value===v))throw new Error('project.invalid');
 }
 for(const k of item.measurements)if(k in item.params && p.measurements[k]!==p.params[k])throw new Error('project.invalid');
 if(Object.keys(p.params).some(k=>!Object.hasOwn(item.params,k)))throw new Error('project.invalid');
 for(const [k,v] of Object.entries(p.overrides))if(!['shoulder_tip_x','armhole_depth'].includes(k)||typeof v!=='number'||!Number.isFinite(v)||v<=0||v>100||!['tee','shirt'].includes(p.model))throw new Error('project.invalid');
 return structuredClone(p);
}
export function loadProjects(catalog:CatalogItem[]):DesignProject[]{
 const raw=JSON.parse(localStorage.getItem(key)??'[]');
 if(!Array.isArray(raw))throw new Error('project.storageError');
 return raw.map(p=>validateProject(p,catalog));
}
export function saveProject(project:DesignProject,catalog:CatalogItem[]){
 const valid=validateProject(project,catalog);
 const all=loadProjects(catalog);
 localStorage.setItem(key,JSON.stringify([valid,...all.filter(p=>p.id!==valid.id)]));
 return valid;
}
export function deleteProject(id:string,catalog:CatalogItem[]){localStorage.setItem(key,JSON.stringify(loadProjects(catalog).filter(p=>p.id!==id)));}
export function downloadProject(project:DesignProject){
 const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`shityo-${project.id}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
