export const MODELS:Record<string,string>={gfs_seamless:'ncep_gfs025',ecmwf_ifs025:'ecmwf_ifs025',icon_seamless:'dwd_icon'};
const key=()=>process.env.OPEN_METEO_API_KEY;
export const base=()=>key()?'https://customer-api.open-meteo.com/v1/forecast':'https://api.open-meteo.com/v1/forecast';
export const withKey=(u:string)=>key()?`${u}&apikey=${encodeURIComponent(key() as string)}`:u;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function getJson(url:string,tries=3,timeout=20000):Promise<any>{
let last:unknown;
for(let i=0;i<tries;i++){
try{const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`upstream HTTP ${r.status}`);return await r.json()}
catch(e){last=e;if(i<tries-1)await sleep(400*2**i)}}
throw last}
export async function runTime(model:string):Promise<number|null>{
try{const j=await getJson(`https://api.open-meteo.com/data/${MODELS[model]}/static/meta.json`,1,4000);const t=j?.last_run_initialisation_time;return typeof t==='number'?t:null}catch{return null}}
export const CMP:{id:string;name:string;org:string}[]=[{id:'gfs_seamless',name:'GFS',org:'NOAA / NCEP'},{id:'ecmwf_ifs025',name:'ECMWF IFS',org:'ECMWF open data'},{id:'icon_seamless',name:'ICON',org:'DWD'},{id:'jma_seamless',name:'JMA GSM',org:'Japan Meteorological Agency'},{id:'gem_seamless',name:'GEM',org:'Environment Canada'},{id:'ukmo_seamless',name:'UK Met Office',org:'UKMO'}];
export const ENS:{id:string;name:string;org:string}[]=[{id:'gfs025',name:'GEFS',org:'NOAA / NCEP'},{id:'ecmwf_ifs025',name:'ECMWF ENS',org:'ECMWF open data'}];
export const ensBase=()=>key()?'https://customer-ensemble-api.open-meteo.com/v1/ensemble':'https://ensemble-api.open-meteo.com/v1/ensemble';
export const archBase=()=>key()?'https://customer-archive-api.open-meteo.com/v1/archive':'https://archive-api.open-meteo.com/v1/archive';
