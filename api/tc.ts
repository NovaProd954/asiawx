import {normJma,normGdacs,normHko,matchGdacs,type TcPayload,type SrcStat,type Storm,type Gdacs,type Warn} from './_tc.js';
const J='https://www.jma.go.jp/bosai/typhoon/data/';
const GD='https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Green;Orange;Red&pageSize=100';
const HK='https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en';
const H={'user-agent':'AsiaWX/0.3 (+https://github.com/NovaProd954/asiawx)',accept:'application/json'};
const msg=(e:unknown)=>e instanceof Error?e.message:String(e);
async function get(u:string):Promise<{j:unknown;ms:number}>{
const t=Date.now(),r=await fetch(u,{signal:AbortSignal.timeout(12000),headers:H});
if(!r.ok)throw new Error(`HTTP ${r.status}`);
return{j:await r.json() as unknown,ms:Date.now()-t}}
async function jma(){
const t0=Date.now(),{j}=await get(J+'targetTc.json');
if(!Array.isArray(j))throw new Error('unexpected target list shape');
const all=await Promise.all(j.map(async(e:any)=>{
const id=String(e?.tropicalCyclone??'');
if(!/^TC\d+$/.test(id))return null;
const[f,s]=await Promise.allSettled([get(`${J}${id}/forecast.json`),get(`${J}${id}/specifications.json`)]);
const st=normJma(e,f.status==='fulfilled'?f.value.j:null,s.status==='fulfilled'?s.value.j:null);
if(f.status==='rejected')st.notes.push(`forecast.json unavailable: ${msg(f.reason)}`);
if(s.status==='rejected')st.notes.push(`specifications.json unavailable: ${msg(s.reason)}`);
return st}));
return{storms:all.filter((x):x is Storm=>!!x),ms:Date.now()-t0}}
export default async function handler(_req:any,res:any){
const now=Math.floor(Date.now()/1000);
const[a,b,c]=await Promise.allSettled([jma(),get(GD),get(HK)]);
const sources:SrcStat[]=[];
let storms:Storm[]=[],g:Gdacs[]=[],w:Warn[]=[];
if(a.status==='fulfilled'){
storms=a.value.storms;
const iss=storms.map(s=>s.issue??0);
sources.push({id:'jma',name:'JMA typhoon information',ok:true,msg:`${storms.length} active system${storms.length===1?'':'s'} listed`,ms:a.value.ms,updated:iss.length?Math.max(...iss):null})}
else sources.push({id:'jma',name:'JMA typhoon information',ok:false,msg:msg(a.reason),ms:null,updated:null});
if(b.status==='fulfilled'){
try{g=normGdacs(b.value.j,now);sources.push({id:'gdacs',name:'GDACS tropical cyclones',ok:true,msg:`${g.length} current system${g.length===1?'':'s'} in the Asia-Pacific domain`,ms:b.value.ms,updated:g.length?Math.max(...g.map(x=>x.modified)):null})}
catch(e){sources.push({id:'gdacs',name:'GDACS tropical cyclones',ok:false,msg:msg(e),ms:b.value.ms,updated:null})}}
else sources.push({id:'gdacs',name:'GDACS tropical cyclones',ok:false,msg:msg(b.reason),ms:null,updated:null});
if(c.status==='fulfilled'){
try{w=normHko(c.value.j);sources.push({id:'hko',name:'Hong Kong Observatory warnings',ok:true,msg:w.length?`${w.length} warning${w.length===1?'':'s'} in force`:'No warnings in force',ms:c.value.ms,updated:w.length?Math.max(...w.map(x=>x.updated??x.issued??0)):null})}
catch(e){sources.push({id:'hko',name:'Hong Kong Observatory warnings',ok:false,msg:msg(e),ms:c.value.ms,updated:null})}}
else sources.push({id:'hko',name:'Hong Kong Observatory warnings',ok:false,msg:msg(c.reason),ms:null,updated:null});
if(sources.every(s=>!s.ok)){res.status(502).json({error:'all upstream sources unavailable',sources});return}
const gdacsOnly=matchGdacs(storms,g);
const body:TcPayload={fetched:now,storms,gdacsOnly,warnings:w,sources};
res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=900');
res.status(200).json(body)}
