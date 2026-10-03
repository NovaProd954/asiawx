const V='asiawx-sat-v1',MAX=2600,AGE=48*3600*1000;
const HOSTS=/^https:\/\/(gibs\.earthdata\.nasa\.gov\/wmts\/|realearth\.ssec\.wisc\.edu\/tiles\/)/;
const own=u=>u.origin===self.location.origin&&u.pathname.startsWith('/p/jma/');
let puts=0;
self.addEventListener('install',()=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('asiawx-sat-')&&k!==V)await caches.delete(k);await self.clients.claim()})())});
self.addEventListener('fetch',e=>{
const r=e.request;
if(r.method!=='GET')return;
const u=new URL(r.url);
if(!(own(u)||HOSTS.test(r.url)))return;
e.respondWith(handle(r))});
async function trim(c){
const ks=await c.keys(),now=Date.now();
const over=ks.length-MAX;
if(over>0)for(const k of ks.slice(0,over+200))await c.delete(k);
for(const k of ks.slice(Math.max(0,over),Math.max(0,over)+60)){
const h=await c.match(k);
const t=h?+h.headers.get('x-cached-at'):0;
if(h&&t&&now-t>AGE)await c.delete(k)}}
async function handle(r){
const c=await caches.open(V),hit=await c.match(r.url);
if(hit)return hit;
const res=await fetch(r);
if(res.ok&&res.status===200&&res.type!=='opaque'){
try{
const b=await res.clone().blob();
if(b.size>=300){
await c.put(r.url,new Response(b,{status:200,headers:{'content-type':res.headers.get('content-type')||b.type||'image/png','x-cached-at':String(Date.now())}}));
if(++puts%40===0)trim(c)}
}catch{}}
return res}
