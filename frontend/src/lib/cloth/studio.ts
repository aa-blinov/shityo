import {
 ACESFilmicToneMapping, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DataTexture, DirectionalLight,
 type Material, TubeGeometry, Vector3,
 Float32BufferAttribute, Fog, Group, HemisphereLight, Mesh, MeshPhysicalMaterial,
 MeshStandardMaterial, PCFShadowMap, PlaneGeometry, PMREMGenerator,
 RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SphereGeometry, SRGBColorSpace,
 type Scene, type WebGLRenderer, DoubleSide
} from 'three';
import { FINISHES, finishById, finishHeights, printColours, type Finish, type FinishId } from './appearance';
import { trunkRadius, type BodyModel } from './body';
import { bodyField, neckTop, snapTo, surfaceMesh } from './field';

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

/**
 * Ткань изделия: цвет, рельеф переплетения и принт.
 *
 * Текстуры строятся в памяти, без загрузки файлов. Развёртка - по плоскому
 * лекалу в сантиметрах, поэтому раппорт задаётся как 1/период.
 * `apply` меняет только материал: драпировку пересчитывать не нужно.
 */
export function fabricLook(renderer:WebGLRenderer) {
 const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 const setup=(texture:DataTexture,period:number)=>{
  texture.wrapS=texture.wrapT=RepeatWrapping;
  texture.repeat.set(1/period,1/period);texture.anisotropy=anisotropy;
  texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
 };
 const reliefs=new Map<string,DataTexture>();
 const relief=(finish:Finish)=>{
  let texture=reliefs.get(finish.relief);
  if(!texture) {
   const size=128,heights=finishHeights(finish.relief,size),data=new Uint8Array(size*size*4);
   for(let i=0;i<heights.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=heights[i];data[i*4+3]=255;}
   texture=setup(new DataTexture(data,size,size,RGBAFormat),FINISHES.find(f=>f.id===finish.relief)!.periodCm);
   reliefs.set(finish.relief,texture);
  }
  return texture;
 };
 let print:DataTexture|null=null;
 const material=new MeshPhysicalMaterial({
  metalness:0,roughness:0.9,sheen:0.9,sheenRoughness:0.8,bumpScale:0.6,
  side:DoubleSide,clearcoat:0,reflectivity:0.15
 });
 const apply=(colour:string,finishId:FinishId)=>{
  const finish=finishById(finishId)??FINISHES[0];
  const bump=relief(finish);
  material.bumpMap=bump;material.roughnessMap=bump;
  print?.dispose();print=null;
  if(finish.print) {
   const size=64;
   print=setup(new DataTexture(printColours(finish.id,colour,size),size,size,RGBAFormat),finish.periodCm);
   print.colorSpace=SRGBColorSpace;
   material.map=print;material.color.set('#ffffff');
  } else {
   material.map=null;material.color.set(colour);
  }
  material.sheenColor=new Color(colour).lerp(new Color('#f4eee4'),0.45);
  material.needsUpdate=true;
 };
 return {
  material,apply,
  dispose(){print?.dispose();reliefs.forEach(t=>t.dispose());material.dispose();}
 };
}

/**
 * Льняной чехол манекена: тёплое некрашеное полотно с утолщениями нитей
 * (у льна нити неровные - это и отличает его на глаз), рельеф переплетения.
 * Рапорт - 4 см на теле.
 */
function linenTextures(): { colour: DataTexture; bump: DataTexture } {
 const size=256,colour=new Uint8Array(size*size*4),bump=new Uint8Array(size*size*4);
 // Толщина каждой нити по основе и утку - случайная, но повторяемая.
 let seed=7;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 const threads=64,warp=Array.from({length:threads},()=>0.75+random()*0.5),weft=Array.from({length:threads},()=>0.75+random()*0.5);
 const base=[218,206,182];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const cx=x*threads/size,cy=y*threads/size,ix=Math.floor(cx),iy=Math.floor(cy);
  const over=(ix+iy)%2===0;
  const across=Math.sin((cx-ix)*Math.PI),down=Math.sin((cy-iy)*Math.PI);
  const h=over?across*warp[ix]:down*weft[iy];
  const tone=0.9+0.12*(over?warp[ix]:weft[iy])-0.06*(1-h);
  const i=(y*size+x)*4;
  for(let k=0;k<3;k++)colour[i+k]=Math.max(0,Math.min(255,Math.round(base[k]*tone)));
  colour[i+3]=255;
  const v=Math.round(80+h*150);bump[i]=bump[i+1]=bump[i+2]=v;bump[i+3]=255;
 }
 const make=(data:Uint8Array,srgb:boolean)=>{
  const texture=new DataTexture(data,size,size,RGBAFormat);
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=8;if(srgb)texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
  return texture;
 };
 return {colour:make(colour,true),bump:make(bump,false)};
}

