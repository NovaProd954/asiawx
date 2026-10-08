import {MODELS,base,withKey,getJson,runTime} from './_om.js';
import {FVARS,buildFields} from './_fields.js';
const LON0=24,LAT0=-12,D=4,NX=40,NY=24,CHUNK=100;
export default async function handler(req:any,res:any){
const model=String(req.query?.model??'gfs_seamless');
if(!MODELS[model]){res.status(400).json({error:'unknown model'});return}
const cells:[number,number][]=[];
for(let j=0;j<NY;j++)for(let i=0;i<NX;i++)cells.push([LAT0+j*D,LON0+i*D]);
const chunks:[number,number][][]=[];
for(let i=0;i<cells.length;i+=CHUNK)chunks.push(cells.slice(i,i+CHUNK));
const out=await Promise.all(chunks.map(async c=>{
const u=`${base()}?latitude=${c.map(p=>p[0]).join(',')}&longitude=${c.map(p=>p[1]).join(',')}&hourly=${FVARS.join(',')}&wind_speed_unit=ms&models=${model}&forecast_days=2&timezone=GMT&timeformat=unixtime`;
try{const j=await getJson(withKey(u));const a=Array.isArray(j)?j:[j];return a.length===c.length?a:null}catch{return null}}));
const first=out.find(Boolean)?.[0];
if(!first?.hourly?.time){res.status(502).json({error:'upstream unavailable'});return}
const flat:(any|null)[]=[];
out.forEach((a,ci)=>{for(let k=0;k<chunks[ci].length;k++)flat.push(a?a[k]:null)});
const f=buildFields(first.hourly.time,flat);
if(!Object.keys(f.vars).length){res.status(502).json({error:'model returned none of the requested fields'});return}
const run=await runTime(model);
res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=10800');
res.status(200).json({source:'Open-Meteo',model,run,lon0:LON0,lat0:LAT0,d:D,nx:NX,ny:NY,times:f.times,vars:f.vars,absent:f.absent,missing:f.missing,fetched:Math.floor(Date.now()/1000)})}
