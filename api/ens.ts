import {ENS,ensBase,withKey,getJson} from './_om.js';
import {summarizeEns} from './_stats.js';
const VARS=['temperature_2m','pressure_msl','wind_speed_10m','precipitation'];
export default async function handler(req:any,res:any){
const lat=Number(req.query?.lat),lon=Number(req.query?.lon);
if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-12||lat>80||lon<25||lon>180){res.status(400).json({error:'coordinates outside the Asian domain'});return}
const out=await Promise.all(ENS.map(async e=>{
const t0=Date.now();
try{
const u=`${ensBase()}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=${VARS.join(',')}&wind_speed_unit=ms&models=${e.id}&forecast_days=10&timezone=GMT&timeformat=unixtime`;
const j=await getJson(withKey(u),2,25000);
const s=summarizeEns(j,VARS);
if(!s)throw new Error('response had no usable ensemble members');
return{id:e.id,name:e.name,org:e.org,ok:true,ms:Date.now()-t0,...s}
}catch(x){return{id:e.id,name:e.name,org:e.org,ok:false,ms:Date.now()-t0,err:x instanceof Error?x.message:'failed'}}}));
if(!out.some(o=>o.ok)){res.status(502).json({error:'no ensemble responded',ens:out});return}
res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=7200');
res.status(200).json({source:'Open-Meteo ensemble API',lat,lon,ens:out,fetched:Math.floor(Date.now()/1000)})}