/** Тонкая тесьма разметки, уложенная на поверхность манекена. */
function tape(points:{x:number;y:number;z:number}[],closed:boolean):TubeGeometry {
 const curve=new CatmullRomCurve3(points.map(p=>new Vector3(p.x,p.y,p.z)),closed,'centripetal');
 return new TubeGeometry(curve,closed?160:120,0.0016,6,closed);
}

/**
 * Портновский манекен: торс в льняном чехле на стойке, шея под шляпкой,
 * тесьма разметки по груди, талии, бёдрам и серединам переда и спинки -
 * как у манекенов в ателье. Руки (мягкие, без кистей) - для изделий с
 * рукавом, ноги - для брюк (BodyModel.parts). Тело - одна сетка по полю
 * расстояний, о которое ударяется ткань.
 */
export function buildMannequin(model:BodyModel):Group {
 const group=new Group();
 const linen=linenTextures();
 const material=new MeshPhysicalMaterial({color:'#ffffff',map:linen.colour,bumpMap:linen.bump,bumpScale:0.6,roughness:0.86,metalness:0,sheen:0.35,sheenRoughness:0.7,sheenColor:new Color('#f2e9d8')});
 const dark=new MeshPhysicalMaterial({color:'#2a2826',roughness:0.35,metalness:0.1,clearcoat:0.4,clearcoatRoughness:0.3});
 const metal=new MeshStandardMaterial({color:'#4a4744',roughness:0.32,metalness:0.85});
 const add=(geometry:BufferGeometry,mat:Material=material)=>{const mesh=new Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
 const field=bodyField(model);
 const surface=surfaceMesh(field);
 // Развёртка чехла - цилиндрическая, в метрах: рапорт полотна 4 см.
 const repeat=0.04,uv=new Float32Array(surface.positions.length/3*2);
 for(let i=0;i<surface.positions.length/3;i++){
  const x=surface.positions[i*3],y=surface.positions[i*3+1],z=surface.positions[i*3+2];
  uv[i*2]=Math.atan2(x,z)*0.16/repeat;uv[i*2+1]=y/repeat;
 }
 const body=new BufferGeometry();
 body.setAttribute('position',new Float32BufferAttribute(surface.positions,3));
 body.setAttribute('normal',new Float32BufferAttribute(surface.normals,3));
 body.setAttribute('uv',new BufferAttribute(uv,2));
 body.setIndex(Array.from(surface.indices));
 add(body);
 // Тесьма: точку ставим внутрь торса по лучу и выводим на поверхность -
 // так она ложится на торс, а не на руку рядом.
 const top=neckTop(model),bottom=model.parts.legs?model.crotchY+0.02:model.crotchY+0.04;
 const onSurface=(phi:number,y:number)=>{
  const r=trunkRadius(model,Math.max(model.crotchY,Math.min(model.neckY,y)),phi)*0.85;
  return snapTo(field,{x:r*Math.sin(phi),y,z:r*Math.cos(phi)},0.0012);
 };
 for(const y of [model.bustY,model.waistY,model.hipY]) {
  if(y<bottom+0.02) continue;
  add(tape(Array.from({length:96},(_,k)=>onSurface(k/96*Math.PI*2,y)),true),dark);
 }
 for(const phi of [0,Math.PI]) {
  const points=[];for(let y=bottom+0.03;y<=top-0.012;y+=0.01) points.push(onSurface(phi,y));
  add(tape(points,false),dark);
 }
 // Шея под шляпкой с точёной ручкой сверху.
 const capR=model.neckR*1.04;
 const cap=add(new CylinderGeometry(capR,capR*1.02,0.014,48),dark);cap.position.set(0,top+0.003,0);
 const knob=add(new SphereGeometry(model.neckR*0.32,32,16),dark);knob.scale.set(1,0.55,1);knob.position.set(0,top+0.016,0);
 // Стойка: штанга от основания до низа торса, муфта регулировки высоты,
 // круглое основание.
 const poleTop=model.parts.legs?model.crotchY:model.crotchY+0.03;
 const pole=add(new CylinderGeometry(0.011,0.011,poleTop,24),metal);pole.position.set(0,poleTop/2,0);
 const collar=add(new CylinderGeometry(0.019,0.019,0.05,24),metal);collar.position.set(0,poleTop*0.55,0);
 const plate=add(new CylinderGeometry(0.15,0.17,0.016,64),dark);plate.position.set(0,0.008,0);
 return group;
}
