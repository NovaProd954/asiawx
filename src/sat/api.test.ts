import {describe,it,expect,vi,afterEach} from 'vitest';
import sat from '../../api/sat';
import cmap from '../../api/cmap';
import {gibsProvider,jmaProvider,realEarthProvider,findNewest,type Fetcher} from '../../api/_prov';
import {findIds,resolveDef,fmtTime,buildTileUrl,LAYERS} from '../../api/_wmts';
const mkRes=()=>{const r:any={code:0,body:null,headers:{} as Record<string,string>,setHeader(k:string,v:string){r.headers[k]=v},status(c:number){r.code=c;return r},json(b:unknown){r.body=b},send(b:unknown){r.body=b}};return r};
afterEach(()=>vi.unstubAllGlobals());
const big=new Uint8Array(3000),tiny=new Uint8Array(50);
const NOW=Date.UTC(2026,9,1,12,0,0)/1000;
const mock=(rules:[RegExp,()=>Response][]):Fetcher=>async u=>{for(const [re,f] of rules)if(re.test(u))return f();return new Response('nf',{status:404})};
const png=(b=big)=>new Response(b,{status:200});
describe('wmts helpers',()=>{
it('formats times for each provider',()=>{const t=Date.UTC(2026,9,1,12,30,0)/1000;expect(fmtTime(t)).toBe('2026-10-01T12:30:00Z');expect(fmtTime(t,'date')).toBe('2026-10-01');expect(fmtTime(t,'jma')).toBe('20261001123000');expect(fmtTime(t,'re')).toBe('20261001/123000')});
it('keeps both JMA time slots',()=>{expect(buildTileUrl('/p/{Time}/fd/{Time}/B13/{z}/{x}/{y}.jpg',Date.UTC(2026,9,1)/1000,'jma')).toBe('/p/20261001000000/fd/20261001000000/B13/{z}/{x}/{y}.jpg')});
it('finds Himawari ids and maps near matches to a layer definition',()=>{
const xml='<ows:Identifier>Himawari_AHI_Band13_Clean_Infrared_v2</ows:Identifier><ows:Identifier>Other</ows:Identifier><ows:Identifier>Himawari_AHI_Air_Mass</ows:Identifier>';
const ids=findIds(xml);expect(ids.length).toBe(2);
expect(resolveDef(LAYERS[0],ids).id).toBe('Himawari_AHI_Band13_Clean_Infrared_v2');
expect(resolveDef(LAYERS[2],ids).id).toBe('Himawari_AHI_Air_Mass');
expect(resolveDef(LAYERS[1],ids).id).toBe(LAYERS[1].id)});
});
describe('providers',()=>{
it('findNewest steps back to the first frame that exists',async()=>{
const ok=new Set([NOW-1200,NOW-1800]);
const F:Fetcher=async u=>{const t=Object.keys(Object.fromEntries([...ok].map(x=>[x,1]))).find(x=>u.includes(fmtTime(+x)));return t?png():new Response('x',{status:404})};
expect(await findNewest(F,'https://g/{Time}/{TileMatrix}/{TileRow}/{TileCol}.png','iso',NOW,600,12,1200)).toBe(NOW-1200)});
it('findNewest rejects blank tiles and returns null when nothing exists',async()=>{
expect(await findNewest(async()=>png(tiny),'https://g/{Time}/{TileMatrix}.png','iso',NOW,600,6,1200)).toBeNull()});
it('gibs falls back to static layers when capabilities fail, and reports it',async()=>{
const F=mock([[/GetCapabilities/,()=>new Response('x',{status:500})],[/\/default\//,()=>png()]]);
const r=await gibsProvider(F,NOW);
expect(r.layers.some(l=>l.key==='ir'&&l.decode&&l.times.length===24)).toBe(true);
expect(r.layers.some(l=>l.key==='viirs'&&l.step===86400&&l.times.length===7)).toBe(true);
expect(r.status.ok).toBe(true);expect(r.status.msg).toContain('capabilities')});
it('gibs reports unavailable when nothing responds',async()=>{
const r=await gibsProvider(mock([]),NOW);
expect(r.layers.length).toBe(0);expect(r.status.ok).toBe(false)});
it('gibs uses capabilities template and time list when parseable',async()=>{
const cap=`<Layer><ows:Identifier>Himawari_AHI_Band13_Clean_Infrared</ows:Identifier><Dimension><ows:Identifier>time</ows:Identifier><Value>2026-10-01T10:00:00Z/2026-10-01T11:40:00Z/PT10M</Value></Dimension><TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level7</TileMatrixSet></TileMatrixSetLink><ResourceURL format="image/png" resourceType="tile" template="https://gibs/x/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/></Layer>`;
const F=mock([[/GetCapabilities/,()=>new Response(cap,{status:200})],[/\/default\//,()=>png()],[/gibs\/x/,()=>png()]]);
const r=await gibsProvider(F,NOW),ir=r.layers.find(l=>l.key==='ir');
expect(ir?.tms).toBe('GoogleMapsCompatible_Level7');expect(ir?.maxzoom).toBe(7)});
it('jma builds layers from the target time list and proxies tiles',async()=>{
const list=[0,1,2,3,4].map(i=>{const s=fmtTime(NOW-i*600,'jma');return{basetime:s,validtime:s}});
const F=mock([[/targetTimes_fd/,()=>new Response(JSON.stringify(list),{status:200})],[/B13|B08|REP/,()=>png()]]);
const r=await jmaProvider(F);
expect(r.status.ok).toBe(true);expect(r.layers.length).toBe(3);
expect(r.layers[0].template.startsWith('/p/jma/bosai/')).toBe(true);expect(r.layers[0].times.length).toBe(5)});
it('jma reports an unexpected format',async()=>{
const r=await jmaProvider(mock([[/targetTimes_fd/,()=>new Response('{"a":1}',{status:200})]]));
expect(r.status.ok).toBe(false);expect(r.status.msg).toContain('format')});
it('realearth extracts times from varied response shapes',async()=>{
const body=JSON.stringify({globalir:[0,1,2,3].map(i=>fmtTime(NOW-i*3600,'jma').replace(/^(\d{8})(\d{6})$/,'$1_$2'))});
const F=mock([[/api\/products/,()=>new Response(body,{status:200})],[/\/tiles\//,()=>png()]]);
const r=await realEarthProvider(F,NOW);
expect(r.status.ok).toBe(true);expect(r.layers[0].times.length).toBe(4);expect(r.layers[0].step).toBe(3600)});
it('realearth fails cleanly on an empty response',async()=>{
const r=await realEarthProvider(mock([[/api\/products/,()=>new Response('{}',{status:200})]]),NOW);
expect(r.layers.length).toBe(0);expect(r.status.msg).toContain('no recent times')});
});
describe('api routes',()=>{
it('sat returns 502 with diagnostics when every provider fails',async()=>{
vi.stubGlobal('fetch',vi.fn(async()=>new Response('x',{status:500})));
const r=mkRes();await sat({},r);
expect(r.code).toBe(502);expect(r.body.diag.length).toBe(3)});
it('sat returns layers and provider status when some providers work',async()=>{
vi.stubGlobal('fetch',vi.fn(async(u:string)=>/\/default\//.test(u)?new Response(big,{status:200}):new Response('x',{status:500})));
const r=mkRes();await sat({},r);
expect(r.code).toBe(200);expect(r.body.layers.length).toBeGreaterThan(0);expect(r.body.providers.length).toBe(3);expect(r.headers['Cache-Control']).toContain('s-maxage')});
it('cmap rejects unknown layers and relays valid xml',async()=>{
const a=mkRes();await cmap({query:{layer:'../etc'}},a);expect(a.code).toBe(400);
vi.stubGlobal('fetch',vi.fn(async()=>new Response('<ColorMap></ColorMap>',{status:200})));
const b=mkRes();await cmap({query:{layer:'Himawari_AHI_Band13_Clean_Infrared'}},b);expect(b.code).toBe(200);
vi.stubGlobal('fetch',vi.fn(async()=>new Response('nope',{status:404})));
const c=mkRes();await cmap({query:{layer:'Himawari_AHI_Band13_Clean_Infrared'}},c);expect(c.code).toBe(404)});
});
