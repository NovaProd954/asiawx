const C=[
{id:'jma-targets',url:'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json',status:'confirmed returning data in the Phase 3 build session'},
{id:'gdacs-tc',url:'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC&alertlevel=Green;Orange;Red&pageSize=5',status:'confirmed returning data in the Phase 3 build session'},
{id:'hko-warnsum',url:'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=en',status:'documented by HKO, not fetched in the build session'},
{id:'jtwc-site',url:'https://www.metoc.navy.mil/jtwc/jtwc.html?best-tracks',status:'documented JTWC page, reliability unknown, not integrated'},
{id:'atcf-noaa-ssd',url:'https://www.ssd.noaa.gov/PS/TROP/DATA/ATCF/JTWC/',status:'candidate ATCF mirror, unverified, not integrated'},
{id:'atcf-ucar',url:'https://hurricanes.ral.ucar.edu/repository/data/bdecks_open/',status:'candidate ATCF mirror, unverified, not integrated'}];
export default async function handler(_req:any,res:any){
const out=await Promise.all(C.map(async c=>{
const t=Date.now();
try{
const r=await fetch(c.url,{signal:AbortSignal.timeout(10000),headers:{'user-agent':'AsiaWX/0.3 probe'}});
const b=new Uint8Array(await r.arrayBuffer());
return{id:c.id,url:c.url,note:c.status,ok:r.ok,http:r.status,ms:Date.now()-t,type:r.headers.get('content-type'),bytes:b.length,head:new TextDecoder().decode(b.slice(0,200)).replace(/\s+/g,' ')}}
catch(e){return{id:c.id,url:c.url,note:c.status,ok:false,http:null,ms:Date.now()-t,type:null,bytes:0,head:e instanceof Error?e.message:String(e)}}}));
res.setHeader('Cache-Control','no-store');
res.status(200).json({probed:Math.floor(Date.now()/1000),results:out})}
