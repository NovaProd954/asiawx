import {LAYERS,parseLayer,type LayerInfo} from './_wmts.js';
const CAPS='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&request=GetCapabilities';
const N=24;
async function getText(url:string,tries=2,timeout=25000):Promise<string>{
let last:unknown;
for(let i=0;i<tries;i++){
try{const r=await fetch(url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)throw new Error(`upstream HTTP ${r.status}`);return await r.text()}
catch(e){last=e}}
throw last}
export default async function handler(_req:any,res:any){
try{
const xml=await getText(CAPS);
const layers:LayerInfo[]=[];
for(const d of LAYERS){const l=parseLayer(xml,d,N);if(l)layers.push(l)}
if(!layers.length){res.status(502).json({error:'no Himawari layers found in GIBS capabilities'});return}
res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=600');
res.status(200).json({source:'NASA GIBS',layers,missing:LAYERS.filter(d=>!layers.some(l=>l.key===d.key)).map(d=>d.id),fetched:Math.floor(Date.now()/1000)})
}catch{res.status(502).json({error:'upstream unavailable'})}}
