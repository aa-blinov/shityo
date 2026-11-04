import {readFileSync} from 'node:fs';
import {buildGarment} from '../frontend/src/lib/cloth/assembly.ts';
import {buildBodyModel} from '../frontend/src/lib/cloth/body.ts';
import {createSimulation} from '../frontend/src/lib/cloth/physics.ts';
const cat=JSON.parse(readFileSync('../frontend/src/lib/fixtures/catalog.json','utf8')).items;
for(const item of cat){
 const pieces=JSON.parse(readFileSync(`../frontend/src/lib/fixtures/generate-${item.id}.json`,'utf8')).pieces;
 const g=buildGarment(pieces,item.default_measurements);
 const sim=await createSimulation(g.parts,g.seams.map(s=>({a:s.a,b:s.b,pair:{a:s.pairs.map(p=>p[0]),b:s.pairs.map(p=>p[1])}})),g.pins,buildBodyModel(item.default_measurements));
 for(const part of g.parts.filter(p=>p.id==='front'||p.id==='back')) {const seen=new Map<string,number>();for(let i=0;i<part.tris.length;i+=3)for(let j=0;j<3;j++){const a=part.tris[i+j],b=part.tris[i+(j+1)%3],key=`${Math.min(a,b)},${Math.max(a,b)}`;seen.set(key,(seen.get(key)??0)+1);} console.log('local',part.id,'nonmanifold',[...seen.values()].filter(n=>n>2).length);}
 const maps=sim.partVertexMap();
 const faces=new Map<string,number>();for(const part of g.parts){const map=maps.get(part.id)!;for(let i=0;i<part.tris.length;i+=3){const key=part.tris.slice(i,i+3).map(v=>map[v]).sort((a,b)=>a-b).join(',');faces.set(key,(faces.get(key)??0)+1);}}
 console.log('duplicate faces',[...faces.values()].filter(v=>v>1).length);
 const edges=new Map<string,number>();
 for(const part of g.parts.filter(p=>!p.id.startsWith('collar'))){ const map=maps.get(part.id)!;
 for(let i=0;i<part.tris.length;i+=3){const tri=part.tris.slice(i,i+3).map(v=>map[v]);if(new Set(tri).size<3 || faces.get(tri.slice().sort((a,b)=>a-b).join(","))!==1)continue;
 for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=`${Math.min(a,b)},${Math.max(a,b)}`;edges.set(key,(edges.get(key)??0)+1);}}
 }
 const adj=new Map<number,number[]>();for(const [key,count]of edges){if(count!==1)continue;const [a,b]=key.split(',').map(Number);adj.set(a,[...(adj.get(a)??[]),b]);adj.set(b,[...(adj.get(b)??[]),a]);}
 const visited=new Set<number>();let loops=0;const sizes:number[]=[];
 for(const node of adj.keys()){if(visited.has(node))continue;loops++;const stack=[node];let size=0;while(stack.length){const n=stack.pop()!;if(visited.has(n))continue;visited.add(n);size++;stack.push(...adj.get(n)!);}sizes.push(size);}
 if(item.id==='tee') {const pos=sim.positions();for(const [key,count] of edges)if(count>2){const [a,b]=key.split(',').map(Number);console.log('edge',count,[...pos.slice(a*3,a*3+3)],[...pos.slice(b*3,b*3+3)]);}}
 console.log(item.id,'boundary loops',loops,sizes,'non-manifold edges',[...edges.values()].filter(n=>n>2).length,'non-cycle vertices',[...adj.values()].filter(v=>v.length!==2).length);
}
