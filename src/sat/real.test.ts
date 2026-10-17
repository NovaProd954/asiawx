import {describe,it,expect} from 'vitest';
import {intensityOf,renderReal,noiseField,REAL_DEF,realKey} from './real';
import {run} from './decode';
const fill=(w:number,h:number,f:(x:number,y:number)=>number[])=>{const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set(f(x,y),(y*w+x)*4);return a};
const grey=()=>[120,120,120,255];
const storm=(x:number,y:number)=>{const d=Math.hypot(x-24,y-24);return d<8?[200,30,150,255]:d<14?[230,40,40,255]:d<20?[240,220,50,255]:d<26?[60,200,90,255]:[110,110,110,255]};
describe('V2 colour intensity',()=>{
it('treats grey as thin and cold palette colours as thick',()=>{
expect(intensityOf(120,120,120)).toBeLessThan(0.1);
expect(intensityOf(200,30,150)).toBeGreaterThan(0.6);
expect(intensityOf(230,40,40)).toBeGreaterThan(intensityOf(60,200,90));
expect(intensityOf(60,200,90)).toBeGreaterThan(intensityOf(60,120,230))});
it('stays within 0 to 1',()=>{for(let i=0;i<200;i++){const v=intensityOf((i*37)%256,(i*91)%256,(i*53)%256);expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(1)}})});
describe('V2 renderer',()=>{
it('makes clear grey sky transparent and cloud opaque',()=>{
const r=renderReal(fill(8,8,grey),8,8,REAL_DEF);
expect(r.flag).toBe(0);
for(let i=3;i<r.out.length;i+=4)expect(r.out[i]).toBe(0);
const s=renderReal(fill(48,48,storm),48,48,REAL_DEF);
expect(s.flag).toBeGreaterThan(300);
expect(s.out[(24*48+24)*4+3]).toBeGreaterThan(200);
expect(s.out[3]).toBe(0)});
it('skips transparent source pixels',()=>{const a=fill(6,6,()=>[230,40,40,0]);const r=renderReal(a,6,6,REAL_DEF);expect(r.valid).toBe(0);expect(r.flag).toBe(0)});
it('doubles the output size at scale 2',()=>{const r=renderReal(fill(20,10,storm),20,10,REAL_DEF,{scale:2});expect(r.ow).toBe(40);expect(r.oh).toBe(20);expect(r.out.length).toBe(40*20*4)});
it('is deterministic and noise follows the map position, not the tile',()=>{
const a=renderReal(fill(48,48,storm),48,48,REAL_DEF,{ox:1000,oy:500}),b=renderReal(fill(48,48,storm),48,48,REAL_DEF,{ox:1000,oy:500}),c=renderReal(fill(48,48,storm),48,48,REAL_DEF,{ox:1010,oy:500});
expect(Array.from(a.out)).toEqual(Array.from(b.out));
expect(Array.from(a.out)).not.toEqual(Array.from(c.out));
const n1=noiseField(5,7,10,10,1),n2=noiseField(6,7,10,10,1);
expect(n1[1]).toBeCloseTo(n2[0],6)});
it('supports the monochrome palette and zero noise',()=>{
const r=renderReal(fill(48,48,storm),48,48,{...REAL_DEF,pal:'mono',noise:0});
const q=(24*48+24)*4;expect(r.out[q]).toBe(r.out[q+1]);expect(r.out[q+1]).toBe(r.out[q+2])});
it('drops pixels beyond the satellite limb',()=>{
const mask={row:new Float32Array(48).fill(1),col:new Float32Array(48).fill(0.1)};
const r=renderReal(fill(48,48,storm),48,48,REAL_DEF,{mask});expect(r.flag).toBe(0);expect(r.valid).toBe(0)});
it('changes the cache key when a setting changes',()=>{expect(realKey(REAL_DEF)).not.toBe(realKey({...REAL_DEF,soft:3}))})});
describe('V2 through run()',()=>{
it('decodes with no colormap and no temperatures',()=>{
const r=run({w:48,h:48,cur:fill(48,48,storm),prev:null,view:'real',thr:-52,native:true,rgb:new Uint8Array(0),btv:new Float32Array(0),src:'cmap',eng:'v2',real:REAL_DEF});
expect(r.bt.length).toBe(0);expect(r.stats.min).toBeNull();expect(r.stats.flag).toBeGreaterThan(300);expect(r.out.length).toBe(48*48*4)})});
