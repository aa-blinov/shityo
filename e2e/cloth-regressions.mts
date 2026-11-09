import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGarment } from '../frontend/src/lib/cloth/assembly.ts';
import { buildBodyModel, armPoint, armSemiAxis, armholeLoop, legProfile, bodyRadius, shoulderEdgePoint, trunkRadius, torsoPoint } from '../frontend/src/lib/cloth/body.ts';
import { createSimulation } from '../frontend/src/lib/cloth/physics.ts';
import { projectOutsideBody, stepCloth, DEFAULT_OPTIONS } from '../frontend/src/lib/cloth/xpbd.ts';
import { clearBody,createContactSurface } from '../frontend/src/lib/cloth/surface.ts';
import { bodyField, fieldDistance, neckTop } from '../frontend/src/lib/cloth/field.ts';
import { fabricFor, measuredFabric } from '../frontend/src/lib/cloth/fabrics.ts';
import { earClip, signedArea } from '../frontend/src/lib/cloth/geometry.ts';
import { FINISHES, defaultFinish, finishHeights, printColours, surfaceUVs } from '../frontend/src/lib/cloth/appearance.ts';
const catalog = JSON.parse(readFileSync('../frontend/src/lib/fixtures/catalog.json','utf8')).items;
// Concave closed contours must keep their area, without a triangle fan across a cutout.
const outline = [{x:0,y:0},{x:3,y:0},{x:3,y:1},{x:1,y:1},{x:1,y:3},{x:0,y:3},{x:0,y:0}];
for (const points of [outline,outline.toReversed()]) {
 const mesh = earClip(points);
 let area=0;
 for(let i=0;i<mesh.tris.length;i+=3) area+=Math.abs(signedArea(mesh.tris.slice(i,i+3).map(j=>mesh.verts[j])));
 assert.ok(Math.abs(area-5)<1e-8);
}
// Полотно: трикотаж поперёк тянется сильнее, чем по долевой; плотная ткань
// жёстче на изгиб, чем трикотаж; тяжёлая ткань той же структуры жёстче лёгкой.
{
 const knit=fabricFor('hoodie'),heavy=fabricFor('coat');
 assert.ok(knit.weftCompliance>knit.compliance,'knit stretches more across the grain');
 assert.ok(heavy.bend<knit.bend,'suiting is stiffer in bending than knit');
 assert.ok(measuredFabric('woven',8,5,300).bend<measuredFabric('woven',8,5,100).bend,'heavier cloth bends less');
 assert.ok(measuredFabric('knit',30,6,200).stretchLimit>measuredFabric('knit',10,6,200).stretchLimit,'stretch input raises the limit');
}
// Внешний вид ткани: фактура по классу полотна, разные рельефы, принт в
// реальном масштабе и развёртка по лекалу (долевая - вдоль детали).
{
 assert.equal(defaultFinish('knit'),'jersey');
 assert.equal(defaultFinish('woven'),'plain');
 assert.equal(defaultFinish('heavy'),'twill');
 const reliefs=FINISHES.filter(f=>!f.print).map(f=>finishHeights(f.id,32).join(','));
 assert.equal(new Set(reliefs).size,reliefs.length,'every finish has its own relief');
 const stripe=FINISHES.find(f=>f.id==='stripe')!,check=FINISHES.find(f=>f.id==='check')!;
 assert.ok(stripe.print && check.print && stripe.periodCm>0 && check.periodCm>stripe.periodCm);
 const px=printColours('stripe','#2c3a55',16);
 assert.notDeepEqual([...px.slice(0,3)],[...px.slice(8*4,8*4+3)],'stripe alternates across the tile');
 assert.deepEqual([...px.slice(0,4)],[...px.slice(16*4*5,16*4*5+4)],'stripe runs along the grain');
 const uv=surfaceUVs([{x:0,y:0},{x:10,y:0},{x:0,y:20}],[[0,1],[1,2],[3,4]]);
 assert.deepEqual([...uv],[0,0,10,0,0,20,5,0,5,10,5,5],'midpoints follow the flat pattern in cm');
}
// Пропорции манекена - как у человека (ГОСТ 31396/31399, доли роста), а
// высоты следуют меркам клиента, а не только росту.
{
 for(const [gender,m] of [['female',{height:164,bust:92,waist:74,hip:100}],['male',{height:176,bust:100,waist:88,hip:104}]] as const) {
  const b=buildBodyModel(m,{gender}),H=b.height;
  const share=(v:number)=>v/H;
  assert.ok(share(b.shoulderTipY)>0.8 && share(b.shoulderTipY)<0.83,`${gender}: acromion at ${share(b.shoulderTipY).toFixed(3)} H`);
  assert.ok(share(b.shoulderY)>0.83 && share(b.shoulderY)<0.86,`${gender}: neck base at ${share(b.shoulderY).toFixed(3)} H`);
  assert.ok(share(b.waistY)>0.59 && share(b.waistY)<0.65,`${gender}: waist at ${share(b.waistY).toFixed(3)} H`);
  assert.ok(share(b.armpitY)>0.7 && share(b.armpitY)<0.76,`${gender}: armpit at ${share(b.armpitY).toFixed(3)} H`);
  // Рука опущена до запястья на 0,48-0,50 роста: мерку длины рукава снимают
  // по согнутому локтю, прямая рука короче. Плечи - прямое расстояние между
  // плечевыми точками (0,21-0,25 роста), а не мерка по спине через лопатки.
  assert.ok(share(b.wrist.y)>0.47 && share(b.wrist.y)<0.51,`${gender}: wrist at ${share(b.wrist.y).toFixed(3)} H`);
  assert.ok(share(2*b.shoulderR)>0.21 && share(2*b.shoulderR)<0.25,`${gender}: shoulders ${(2*b.shoulderR*100).toFixed(1)} cm`);
  // Скат плеча - прямая трапеция от шеи к плечевой точке, а не «бутылка».
  const mid=(b.shoulderY+b.shoulderTipY)/2,expected=(b.neckR*1.3+b.shoulderR)/2;
  assert.ok(Math.abs(bodyRadius(b,mid,Math.PI/2).a-expected)<0.015,`${gender}: shoulder slope is not a straight trapezius line (${bodyRadius(b,mid,Math.PI/2).a.toFixed(3)} vs ${expected.toFixed(3)})`);
 }
 const base={height:170,bust:96,waist:78,hip:102,neck_to_waist:42,waist_to_hip:20};
 const b0=buildBodyModel(base,{gender:'female'});
 const longBack=buildBodyModel({...base,neck_to_waist:46},{gender:'female'});
 assert.ok(longBack.shoulderY-b0.shoulderY>0.03,'longer back raises the shoulders');
 const lowHip=buildBodyModel({...base,waist_to_hip:24},{gender:'female'});
 assert.ok(Math.abs((b0.hipY-lowHip.hipY)-0.04)<0.002,'waist-to-hip sets the hip line');
 const legs=buildBodyModel({...base,inseam_length:84,crotch_depth:27},{gender:'female'});
 assert.ok(Math.abs(legs.waistY-1.11)<0.002,'inseam and seat depth set the waist height');
 const knee=(k:number)=>{const b=buildBodyModel({...base,knee_length:k},{gender:'female'});const p=legProfile(b);return p.rings.filter(r=>r.y>0.38&&r.y<b.crotchY-0.15).reduce((m,r)=>r.a+r.b<m.a+m.b?r:m).y;};
 assert.ok(knee(56)-knee(62)>0.04,'waist-to-knee moves the knee');
}
// Торс вылеплен, а не собран из овалов: грудь или грудные мышцы, лопатки,
// ложбинка позвоночника, ягодицы. Обхваты при этом остаются по меркам.
{
 const girth=(b:ReturnType<typeof buildBodyModel>,y:number)=>{
  let total=0,prev:[number,number]|null=null,first:[number,number]|null=null;
  for(let i=0;i<720;i++){const phi=i/720*Math.PI*2,r=trunkRadius(b,y,phi),pt:[number,number]=[r*Math.sin(phi),r*Math.cos(phi)];if(prev)total+=Math.hypot(pt[0]-prev[0],pt[1]-prev[1]);else first=pt;prev=pt;}
  return total+Math.hypot(first![0]-prev![0],first![1]-prev![1]);
 };
 const f=buildBodyModel({height:164,bust:92,waist:74,hip:100},{gender:'female'});
 const m=buildBodyModel({height:176,bust:100,waist:88,hip:104},{gender:'male'});
 for(const [b,bust,waist,hip] of [[f,0.92,0.74,1.0],[m,1.0,0.88,1.04]] as const) {
  assert.ok(Math.abs(girth(b,b.bustY)-bust)<0.01,`bust girth ${girth(b,b.bustY).toFixed(3)}`);
  assert.ok(Math.abs(girth(b,b.waistY)-waist)<0.01,`waist girth ${girth(b,b.waistY).toFixed(3)}`);
  assert.ok(Math.abs(girth(b,b.hipY)-hip)<0.01,`hip girth ${girth(b,b.hipY).toFixed(3)}`);
  assert.ok(trunkRadius(b,b.waistY,Math.PI)<trunkRadius(b,b.waistY,Math.PI-0.35)-0.004,'spine groove at the waist');
  const blade=(b.armpitY+b.shoulderTipY)/2;
  assert.ok(trunkRadius(b,blade,Math.PI-0.6)>trunkRadius(b,blade,Math.PI)+0.003,'shoulder blades');
  assert.ok(trunkRadius(b,b.hipY,Math.PI-0.42)>trunkRadius(b,b.hipY,Math.PI)*1.05,'buttocks');
  // Точка торса и столкновение ложатся на ту же вылепленную поверхность.
  const p=torsoPoint(b,0.4,b.bustY),phi=Math.atan2(p.x,p.z);
  assert.ok(Math.abs(Math.hypot(p.x,p.z)-trunkRadius(b,b.bustY,phi))<1e-9,'torsoPoint lies on the sculpted surface');
  const out=projectOutsideBody(b,{x:0.03,y:b.bustY,z:0.02})!,po=Math.atan2(out.x,out.z);
  // Столкновение - по полю расстояний: точка ложится на его поверхность,
  // а на груди она совпадает с вылепленным торсом.
  assert.ok(Math.abs(fieldDistance(bodyField(b),out.x,out.y,out.z))<0.001,'collision lands on the body field');
  assert.ok(Math.abs(Math.hypot(out.x,out.z)-trunkRadius(b,b.bustY,po))<0.004,'collision uses the sculpted surface');
 }
 assert.ok(trunkRadius(f,f.bustY,0.42)>trunkRadius(f,f.bustY,0)*1.06,'bust stands out of the centre front');
 assert.ok(trunkRadius(f,f.bustY,0.42)/trunkRadius(f,f.bustY,Math.PI/2)>trunkRadius(m,m.bustY,0.42)/trunkRadius(m,m.bustY,Math.PI/2),'female bust is fuller than male chest');
}
// Руки и ноги - по профилям модели: бицепс по мерке, к локтю и запястью
// рука сужается, бедро шире колена, ниже колена - икра, лодыжка тонкая.
{
 const girth=(a:number,b:number)=>Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)));
 for(const gender of ['female','male'] as const) {
  const b=buildBodyModel({height:gender==='female'?164:176,bust:gender==='female'?92:100,waist:gender==='female'?74:88,hip:gender==='female'?100:104,biceps:gender==='female'?28.4:32},{gender});
  const at=(s:number)=>armSemiAxis(b.armProfile,b.armR,s*b.armLength);
  const g=(s:number)=>{const x=at(s);return girth(x.a,x.b);};
  const biceps=Math.max(...[0.25,0.3,0.35,0.4].map(g));
  assert.ok(Math.abs(biceps-(gender==='female'?0.284:0.32))<0.01,`${gender}: biceps ${biceps.toFixed(3)}`);
  assert.ok(g(0.99)<biceps*0.7,`${gender}: wrist ${g(0.99).toFixed(3)} vs biceps ${biceps.toFixed(3)}`);
  const L=legProfile(b);
  const legAt=(y:number)=>L.rings.reduce((best,r)=>Math.abs(r.y-y)<Math.abs(best.y-y)?r:best);
  const thigh=legAt(b.crotchY-0.05),knee=legAt(b.kneeY),calf=L.rings.filter(r=>r.y<b.kneeY-0.05&&r.y>b.kneeY-0.2).reduce((m,r)=>r.a+r.b>m.a+m.b?r:m),ankle=legAt(b.height*0.06);
  assert.ok(thigh.a+thigh.b>(knee.a+knee.b)*1.3,`${gender}: thigh wider than knee`);
  assert.ok(calf.a+calf.b>knee.a+knee.b,`${gender}: calf below the knee`);
  assert.ok(ankle.a+ankle.b<(knee.a+knee.b)*0.7,`${gender}: slim ankle`);
  // Отношения обхватов - как у модели MakeHuman, а не придуманные доли.
  const table=JSON.parse(readFileSync('../frontend/src/lib/cloth/mannequin.json','utf8'))[gender];
  const rowAt=(rows:any[],s:number)=>rows.reduce((best:any,r:any)=>Math.abs(r.s-s)<Math.abs(best.s-s)?r:best);
  const ref=rowAt(table.arm,0.3);
  for(const s of [0.6,0.9]) {
   const want=girth(rowAt(table.arm,s).a,rowAt(table.arm,s).b)/girth(ref.a,ref.b);
   const got=g(s)/g(0.3);
   assert.ok(Math.abs(got/want-1)<0.05,`${gender}: arm girth ratio at ${s} is ${got.toFixed(2)}, model ${want.toFixed(2)}`);
  }
 }
}
// Форма торса - по модели MakeHuman под CC0; источник указан в таблице.
{
 const table=JSON.parse(readFileSync('../frontend/src/lib/cloth/mannequin.json','utf8'));
 assert.match(table.source,/MakeHuman.*CC0/);
 assert.ok(table.female.radii.length>50 && table.male.radii.length>50);
}
const body = buildBodyModel(catalog[0].default_measurements);
for(const side of [-1,1] as const) {
 const s=body.armLength*0.55;
 const axes=armSemiAxis(body.armProfile,body.armR,s);
 const centre=armPoint(body,side,s);
 const p={x:centre.x+side*axes.a*0.5,y:body.armOrigin.y-s,z:0};
 const out=projectOutsideBody(body,p)!;
 assert.ok(out,'arm collision must project');
 // Рука в поле - тот же эллипс сечения: точка выходит на его край.
 assert.ok(Math.abs(fieldDistance(bodyField(body),out.x,out.y,out.z))<0.001,'arm collision lands on the body field');
 assert.ok(Math.abs(Math.hypot((out.x-centre.x)/axes.a,out.z/axes.b)-1)<0.08,'arm collision keeps the arm section');
}
assert.equal(projectOutsideBody(body,{x:0,y:0.01,z:0}),null,'torso must not extend to infinity below hips');
// Бок таза без гребня: на линии бёдер натянутая юбка срезала острый
// перегиб, и сквозь ткань просвечивал манекен.
for(const item of catalog.filter((i:any)=>i.id==='skirt' || i.id==='trousers')) {
 const m=buildBodyModel(item.default_measurements);
 for(let y=m.crotchY+0.03;y<m.hipY+0.08;y+=0.01) {
  const side=(v:number)=>trunkRadius(m,v,Math.PI/2);
  const bend=side(y-0.02)-2*side(y)+side(y+0.02);
  assert.ok(bend>-0.008,`${item.id}: pelvis side bends ${(bend*1000).toFixed(1)} mm at ${y.toFixed(2)} m`);
 }
}
// Грудь без уступа у подмышки: спереди торс меняется плавно, иначе ткань
// лифа ложилась ступенькой и в щель было видно тело.
for(const gender of ['female','male'] as const) {
 const m=buildBodyModel(gender==='female'?{height:164,bust:92,waist:74,hip:100}:{height:176,bust:100,waist:88,hip:104},{gender});
 for(let y=m.armpitY-0.1;y<m.armpitY+0.08;y+=0.005) for(const deg of [0,30,45]) {
  const phi=deg*Math.PI/180,step=Math.abs(trunkRadius(m,y+0.01,phi)-trunkRadius(m,y,phi));
  assert.ok(step<0.012,`${gender}: chest steps ${(step*1000).toFixed(0)} mm per cm at ${y.toFixed(3)} m, ${deg} deg`);
 }
 // Пройма без рукава лежит на теле, а не внутри торса, и половины
 // переда и спинки сходятся у подмышки в одну точку.
 for(const side of [1,-1] as const) {
  const loop=armholeLoop(m,side,16,true);
  for(const p of [...loop.front.points,...loop.back.points]) {
   const out=clearBody(m,p,0);
   assert.ok(Math.hypot(out.x-p.x,out.z-p.z)<0.002,`${gender}: sleeveless armhole runs inside the body at ${p.y.toFixed(3)} m`);
  }
  const a=loop.front.points.at(-1)!,b=loop.back.points.at(-1)!;
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<0.005,`${gender}: armhole halves meet at the armpit`);
 }
}
// Плечевой пояс гладкий: силуэт спереди от трапеции через плечо к руке
// без углов (раньше плечо было полкой с прямым углом), рука и торс у плеча -
// одна поверхность, шов плеча начинается у основания шеи, а не на шее.
for(const [gender,m] of [['female',{height:164,bust:92,waist:74,hip:100}],['male',{height:176,bust:100,waist:88,hip:104}]] as const) {
 const b=buildBodyModel(m,{gender}),field=bodyField(b);
 const occupied=(x:number,y:number)=>{for(let z=-0.15;z<=0.15;z+=0.004) if(fieldDistance(field,x,y,z)<=0) return true;return false;};
 const C={x:b.shoulderR-0.06,y:b.shoulderTipY-0.06},pts:{x:number;y:number}[]=[];
 for(let deg=100;deg>=-30;deg-=5){const a=deg*Math.PI/180;let r=0.2;while(r>0 && !occupied(C.x+r*Math.cos(a),C.y+r*Math.sin(a))) r-=0.001;pts.push({x:C.x+r*Math.cos(a),y:C.y+r*Math.sin(a)});}
 for(let i=1;i<pts.length-1;i++) {
  const a1=Math.atan2(pts[i].y-pts[i-1].y,pts[i].x-pts[i-1].x),a2=Math.atan2(pts[i+1].y-pts[i].y,pts[i+1].x-pts[i].x);
  let turn=Math.abs(a2-a1)*180/Math.PI;if(turn>180) turn=360-turn;
  assert.ok(turn<25,`${gender}: shoulder silhouette turns ${turn.toFixed(0)} deg at ${pts[i].x.toFixed(3)},${pts[i].y.toFixed(3)}`);
 }
 const y=b.shoulderTipY-0.03,axis=armPoint(b,1,b.armOrigin.y-y).x;
 for(let x=0.08;x<=axis;x+=0.002) assert.ok(fieldDistance(field,x,y,0)<0,`${gender}: gap between trunk and arm at the shoulder, x=${x.toFixed(3)}`);
 const neckPoint=shoulderEdgePoint(b,1,0);
 assert.ok(neckPoint.y<b.shoulderY+0.02,`${gender}: shoulder seam starts ${((neckPoint.y-b.shoulderY)*100).toFixed(1)} cm above the neck base`);
}
// Портновский манекен: рук и ног нет, пока они не нужны изделию, и в поле
// (столкновениях) их тоже нет; шея обрезана под шляпку, стойка снизу.
{
 const m={height:164,bust:92,waist:74,hip:100};
 const full=buildBodyModel(m,{gender:'female'}),form=buildBodyModel(m,{gender:'female',parts:{arms:false,legs:false}});
 const elbowY=full.armOrigin.y-full.armLength*0.5,elbow=armPoint(full,1,full.armLength*0.5);
 assert.ok(fieldDistance(bodyField(full),elbow.x,elbowY,0)<0,'arm is in the field when the garment has sleeves');
 assert.ok(fieldDistance(bodyField(form),elbow.x,elbowY,0)>0.02,'dress form without sleeves has no arm');
 const legs=legProfile(full),kneeY=full.kneeY;
 assert.ok(fieldDistance(bodyField(full),legs.x,kneeY,0)<0,'legs are in the field for trousers');
 assert.ok(fieldDistance(bodyField(form),legs.x,kneeY,0)>0.02,'dress form for skirts has no legs');
 const top=neckTop(form);
 assert.ok(fieldDistance(bodyField(form),0,top+0.01,0)>0,'neck is cut under the cap');
 assert.ok(fieldDistance(bodyField(form),0,top-0.03,0)<0,'neck reaches the cap');
 assert.ok(top<form.height-form.height/7.5,'no head on the dress form');
}
// Кисть висит по оси предплечья ладонью к бедру: пальцы не уходят к телу,
// большой палец не заходит в бедро и в юбку.
{
 const parts=JSON.parse(readFileSync('../frontend/src/lib/cloth/mannequin-parts.json','utf8'));
 const raw=Buffer.from(parts.hand.positions,'base64');
 const hand=new Int16Array(raw.buffer,raw.byteOffset,raw.length/2);
 let maxAlong=0;for(let i=0;i<hand.length;i+=3) maxAlong=Math.max(maxAlong,hand[i]);
 let inward=0,sum=0,count=0;
 for(let i=0;i<hand.length;i+=3) {
  inward=Math.max(inward,hand[i+1]);
  if(hand[i]>maxAlong*0.7){sum+=hand[i+1];count++;}
 }
 const toM=(v:number)=>v/1000*1.7/parts.height;
 assert.ok(Math.abs(toM(sum/count))<0.01,`fingers drift ${(toM(sum/count)*100).toFixed(1)} cm off the forearm axis`);
 assert.ok(toM(inward)<0.045,`hand reaches ${(toM(inward)*100).toFixed(1)} cm towards the body`);
}
for(const item of catalog) {
 const response=JSON.parse(readFileSync(`../frontend/src/lib/fixtures/generate-${item.id}.json`,'utf8'));
 // Пол фигуры - как в приложении: первый из полов изделия (платье и юбка - женские).
 const gender=item.genders?.[0];
 // Манекен - как в превью: руки под рукав, ноги только под брюки.
 const parts={arms:response.pieces.some((p:{id:string})=>p.id==='sleeve'),legs:item.id==='trousers'};
 const model=buildBodyModel(item.default_measurements,{gender,parts});
 const garment=buildGarment(response.pieces,item.default_measurements,{model:item.id,gender,body:model});
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
 // Швы не сшивают далёкие точки: иначе солвер стягивает их и ткань рвётся
 // (платье с нагрудной вытачкой рвалось на боку и в пройме).
 for(const seam of garment.seams) {
  const a=garment.parts.find(p=>p.id===seam.a)!,b=garment.parts.find(p=>p.id===seam.b)!;
  for(const [ia,ib] of seam.pairs) {
   const gap=Math.hypot(...[0,1,2].map(k=>a.world[ia*3+k]-b.world[ib*3+k]));
   assert.ok(gap<0.03,`${item.id}: ${seam.a}-${seam.b} stitches points ${(gap*100).toFixed(1)} cm apart`);
  }
 }
 const seams=garment.seams.map(s=>({a:s.a,b:s.b,pair:{a:s.pairs.map(p=>p[0]),b:s.pairs.map(p=>p[1])}}));
 const sim=await createSimulation(garment.parts,seams,garment.pins,model,fabricFor(item.id));
 for(let i=0;i<180;i++) sim.step(1/60);
 assert.ok([...sim.positions()].every(Number.isFinite),`${item.id}: simulation exploded`);
 assert.ok([...sim.positions()].every(v=>Math.abs(v)<5),`${item.id}: simulation escaped`);
 const maps=sim.partVertexMap(),positions=sim.positions();
 const edgeCounts=new Map<string,number>();
 const surfaceTris=sim.partTriangles();
 for(const part of garment.parts.filter(p=>!p.id.startsWith('collar') && !p.id.startsWith('trim-'))) {
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
  const surface=createContactSurface(surfaceTris.get(part.id)!,maps.get(part.id)!,model,part.id.startsWith('collar')?3:(/^(front|back)-/.test(part.id)?2:(part.id==='front'||part.id==='back'?3:(part.id.startsWith('sleeve')?2:1))),part.id==='collar-1'?1:(part.id==='collar--1'?-1:0),garment.sleeveless??false);
  surface.update(positions);
  const rendered=surface.positions;
  for(let i=0;i<rendered.length;i+=3) {
   const p={x:rendered[i],y:rendered[i+1],z:rendered[i+2]},out=clearBody(model,p,0);
   assert.ok(Math.hypot(p.x-out.x,p.z-out.z)<1e-6,`${item.id}/${part.id}: render vertex inside mannequin`);
  }
  // Треугольники не режут манекен ни у одного изделия, на фигуре того пола,
  // что в приложении, включая воротник.
  for(let i=0;i<surface.triangles.length;i+=3) {
   const indices=surface.triangles.slice(i,i+3);
   const p={x:0,y:0,z:0};
   for(const index of indices){p.x+=rendered[index*3]/3;p.y+=rendered[index*3+1]/3;p.z+=rendered[index*3+2]/3;}
   const out=clearBody(model,p,0);
   assert.ok(Math.hypot(p.x-out.x,p.z-out.z)<0.002,`${item.id}/${part.id}: triangle cuts through mannequin by ${Math.hypot(p.x-out.x,p.z-out.z)*1000} mm at ${JSON.stringify(p)}`);
  }
 }
 // Штанина не раздувается: ниже шага ткань отходит от ноги манекена не
 // больше чем на 3 см вбок, а левая и правая штанины не заходят друг в друга.
 if(item.id==='trousers') {
  const legs=legProfile(model),top=legs.rings[0].y-0.1;
  for(let i=0;i<positions.length;i+=3) {
   const y=positions[i+1];
   if(y>top || y<legs.rings[legs.rings.length-1].y) continue;
   const ring=legs.rings.find((r,k)=>k===legs.rings.length-1 || legs.rings[k+1].y<y)!;
   assert.ok(Math.abs(positions[i])<=legs.x+ring.a+0.03,`trousers: leg balloons to ${(Math.abs(positions[i])*100).toFixed(1)} cm at ${y.toFixed(2)} m`);
  }
 }
 // Отверстия сшитого изделия: горловина, низ и два рукава (или две проймы у
 // платья и жилета); у брюк - пояс и две штанины, у юбки - пояс и низ.
 const expectedLoops:Record<string,number>={tee:4,shirt:4,dress:4,vest:4,coat:4,trousers:3,skirt:2,sweatshirt:4,hoodie:4,jumper:4,cardigan:4};
 assert.equal(loops,expectedLoops[item.id],`${item.id}: unexpected hole in stitched surface`);

 for(const seam of garment.seams) for(const [a,b] of seam.pairs) assert.equal(maps.get(seam.a)![a],maps.get(seam.b)![b]);
 for(const pin of garment.pins) {
  const node=maps.get(pin.piece)![pin.vertex];
  assert.ok(pin.position.every((v,k)=>Math.abs(v-positions[node*3+k])<1e-6),`${item.id}: anchor moved`);
 }
 // Воротник: сгиб (самая широкая часть) - на середине спинки, концы - у
 // середины переда; сетка мелкая, без треугольников во всю длину.
 for(const part of garment.parts.filter(p=>p.id.startsWith('collar'))) {
  const fold=part.verts.reduce((best,v,i)=>v.y>part.verts[best].y?i:best,0);
  assert.ok(part.world[fold*3+2]<0,`${item.id}/${part.id}: collar fold sits at the front`);
  for(let i=0;i<part.tris.length;i+=3) for(let j=0;j<3;j++) {
   const a=part.verts[part.tris[i+j]],b=part.verts[part.tris[i+(j+1)%3]];
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<=1.5+1e-6,`${item.id}/${part.id}: collar edge ${Math.hypot(a.x-b.x,a.y-b.y).toFixed(1)} cm`);
  }
 }
 console.log(`${item.id}: ${garment.parts.length} parts, ${garment.seams.length} seams, 180 stable steps`);
 sim.dispose();
}
console.log('3D regression checks passed');
