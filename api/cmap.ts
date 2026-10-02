import {LAYERS} from './_wmts.js';
const ALIAS:Record<string,string[]>={Himawari_AHI_Band13_Clean_Infrared:['Clean_Longwave_Infrared_Window_Band','Himawari_AHI_Band13_Clean_Infrared']};
export default async function handler(req:any,res:any){
const id=String(req.query?.layer??'');
if(!LAYERS.some(l=>l.id===id)){res.status(400).json({error:'unknown layer'});return}
const names=ALIAS[id]??[id],tried:string[]=[];
for(const n of names){
try{
const r=await fetch(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${n}.xml`,{signal:AbortSignal.timeout(15000)});
if(!r.ok){tried.push(`${n}: HTTP ${r.status}`);continue}
const t=await r.text();
if(!/<ColorMap/i.test(t)){tried.push(`${n}: unexpected content`);continue}
res.setHeader('Content-Type','application/xml; charset=utf-8');
res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
res.status(200).send(t);return
}catch{tried.push(`${n}: unreachable`)}}
res.status(tried.every(x=>x.includes('HTTP 404'))?404:502).json({error:`colormap not found (${tried.join('; ')})`})}
