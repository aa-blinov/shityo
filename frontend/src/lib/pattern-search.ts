import type {LibraryPattern} from './library';
import {patternName} from './library';

export function normalizeSearch(text:string){return text.toLowerCase().normalize('NFKD').replace(/и\u0306/gu,'й').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
const aliases:Record<string,string>={саймон:'simon',симон:'simon',худи:'hoodie',футболка:'tee',футболки:'tee',пальто:'coat',джинсы:'jeans'};
function stem(token:string){return token.length>4?token.replace(/(ами|ями|ого|его|ая|яя|ые|ие|ый|ий|ой|ка|ки|ы|и|а|я|у|ю|е)$/,''):token;}
function oneEdit(a:string,b:string):boolean {
 if(a.length===b.length){const mismatches=[...a].map((c,i)=>c!==b[i]?i:-1).filter(i=>i>=0);if(mismatches.length===2 && mismatches[1]===mismatches[0]+1 && a[mismatches[0]]===b[mismatches[1]] && a[mismatches[1]]===b[mismatches[0]])return true;}
 if(Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;
 while(i<a.length && j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
 return edits+(i<a.length||j<b.length?1:0)<=1;
}
export function searchPatterns(items:LibraryPattern[],query:string,section='all',provider='all'){
 const tokens=normalizeSearch(query).split(' ').filter(Boolean);
 return items.filter(p=>{
  if(section!=='all' && p.section!==section || provider!=='all' && (p.provider??'freesewing')!==provider)return false;
  const text=normalizeSearch(`${patternName(p,'ru')} ${p.name} ${p.description} ${p.author} ${p.tags.join(' ')} ${p.source}`);
  const words=text.split(' ').map(stem);
  return tokens.every(t=>{
   const variants=[t,aliases[t]].filter(Boolean);
   return variants.some(v=>text.includes(v) || words.some(w=>w===stem(v) || v.length>=5 && oneEdit(stem(v),w)));
  });
 });
}
