import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGarment } from '../frontend/src/lib/cloth/assembly.ts';
import { buildBodyModel, armPoint, armSemiAxis } from '../frontend/src/lib/cloth/body.ts';
import { createSimulation } from '../frontend/src/lib/cloth/physics.ts';
import { projectOutsideBody, stepCloth, DEFAULT_OPTIONS } from '../frontend/src/lib/cloth/xpbd.ts';
import { clearBody,createContactSurface } from '../frontend/src/lib/cloth/surface.ts';
import { earClip, signedArea } from '../frontend/src/lib/cloth/geometry.ts';
const catalog = JSON.parse(readFileSync('../frontend/src/lib/fixtures/catalog.json','utf8')).items;
// Concave closed contours must keep their area, without a triangle fan across a cutout.
const outline = [{x:0,y:0},{x:3,y:0},{x:3,y:1},{x:1,y:1},{x:1,y:3},{x:0,y:3},{x:0,y:0}];
for (const points of [outline,outline.toReversed()]) {
 const mesh = earClip(points);
 let area=0;
 for(let i=0;i<mesh.tris.length;i+=3) area+=Math.abs(signedArea(mesh.tris.slice(i,i+3).map(j=>mesh.verts[j])));
 assert.ok(Math.abs(area-5)<1e-8);
}
const body = buildBodyModel(catalog[0].default_measurements);
for(const side of [-1,1] as const) {
 const s=body.armLength*0.55;
 const axes=armSemiAxis(body.armProfile,body.armR,s);
 const centre=armPoint(body,side,s);
 const p={x:centre.x+side*axes.a*0.5,y:body.armOrigin.y-s,z:0};
 const out=projectOutsideBody(body,p)!;
 assert.ok(out,'arm collision must project');
 assert.ok(Math.abs(Math.hypot((out.x-centre.x)/axes.a,out.z/axes.b)-1)<1e-6);
}
assert.equal(projectOutsideBody(body,{x:0,y:0.01,z:0}),null,'torso must not extend to infinity below hips');
for(const item of catalog) {
 const response=JSON.parse(readFileSync(`../frontend/src/lib/fixtures/generate-${item.id}.json`,'utf8'));
 const model=buildBodyModel(item.default_measurements);
 const garment=buildGarment(response.pieces,item.default_measurements);
 assert.ok(garment.parts.length>=2,item.id);
 assert.ok(garment.pins.length>0,`${item.id}: anchors`);
 for(const p of garment.parts) {
  assert.ok(p.tris.length>0 && p.world.every(Number.isFinite),`${item.id}/${p.id}: finite mesh`);
  for(const i of p.tris) assert.ok(i>=0 && i<p.verts.length);
 }
 if (item.id==='tee' || item.id==='shirt') for(const seam of garment.seams) {
  const a=garment.parts.find(p=>p.id===seam.a)!,b=garment.parts.find(p=>p.id===seam.b)!;
  for(const [ia,ib] of seam.pairs) assert.ok(Math.hypot(...[0,1,2].map(k=>a.world[ia*3+k]-b.world[ib*3+k]))<0.006,`${item.id}: initial seam gap`);
 }
 const seams=garment.seams.map(s=>({a:s.a,b:s.b,pair:{a:s.pairs.map(p=>p[0]),b:s.pairs.map(p=>p[1])}}));
 const sim=await createSimulation(garment.parts,seams,garment.pins,model);
 for(let i=0;i<180;i++) sim.step(1/60);
 assert.ok([...sim.positions()].every(Number.isFinite),`${item.id}: simulation exploded`);
 assert.ok([...sim.positions()].every(v=>Math.abs(v)<5),`${item.id}: simulation escaped`);
 const maps=sim.partVertexMap(),positions=sim.positions();
 const edgeCounts=new Map<string,number>();
 const surfaceTris=sim.partTriangles();
 for(const part of garment.parts.filter(p=>!p.id.startsWith('collar'))) {
  const map=maps.get(part.id)!,tris=surfaceTris.get(part.id)!;
  for(let i=0;i<tris.length;i+=3) for(let j=0;j<3;j++) {
   const a=map[tris[i+j]],b=map[tris[i+(j+1)%3]],key=`${Math.min(a,b)}:${Math.max(a,b)}`;
   edgeCounts.set(key,(edgeCounts.get(key)??0)+1);
  }
 }
 assert.ok([...edgeCounts.values()].every(count=>count<=2),`${item.id}: internal duplicate faces remain`);
 const boundary=new Map<number,number[]>();
 for(const [key,count]of edgeCounts) if(count===1){const [a,b]=key.split(':').map(Number);boundary.set(a,[...(boundary.get(a)??[]),b]);boundary.set(b,[...(boundary.get(b)??[]),a]);}
 assert.ok([...boundary.values()].every(neighbours=>neighbours.length===2),`${item.id}: boundary is torn`);
 const visited=new Set<number>();let loops=0;
 for(const node of boundary.keys()) {if(visited.has(node))continue;loops++;const stack=[node];while(stack.length){const n=stack.pop()!;if(visited.has(n))continue;visited.add(n);stack.push(...boundary.get(n)!);}}
 for(const part of garment.parts) {
  const surface=createContactSurface(surfaceTris.get(part.id)!,maps.get(part.id)!,model,part.id.startsWith('collar')?3:(/^(front|back)-/.test(part.id)?1:(part.id==='front'||part.id==='back'?2:1)),part.id==='collar-1'?1:(part.id==='collar--1'?-1:0));
  surface.update(positions);
  const rendered=surface.positions;
  for(let i=0;i<rendered.length;i+=3) {
   const p={x:rendered[i],y:rendered[i+1],z:rendered[i+2]},out=clearBody(model,p,0);
   assert.ok(Math.hypot(p.x-out.x,p.z-out.z)<1e-6,`${item.id}/${part.id}: render vertex inside mannequin`);
  }
  if(item.id==='tee' || item.id==='shirt' || item.id==='trousers') for(let i=0;i<surface.triangles.length;i+=3) {
   const indices=surface.triangles.slice(i,i+3);
   const p={x:0,y:0,z:0};
   for(const index of indices){p.x+=rendered[index*3]/3;p.y+=rendered[index*3+1]/3;p.z+=rendered[index*3+2]/3;}
   const out=clearBody(model,p,0);
   assert.ok(Math.hypot(p.x-out.x,p.z-out.z)<0.0015,`${item.id}/${part.id}: triangle cuts through mannequin by ${Math.hypot(p.x-out.x,p.z-out.z)*1000} mm at ${JSON.stringify(p)}`);
  }
 }
 const expectedLoops:Record<string,number>={tee:4,shirt:4,trousers:3,skirt:2};
 assert.equal(loops,expectedLoops[item.id],`${item.id}: unexpected hole in stitched surface`);

 for(const seam of garment.seams) for(const [a,b] of seam.pairs) assert.equal(maps.get(seam.a)![a],maps.get(seam.b)![b]);
 for(const pin of garment.pins) {
  const node=maps.get(pin.piece)![pin.vertex];
  assert.ok(pin.position.every((v,k)=>Math.abs(v-positions[node*3+k])<1e-6),`${item.id}: anchor moved`);
 }
 console.log(`${item.id}: ${garment.parts.length} parts, ${garment.seams.length} seams, 180 stable steps`);
 sim.dispose();
}
console.log('3D regression checks passed');
