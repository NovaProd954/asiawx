import {MODELS,base,withKey,getJson,runTime} from './_om.js';
const LON0=24,LAT0=-12,D=6,NX=27,NY=16,CHUNK=100,LV=[925,850,700,500,300,200];
const VARS=LV.flatMap(l=>[`temperature_${l}hPa`,`wind_speed_${l}hPa`,`wind_direction_${l}hPa`]);
export default async function handler(req:any,res:any){
const model=String(req.query?.model??'gfs_seamless');
if(!MODELS[model]){res.status(400).json({error:'unknown model'});return}
const t=Math.floor(Number(req.query?.t??Date.now()/1000)/3600)*3600;
if(!Number.isFinite(t)){res.status(400).json({error:'bad time'});return}
const cells:[number,number][]=[];
for(let j=0;j<NY;j++)for(let i=0;i<NX;i++)cells.push([LAT0+j*D,LON0+i*D]);
const chunks:[number,number][][]=[];
for(let i=0;i<cells.length;i+=CHUNK)chunks.push(cells.slice(i,i+CHUNK));
const out=await Promise.all(chunks.map(async c=>{
const u=`${base()}?latitude=${c.map(p=>p[0]).join(',')}&longitude=${c.map(p=>p[1]).join(',')}&hourly=${VARS.join(',')}&wind_speed_unit=ms&models=${model}&past_days=1&forecast_days=2&timezone=GMT&timeformat=unixtime`;
try{const j=await getJson(withKey(u));const a=Array.isArray(j)?j:[j];return a.length===c.length?a:null}catch{return null}}));
const first=out.find(Boolean)?.[0];
const times:number[]|undefined=first?.hourly?.time;
if(!times){res.status(502).json({error:'upstream unavailable'});return}
const hi=times.indexOf(t);
if(hi<0){res.status(404).json({error:'time outside the model range'});return}
const n=cells.length,mk=()=>LV.map(()=>new Array(n).fill(null) as (number|null)[]),temp=mk(),spd=mk(),dir=mk();
let missing=0;
out.forEach((a,ci)=>{for(let k=0;k<chunks[ci].length;k++){
const idx=ci*CHUNK+k,h=a?.[k]?.hourly;let ok=!!h;
if(h)LV.forEach((l,li)=>{
const T=h[`temperature_${l}hPa`]?.[hi],S=h[`wind_speed_${l}hPa`]?.[hi],Dd=h[`wind_direction_${l}hPa`]?.[hi];
if([T,S,Dd].every(x=>typeof x==='number'&&Number.isFinite(x))){temp[li][idx]=T;spd[li][idx]=S;dir[li][idx]=Dd}else ok=false});
if(!ok)missing++}});
if(missing>n*0.5){res.status(502).json({error:'model returned too few pressure-level values'});return}
const run=await runTime(model);
res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=3600');
res.status(200).json({source:'Open-Meteo',model,run,t,lon0:LON0,lat0:LAT0,d:D,nx:NX,ny:NY,levels:LV,temp,spd,dir,missing,fetched:Math.floor(Date.now()/1000)})}
