import {
 ACESFilmicToneMapping, BufferGeometry, Color, DataTexture, DirectionalLight,
 Float32BufferAttribute, Fog, Group, HemisphereLight, Mesh, MeshPhysicalMaterial,
 MeshStandardMaterial, PCFShadowMap, PlaneGeometry, PMREMGenerator,
 RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SphereGeometry, SRGBColorSpace,
 type Scene, type WebGLRenderer, DoubleSide
} from 'three';
import { armPoint, armSemiAxis, legProfile, neckProfile, pelvisRadius, torsoPoint, type BodyModel } from './body';

/** A neutral photographic studio, independent of the editor's UI theme. */
export function lightStudio(renderer:WebGLRenderer,scene:Scene,model:BodyModel) {
 renderer.outputColorSpace=SRGBColorSpace;
 renderer.toneMapping=ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=PCFShadowMap;
 renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 scene.background=new Color('#e7e5df');
 scene.fog=new Fog('#e7e5df',5,12);
 // A small studio reflection map avoids rendering and filtering an entire
 // extra room scene every time the measurements change.
 const width=256,height=128,pixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const u=x/width,v=y/height;
  const box=(cx:number,cy:number,sx:number,sy:number)=>Math.exp(-Math.pow((u-cx)/sx,8)-Math.pow((v-cy)/sy,8));
  const light=Math.min(1,0.28+0.65*box(0.23,0.38,0.13,0.25)+0.5*box(0.73,0.4,0.1,0.2));
  const i=(y*width+x)*4;pixels[i]=light*255;pixels[i+1]=light*251;pixels[i+2]=light*242;pixels[i+3]=255;
 }
 const studioMap=new DataTexture(pixels,width,height,RGBAFormat);
 studioMap.colorSpace=SRGBColorSpace;studioMap.needsUpdate=true;
 const generator=new PMREMGenerator(renderer);
 const environment=generator.fromEquirectangular(studioMap);
 scene.environment=environment.texture;
 scene.environmentIntensity=0.5;
 studioMap.dispose();generator.dispose();
 scene.add(new HemisphereLight('#fffaf0','#8c8f86',0.7));
 const key=new DirectionalLight('#fff4e3',2.5);
 key.position.set(-2.2,3.4,3.0);key.target.position.set(0,model.height*0.55,0);
 key.castShadow=true;key.shadow.mapSize.set(1024,1024);
 key.shadow.camera.left=-1.5;key.shadow.camera.right=1.5;
 key.shadow.camera.top=2.0;key.shadow.camera.bottom=-1.0;
 key.shadow.camera.near=0.1;key.shadow.camera.far=10;
 key.shadow.bias=-0.00015;key.shadow.normalBias=0.002;
 key.shadow.radius=4;
 scene.add(key,key.target);
 const fill=new DirectionalLight('#e6eef7',0.8);fill.position.set(2.5,1.7,1.0);scene.add(fill);
 const edge=new DirectionalLight('#fffdf4',1.5);edge.position.set(0.7,2.7,-2.0);scene.add(edge);
 const ground=new Mesh(new PlaneGeometry(200,200),new MeshStandardMaterial({color:'#dedcd5',roughness:1}));
 ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 return ()=>{environment.dispose();key.shadow.map?.dispose();scene.environment=null;};
}

/** A small deterministic yarn height field: no downloaded assets or network requests. */
export function cottonTexture(renderer:WebGLRenderer):DataTexture {
 const size=128,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
  const across=Math.sin(x*Math.PI/4),down=Math.sin(y*Math.PI/4);
  const over=(Math.floor(x/8)+Math.floor(y/8))%2===0;
  const thread=(over?across:down)*0.55+(over?down:across)*0.15;
  const noise=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
  const value=Math.max(0,Math.min(255,208+thread*26+noise*5));
  const i=(y*size+x)*4;data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;
 }
 const texture=new DataTexture(data,size,size,RGBAFormat);
 texture.wrapS=texture.wrapT=RepeatWrapping;
 texture.repeat.set(16,16);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;
 texture.generateMipmaps=true;texture.needsUpdate=true;
 return texture;
}

export function clothMaterial(color:string,texture:DataTexture) {
 return new MeshPhysicalMaterial({
  color,metalness:0,roughness:0.9,sheen:0.9,sheenColor:new Color(color).lerp(new Color('#f4eee4'),0.45),
  sheenRoughness:0.8,bumpMap:texture,bumpScale:0.00008,roughnessMap:texture,
  side:DoubleSide,clearcoat:0,reflectivity:0.15
 });
}

