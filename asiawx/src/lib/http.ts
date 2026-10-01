export interface Health{ok:boolean|null;lastOk:number|null;err:string|null;ms:number|null}
export const health=new Map<string,Health>();
const inflight=new Map<string,Promise<unknown>>();
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function mark(k:string,ok:boolean,ms:number,err:string|null){const p=health.get(k);health.set(k,{ok,lastOk:ok?Date.now():p?.lastOk??null,err,ms:Math.round(ms)})}
interface Opt{timeout?:number;retries?:number;signal?:AbortSignal}
async function run<T>(key:string,url:string,o:Opt):Promise<T>{
const n=o.retries??2;let last:unknown;
for(let i=0;i<=n;i++){
const t0=performance.now(),ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),o.timeout??15000);
try{
const r=await fetch(url,{signal:o.signal?AbortSignal.any([o.signal,ctl.signal]):ctl.signal});
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const j=await r.json() as T;mark(key,true,performance.now()-t0,null);return j
}catch(e){
if(o.signal?.aborted)throw e;
last=e;mark(key,false,performance.now()-t0,e instanceof Error?e.message:String(e));
if(i<n)await sleep(500*2**i)
}finally{clearTimeout(to)}}
throw last}
export function fetchJson<T>(key:string,url:string,o:Opt={}):Promise<T>{
if(!o.signal){const h=inflight.get(url) as Promise<T>|undefined;if(h)return h}
const p=run<T>(key,url,o);
if(!o.signal){inflight.set(url,p);p.then(()=>inflight.delete(url),()=>inflight.delete(url))}
return p}
