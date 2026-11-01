import {describe,it,expect,beforeAll,vi} from 'vitest';
import {SatController} from './controller';
import {WindDecoder} from '../wind/decoder';
const PALX=[['0,0,0','(40,+INF)'],['40,40,40','(30,40]'],['120,120,120','(10,30]'],['200,200,200','(-10,10]'],['255,255,255','(-30,-10]'],['60,200,250','(-45,-30]'],['40,200,90','(-55,-45]'],['250,235,40','(-65,-55]'],['215,30,40','(-75,-65]'],['200,60,200','(-85,-75]'],['90,0,0','(-120,-85]']];
const xml=`<ColorMaps><ColorMap title="IR" units="&#176;C"><Entries>${PALX.map(([c,v])=>`<ColorMapEntry rgb="${c}" transparent="false" value="${v}"/>`).join('')}</Entries></ColorMap><ColorMap title="No Data"><Entries><ColorMapEntry rgb="0,0,0" transparent="true" nodata="true" /></Entries></ColorMap></ColorMaps>`;
const base=1762000000-(1762000000%600),T=Array.from({length:24},(_,i)=>base-(23-i)*600);
const layer=(o:object)=>({tms:'GoogleMapsCompatible_Level6',maxzoom:6,format:'image/png',step:600,times:T,tfmt:'iso',attribution:'x',...o});
const catalog={layers:[
layer({key:'ir',id:'Himawari_AHI_Band13_Clean_Infrared',name:'Clean infrared, Band 13 (10.4 um)',kind:'ir',template:'https://gibs/{Time}/{z}/{y}/{x}.png',provider:'gibs',decode:true}),
layer({key:'vis',id:'Vis',name:'Visible',kind:'vis',template:'https://gibs/v/{Time}/{z}/{y}/{x}.png',provider:'gibs',decode:false}),
layer({key:'jma-ir',id:'B13/TBB',name:'Infrared Band 13 (JMA)',kind:'rgb',tms:'XYZ',maxzoom:5,format:'image/jpeg',template:'/p/jma/{Time}/fd/{Time}/B13/TBB/{z}/{x}/{y}.jpg',provider:'jma',tfmt:'jma',decode:false})],
providers:[{id:'gibs',name:'NASA GIBS',ok:true,msg:''},{id:'jma',name:'JMA Himawari',ok:true,msg:''}]};
const MOVE=5/1800;
const bt=(x:number,y:number)=>{const v=0.5+0.3*Math.sin(x/90)+0.2*Math.cos(y/110+x/200)+0.1*Math.sin((x+y)/40);return 35-125*Math.max(0,Math.min(1,v))};
const gcol=(v:number)=>{const k=v>40?0:v>30?1:v>10?2:v>-10?3:v>-30?4:v>-45?5:v>-55?6:v>-65?7:v>-75?8:v>-85?9:10;return PALX[k][0].split(',').map(Number)};
class FakeMap{layers:any[]=[];src=new Map<string,any>();paint=new Map<string,Record<string,unknown>>();h:Record<string,Function[]>={};
on(e:string,f:Function){(this.h[e]??=[]).push(f);return this}off(){return this}
getStyle(){return{layers:this.layers,sources:{}}}
addSource(id:string,s:any){this.src.set(id,{...s,updateImage:(o:any)=>{this.src.get(id).url=o.url}})}
getSource(id:string){return this.src.get(id)}
addLayer(l:any){this.layers.push(l);this.paint.set(l.id,{...l.paint})}
getLayer(id:string){return this.layers.find(l=>l.id===id)}
removeLayer(id:string){this.layers=this.layers.filter(l=>l.id!==id);this.paint.delete(id)}
removeSource(id:string){this.src.delete(id)}
setPaintProperty(id:string,k:string,v:unknown){const p=this.paint.get(id);if(p)p[k]=v}
isSourceLoaded(){return true}
getZoom(){return 3}
getBounds(){return{getWest:()=>60,getEast:()=>180,getSouth:()=>-12,getNorth:()=>72}}
moveLayer(){}isStyleLoaded(){return true}}
describe('Fused IR end to end (fake map, fake tiles)',()=>{
const status:string[]=[];let sc:SatController,map:FakeMap;
beforeAll(()=>{
(globalThis as any).window=globalThis;(globalThis as any).location={origin:'https://asiawx.test',href:'https://asiawx.test/'};(globalThis as any).requestAnimationFrame=(f:Function)=>setTimeout(()=>f(performance.now()),0);(globalThis as any).cancelAnimationFrame=(n:any)=>clearTimeout(n);
(globalThis as any).matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
(globalThis as any).document={createElement:()=>({getContext:()=>null})};
(globalThis as any).localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
(globalThis as any).URL.createObjectURL=()=>'blob:fake';(globalThis as any).URL.revokeObjectURL=()=>{};
(globalThis as any).fetch=vi.fn(async(u:string)=>{
if(u.startsWith('/api/sat'))return new Response(JSON.stringify(catalog),{status:200});
if(u.startsWith('/api/cmap'))return new Response(xml,{status:200});
if(u.startsWith('/api/levels')){const nx=27,ny=16,n=nx*ny,P=[925,850,700,500,300,200],Tm=[23,18,8,-6,-32,-55],S=[6,7,10,14,28,36],cell=(v:number)=>Array.from({length:n},()=>v);return new Response(JSON.stringify({model:'gfs_seamless',run:null,t:0,lon0:24,lat0:-12,d:6,nx,ny,levels:P,temp:Tm.map(cell),spd:S.map(cell),dir:P.map(()=>cell(270)),missing:0}),{status:200})}
return new Response('',{status:404})});
map=new FakeMap();
sc=new SatController(map as any,{change:()=>{},status:(m)=>{status.push(m)}});
(sc as any).mosaic=async(L:any,_t:number,r:any)=>{
const w=(r.x1-r.x0+1)*256,h=(r.y1-r.y0+1)*256,p=new Uint8ClampedArray(w*h*4),dx=(L.provider==='jma'?2:0)-(_t-base)*MOVE;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=bt(x+dx,y);
if(L.provider==='jma'){const l=Math.max(0,Math.min(255,Math.round(255*Math.pow((40-v)/165,1.05))));p[i]=l;p[i+1]=l;p[i+2]=l}
else{const c=gcol(v);p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2]}
p[i+3]=255}
return p};
(sc as any).encodeBlob=async()=>new Blob(['x']);(sc as any).encode=async()=>'blob:fake';
});
it('lists the Fused IR option first, built from the two real layers',async()=>{
await sc.enable(true);
const L=sc.catalog!.layers;
expect(L[0].key).toBe('fused');expect(L[0].provider).toBe('fused');
expect(L[0].times.length).toBe(24);
expect(sc.catalog!.providers[0].id).toBe('fused')});
it('calibrates JMA, decodes the fused frame and shows a visible image layer',async()=>{
await sc.selectLayer('fused');
expect(sc.key).toBe('fused');expect(sc.mode).toBe('fuse');expect(sc.view).toBe('fuse');
await (sc as any).decode();
const cal=sc.cal.get('jma-ir');
expect(cal?.s,`calibration: ${cal?.m}; dstat: ${sc.dstat}`).toBe('ok');
expect(sc.dkind,sc.dstat).not.toBe('err');
const l=map.getLayer('sat-decw');
expect(l,`dstat: ${sc.dstat}`).toBeTruthy();
expect(map.paint.get('sat-decw')!['raster-opacity']).toBeGreaterThan(0.2);
expect(sc.can).toBe(true)});
it('does not leave a raw tile layer on top of the decoded image',()=>{
const raw=map.layers.filter(x=>/^sat-[ab]$/.test(x.id));
expect(raw.length).toBe(0)});
it('Wind Decoder runs the whole chain and finds eastward cloud motion',async()=>{
const wd=new WindDecoder(),r=await wd.run(sc,'gfs_seamless',null);
expect(wd.err).toBe('');
expect(r).not.toBeNull();
const s=r!.a.stats;
expect(s.tracked).toBeGreaterThan(200);
const vs=r!.a.vecs;expect(vs.length).toBeGreaterThan(50);
const mu=vs.reduce((a,v)=>a+v.u,0)/vs.length,mv=vs.reduce((a,v)=>a+v.v,0)/vs.length;
console.log('WD',JSON.stringify({tracked:s.tracked,accepted:s.accepted,mu,mv,ms:r!.ms,vecs:vs.length}));
expect(mu).toBeGreaterThan(8);expect(mu).toBeLessThan(40);expect(Math.abs(mv)).toBeLessThan(6);
expect(r!.a.bands).toHaveLength(3)},60000);
it('selecting another product and back keeps working',async()=>{
await sc.selectLayer('ir');expect(sc.mode).toBe('cmap');
await sc.selectLayer('fused');await (sc as any).decode();
expect(map.paint.get('sat-decw')!['raster-opacity']).toBeGreaterThan(0.2)})});
