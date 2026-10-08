export const FVARS=['temperature_2m','pressure_msl','precipitation','cloud_cover','wind_gusts_10m','relative_humidity_2m','cape'] as const;
export const STEP=3;
const Q:Record<string,number>={temperature_2m:1,pressure_msl:1,precip3:2,cloud_cover:0,wind_gusts_10m:1,relative_humidity_2m:0,cape:0};
export const OUT_VARS=['temperature_2m','pressure_msl','precip3','cloud_cover','wind_gusts_10m','relative_humidity_2m','cape'] as const;
export interface FieldsOut{times:number[];vars:Record<string,(number|null)[][]>;absent:string[];missing:number}
const fin=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const rd=(x:number,d:number)=>{const k=10**d;return Math.round(x*k)/k};
export function buildFields(times:number[],cells:(any|null)[]):FieldsOut{
const n=cells.length,frames:number[]=[];
for(let i=0;i<times.length;i+=STEP)frames.push(i);
const vars:Record<string,(number|null)[][]>={};
for(const v of OUT_VARS)vars[v]=frames.map(()=>new Array(n).fill(null));
let missing=0;
cells.forEach((c,k)=>{
const h=c?.hourly;
if(!h||!Array.isArray(h.time)||h.time.length!==times.length){missing++;return}
frames.forEach((hi,f)=>{
for(const v of FVARS){
const a=h[v];
if(!Array.isArray(a)||a.length!==times.length)continue;
if(v==='precipitation'){
let s=0,ok=true;
for(let q=Math.max(0,hi-STEP+1);q<=hi;q++){if(!fin(a[q])){ok=false;break}s+=a[q]}
if(ok)vars.precip3[f][k]=rd(s,Q.precip3);
continue}
const x=a[hi];
if(fin(x))vars[v][f][k]=rd(x,Q[v])}})});
const absent=OUT_VARS.filter(v=>vars[v].every(fr=>fr.every(x=>x==null)));
for(const v of absent)delete vars[v];
return{times:frames.map(i=>times[i]),vars,absent:[...absent],missing}}
