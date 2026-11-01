import {describe,it,expect} from 'vitest';
import {runFuse,runAny,composite} from './fuse';
import type {DecodeIn} from './decode';
const W=64,H=64,N=W*H;
const PAL=[[30,[40,40,40]],[0,[150,150,150]],[-40,[30,30,220]],[-70,[255,255,0]],[-90,[255,255,255]]] as [number,number[]][];
const rgb=Uint8Array.from(PAL.flatMap(p=>p[1])),btv=Float32Array.from(PAL.map(p=>p[0]));
const lum=new Float32Array(256);for(let l=0;l<256;l++)lum[l]=30-l*(120/255);
const blob=(x:number,y:number)=>x>=20&&x<44&&y>=20&&y<44;
function gibs(){const p=new Uint8ClampedArray(N*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,c=blob(x,y)?PAL[3][1]:PAL[0][1];p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2];p[i+3]=255}return p}
function jma(){const p=new Uint8ClampedArray(N*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4,l=blob(x,y)?200:10;p[i]=l;p[i+1]=l;p[i+2]=l;p[i+3]=255}return p}
const base=(o:Partial<DecodeIn>={}):DecodeIn=>({w:W,h:H,cur:gibs(),cur2:jma(),prev:null,view:'fuse',thr:-52,native:false,rgb,btv,lum,src:'cmap',smooth:1,scale:1,ppd:11.4,eng:'v1',fuse:{top:0.5},...o});
const at=(r:{out:Uint8ClampedArray},x:number,y:number)=>{const p=(y*W+x)*4;return[...r.out.slice(p,p+4)]};
describe('fused IR',()=>{
it('drops the warm background and keeps cold cloud, same size output',()=>{
const r=runFuse(base());
expect(r.ow).toBe(W);expect(r.oh).toBe(H);
expect(at(r,5,5)[3]).toBe(0);
expect(at(r,32,32)[3]).toBeGreaterThan(240);
expect(r.stats.flag).toBeGreaterThan(400);
expect(r.stats.valid).toBe(N)});
it('JMA is on top: top=0 shows only Clean IR colours, top=1 shows JMA grey',()=>{
const a=at(runFuse(base({fuse:{top:0}})),32,32),b=at(runFuse(base({fuse:{top:1}})),32,32),m=at(runFuse(base({fuse:{top:0.5}})),32,32);
expect(a.slice(0,3)).toEqual([255,255,0]);
expect(b.slice(0,3)).toEqual([200,200,200]);
expect(m[0]).toBeGreaterThan(200);expect(m[0]).toBeLessThan(255);expect(m[2]).toBeGreaterThan(90);expect(m[2]).toBeLessThan(120)});
it('still draws when one source is missing and says so through the stats',()=>{
const onlyG=runFuse(base({cur2:null})),onlyJ=runFuse(base({rgb:new Uint8Array(0),btv:new Float32Array(0)}));
expect(at(onlyG,32,32).slice(0,3)).toEqual([255,255,0]);
expect(at(onlyJ,32,32).slice(0,3)).toEqual([200,200,200]);
expect(at(onlyJ,5,5)[3]).toBe(0)});
it('pixels outside the disk mask stay transparent',()=>{
const mask={row:new Float32Array(H).fill(1),col:new Float32Array(W).fill(0.1)};
const r=runFuse(base({mask}));
expect(r.stats.valid).toBe(0);expect(at(r,32,32)[3]).toBe(0)});
it('composite is a straight-alpha over operation',()=>{
const cb=new Uint8ClampedArray([0,0,255,255]),ct=new Uint8ClampedArray([255,0,0,255]);
const r=composite(cb,Float32Array.of(1),ct,Float32Array.of(1),0.5,null,1);
expect([...r.out]).toEqual([128,0,128,255]);
const s=composite(cb,Float32Array.of(0.5),ct,Float32Array.of(0),1,null,1);
expect([...s.out]).toEqual([0,0,255,128])});
it('runAny only routes to the fused engine when asked',()=>{
expect(runAny(base()).stats.flag).toBeGreaterThan(400);
const v=runAny({...base(),fuse:null,cur2:null,view:'enh'});expect(v.out.length).toBe(N*4)})});
