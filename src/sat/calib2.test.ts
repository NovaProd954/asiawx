import {describe,it,expect} from 'vitest';
import {calibrate,type CalibIn} from './decode';
import {shiftRGBA,quantileLut,findShift} from './calib';
const W=220,H=220,N=W*H;
const PAL:[number,number[]][]=[[30,[40,40,40]],[0,[150,150,150]],[-40,[30,30,220]],[-70,[255,255,0]],[-90,[255,255,255]]];
const rgb=Uint8Array.from(PAL.flatMap(p=>p[1])),btv=Float32Array.from(PAL.map(p=>p[0]));
const colour=(bt:number)=>{for(let k=0;k<PAL.length-1;k++){const a=PAL[k],b=PAL[k+1];if(bt<=a[0]&&bt>=b[0]){const f=(a[0]-bt)/(a[0]-b[0]);return a[1].map((v,i)=>Math.round(v+(b[1][i]-v)*f))}}return PAL[PAL.length-1][1]};
const field=(x:number,y:number)=>{const v=0.5+0.28*Math.sin(x/17)+0.22*Math.cos(y/23+x/41)+0.12*Math.sin((x+y)/9);return 30-120*Math.max(0,Math.min(1,v))};
const job=(sx:number,sy:number,lumOf:(bt:number)=>number):CalibIn=>{
const ref=new Uint8ClampedArray(N*4),src=new Uint8ClampedArray(N*4);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,c=colour(field(x,y));ref[i]=c[0];ref[i+1]=c[1];ref[i+2]=c[2];ref[i+3]=255;
const l=Math.max(0,Math.min(255,Math.round(lumOf(field(x+sx,y+sy)))));src[i]=l;src[i+1]=l;src[i+2]=l;src[i+3]=255}
return{w:W,h:H,src,ref,rgb,btv,mask:{row:new Float32Array(H).fill(1),col:new Float32Array(W).fill(1)}}};
const lum=(bt:number)=>255*Math.pow((30-bt)/120,1.12);
describe('JMA to GIBS calibration under misalignment',()=>{
it('aligned images give an exact monotone fit',()=>{
const f=calibrate(job(0,0,lum));expect(f.ok).toBe(true);expect(f.approx).toBeFalsy();expect(f.rms).toBeLessThan(3.5)});
it('finds a few pixels of offset and still calibrates',()=>{
const f=calibrate(job(3,-2,lum));
expect(f.ok).toBe(true);
expect(Math.abs((f.sx??0)+3)).toBeLessThanOrEqual(1);expect(Math.abs((f.sy??0)-2)).toBeLessThanOrEqual(1);
expect(f.rms).toBeLessThan(5)});
it('a larger offset falls back to a distribution match instead of failing',()=>{
const f=calibrate(job(7,6,lum));
expect(f.ok).toBe(true);expect(f.lut[0]).toBeGreaterThan(f.lut[255]);
for(let l=1;l<256;l++)expect(f.lut[l]).toBeLessThanOrEqual(f.lut[l-1]+1e-4)});
it('a distribution match tracks the true scale closely',()=>{
const j=job(7,6,lum),f=calibrate(j);
for(const bt of [20,-10,-50,-80]){const l=Math.round(lum(bt));expect(Math.abs(f.lut[l]-bt)).toBeLessThan(9)}});
it('still rejects an unrelated image',()=>{
const j=job(0,0,lum);for(let i=0;i<N;i++){const v=(i*2654435761>>>0)%256;j.src[i*4]=v;j.src[i*4+1]=v;j.src[i*4+2]=v}
expect(calibrate(j).ok).toBe(false)});
it('shifts an RGBA image and leaves the exposed edge empty',()=>{
const s=new Uint8ClampedArray([1,1,1,255,2,2,2,255,3,3,3,255,4,4,4,255]),o=shiftRGBA(s,2,2,1,0);
expect([...o]).toEqual([2,2,2,255,0,0,0,0,4,4,4,255,0,0,0,0]);
expect(shiftRGBA(s,2,2,0,0)).toBe(s)});
it('quantile and shift helpers behave on trivial input',()=>{
expect(quantileLut(new Float64Array(256),new Float32Array(10),new Uint8ClampedArray(40),1)).toBeNull();
const s=new Uint8ClampedArray(N*4),bt=new Float32Array(N).fill(NaN);
expect(findShift(s,bt,W,H).sx).toBe(0)})});
