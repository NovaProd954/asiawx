import {LAYERS} from './_wmts.js';
export default async function handler(req:any,res:any){
const id=String(req.query?.layer??'');
if(!LAYERS.some(l=>l.id===id)){res.status(400).json({error:'unknown layer'});return}
try{
const r=await fetch(`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${id}.xml`,{signal:AbortSignal.timeout(15000)});
if(!r.ok){res.status(r.status===404?404:502).json({error:`colormap HTTP ${r.status}`});return}
const t=await r.text();
if(!/<ColorMap/i.test(t)){res.status(502).json({error:'unexpected colormap content'});return}
res.setHeader('Content-Type','application/xml; charset=utf-8');
res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');
res.status(200).send(t)
}catch{res.status(502).json({error:'upstream unavailable'})}}
