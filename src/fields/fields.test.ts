import {describe,it,expect} from 'vitest';
import {buildFields} from '../../api/_fields';
import {sampleCR,merc,invMerc,mix,fillGaps,type G2} from './sample';
import {makeLut,FDEFS,fdef,legendCss,legendPos,neutralRamp} from './defs';
import {renderRaster,rasterSize,extentOf} from './render';
import {contourLevel,contours,fineGrid,extrema,chaikin} from './contour';
import {bracket,fieldValues,nearestFrame} from './values';
import {parseFields,type FieldSet} from '../data/fields';
const T0=Date.UTC(2026,9,8)/1000,TS=Array.from({length:48},(_,i)=>T0+i*3600);
const cell=(f:(h:number)=>number|null)=>({hourly:{time:TS,temperature_2m:TS.map((_,h)=>f(h)),pressure_msl:TS.map(()=>1010.04),precipitation:TS.map((_,h)=>h),cloud_cover:TS.map(()=>55.4),wind_gusts_10m:TS.map(()=>9),relative_humidity_2m:TS.map(()=>70),cape:TS.map(()=>null)}});
describe('buildFields',()=>{
const r=buildFields(TS,[cell(h=>20+h/10),cell(h=>h===6?null:25),null]);
it('keeps every third hour as a frame',()=>{expect(r.times.length).toBe(16);expect(r.times[1]).toBe(T0+3*3600);expect(r.vars.temperature_2m.length).toBe(16);expect(r.vars.temperature_2m[1].length).toBe(3)});
it('rounds and keeps nulls where the provider had none',()=>{expect(r.vars.temperature_2m[1][0]).toBe(20.3);expect(r.vars.temperature_2m[2][1]).toBeNull();expect(r.vars.pressure_msl[0][0]).toBe(1010);expect(r.vars.cloud_cover[0][0]).toBe(55)});
it('sums rain over the 3 hours ending at the frame',()=>{expect(r.vars.precip3[0][0]).toBe(0);expect(r.vars.precip3[2][0]).toBe(4+5+6);expect(r.vars.precip3[1][0]).toBe(1+2+3)});
it('drops variables the model did not provide and counts missing cells',()=>{expect(r.absent).toEqual(['cape']);expect(r.vars.cape).toBeUndefined();expect(r.missing).toBe(1);expect(r.vars.temperature_2m[0][2]).toBeNull()});
it('refuses rain sums with gaps',()=>{const c=cell(()=>1);(c.hourly.precipitation as (number|null)[])[4]=null;const b=buildFields(TS,[c]).vars.precip3;expect(b[2][0]).toBeNull();expect(b[1][0]).toBe(6);expect(b[3][0]).toBe(7+8+9)});
it('treats a cell with a wrong time axis as missing',()=>{const c=cell(()=>1);c.hourly.time=TS.slice(1);expect(buildFields(TS,[c]).missing).toBe(1)})});
const G:G2={lon0:0,lat0:0,d:4,nx:6,ny:5};
const lin=(f:(lon:number,lat:number)=>number)=>{const v=new Float32Array(G.nx*G.ny);for(let j=0;j<G.ny;j++)for(let i=0;i<G.nx;i++)v[j*G.nx+i]=f(i*G.d,j*G.d);return v};
describe('Catmull-Rom sampling',()=>{
it('reproduces a plane exactly, including at the edges',()=>{const v=lin((x,y)=>2*x-3*y+7);for(const [x,y] of [[0,0],[3.3,5.1],[19.9,15.2],[20,16],[10,8]])expect(sampleCR(G,v,x,y)).toBeCloseTo(2*x-3*y+7,3)});
it('passes through grid nodes',()=>{const v=lin((x,y)=>Math.sin(x)*10+y);expect(sampleCR(G,v,8,4)).toBeCloseTo(v[1*G.nx+2],4)});
it('is NaN outside the grid',()=>{const v=lin(()=>1);expect(sampleCR(G,v,-0.1,2)).toBeNaN();expect(sampleCR(G,v,5,16.1)).toBeNaN()});
it('falls back to bilinear next to a gap and NaN inside one',()=>{const v=lin(()=>5);v[3*G.nx+5]=NaN;expect(sampleCR(G,v,2,2)).toBeCloseTo(5,5);v[1*G.nx+1]=NaN;expect(sampleCR(G,v,5,5)).toBeNaN()});
it('mixes frames and fills small gaps without touching valid cells',()=>{const a=Float32Array.of(0,10),b=Float32Array.of(10,20);expect(Array.from(mix(a,b,.25))).toEqual([2.5,12.5]);const g=lin(()=>3);g[7]=NaN;const f=fillGaps(G,g);expect(f[7]).toBeCloseTo(3,5);expect(f[0]).toBe(3)});
it('mercator is invertible',()=>{for(const l of [-12,0,14.6,45,80])expect(invMerc(merc(l))).toBeCloseTo(l,6)})});
describe('colour ramps',()=>{
const t=FDEFS.find(d=>d.k==='temp')!,lut=makeLut(t.stops(true),t.vmin,t.vmax,512);
it('hits stop colours at stop values',()=>{const i=Math.round((0-t.vmin)/(t.vmax-t.vmin)*511);expect(Math.abs(lut[i*4]-0x3f)).toBeLessThan(6);expect(Math.abs(lut[i*4+2]-0xe6)).toBeLessThan(6)});
it('leaves rain and CAPE clear below their thresholds',()=>{for(const k of ['rain3','rain24','cape']){const d=fdef(k)!,l=makeLut(d.stops(true),d.vmin,d.vmax);const n=l.length/4,at=(v:number)=>l[Math.round((v-d.vmin)/(d.vmax-d.vmin)*(n-1))*4+3];expect(at(d.vmin)).toBe(0);expect(at(d.vmin+(d.vmax-d.vmin)*0.0005)).toBe(0);expect(at(d.vmax)).toBeGreaterThan(150)}});
it('every layer has increasing stops inside its range and a legend',()=>{for(const d of FDEFS){const s=d.stops(true);for(let i=1;i<s.length;i++)expect(s[i][0]).toBeGreaterThan(s[i-1][0]);expect(s[0][0]).toBeGreaterThanOrEqual(d.vmin);expect(s[s.length-1][0]).toBeLessThanOrEqual(d.vmax);expect(legendCss(d,false)).toContain('linear-gradient');expect(d.ticks[0]).toBeGreaterThanOrEqual(d.vmin);for(let i=1;i<d.ticks.length;i++)expect(d.ticks[i]).toBeGreaterThan(d.ticks[i-1]);expect(d.ticks[d.ticks.length-1]).toBeLessThanOrEqual(d.vmax)}});
it('cloud ramp differs by base map and wind goes neutral',()=>{const c=fdef('cloud')!;expect(c.stops(true)[2][1]).not.toBe(c.stops(false)[2][1]);expect(neutralRamp(true)[0][1]).toBe('#ffffff')});
it('places legend ticks by stop order so rain is readable',()=>{const r=fdef('rain3')!;const p=r.ticks.map(t=>legendPos(r,t,true));for(let i=1;i<p.length;i++)expect(p[i]-p[i-1]).toBeGreaterThan(8);expect(legendPos(r,1e9,true)).toBe(100);expect(legendPos(r,-1,true)).toBe(0);for(const d of FDEFS){const q=d.ticks.map(t=>legendPos(d,t,true));for(let i=1;i<q.length;i++)expect(q[i]-q[i-1]).toBeGreaterThan(6)}});
it('layer keys are unique',()=>{expect(new Set(FDEFS.map(d=>d.k)).size).toBe(FDEFS.length)})});
describe('raster rendering',()=>{
const GG:G2={lon0:24,lat0:-12,d:4,nx:40,ny:24};
it('sizes the raster in Mercator space',()=>{const e=extentOf(GG),s=rasterSize(e,4);expect(e.lon1).toBe(180);expect(e.lat1).toBe(80);expect(s.w).toBe(624);expect(s.h).toBeGreaterThan(560);expect(s.h).toBeLessThan(640)});
it('places latitudes by Mercator row, not linearly',()=>{
const v=new Float32Array(GG.nx*GG.ny);for(let j=0;j<GG.ny;j++)for(let i=0;i<GG.nx;i++)v[j*GG.nx+i]=GG.lat0+j*GG.d;
const lut=new Uint8ClampedArray(1024);for(let i=0;i<256;i++){lut[i*4]=i;lut[i*4+3]=255}
const {w,h}=rasterSize(extentOf(GG),2),px=renderRaster(GG,v,lut,-12,80,w,h);
const yT=merc(80),yB=merc(-12),row=Math.round((yT-merc(40))/(yT-yB)*h-0.5),got=px[(row*w+Math.floor(w/2))*4]/255*92-12;
expect(got).toBeGreaterThan(38.5);expect(got).toBeLessThan(41.5)});
it('draws nothing where the field is NaN and clamps overshoot',()=>{
const v=new Float32Array(GG.nx*GG.ny).fill(NaN);const lut=new Uint8ClampedArray(8).fill(255);
const px=renderRaster(GG,v,lut,0,1,20,20);expect(px.every(x=>x===0)).toBe(true);
const v2=new Float32Array(GG.nx*GG.ny).fill(5);const l2=new Uint8ClampedArray([0,0,0,255,9,9,9,255]);
const p2=renderRaster(GG,v2,l2,0,1,10,10,0,1);expect(p2[0]).toBe(9)})});
describe('contours',()=>{
const C:G2={lon0:0,lat0:0,d:1,nx:21,ny:21},cone=new Float32Array(441);
for(let j=0;j<21;j++)for(let i=0;i<21;i++)cone[j*21+i]=Math.hypot(i-10,j-10);
const f={g:C,v:cone};
it('closes a loop around a minimum at the right radius',()=>{const l=contourLevel(f,5);expect(l.length).toBe(1);expect(l[0].closed).toBe(true);for(const p of l[0].pts)expect(Math.hypot(p[0]-10,p[1]-10)).toBeGreaterThan(4.6);for(const p of l[0].pts)expect(Math.hypot(p[0]-10,p[1]-10)).toBeLessThan(5.2)});
it('returns an open line across a plane',()=>{const v=new Float32Array(441);for(let j=0;j<21;j++)for(let i=0;i<21;i++)v[j*21+i]=i;const l=contourLevel({g:C,v},7.5);expect(l.length).toBe(1);expect(l[0].closed).toBe(false);expect(l[0].pts.every(p=>Math.abs(p[0]-7.5)<1e-6)).toBe(true);expect(l[0].pts.length).toBe(21)});
it('handles a saddle without crossing lines',()=>{const g:G2={lon0:0,lat0:0,d:1,nx:2,ny:2},l=contourLevel({g,v:Float32Array.of(10,0,0,10)},5);expect(l.length).toBe(2)});
it('skips cells with gaps',()=>{const v=Float32Array.from(cone);v[10*21+10]=NaN;expect(()=>contourLevel({g:C,v},5)).not.toThrow()});
it('labels levels and flags majors',()=>{const fc=contours(f,2,10,l=>String(l)) as {features:{properties:{label:string;major:number}}[]};const ls=fc.features.map(x=>x.properties.label);expect(ls).toContain('10');expect(fc.features.find(x=>x.properties.label==='10')?.properties.major).toBe(1);expect(fc.features.find(x=>x.properties.label==='4')?.properties.major).toBe(0)});
it('returns nothing for a flat field',()=>{expect((contours({g:C,v:new Float32Array(441).fill(3)},1,5,String) as {features:unknown[]}).features.length).toBe(0)});
it('smoothing keeps open endpoints and closes loops',()=>{const o=chaikin([[0,0],[1,1],[2,0]],false);expect(o[0]).toEqual([0,0]);expect(o[o.length-1]).toEqual([2,0]);const c=chaikin([[0,0],[1,0],[1,1],[0,0]],true);expect(c[0]).toEqual(c[c.length-1])});
it('builds a fine grid from a coarse one',()=>{const g:G2={lon0:0,lat0:0,d:4,nx:6,ny:5},v=new Float32Array(30);for(let j=0;j<5;j++)for(let i=0;i<6;i++)v[j*6+i]=i*4;const fg=fineGrid(g,v,1);expect(fg.g.nx).toBe(21);expect(fg.g.ny).toBe(17);expect(fg.v[3]).toBeCloseTo(3,3)})});
describe('pressure centres',()=>{
const C:G2={lon0:0,lat0:0,d:1,nx:60,ny:40},v=new Float32Array(2400);
for(let j=0;j<40;j++)for(let i=0;i<60;i++)v[j*60+i]=1012+14*Math.exp(-((i-15)**2+(j-20)**2)/40)-12*Math.exp(-((i-45)**2+(j-20)**2)/40);
it('finds a broad high whose centre is only gently higher than its surroundings',()=>{const w=new Float32Array(2400);for(let j=0;j<40;j++)for(let i=0;i<60;i++)w[j*60+i]=1010+11*Math.exp(-((i-30)**2/(2*28**2)+(j-20)**2/(2*9**2)));const e=extrema({g:C,v:w});expect(e.filter(x=>x.t==='H').length).toBe(1)});
it('finds one high and one low with their values',()=>{const e=extrema({g:C,v});expect(e.length).toBe(2);const h=e.find(x=>x.t==='H')!,l=e.find(x=>x.t==='L')!;expect(h.lon).toBe(15);expect(l.lon).toBe(45);expect(h.v).toBeCloseTo(1026,0);expect(l.v).toBeCloseTo(1000,0)});
it('ignores a flat field and tiny wiggles',()=>{expect(extrema({g:C,v:new Float32Array(2400).fill(1010)}).length).toBe(0);const w=new Float32Array(2400);for(let k=0;k<2400;k++)w[k]=1010+0.3*Math.sin(k);expect(extrema({g:C,v:w}).length).toBe(0)})});
const set=(n:number):FieldSet=>({model:'m',run:null,times:Array.from({length:n},(_,i)=>T0+i*10800),g:{lon0:0,lat0:0,d:4,nx:2,ny:1},vars:{temperature_2m:Array.from({length:n},(_,i)=>Float32Array.of(i*10,i*10+1)),precip3:Array.from({length:n},()=>Float32Array.of(2,0))},absent:[],missing:0,fetched:0});
describe('values over time',()=>{
const s=set(4),T=FDEFS.find(d=>d.k==='temp')!,R3=FDEFS.find(d=>d.k==='rain3')!,R24=FDEFS.find(d=>d.k==='rain24')!;
it('brackets and clamps times',()=>{expect(bracket(s.times,T0-5)).toEqual({i:0,j:0,w:0});expect(bracket(s.times,T0+99999999).i).toBe(3);const b=bracket(s.times,T0+10800*1.5);expect(b.i).toBe(1);expect(b.j).toBe(2);expect(b.w).toBeCloseTo(.5,6)});
it('interpolates continuous fields between model steps',()=>{expect(fieldValues(s,T,T0+10800*1.5)?.vals[0]).toBeCloseTo(15,5)});
it('uses the nearest step for rain totals',()=>{const r=fieldValues(s,R3,T0+10800*1.2);expect(r?.frame).toBe(1);expect(nearestFrame(s.times,T0+10800*1.6)).toBe(2)});
it('sums the next 24 hours of rain steps and reports coverage',()=>{const r=fieldValues(set(12),R24,T0)!;expect(r.vals[0]).toBe(16);expect(r.hours).toBe(24);const e=fieldValues(set(12),R24,T0+10800*9)!;expect(e.hours).toBe(6);expect(e.vals[0]).toBe(4);expect(fieldValues(set(12),R24,T0+10800*20)).toBeNull()});
it('returns null for a variable the model lacks',()=>{expect(fieldValues(s,fdef('cape')!,T0)).toBeNull()})});
describe('parseFields',()=>{
const raw=(o:Record<string,unknown>={})=>({model:'m',run:null,lon0:0,lat0:0,d:4,nx:2,ny:1,times:[1,2],vars:{temperature_2m:[[1,null],[2,3]]},absent:[],missing:0,fetched:0,...o}) as never;
it('converts nulls to NaN',()=>{const p=parseFields(raw());expect(p.vars.temperature_2m[0][1]).toBeNaN();expect(p.vars.temperature_2m[1][1]).toBe(3)});
it('rejects malformed payloads',()=>{expect(()=>parseFields(raw({vars:{temperature_2m:[[1,2]]}}))).toThrow();expect(()=>parseFields(raw({vars:{temperature_2m:[[1],[2]]}}))).toThrow();expect(()=>parseFields(raw({vars:{}}))).toThrow()})});
