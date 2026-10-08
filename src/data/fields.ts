import {fetchJson} from '../lib/http';
import type {G2} from '../fields/sample';
export interface RawFields{model:string;run:number|null;lon0:number;lat0:number;d:number;nx:number;ny:number;times:number[];vars:Record<string,(number|null)[][]>;absent:string[];missing:number;fetched:number}
export interface FieldSet{model:string;run:number|null;times:number[];g:G2;vars:Record<string,Float32Array[]>;absent:string[];missing:number;fetched:number}
export function parseFields(r:RawFields):FieldSet{
const n=r.nx*r.ny;
if(!(n>0)||!r.times?.length||!r.vars||typeof r.vars!=='object')throw new Error('Malformed model fields');
const vars:Record<string,Float32Array[]>={};
for(const k of Object.keys(r.vars)){
const fr=r.vars[k];
if(!Array.isArray(fr)||fr.length!==r.times.length)throw new Error('Malformed model fields');
vars[k]=fr.map(a=>{
if(!Array.isArray(a)||a.length!==n)throw new Error('Malformed model fields');
const o=new Float32Array(n);
for(let i=0;i<n;i++){const x=a[i];o[i]=typeof x==='number'&&Number.isFinite(x)?x:NaN}
return o})}
if(!Object.keys(vars).length)throw new Error('Malformed model fields');
return{model:r.model,run:r.run,times:r.times,g:{lon0:r.lon0,lat0:r.lat0,d:r.d,nx:r.nx,ny:r.ny},vars,absent:r.absent??[],missing:r.missing??0,fetched:r.fetched}}
export const loadFields=(model:string,signal:AbortSignal)=>fetchJson<RawFields>('fields',`/api/fields?model=${encodeURIComponent(model)}`,{signal,timeout:60000,retries:1}).then(parseFields);
