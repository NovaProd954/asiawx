import {LAYERS,parseLayer,findIds,resolveDef,buildTileUrl,type LayerInfo,type LayerDef,type TFmt} from './_wmts.js';
export interface ProviderStatus{id:string;name:string;ok:boolean;msg:string}
export interface ProviderResult{layers:LayerInfo[];status:ProviderStatus}
export type Fetcher=(url:string,ms:number)=>Promise<Response>;
export const defaultFetch:Fetcher=(u,ms)=>fetch(u,{signal:AbortSignal.timeout(ms),headers:{'User-Agent':'AsiaWX/2 (+https://github.com/NovaProd954/asiawx)'}});
const GB='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const CAPS=`${GB}/wmts.cgi?SERVICE=WMTS&request=GetCapabilities`;
export const GIBS_ACK="We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).";
const JMA_ACK='Source: Japan Meteorological Agency, Himawari-9';
const RE_ACK='Source: SSEC RealEarth, University of Wisconsin-Madison';
const N=24;
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
const probeUrl=(tpl:string,t:number,f:TFmt)=>buildTileUrl(tpl,t,f).replace('{z}','3').replace('{y}','3').replace('{x}','6').replace('{TileMatrix}','3');
async function probeOne(F:Fetcher,tpl:string,t:number,f:TFmt,min:number):Promise<boolean>{
try{const r=await F(probeUrl(tpl,t,f),7000);if(!r.ok)return false;return(await r.arrayBuffer()).byteLength>=min}catch{return false}}
export async function findNewest(F:Fetcher,tpl:string,f:TFmt,start:number,step:number,steps:number,min:number):Promise<number|null>{
for(let i=0;i<steps;i+=6){
const c:number[]=[];for(let k=i;k<Math.min(steps,i+6);k++)c.push(start-k*step);
const ok=await Promise.all(c.map(t=>probeOne(F,tpl,t,f,min)));
const j=ok.findIndex(Boolean);if(j>=0)return c[j]}
return null}
export async function trimFrames(F:Fetcher,tpl:string,f:TFmt,times:number[],min:number):Promise<number[]>{
const t=times.slice();
for(let k=0;k<3&&t.length>3;k++){if(await probeOne(F,tpl,t[t.length-1],f,min))break;t.pop()}
return t}
const frames=(newest:number,step:number,n:number)=>{const o:number[]=[];for(let k=n-1;k>=0;k--)o.push(newest-k*step);return o};
const minFor=(k:string)=>k==='vis'?200:1200;
function himStatic(def:LayerDef,ext:string):LayerInfo{
const tms='GoogleMapsCompatible_Level6';
return{key:def.key,id:def.id,name:def.name,kind:def.kind,tms,maxzoom:6,format:ext==='png'?'image/png':'image/jpeg',template:`${GB}/${def.id}/default/{Time}/${tms}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`,times:[],step:600}}
export async function gibsProvider(F:Fetcher,now=Date.now()/1000):Promise<ProviderResult>{
const notes:string[]=[];let xml:string|null=null;
const caps=F(CAPS,14000).then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);xml=await r.text()}).catch(e=>{notes.push(`capabilities ${msg(e)}`)});
const start=Math.floor((now-15*60)/600)*600;
const stat=Promise.all(LAYERS.map(async d=>{
for(const ext of['png','jpeg']){
const L=himStatic(d,ext),t=await findNewest(F,L.template,'iso',start,600,36,minFor(d.kind));
if(t!=null){L.times=frames(t,600,N);return L}}
return null}));
const [,st]=await Promise.all([caps,stat]);
const out:LayerInfo[]=[];
const ids=xml?findIds(xml):[];
if(xml&&!ids.length)notes.push(`capabilities (${(xml as string).length} chars) listed no Himawari layers`);
for(let i=0;i<LAYERS.length;i++){
const d=LAYERS[i];let L:LayerInfo|null=null;
if(xml){const dd=resolveDef(d,ids),p=parseLayer(xml,dd,N);if(p){p.times=await trimFrames(F,p.template,'iso',p.times,minFor(d.kind));if(p.times.length)L=p}else notes.push(`${dd.id} not parsed from capabilities`)}
if(!L)L=st[i];
if(L){L.provider='gibs';L.tfmt='iso';L.attribution='Imagery: NASA GIBS, JMA Himawari-9';L.decode=d.kind==='ir';out.push(L)}}
const daily:[string,string,string][]=[['viirs','VIIRS_SNPP_CorrectedReflectance_TrueColor','VIIRS true colour, daily (Suomi NPP)'],['modis','MODIS_Terra_CorrectedReflectance_TrueColor','MODIS true colour, daily (Terra)']];
const day0=Math.floor(now/86400)*86400-86400;
await Promise.all(daily.map(async([key,id,name])=>{
const tpl=`${GB}/${id}/default/{Time}/GoogleMapsCompatible_Level9/{TileMatrix}/{TileRow}/{TileCol}.jpg`;
const t=await findNewest(F,tpl,'date',day0,86400,4,2000);
if(t!=null)out.push({key,id,name,kind:'rgb',tms:'GoogleMapsCompatible_Level9',maxzoom:9,format:'image/jpeg',template:tpl,times:frames(t,86400,7),step:86400,provider:'gibs',tfmt:'date',attribution:'Imagery: NASA GIBS',decode:false})}));
const hasHim=out.some(l=>l.key==='ir'||l.key==='vis'||l.key==='airmass');
const m=out.length?(hasHim?'':'Himawari layers unavailable; ')+notes.join('; '):notes.join('; ')||'no layers responded';
return{layers:out,status:{id:'gibs',name:'NASA GIBS',ok:out.length>0&&hasHim,msg:m}}}
const parse14=(s:string)=>{const m=/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+m[6])/1000:NaN};
export async function jmaProvider(F:Fetcher):Promise<ProviderResult>{
const st=(ok:boolean,m:string):ProviderStatus=>({id:'jma',name:'JMA Himawari',ok,msg:m});
try{
const r=await F('https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json',10000);
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const j=await r.json() as unknown;
const all=(Array.isArray(j)?j:[]).filter((e:any)=>e&&typeof e.validtime==='string'&&e.basetime===e.validtime).map((e:any)=>parse14(e.validtime)).filter(Number.isFinite).sort((a:number,b:number)=>a-b);
const u=[...new Set(all)];
if(!u.length)throw new Error('unexpected time list format');
const defs:[string,string,string,string][]=[['jma-ir','Infrared Band 13 (JMA)','B13/TBB','ir'],['jma-wv','Water vapour Band 8 (JMA)','B08/TBB','wv'],['jma-tc','True colour reproduction (JMA)','REP/ETC','rgb']];
const out:LayerInfo[]=[];
for(const [key,name,path,kind] of defs){
const base=`https://www.jma.go.jp/bosai/himawari/data/satimg/{Time}/fd/{Time}/${path}/{z}/{x}/{y}.jpg`;
const t=await trimFrames(F,base,'jma',u.slice(-N),kind==='rgb'?200:1000);
if(t.length)out.push({key,id:path,name,kind:kind==='ir'||kind==='wv'?'rgb':kind,tms:'XYZ',maxzoom:5,format:'image/jpeg',template:base.replace('https://www.jma.go.jp','/p/jma'),times:t,step:600,provider:'jma',tfmt:'jma',attribution:JMA_ACK,decode:false})}
return{layers:out,status:st(out.length>0,out.length?'':'no tiles returned')}
}catch(e){return{layers:[],status:st(false,msg(e))}}}
export async function realEarthProvider(F:Fetcher,now=Date.now()/1000):Promise<ProviderResult>{
const st=(ok:boolean,m:string):ProviderStatus=>({id:'realearth',name:'SSEC RealEarth',ok,msg:m});
const defs:[string,string,string][]=[['re-ir','globalir','Global infrared composite (SSEC)'],['re-vis','globalvis','Global visible composite (SSEC)']];
const out:LayerInfo[]=[],notes:string[]=[];
await Promise.all(defs.map(async([key,id,name])=>{
try{
const r=await F(`https://realearth.ssec.wisc.edu/api/products?products=${id}&timespan=-12h`,10000);
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const txt=await r.text(),set=new Set<number>();
for(const m of txt.matchAll(/(\d{8})\D{0,14}?(\d{6})(?!\d)/g)){const t=parse14(m[1]+m[2]);if(Number.isFinite(t)&&t<=now+600&&t>now-3*86400)set.add(t)}
const ts=[...set].sort((a,b)=>a-b).slice(-12);
if(ts.length<2)throw new Error('no recent times in response');
const tpl=`https://realearth.ssec.wisc.edu/tiles/${id}/{Time}/{z}/{x}/{y}.png`,t=await trimFrames(F,tpl,'re',ts,1000);
if(!t.length)throw new Error('no tiles returned');
const step=t.length>1?t[t.length-1]-t[t.length-2]:3600;
out.push({key,id,name,kind:'rgb',tms:'XYZ',maxzoom:6,format:'image/png',template:tpl,times:t,step,provider:'realearth',tfmt:'re',attribution:RE_ACK,decode:false})
}catch(e){notes.push(`${id}: ${msg(e)}`)}}));
out.sort((a,b)=>a.key<b.key?1:-1);
return{layers:out,status:st(out.length>0,notes.join('; '))}}
