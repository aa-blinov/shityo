import { armPoint, armSemiAxis, bodyRadius, legProfile, neckProfile, pelvisRadius, type BodyModel } from './body';

interface Point { x:number; y:number; z:number }
interface Ellipse { x:number; a:number; b:number }

/** Project onto the outside of the union, including overlapping shoulder/arm sections. */
export function clearBody(model:BodyModel, point:Point, gap=0.004, preferredX=0):Point {
 const ellipses:Ellipse[]=[];
 if(point.y>=model.rings[0].y && point.y<=model.neckY) {
  const {a,b}=bodyRadius(model,point.y,0);
  ellipses.push({x:0,a:a+gap,b:b+gap});
 }
 const pelvis=pelvisRadius(model,point.y);
 if(pelvis) ellipses.push({x:0,a:pelvis.a+gap,b:pelvis.b+gap});
 const neckRings=neckProfile(model);
 for(let i=1;i<neckRings.length;i++) {
  const a=neckRings[i-1],b=neckRings[i];
  if(point.y>=a.y && point.y<=b.y) {
   const t=(point.y-a.y)/(b.y-a.y);
   ellipses.push({x:0,a:a.a+(b.a-a.a)*t+gap,b:a.b+(b.b-a.b)*t+gap});
   break;
  }
 }
 const station=model.armOrigin.y-point.y;
 if(station>=0 && station<=model.armLength) {
  const {a,b}=armSemiAxis(model.armProfile,model.armR,Math.max(0,station));
  for(const side of [-1,1]) ellipses.push({x:armPoint(model,side as 1|-1,station).x,a:a+gap,b:b+gap});
 }
 const legs=legProfile(model);
 if(point.y<=legs.rings[0].y && point.y>=legs.rings[legs.rings.length-1].y) {
  for(let i=1;i<legs.rings.length;i++) {
   const a=legs.rings[i-1],b=legs.rings[i];
   if(point.y<=a.y && point.y>=b.y) {
    const t=(point.y-a.y)/(b.y-a.y);
    for(const side of [-1,1])ellipses.push({x:side*legs.x,a:a.a+(b.a-a.a)*t+gap,b:a.b+(b.b-a.b)*t+gap});
    break;
   }
  }
 }
 const inside=(p:Point,e:Ellipse)=>((p.x-e.x)/e.a)**2+(p.z/e.b)**2<1-1e-10;
 if(!ellipses.some(e=>inside(point,e))) return point;
 const candidates:Point[]=[];
 let zExit=0;
 const intervals:[number,number][]=[];
 for(const e of ellipses) {
  const nx=(point.x-e.x)/e.a;
  if(Math.abs(nx)<1) zExit=Math.max(zExit,e.b*Math.sqrt(1-nx*nx));
  const nz=point.z/e.b;
  if(Math.abs(nz)<1) {
   const half=e.a*Math.sqrt(1-nz*nz);
   intervals.push([e.x-half,e.x+half]);
  }
 }
 candidates.push({...point,z:zExit},{...point,z:-zExit});
 intervals.sort((a,b)=>a[0]-b[0]);
 const merged:[number,number][]=[];
 for(const interval of intervals) {
  const last=merged[merged.length-1];
  if(last && interval[0]<=last[1]) last[1]=Math.max(last[1],interval[1]);
  else merged.push([...interval]);
 }
 for(const [lo,hi]of merged) if(point.x>=lo && point.x<=hi) candidates.push({...point,x:lo},{...point,x:hi});
 const valid=candidates.filter(p=>!ellipses.some(e=>inside(p,e)) && (!preferredX || p.x*preferredX>=-1e-8));
 valid.sort((a,b)=>Math.hypot(a.x-point.x,a.z-point.z)-Math.hypot(b.x-point.x,b.z-point.z));
 return valid[0]??point;
}

/** A refined contact surface keeps triangle interiors outside the body too. */
export function createContactSurface(tris:number[], vertexMap:Int32Array, model:BodyModel, levels=2, preferredX=0) {
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
  triangles,positions,
  update(particles:Float32Array) {
   for(let i=0;i<vertexMap.length;i++) {
    const node=vertexMap[i];
    write(i,clearBody(model,{x:particles[node*3],y:particles[node*3+1],z:particles[node*3+2]},0.004,preferredX));
   }
   for(let i=0;i<parents.length;i++) {
    const a=read(parents[i][0]),b=read(parents[i][1]);
    write(vertexMap.length+i,clearBody(model,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},0.004,preferredX));
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
   for(let i=0;i<count;i++) write(i,clearBody(model,read(i),0.004,preferredX));
  }
 };
}
