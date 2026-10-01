import {describe,it,expect,vi,afterEach} from 'vitest';
import sat from '../../api/sat';
import cmap from '../../api/cmap';
const mkRes=()=>{const r:any={code:0,body:null,headers:{} as Record<string,string>,setHeader(k:string,v:string){r.headers[k]=v},status(c:number){r.code=c;return r},json(b:unknown){r.body=b},send(b:unknown){r.body=b}};return r};
afterEach(()=>vi.unstubAllGlobals());
const cap=`<Layer><ows:Identifier>Himawari_AHI_Band13_Clean_Infrared</ows:Identifier><Dimension><ows:Identifier>time</ows:Identifier><Value>2026-09-30T11:00:00Z/2026-09-30T12:00:00Z/PT10M</Value></Dimension><TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level6</TileMatrixSet></TileMatrixSetLink><ResourceURL format="image/png" resourceType="tile" template="https://g/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/></Layer>`;
describe('api routes',()=>{
it('sat returns parsed layers and reports missing ones',async()=>{
vi.stubGlobal('fetch',vi.fn(async()=>new Response(cap,{status:200})));
const r=mkRes();await sat({},r);
expect(r.code).toBe(200);expect(r.body.layers.length).toBe(1);expect(r.body.missing.length).toBe(2);expect(r.headers['Cache-Control']).toContain('s-maxage')});
it('sat returns 502 when upstream fails',async()=>{
vi.stubGlobal('fetch',vi.fn(async()=>new Response('x',{status:500})));
const r=mkRes();await sat({},r);expect(r.code).toBe(502)});
it('cmap rejects unknown layers and relays valid xml',async()=>{
const a=mkRes();await cmap({query:{layer:'../etc'}},a);expect(a.code).toBe(400);
vi.stubGlobal('fetch',vi.fn(async()=>new Response('<ColorMap></ColorMap>',{status:200})));
const b=mkRes();await cmap({query:{layer:'Himawari_AHI_Band13_Clean_Infrared'}},b);expect(b.code).toBe(200);
vi.stubGlobal('fetch',vi.fn(async()=>new Response('nope',{status:404})));
const c=mkRes();await cmap({query:{layer:'Himawari_AHI_Band13_Clean_Infrared'}},c);expect(c.code).toBe(404)});
});
