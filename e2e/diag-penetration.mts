import {readFileSync} from 'node:fs';
import {buildGarment} from '../frontend/src/lib/cloth/assembly.ts';
import {buildBodyModel} from '../frontend/src/lib/cloth/body.ts';
import {createSimulation} from '../frontend/src/lib/cloth/physics.ts';
import {clearBody,createContactSurface} from '../frontend/src/lib/cloth/surface.ts';
const item=JSON.parse(readFileSync('../frontend/src/lib/fixtures/catalog.json','utf8')).items[0];
const pieces=JSON.parse(readFileSync('../frontend/src/lib/fixtures/generate-tee.json','utf8')).pieces;
const model=buildBodyModel(item.default_measurements),g=buildGarment(pieces,item.default_measurements);
const sim=await createSimulation(g.parts,g.seams.map(s=>({a:s.a,b:s.b,pair:{a:s.pairs.map(p=>p[0]),b:s.pairs.map(p=>p[1])}})),g.pins,model);
for(let i=0;i<180;i++)sim.step(1/60);
const pos=sim.positions(),maps=sim.partVertexMap(),tris=sim.partTriangles();
for(const part of g.parts){let max=0,count=0,vertexMax=0;let worst:number[]=[];const map=maps.get(part.id)!;const surface=createContactSurface(tris.get(part.id)!,map,model);surface.update(pos);const tri=surface.triangles,rendered=surface.positions;
for(let i=0;i<tri.length;i+=3){const center={x:0,y:0,z:0};for(const j of tri.slice(i,i+3)){center.x+=rendered[j*3]/3;center.y+=rendered[j*3+1]/3;center.z+=rendered[j*3+2]/3;}const out=clearBody(model,center,0);if(out){const d=Math.hypot(center.x-out.x,center.y-out.y,center.z-out.z);if(d>max){max=d;worst=tri.slice(i,i+3).flatMap(j=>[...rendered.slice(j*3,j*3+3)]);}if(d>.001)count++;}}
for(const i of map){const p={x:pos[i*3],y:pos[i*3+1],z:pos[i*3+2]},out=clearBody(model,p,0);if(out)vertexMax=Math.max(vertexMax,Math.hypot(p.x-out.x,p.y-out.y,p.z-out.z));}
console.log(part.id,'penetrating faces',count,'max mm',max*1000,'vertex max mm',vertexMax*1000,'worst',max>0.001?worst:[]);}
