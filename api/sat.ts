import {defaultFetch,gibsProvider,jmaProvider,realEarthProvider,type ProviderResult} from './_prov.js';
export const config={maxDuration:30};
export default async function handler(_req:any,res:any){
try{
const F=defaultFetch;
const rs:ProviderResult[]=await Promise.all([gibsProvider(F),jmaProvider(F),realEarthProvider(F)]);
const layers=rs.flatMap(r=>r.layers),providers=rs.map(r=>r.status);
if(!layers.length){res.status(502).json({error:'no satellite layers available',providers,diag:providers.map(p=>`${p.name}: ${p.msg||'failed'}`)});return}
res.setHeader('Cache-Control','public, s-maxage=120, stale-while-revalidate=600');
res.status(200).json({source:'NASA GIBS, JMA, SSEC RealEarth',layers,providers,fetched:Math.floor(Date.now()/1000)})
}catch(e){res.status(502).json({error:'catalog failed',diag:[e instanceof Error?e.message:String(e)]})}}
