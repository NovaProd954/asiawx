import {archBase,withKey,getJson} from './_om.js';
import {climatology,fin,type N} from './_stats.js';
const D='temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';
const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const snap=(x:number)=>Math.round(x*4)/4;
async function archive(lat:number,lon:number,a:string,b:string){
const u=(m:boolean)=>`${archBase()}?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&start_date=${a}&end_date=${b}&daily=${D}&wind_speed_unit=ms&timezone=GMT${m?'&models=era5':''}`;
let j:any,model='era5';
try{j=await getJson(withKey(u(true)),2,40000)}catch{model='default';j=await getJson(withKey(u(false)),2,40000)}
const d=j?.daily;
if(!d||!Array.isArray(d.time))throw new Error('malformed upstream response');
const col=(k:string):N[]=>Array.isArray(d[k])?d[k].map((x:unknown)=>fin(x)?x:null):d.time.map(()=>null);
return{model,times:d.time.map((s:string)=>Date.parse(`${s}T00:00:00Z`)/1000) as number[],tmean:col('temperature_2m_mean'),tmax:col('temperature_2m_max'),tmin:col('temperature_2m_min'),prcp:col('precipitation_sum'),wmax:col('wind_speed_10m_max'),elev:j.elevation??null,glat:j.latitude,glon:j.longitude}}
export default async function handler(req:any,res:any){
const part=String(req.query?.part??'recent');
const lat0=Number(req.query?.lat),lon0=Number(req.query?.lon);
if(!Number.isFinite(lat0)||!Number.isFinite(lon0)||lat0<-12||lat0>80||lon0<25||lon0>180){res.status(400).json({error:'coordinates outside the Asian domain'});return}
const lat=snap(lat0),lon=snap(lon0);
try{
if(part==='clim'){
const r=await archive(lat,lon,'1991-01-01','2020-12-31');
const c=climatology(r.times,r);
res.setHeader('Cache-Control','public, s-maxage=2592000, stale-while-revalidate=604800');
res.status(200).json({source:'Open-Meteo historical weather API, ERA5 reanalysis',period:'1991-2020',model:r.model,lat:r.glat??lat,lon:r.glon??lon,elev:r.elev,clim:c,fetched:Math.floor(Date.now()/1000)});return}
if(part==='recent'){
const now=Date.now(),r=await archive(lat,lon,iso(now-420*86400000),iso(now-86400000));
let n=r.times.length;
while(n>0&&r.tmean[n-1]==null&&r.prcp[n-1]==null)n--;
res.setHeader('Cache-Control','public, s-maxage=10800, stale-while-revalidate=21600');
res.status(200).json({source:'Open-Meteo historical weather API, ERA5 reanalysis',model:r.model,lat:r.glat??lat,lon:r.glon??lon,times:r.times.slice(0,n),tmean:r.tmean.slice(0,n),tmax:r.tmax.slice(0,n),tmin:r.tmin.slice(0,n),prcp:r.prcp.slice(0,n),wmax:r.wmax.slice(0,n),fetched:Math.floor(now/1000)});return}
res.status(400).json({error:'unknown part'})
}catch{res.status(502).json({error:'upstream unavailable'})}}