interface Ring { y:number;a:number;b:number;x?:number;z?:number }
function cubic(a:number,b:number,c:number,d:number,t:number) {
 return 0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
}
function tube(source:Ring[],segments=40,smooth=true):BufferGeometry {
 const rings:Ring[]=[];
 const steps=smooth?6:1;
 for(let i=0;i<source.length-1;i++) for(let j=0;j<steps;j++) {
  const t=j/steps,p=source[Math.max(0,i-1)],a=source[i],b=source[i+1],n=source[Math.min(source.length-1,i+2)];
  rings.push({y:a.y+(b.y-a.y)*t,a:Math.max(0.001,cubic(p.a,a.a,b.a,n.a,t)),b:Math.max(0.001,cubic(p.b,a.b,b.b,n.b,t)),x:(a.x??0)+((b.x??0)-(a.x??0))*t,z:(a.z??0)+((b.z??0)-(a.z??0))*t});
 }
 rings.push(source[source.length-1]);
 const positions:number[]=[],indices:number[]=[];
 for(const ring of rings) for(let j=0;j<segments;j++) {
  const theta=j/segments*Math.PI*2;
  positions.push((ring.x??0)+ring.a*Math.sin(theta),ring.y,(ring.z??0)+ring.b*Math.cos(theta));
 }
 for(let r=0;r<rings.length-1;r++)for(let j=0;j<segments;j++) {
  const a=r*segments+j,b=r*segments+(j+1)%segments,c=a+segments,d=b+segments;
  if(source[source.length-1].y>source[0].y) indices.push(a,b,c,b,d,c);
  else indices.push(a,c,b,b,c,d);
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
 geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Sculpted display mannequin; body measurements and collision dimensions remain authoritative. */
export function buildMannequin(model:BodyModel):Group {
 const group=new Group();
 const material=new MeshPhysicalMaterial({color:'#bcb6a9',roughness:0.56,metalness:0,sheen:0.14,sheenRoughness:0.8,clearcoat:0.025});
 const add=(geometry:BufferGeometry,mat=material)=>{const mesh=new Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
 const rings=model.rings;
 const pelvisStations=model.crotchY<rings[0].y ? Array.from({length:12},(_,i)=>model.crotchY+(rings[0].y-model.crotchY)*i/12):[];
 const stations=[...pelvisStations,...rings.flatMap((r,i)=>i===rings.length-1?[r.y]:Array.from({length:10},(_,j)=>r.y+(rings[i+1].y-r.y)*j/10))];
 const positions:number[]=[],indices:number[]=[],segments=64;
 for(const y of stations)for(let j=0;j<segments;j++){
  const theta=j/segments*Math.PI*2,pelvis=pelvisRadius(model,y);
  const p=pelvis?{x:pelvis.a*Math.sin(theta),y,z:pelvis.b*Math.cos(theta)}:torsoPoint(model,theta,y);
  positions.push(p.x,p.y,p.z);
 }
 for(let r=0;r<stations.length-1;r++)for(let j=0;j<segments;j++){const a=r*segments+j,b=r*segments+(j+1)%segments,c=a+segments,d=b+segments;indices.push(a,b,c,b,d,c);}
 const torso=new BufferGeometry();torso.setAttribute('position',new Float32BufferAttribute(positions,3));torso.setIndex(indices);torso.computeVertexNormals();add(torso);
 add(tube(neckProfile(model)));
 for(const side of [-1,1] as const) {
  const armRings:Ring[]=[];
  for(let i=0;i<=24;i++){const s=i/24*model.armLength,p=armPoint(model,side,s),axes=armSemiAxis(model.armProfile,model.armR,s);armRings.push({x:p.x-side*model.armOrigin.x,y:p.y,a:axes.a,b:axes.b});}
  const arm=add(tube(armRings));arm.position.x=side*model.armOrigin.x;
  const wrist=armPoint(model,side,model.armLength);
  const hand=add(new SphereGeometry(1,32,24));hand.scale.set(model.height*0.020,model.height*0.046,model.height*0.012);
  hand.position.set(wrist.x,wrist.y-model.height*0.037,0.005);
  const thumb=add(new SphereGeometry(1,24,16));thumb.scale.set(model.height*0.009,model.height*0.023,model.height*0.009);
  thumb.rotation.z=side*-0.32;thumb.position.set(wrist.x-side*model.height*0.021,wrist.y-model.height*0.022,model.height*0.008);
 }
 const headHeight=model.height/7.5;
 const headGeometry=new SphereGeometry(1,64,48);
 const attr=headGeometry.getAttribute('position');
 const gaussian=(x:number,y:number,cx:number,cy:number,sx:number,sy:number)=>Math.exp(-(((x-cx)/sx)**2)-((y-cy)/sy)**2);
 for(let i=0;i<attr.count;i++){
  const x=attr.getX(i),y=attr.getY(i),z=attr.getZ(i);
  const jaw=y<0?1+y*0.24:1;
  let front=z;
  if(z>0){
   front+=0.18*gaussian(x,y,0,-0.05,0.13,0.24);
   front-=0.055*(gaussian(x,y,-0.30,0.12,0.16,0.12)+gaussian(x,y,0.30,0.12,0.16,0.12));
   front+=0.035*gaussian(x,y,0,-0.35,0.24,0.07);
  }
  const chin=Math.max(0,Math.min(1,(-y-0.35)/0.65));
  attr.setXYZ(i,x*jaw,y,front*(1-0.1*chin*chin*(3-2*chin)));
 }
 headGeometry.computeVertexNormals();
 const head=add(headGeometry);head.scale.set(headHeight*0.36,headHeight/2,headHeight*0.43);head.position.set(0,model.height-headHeight/2,0.009);
 for(const side of [-1,1]){const ear=add(new SphereGeometry(1,24,16));ear.scale.set(headHeight*0.055,headHeight*0.11,headHeight*0.07);ear.position.set(side*headHeight*0.35,model.height-headHeight*0.51,0.002);}
 const legs=legProfile(model);
 for(const side of [-1,1]){
  const x=side*legs.x;
  const leg=add(tube(legs.rings,40,false));leg.position.x=x;
  const foot=add(new SphereGeometry(1,40,24));foot.scale.set(model.height*0.023,model.height*0.022,model.height*0.063);
  foot.position.set(x,model.height*0.022,model.height*0.028);
 }
 return group;
}
