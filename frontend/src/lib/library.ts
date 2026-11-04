import data from './fixtures/library.json';
import { russianPatternLabels } from './library-labels';
export interface LibraryExample {title:string;url:string;image:string;}
export interface LibraryPattern {
 id:string;name:string;description:string;section:string;tags:string[];author:string;
 difficulty:number|null;provider?:string;image_srcset?:string;access?:string;download_url?:string;image:string;url:string;editor_url:string|null;examples:LibraryExample[];
 source:string;code_license:string|null;source_version:string|null;code_url:string|null;verified_on:string;integration:'external';
}
export const library=data.items as unknown as LibraryPattern[];
export const librarySources=data.sources;
export const librarySections=['tops','bottoms','skirts','dresses','outerwear','underwear','accessories','blocks','kids','costumes'] as const;
export function patternName(pattern:LibraryPattern,locale:string){
 if(locale!=='ru')return pattern.name;
 const label=russianPatternLabels[pattern.id];
 const name=pattern.provider && pattern.provider!=='freesewing'?pattern.name.replace(/^Free sewing pattern[:\s–-]*|^The /ig,'').split(' ')[0]:pattern.id[0].toUpperCase()+pattern.id.slice(1);
 return label?`${name} — ${label}`:pattern.name;
}
