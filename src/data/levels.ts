import {fetchJson} from '../lib/http';
import {toUV} from '../lib/wind';
import type {Levels} from '../wind/amv';
export interface RawLevels{model:string;run:number|null;t:number;lon0:number;lat0:number;d:number;nx:number;ny:number;levels:number[];temp:(number|null)[][];spd:(number|null)[][];dir:(number|null)[][];missing:number}
export function parseLevels(r:RawLevels):Levels{
const n=r.nx*r.ny;
if(!(n>0)||!r.levels?.length||r.temp?.length!==r.levels.length||r.spd?.length!==r.levels.length||r.dir?.length!==r.levels.length)throw new Error('Malformed pressure-level data');
const t:Float32Array[]=[],u:Float32Array[]=[],v:Float32Array[]=[];
for(let l=0;l<r.levels.length;l++){
if(r.temp[l].length!==n||r.spd[l].length!==n||r.dir[l].length!==n)throw new Error('Malformed pressure-level data');
const a=new Float32Array(n),b=new Float32Array(n),c=new Float32Array(n);
for(let k=0;k<n;k++){const T=r.temp[l][k],s=r.spd[l][k],d=r.dir[l][k];
if(T==null||s==null||d==null){a[k]=NaN;b[k]=NaN;c[k]=NaN}else{a[k]=T;const p=toUV(s,d);b[k]=p[0];c[k]=p[1]}}
t.push(a);u.push(b);v.push(c)}
return{lon0:r.lon0,lat0:r.lat0,d:r.d,nx:r.nx,ny:r.ny,p:r.levels,t,u,v}}
export const loadLevels=(model:string,t:number,signal?:AbortSignal)=>fetchJson<RawLevels>('levels',`/api/levels?model=${encodeURIComponent(model)}&t=${Math.floor(t/3600)*3600}`,{signal,timeout:30000,retries:1}).then(parseLevels);
