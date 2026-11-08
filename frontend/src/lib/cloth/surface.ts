import type { BodyModel } from './body';
import { bodyField, pushOut } from './field';

interface Point { x:number; y:number; z:number }
interface Ellipse { x:number; a:number; b:number }

/**
 * Вытолкнуть точку наружу из тела на зазор gap: по полю расстояний до
 * манекена (field.ts), той же поверхности, что видна на экране и о которую
 * ударяется ткань в солвере. Поле гладкое, поэтому точка уходит по нормали
 * к ближайшему месту поверхности и не перескакивает через руку или шею;
 * preferredX и keepArmSide для этого больше не нужны и оставлены ради
 * совместимости вызовов.
 */
export function clearBody(model:BodyModel, point:Point, gap=0.004, _preferredX=0, _keepArmSide=false):Point {
 return pushOut(bodyField(model),point,gap) ?? point;
}

/** A refined contact surface keeps triangle interiors outside the body too. */
export function createContactSurface(tris:number[], vertexMap:Int32Array, model:BodyModel, levels=2, preferredX=0, keepArmSide=false) {
 const parents:[number,number][]=[];
 let count=vertexMap.length;
 let triangles=tris.slice();
 for(let level=0;level<levels;level++) {
  const edges=new Map<string,number>();
  const midpoint=(a:number,b:number)=>{
   const key=`${Math.min(a,b)}:${Math.max(a,b)}`;
   const existing=edges.get(key);if(existing!==undefined)return existing;
   const index=count++;parents.push([a,b]);edges.set(key,index);return index;
  };
  const next:number[]=[];
  for(let i=0;i<triangles.length;i+=3) {
   const [a,b,c]=triangles.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
   next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
  }
  triangles=next;
 }
 const neighbours=Array.from({length:count},()=>new Set<number>());
 const edgeCounts=new Map<string,{a:number;b:number;count:number}>();
 for(let i=0;i<triangles.length;i+=3) for(let j=0;j<3;j++) {
  const a=triangles[i+j],b=triangles[i+(j+1)%3];
  neighbours[a].add(b);neighbours[b].add(a);
  const key=`${Math.min(a,b)}:${Math.max(a,b)}`,edge=edgeCounts.get(key);
  if(edge)edge.count++;else edgeCounts.set(key,{a,b,count:1});
 }
 const boundary=new Set([...edgeCounts.values()].filter(e=>e.count===1).flatMap(e=>[e.a,e.b]));
 const adjacency=neighbours.map(n=>[...n]);
 const scratch=new Float32Array(count*3);
 const positions=new Float32Array(count*3);
 const write=(index:number,p:Point)=>{positions[index*3]=p.x;positions[index*3+1]=p.y;positions[index*3+2]=p.z;};
 const read=(index:number):Point=>({x:positions[index*3],y:positions[index*3+1],z:positions[index*3+2]});
 return {
  triangles,positions,parents,
  update(particles:Float32Array) {
   for(let i=0;i<vertexMap.length;i++) {
    const node=vertexMap[i];
    write(i,clearBody(model,{x:particles[node*3],y:particles[node*3+1],z:particles[node*3+2]},0.004,preferredX,keepArmSide));
   }
   for(let i=0;i<parents.length;i++) {
    const a=read(parents[i][0]),b=read(parents[i][1]);
    write(vertexMap.length+i,clearBody(model,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},0.004,preferredX,keepArmSide));
   }
   // Taubin smoothing removes the old triangulation's facets without
   // shrinking hems or moving the shared sewing boundaries.
   for(const factor of [0.42,-0.43]) {
    scratch.set(positions);
    for(let i=0;i<count;i++) {
     if(boundary.has(i) || adjacency[i].length===0) continue;
     let x=0,y=0,z=0;
     for(const neighbour of adjacency[i]){x+=positions[neighbour*3];y+=positions[neighbour*3+1];z+=positions[neighbour*3+2];}
     const n=adjacency[i].length;
     scratch[i*3]+=factor*(x/n-positions[i*3]);
     scratch[i*3+1]+=factor*(y/n-positions[i*3+1]);
     scratch[i*3+2]+=factor*(z/n-positions[i*3+2]);
    }
    positions.set(scratch);
   }
   for(let i=0;i<count;i++) write(i,clearBody(model,read(i),0.004,preferredX,keepArmSide));
  }
 };
}
