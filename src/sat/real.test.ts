import {describe,it,expect} from 'vitest';
import {intensityOf,intensityField,trueField,renderReal,renderEnh,histOf,hiOf,mergeHist,noiseField,V2_DEF,v2Key,runV2} from './real';
import {computeDecodedRGBA,computeFalseColorRGBA,colorToIntensity,falseRawField,histHi} from './ref.fixture';
import {run,type DecodeIn} from './decode';
const W=70,H=54;
const fill=(w:number,h:number,f:(x:number,y:number)=>number[])=>{const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set(f(x,y),(y*w+x)*4);return a};
const storm=(x:number,y:number)=>{const d=Math.hypot(x-35,y-27)+3*Math.sin(x*0.4)*Math.cos(y*0.3);return d<7?[200,30,150,255]:d<13?[230,40,40,255]:d<19?[240,220,50,255]:d<25?[60,200,90,255]:d<31?[60,120,230,255]:[110+((x*7+y*3)%9),110,110,255]};
const tcol=(x:number,y:number)=>{const d=Math.hypot(x-35,y-27)+4*Math.sin(x*0.3);return d<14?[240,242,246,255]:d<24?[205,208,214,255]:[40+x%7,90+y%5,60,255]};
const ones=(n:number)=>new Float32Array(n).fill(1);
const same=(a:ArrayLike<number>,b:ArrayLike<number>)=>{expect(a.length).toBe(b.length);let bad=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])bad++;expect(bad).toBe(0)};
const rawOf=(px:Uint8ClampedArray)=>{const r=new Float32Array(W*H);for(let i=0;i<W*H;i++)r[i]=colorToIntensity(px[i*4],px[i*4+1],px[i*4+2]);return r};
describe('V2 is an exact port of the original engine',()=>{
it('colour to intensity matches for many colours',()=>{
for(let i=0;i<5000;i++){const r=(i*37)%256,g=(i*91+13)%256,b=(i*53+7)%256;expect(intensityOf(r,g,b)).toBe(colorToIntensity(r,g,b))}});
it('intensity field with the colour cache matches per pixel',()=>{
const px=fill(W,H,storm),f=intensityField(px,W*H,null),r=rawOf(px);same(f,r)});
it('realistic render matches the original, opaque',()=>{
const px=fill(W,H,storm),raw=rawOf(px),p=V2_DEF.real,o=renderReal(raw,W,H,p,{alpha:ones(W*H),bg:'space'}).out;
const ref=computeDecodedRGBA(raw,W,H,{thresh:p.thr,contrast:p.ct,stormAmt:p.storm,softness:p.soft,noiseAmt:p.noise,reliefAmt:p.relief,lightDeg:p.light,mode:'realistic'});
same(o,ref)});
it('realistic render matches with other settings and mono palette',()=>{
const px=fill(W,H,storm),raw=rawOf(px),p={...V2_DEF.real,thr:0.2,ct:0.8,storm:0.3,soft:4,noise:0.9,relief:1,light:200,pal:'mono' as const},o=renderReal(raw,W,H,p,{alpha:ones(W*H),bg:'space'}).out;
const ref=computeDecodedRGBA(raw,W,H,{thresh:p.thr,contrast:p.ct,stormAmt:p.storm,softness:p.soft,noiseAmt:p.noise,reliefAmt:p.relief,lightDeg:p.light,mode:'mono'});
same(o,ref)});
it('true colour field matches the original',()=>{const px=fill(W,H,tcol);same(trueField(px,W,H,null),falseRawField(px,W,H))});
it('enhanced IR render matches the original with the enhanced palette',()=>{
const px=fill(W,H,tcol),raw=falseRawField(px,W,H),p=V2_DEF.enh,o=renderEnh(raw,W,H,p,null,{alpha:ones(W*H),bg:'space'}).out;
const ref=computeFalseColorRGBA(raw,W,H,{threshFC:p.thr,contrastFC:p.ct,softnessFC:p.soft,heightFC:p.height,palFC:'enhanced',hiFC:null});
same(o,ref)});
it('enhanced IR matches with rainbow palette, fixed calibration and other settings',()=>{
const px=fill(W,H,storm),raw=rawOf(px),p={thr:0.15,ct:1.4,soft:0,height:0,pal:'classic' as const},o=renderEnh(raw,W,H,p,0.7,{alpha:ones(W*H),bg:'space'}).out;
const ref=computeFalseColorRGBA(raw,W,H,{threshFC:p.thr,contrastFC:p.ct,softnessFC:p.soft,heightFC:p.height,palFC:'classic',hiFC:0.7});
same(o,ref)});
it('calibration from merged histograms matches the original on one frame',()=>{
const raw=rawOf(fill(W,H,storm));expect(hiOf(histOf(raw))).toBe(histHi([raw]));
const a=histOf(raw),m=mergeHist([a,a]);expect(hiOf(m)).toBe(hiOf(a))})});
describe('V2 only adds an alpha mask',()=>{
const job=(view:'real'|'e2',bg:'clear'|'space',src:'cmap'|'vis'='cmap',mask:DecodeIn['mask']=null):DecodeIn=>({w:W,h:H,cur:fill(W,H,src==='vis'?tcol:storm),prev:null,view,thr:-52,native:true,rgb:new Uint8Array(0),btv:new Float32Array(0),src,eng:'v2',v2:{...V2_DEF,bg},mask});
it('colours are identical in transparent and space modes where visible',()=>{
for(const v of ['real','e2'] as const){
const a=runV2(job(v,'space')).out,b=runV2(job(v,'clear')).out;let seen=0;
for(let i=0;i<W*H;i++){if(b[i*4+3]>0){seen++;expect([b[i*4],b[i*4+1],b[i*4+2]]).toEqual([a[i*4],a[i*4+1],a[i*4+2]])}}
expect(seen).toBeGreaterThan(200)}});
it('transparent mode clears the sky and keeps thick cloud opaque',()=>{
const o=runV2(job('real','clear')).out;
expect(o[3]).toBe(0);expect(o[((27*W)+35)*4+3]).toBeGreaterThan(240)});
it('space mode is opaque everywhere there is data',()=>{const o=runV2(job('real','space')).out;for(let i=0;i<W*H;i++)expect(o[i*4+3]).toBe(255)});
it('works for true colour layers',()=>{const r=runV2(job('e2','clear','vis'));expect(r.stats.flag).toBeGreaterThan(100);expect(r.bt.length).toBe(0)});
it('skips no data pixels and the satellite limb',()=>{
const j=job('real','space');for(let i=0;i<100;i++)j.cur[i*4+3]=0;
const r=runV2(j);for(let i=0;i<100;i++)expect(r.out[i*4+3]).toBe(0);
const mk={row:new Float32Array(H).fill(1),col:new Float32Array(W).fill(0.1)};
const l=runV2(job('real','space','cmap',mk));expect(l.stats.valid).toBe(0)});
it('goes through run() with no colormap',()=>{const r=run(job('real','clear'));expect(r.stats.min).toBeNull();expect(r.out.length).toBe(W*H*4)});
it('noise is tied to map position and cached',()=>{
const a=noiseField(5,7,10,10),v=a[1];const b=noiseField(6,7,10,10);expect(b[0]).toBe(v)});
it('cache key changes with every setting',()=>{
const k=v2Key(V2_DEF);expect(v2Key({...V2_DEF,bg:'space'})).not.toBe(k);expect(v2Key({...V2_DEF,enh:{...V2_DEF.enh,height:0.2}})).not.toBe(k);expect(v2Key({...V2_DEF,real:{...V2_DEF.real,light:90}})).not.toBe(k)})});
