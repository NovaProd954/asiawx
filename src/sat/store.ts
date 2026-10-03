export const CACHE='asiawx-sat-v1';
export const SAT_RE=/^https:\/\/(gibs\.earthdata\.nasa\.gov\/wmts\/|realearth\.ssec\.wisc\.edu\/tiles\/)/;
export const isSatUrl=(u:string,origin:string)=>SAT_RE.test(u)||u.startsWith(origin+'/p/jma/');
export const supported=()=>typeof caches!=='undefined'&&'serviceWorker' in navigator;
export interface CacheInfo{n:number;bytes:number}
export async function cacheInfo():Promise<CacheInfo|null>{
if(typeof caches==='undefined')return null;
try{
const c=await caches.open(CACHE),ks=await c.keys();
let sum=0,m=0;
for(const k of ks.slice(-30)){const r=await c.match(k);if(r){sum+=(await r.blob()).size;m++}}
return{n:ks.length,bytes:m?Math.round(sum/m*ks.length):0}
}catch{return null}}
export async function clearCache():Promise<void>{if(typeof caches!=='undefined')await caches.delete(CACHE)}
export async function keepStorage():Promise<void>{try{await navigator.storage?.persist?.()}catch{}}
export const fmtBytes=(b:number)=>b>=1048576?`${(b/1048576).toFixed(0)} MB`:`${Math.max(1,Math.round(b/1024))} KB`;
export function registerSW(){if(typeof navigator!=='undefined'&&'serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})})}
