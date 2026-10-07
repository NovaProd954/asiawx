import polygonClipping from 'polygon-clipping';
import {dest} from './geo';
import type {Quad,JtFix} from '../../api/_tc';
const NM=1852;
type Pt=[number,number];
export type RKey='r34'|'r50'|'r64';
export function quadRing(lat:number,lon:number,q:Quad):Pt[]{
const o:Pt[]=[];
for(let i=0;i<4;i++)for(let k=0;k<=15;k++)o.push(dest(lat,lon,i*90+k*6,q[i]*NM));
o.push(o[0]);return o}
const cross=(o:Pt,a:Pt,b:Pt)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
export function hull(p:Pt[]):Pt[]{
const s=[...p].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
if(s.length<3)return s;
const lo:Pt[]=[],up:Pt[]=[];
for(const x of s){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],x)<=0)lo.pop();lo.push(x)}
for(const x of[...s].reverse()){while(up.length>1&&cross(up[up.length-2],up[up.length-1],x)<=0)up.pop();up.push(x)}
lo.pop();up.pop();
const h=[...lo,...up];h.push(h[0]);return h}
const has=(f:JtFix,k:RKey)=>!!f[k]&&Math.max(...(f[k] as Quad))>0;
export function envelope(fx:JtFix[],k:RKey):Pt[][][]|null{
const rings=fx.map(f=>has(f,k)?quadRing(f.lat,f.lon,f[k] as Quad):null);
const polys:Pt[][][]=[];
for(let i=0;i<fx.length;i++){
const a=rings[i];if(!a)continue;
polys.push([a]);
const b=rings[i+1];
if(b)polys.push([hull([...a,...b])])}
if(!polys.length)return null;
try{const u=polygonClipping.union(polys[0] as never,...(polys.slice(1) as never[]));return u.length?u as Pt[][][]:null}
catch{return null}}
export const radiiFor=(f:JtFix,k:RKey)=>has(f,k)?quadRing(f.lat,f.lon,f[k] as Quad):null;
