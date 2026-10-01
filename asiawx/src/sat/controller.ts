import type maplibregl from 'maplibre-gl';
import {fetchJson,health} from '../lib/http';
import {buildTileUrl} from '../../api/_wmts';
import {parseColormap,type CMap} from './colormap';
import {run,type DecodeIn,type Stats,type View} from './decode';
export interface SatLayer{key:string;id:string;name:string;kind:'ir'|'vis'|'rgb';tms:string;maxzoom:number;format:string;template:string;times:number[];step:number}
interface Catalog{source:string;layers:SatLayer[];missing:string[];fetched:number}
export interface Hooks{change:()=>void;status:(m:string,k:'info'|'warn'|'err',retry?:()=>void)=>void}
export interface TileRng{z:number;x0:number;y0:number;x1:number;y1:number}
export interface Meta{z:number;x0:number;y0:number;w:number;h:number;native:boolean;time:number;view:View;stats:Stats;prevOk:boolean}
const ATTR='Imagery: NASA GIBS/ESDIS, JMA Himawari-9';
const TS=256,HIDE=0.001,COOL_STEP=1800;
export const lonToX=(lon:number,z:number)=>(lon+180)/360*2**z;
export const latToY=(lat:number,z:number)=>{const r=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;return(1-Math.asinh(Math.tan(r))/Math.PI)/2*2**z};
export const xToLon=(x:number,z:number)=>x/2**z*360-180;
export const yToLat=(y:number,z:number)=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI;
export function tileRange(b:{w:number;s:number;e:number;n:number},zoom:number,maxzoom:number,cap:number):TileRng{
let z=Math.min(maxzoom,Math.max(1,Math.round(zoom)));
for(;;){
const m=2**z-1,x0=Math.max(0,Math.min(m,Math.floor(lonToX(b.w,z)))),x1=Math.max(0,Math.min(m,Math.floor(lonToX(b.e,z))));
const y0=Math.max(0,Math.min(m,Math.floor(latToY(b.n,z)))),y1=Math.max(0,Math.min(m,Math.floor(latToY(b.s,z))));
if((x1-x0+1)*(y1-y0+1)<=cap||z<=1)return{z,x0,y0,x1,y1};
z--}}
export class SatController{
on=false;key='ir';catalog:Catalog|null=null;frames:number[]=[];idx=0;opacity=0.85;view:View='raw';thr=-52;mix=1;
busy=false;playing=false;cmap:CMap|null=null;cmapState:'idle'|'loading'|'ok'|'unusable'|'error'='idle';
meta:Meta|null=null;bt:Float32Array|null=null;dstat='';dkind:'info'|'warn'|'err'='info';loading=false;
private front:string|null=null;private tok=0;private dtok=0;private dtimer=0;private errs=0;private worker:Worker|null=null;private wid=0;
private pending=new Map<number,(r:any)=>void>();private cache=new Map<string,ImageBitmap|null>();private decUrl:string|null=null;
private mobile=matchMedia('(pointer:coarse)').matches;
constructor(private map:maplibregl.Map,private h:Hooks){
const go=()=>{this.front=null;if(this.on)void this.show();this.redrawDecoded()};
map.on('style.load',go);
map.on('moveend',()=>this.scheduleDecode());
map.on('error',e=>{
const sid=String((e as unknown as {sourceId?:string}).sourceId??'');
if(!sid.startsWith('sat-'))return;
this.errs++;const p=health.get('gibs');
health.set('gibs',{ok:false,lastOk:p?.lastOk??null,err:String(e.error?.message??'tile error'),ms:null})})}
get layer():SatLayer|null{return this.catalog?.layers.find(l=>l.key===this.key)??null}
get time():number|null{return this.frames[this.idx]??null}
get ready(){return this.on&&this.frames.length>0}
get cmapOk(){return this.cmapState==='ok'&&!!this.cmap?.usable}
async enable(on:boolean){
this.on=on;
if(!on){this.tok++;this.dtok++;this.busy=false;this.removeAll();this.h.change();return}
if(!this.catalog)await this.loadCatalog();
else await this.selectLayer(this.key);
this.h.change()}
async loadCatalog(){
this.loading=true;this.h.status('Loading satellite catalog','info');this.h.change();
try{
const c=await fetchJson<Catalog>('sat','/api/sat',{timeout:45000,retries:1});
if(!c?.layers?.length)throw new Error('empty catalog');
this.catalog=c;this.h.status('','info');
if(!this.layer)this.key=c.layers[0].key;
await this.selectLayer(this.key)
}catch{
this.on=false;this.h.status('Satellite catalog unavailable. NASA GIBS or the proxy did not respond with a usable layer list.','err',()=>void this.enable(true))}
finally{this.loading=false;this.h.change()}}
async selectLayer(key:string){
this.key=key;
if(!this.on){this.h.change();return}
this.tok++;this.removeAll();this.meta=null;this.bt=null;
const L=this.layer;if(!L){this.frames=[];return}
this.frames=L.times.slice();this.idx=this.frames.length-1;
await this.probe(L);
if(L.kind==='ir')void this.ensureCmap();
this.dstat='';
await this.show();this.h.change()}
private async probe(L:SatLayer){
if(L.kind==='vis')return;
try{
for(let k=0;k<3&&this.frames.length>3;k++){
const u=buildTileUrl(L.template,this.frames[this.frames.length-1]).replace('{z}','3').replace('{y}','3').replace('{x}','6');
const r=await fetch(u);
if(!r.ok){this.frames.pop();continue}
const b=await r.blob();
if(b.size>1500)break;
this.frames.pop()}
}catch{}
this.idx=this.frames.length-1}
async ensureCmap(){
const L=this.layer;
if(!L||L.kind!=='ir'||this.cmapState==='ok'||this.cmapState==='loading')return;
this.cmapState='loading';this.h.change();
try{
const r=await fetch(`/api/cmap?layer=${encodeURIComponent(L.id)}`);
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const c=parseColormap(await r.text());
this.cmap=c;this.cmapState=c.usable?'ok':'unusable'
}catch{this.cmapState='error'}
this.h.change();
if(this.cmapOk)this.scheduleDecode()}
setIdx(i:number){
if(!this.frames.length)return;
const n=Math.max(0,Math.min(this.frames.length-1,i));
if(n===this.idx&&this.front)return;
this.idx=n;void this.show()}
setOpacity(o:number){this.opacity=o;this.applyOpacity()}
setMix(m:number){this.mix=m;this.applyOpacity()}
setView(v:View){
this.view=v;this.mix=v==='enh'?1:0.5;
this.applyOpacity();this.h.change();this.scheduleDecode()}
setThr(t:number){this.thr=t;this.scheduleDecode()}
setPlaying(p:boolean){this.playing=p;if(!p)this.scheduleDecode()}
private decVisible(){const d=this.meta;return this.view!=='raw'&&!!d&&d.view===this.view&&d.time===this.time}
private rawOp(){return Math.max(HIDE,this.opacity*(this.decVisible()?1-this.mix:1))}
private decOp(){return this.decVisible()?this.opacity*this.mix:0}
private applyOpacity(){
const m=this.map;
if(this.front&&m.getLayer(this.front))m.setPaintProperty(this.front,'raster-opacity',this.rawOp());
if(m.getLayer('sat-dec'))m.setPaintProperty('sat-dec','raster-opacity',this.decOp())}
private before(){
if(this.map.getLayer('sat-dec'))return 'sat-dec';
return this.map.getStyle()?.layers?.find(l=>l.type==='symbol')?.id}
private removeBuf(id:string){
const m=this.map;
if(m.getLayer(id))m.removeLayer(id);
if(m.getSource(id))m.removeSource(id)}
private removeAll(){
this.removeBuf('sat-a');this.removeBuf('sat-b');this.front=null;
this.removeBuf('sat-dec');
if(this.decUrl){URL.revokeObjectURL(this.decUrl);this.decUrl=null}}
private loaded(id:string,ms:number):Promise<void>{
return new Promise(res=>{
const done=()=>{clearTimeout(t);this.map.off('sourcedata',hd);res()};
const hd=(e:maplibregl.MapSourceDataEvent)=>{if(e.sourceId===id&&e.isSourceLoaded)done()};
const t=window.setTimeout(done,ms);
this.map.on('sourcedata',hd);
if(this.map.getSource(id)&&this.map.isSourceLoaded(id))done()})}
async show(){
const L=this.layer,t=this.time,m=this.map;
if(!this.on||!L||t==null||!m.getStyle())return;
const tok=++this.tok,id=this.front==='sat-a'?'sat-b':'sat-a',url=buildTileUrl(L.template,t);
this.busy=true;this.errs=0;
this.removeBuf(id);
m.addSource(id,{type:'raster',tiles:[url],tileSize:TS,maxzoom:L.maxzoom,attribution:ATTR});
m.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':HIDE,'raster-fade-duration':0,'raster-resampling':'linear'}},this.before());
const t0=performance.now();
await this.loaded(id,7000);
if(tok!==this.tok)return;
const old=this.front;this.front=id;this.busy=false;
this.applyOpacity();
if(old)this.removeBuf(old);
if(this.errs>0)this.h.status('Some satellite tiles were not returned for this time. They may be outside Himawari coverage or not yet published.','warn');
else{health.set('gibs',{ok:true,lastOk:Date.now(),err:null,ms:Math.round(performance.now()-t0)});this.h.status('','info')}
this.h.change();this.scheduleDecode()}
scheduleDecode(){
clearTimeout(this.dtimer);
this.dtimer=window.setTimeout(()=>void this.decode(),350)}
private async tile(url:string):Promise<ImageBitmap|null>{
if(this.cache.has(url)){const v=this.cache.get(url)??null;this.cache.delete(url);this.cache.set(url,v);return v}
let bm:ImageBitmap|null=null;
const r=await fetch(url);
if(r.ok)bm=await createImageBitmap(await r.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
else if(r.status!==404)throw new Error(`HTTP ${r.status}`);
if(bm)this.cache.set(url,bm);
if(this.cache.size>96){const k=this.cache.keys().next().value as string;this.cache.get(k)?.close();this.cache.delete(k)}
return bm}
private async mosaic(L:SatLayer,time:number,r:TileRng):Promise<Uint8ClampedArray>{
const w=(r.x1-r.x0+1)*TS,h=(r.y1-r.y0+1)*TS,cv=document.createElement('canvas');
cv.width=w;cv.height=h;
const ctx=cv.getContext('2d',{willReadFrequently:true}) as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled=false;
const base=buildTileUrl(L.template,time),jobs:Promise<void>[]=[];
let next=0;const cells:[number,number][]=[];
for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++)cells.push([x,y]);
const lane=async()=>{
while(next<cells.length){
const [x,y]=cells[next++],bm=await this.tile(base.replace('{z}',String(r.z)).replace('{y}',String(y)).replace('{x}',String(x)));
if(bm)ctx.drawImage(bm,(x-r.x0)*TS,(y-r.y0)*TS)}};
for(let i=0;i<(this.mobile?4:6);i++)jobs.push(lane());
await Promise.all(jobs);
return ctx.getImageData(0,0,w,h).data}
private ask(job:DecodeIn):Promise<{out:Uint8ClampedArray;bt:Float32Array;stats:Stats}>{
const local=()=>Promise.resolve(run(job));
if(!this.worker&&typeof Worker!=='undefined'){
try{
const w=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
w.onmessage=e=>{const f=this.pending.get(e.data.id);if(f){this.pending.delete(e.data.id);f(e.data)}};
w.onerror=()=>{this.worker=null;for(const[,f]of this.pending)f({ok:false,error:'worker failed'});this.pending.clear()};
this.worker=w
}catch{this.worker=null}}
const w=this.worker;
if(!w)return local();
const id=++this.wid;
return new Promise((res,rej)=>{
this.pending.set(id,r=>r.ok?res(r):rej(new Error(r.error)));
w.postMessage({id,job})}).catch(()=>local()) as Promise<{out:Uint8ClampedArray;bt:Float32Array;stats:Stats}>}
async decode(){
const L=this.layer,t=this.time;
if(!this.on||!L||t==null||this.playing||this.busy||L.kind!=='ir')return;
if(this.cmapState==='idle'){await this.ensureCmap();return}
if(!this.cmapOk)return;
const tok=++this.dtok,map=this.map,b=map.getBounds();
const r=tileRange({w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth()},map.getZoom(),L.maxzoom,this.mobile?36:49);
const native=r.z===L.maxzoom&&map.getZoom()>=L.maxzoom-0.5;
this.dstat='Decoding visible area';this.dkind='info';this.h.change();
try{
const w=(r.x1-r.x0+1)*TS,h=(r.y1-r.y0+1)*TS;
const cur=await this.mosaic(L,t,r);
if(tok!==this.dtok)return;
let prev:Uint8ClampedArray|null=null;
const pt=t-COOL_STEP,prevOk=this.frames.includes(pt);
if(this.view==='cool'&&prevOk){prev=await this.mosaic(L,pt,r);if(tok!==this.dtok)return}
const c=this.cmap as CMap;
const job:DecodeIn={w,h,cur,prev,view:this.view,thr:this.thr,native,rgb:c.rgb.slice(),btv:c.bt.slice()};
const res=await this.ask(job);
if(tok!==this.dtok)return;
this.bt=res.bt;
this.meta={z:r.z,x0:r.x0,y0:r.y0,w,h,native,time:t,view:this.view,stats:res.stats,prevOk};
await this.paint(res.out,r,w,h);
if(tok!==this.dtok)return;
this.dstat=res.stats.valid===0?'No satellite pixels in the visible area':res.stats.unmatched>res.stats.valid*0.05?'Many pixel colours did not match the colormap, so temperatures may be unreliable here':'';
this.dkind=this.dstat?'warn':'info'
}catch{
if(tok!==this.dtok)return;
this.dstat='Decoding failed. Tiles could not be read or blocked by the browser (CORS).';this.dkind='err'}
this.applyOpacity();this.h.change()}
private async paint(px:Uint8ClampedArray,r:TileRng,w:number,h:number){
const cv=document.createElement('canvas');cv.width=w;cv.height=h;
(cv.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(px),w,h),0,0);
const blob=await new Promise<Blob|null>(res=>cv.toBlob(res,'image/png'));
if(!blob)throw new Error('encode failed');
const url=URL.createObjectURL(blob),z=r.z;
const lon0=xToLon(r.x0,z),lon1=xToLon(r.x1+1,z),lat0=yToLat(r.y0,z),lat1=yToLat(r.y1+1,z);
const coordinates:[[number,number],[number,number],[number,number],[number,number]]=[[lon0,lat0],[lon1,lat0],[lon1,lat1],[lon0,lat1]];
const m=this.map,old=this.decUrl;this.decUrl=url;
const src=m.getSource('sat-dec') as maplibregl.ImageSource|undefined;
if(src)src.updateImage({url,coordinates});
else if(m.getStyle()){
m.addSource('sat-dec',{type:'image',url,coordinates});
m.addLayer({id:'sat-dec',type:'raster',source:'sat-dec',paint:{'raster-opacity':this.decOp(),'raster-fade-duration':0,'raster-resampling':'nearest'}},m.getStyle()?.layers?.find(l=>l.type==='symbol')?.id)}
if(old)setTimeout(()=>URL.revokeObjectURL(old),2000)}
private redrawDecoded(){if(this.on&&this.cmapOk&&this.ready)this.scheduleDecode()}
btAt(lon:number,lat:number):number|null{
const d=this.meta,bt=this.bt;
if(!d||!bt||this.time!==d.time)return null;
const px=Math.floor((lonToX(lon,d.z)-d.x0)*TS),py=Math.floor((latToY(lat,d.z)-d.y0)*TS);
if(px<0||py<0||px>=d.w||py>=d.h)return null;
const v=bt[py*d.w+px];
return v===v?v:null}}
