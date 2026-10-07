import {CMP,MODELS,base,withKey,getJson,runTime} from './_om.js';
import {alignModels,type ModelIn} from './_stats.js';
const VARS=['temperature_2m','pressure_msl','wind_speed_10m','precipitation','cloud_cover'];
export default async function handler(req:any,res:any){
const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-12||lat>80||lon<25||lon>180){res.status(400).json({error:'coordinates outside the Asian domain'});return}
const one=async(m:{id:string;name:string}):Promise<ModelIn>=>{
const t0=Date.now();
try{
const u=`${base()}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=${VARS.join(',')}&wind_speed_unit=ms&models=${m.id}&forecast_days=5&timezone=GMT&timeformat=unixtime`;
const j=await getJson(withKey(u),2,15000);
if(!Array.isArray(j?.hourly?.time))throw new Error('malformed upstream response');
const vars:Record<string,(number|null)[]>={};
for(const v of VARS)vars[v]=Array.isArray(j.hourly[v])?j.hourly[v]:[];
return{id:m.id,name:m.name,ok:true,ms:Date.now()-t0,times:j.hourly.time,vars}
}catch(e){return{id:m.id,name:m.name,ok:false,ms:Date.now()-t0,err:e instanceof Error?e.message:'failed'}}};
const [list,runs]=await Promise.all([Promise.all(CMP.map(one)),Promise.all(CMP.map(m=>MODELS[m.id]?runTime(m.id):Promise.resolve(null)))]);
const a=alignModels(list,VARS);
if(!a.times.length){res.status(502).json({error:'no model responded',models:a.models.map(m=>({id:m.id,name:m.name,err:m.err}))});return}
const org=Object.fromEntries(CMP.map(m=>[m.id,m.org]));
res.setHeader('Cache-Control','public, s-maxage=600, stale-while-revalidate=1800');
res.status(200).json({source:'Open-Meteo',lat,lon,times:a.times,models:a.models.map((m,i)=>({...m,org:org[m.id],run:runs[i]})),fetched:Math.floor(Date.now()/1000)})}
