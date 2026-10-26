import type maplibregl from 'maplibre-gl';
import {health} from '../lib/http';
import {buildTileUrl,type TFmt} from '../../api/_wmts';
import {parseColormap,type CMap} from './colormap';
import {run,calibrate,type DecodeIn,type DecodeOut,type CalibIn,type Stats,type View,type Src,type Eng} from './decode';
import {V2_DEF,v2Key,mergeHist,hiOf,histV2,type V2P,type Hist} from './real';
import {Pool} from './pool';
import type {Fit} from './calib';
import {TS,lonToX,latToY,xToLon,yToLat,tileRange,wideRange,padBox,boxOf,inside,diskArrays,ppdOf,type TileRng,type Box} from './geo';
import {cacheInfo,clearCache,keepStorage,fmtBytes,supported} from './store';
export {lonToX,latToY,xToLon,yToLat,tileRange};
export type {TileRng};
export interface SatLayer{key:string;id:string;name:string;kind:'ir'|'vis'|'rgb';tms:string;maxzoom:number;format:string;template:string;times:number[];step:number;provider:string;tfmt:TFmt;attribution:string;decode:boolean}
export interface ProviderStatus{id:string;name:string;ok:boolean;msg:string}
interface Catalog{source:string;layers:SatLayer[];providers:ProviderStatus[];fetched:number}
export interface Hooks{change:()=>void;status:(m:string,k:'info'|'warn'|'err',retry?:()=>void)=>void}
export interface Meta{z:number;x0:number;y0:number;w:number;h:number;ow:number;oh:number;native:boolean;time:number;view:View;key:string;stats:Stats;prevOk:boolean;wide:boolean;src:Src;box:Box;eng:Eng}
type Coords=[[number,number],[number,number],[number,number],[number,number]];
interface WideEntry{url:string;meta:Meta;bt:Float32Array;coords:Coords}
export type Mode='cmap'|'lum'|'vis';
export type Cov='fast'|'fine';
const abs=(u:string)=>u.startsWith('/')?location.origin+u:u;
export const tileUrl=(L:{template:string;tfmt:TFmt},t:number)=>abs(buildTileUrl(L.template,t,L.tfmt));
const HIDE=0.001,COOL_STEP=1800,DAY=864e5;
export const lumCapable=(L:{provider:string;id:string})=>(L.provider==='jma'&&L.id==='B13/TBB')||(L.provider==='realearth'&&L.id==='globalir');
export const visCapable=(L:{kind:string;id:string})=>L.kind==='vis'||L.id==='REP/ETC'||L.id==='globalvis';
export const modeOf=(L:SatLayer|null):Mode|null=>!L?null:L.decode?'cmap':lumCapable(L)?'lum':visCapable(L)?'vis':null;
const LK=(L:{provider:string;id:string})=>`asiawx.lum.v1.${L.provider}.${L.id}`;
const BND=['sat-coast','sat-bnd-case','sat-bnd','sat-adm1'];
export class SatController{
on=false;key='ir';catalog:Catalog|null=null;frames:number[]=[];idx=0;opacity=0.85;view:View='raw';thr=-52;mix=1;smoothLv=2;cov:Cov='fine';borders=true;
busy=false;playing=false;cmap:CMap|null=null;cmapState:'idle'|'loading'|'ok'|'unusable'|'error'='idle';
meta:Meta|null=null;wmeta:Meta|null=null;bt:Float32Array|null=null;wbt:Float32Array|null=null;dstat='';dkind:'info'|'warn'|'err'='info';loading=false;
lums=new Map<string,Fit>();cal=new Map<string,{s:'working'|'ok'|'fail';m:string}>();saving=false;cstat='';cinfo='';eng:Eng='v2';v2:V2P=JSON.parse(JSON.stringify(V2_DEF));loopMode=false;lost=false;fadeMs=0;
private lneedRaw=false;private rbox:Box|null=null;private rz=0;private pt:{L:SatLayer;times:number[]}|null=null;private tstore=new Map<string,ArrayBuffer>();private tseen=new Set<string>();private proto=false;private lwide:(Blob|null)[]=[];private ldet:(Blob|null)[]=[];private lwc:Coords|null=null;private ldc:Coords|null=null;private lnear=false;private lN=0;private lres=new Map<number,{raw:string|null;dec:string[];urls:string[];ok:boolean;p:Promise<void>}>();private want=-1;private lcur=-1;private fadeA=-1;private rid=0;private lraf=0;private lbox:Box|null=null;private lz=0;private byPlay=false;private pool:Pool|null=null;
private front:string|null=null;private tok=0;private dtok=0;private stok=0;private dtimer=0;private errs=0;private worker:Worker|null=null;private wid=0;
private pending=new Map<number,(r:any)=>void>();private cache=new Map<string,ImageBitmap|null>();private decUrl:string|null=null;private wurl:string|null=null;private wcache=new Map<string,WideEntry>();
private mobile=matchMedia('(pointer:coarse)').matches;
constructor(private map:maplibregl.Map,private h:Hooks){
const go=()=>{this.dropLoop(false);this.front=null;this.wmeta=null;this.meta=null;if(this.on)void this.show();this.redrawDecoded()};
map.on('style.load',go);
map.on('moveend',()=>this.scheduleDecode());
map.on('move',()=>{if(this.on&&this.meta)this.applyOpacity()});
map.on('error',e=>{
const sid=String((e as unknown as {sourceId?:string}).sourceId??'');
if(!sid.startsWith('sat-'))return;
this.errs++;const hk=this.layer?.provider??'gibs',p=health.get(hk);
health.set(hk,{ok:false,lastOk:p?.lastOk??null,err:String(e.error?.message??'tile error'),ms:null})})}
get layer():SatLayer|null{return this.catalog?.layers.find(l=>l.key===this.key)??null}
get anchor():SatLayer|null{return this.catalog?.layers.find(l=>l.provider==='gibs'&&l.kind==='ir'&&l.decode)??null}
get mode():Mode|null{return modeOf(this.layer)}
get time():number|null{return this.frames[this.idx]??null}
get ready(){return this.on&&this.frames.length>0}
get cmapOk(){return this.cmapState==='ok'&&!!this.cmap?.usable}
get lumFit():Fit|null{const f=this.lums.get(this.key);return f&&f.ok?f:null}
get engEff():Eng{return this.eng==='v2'&&(this.mode==='cmap'||this.mode==='vis')?'v2':'v1'}
get can():boolean{const m=this.mode;return m==='cmap'?this.engEff==='v2'||this.cmapOk:m==='lum'?!!this.lumFit:m==='vis'}
get views():View[]{return this.engEff==='v2'?(this.mode==='vis'?['raw','e2']:['raw','real','e2']):this.mode==='vis'?['raw','cloud']:['raw','enh','cold','conv','ot','cool','cloud']}
get btSource():string{return this.mode==='lum'?'estimated from source brightness, calibrated against GIBS':'decoded from GIBS colours'}
private get wideZ(){const L=this.layer;return L?Math.min(this.cov==='fine'?5:4,L.maxzoom):4}
get palOn(){return this.mode==='cmap'&&this.cmapOk}
curKey(){return`${this.view}|${this.thr}|${this.smoothLv}|${this.engEff}|${this.engEff==='v2'?v2Key(this.v2)+(this.palOn?'|pal':'|hue'):''}`}
async enable(on:boolean){
this.on=on;
if(!on){this.tok++;this.dtok++;this.stok++;this.saving=false;this.busy=false;this.removeAll();this.h.change();return}
void keepStorage();void this.refreshInfo();
if(!this.catalog)await this.loadCatalog();
else await this.selectLayer(this.key);
this.h.change()}
async loadCatalog(){
this.loading=true;this.h.status('Loading satellite catalog','info');this.h.change();
try{
const t0=performance.now(),r=await fetch('/api/sat',{signal:AbortSignal.timeout(45000)}),j=await r.json().catch(()=>null) as (Catalog&{error?:string;diag?:string[]})|null;
if(!r.ok||!j?.layers?.length)throw new Error(j?.diag?.join(' | ')||j?.error||`HTTP ${r.status}`);
health.set('sat',{ok:true,lastOk:Date.now(),err:null,ms:Math.round(performance.now()-t0)});
this.catalog=j;this.h.status('','info');
if(!this.layer)this.key=(j.layers.find(l=>l.key==='ir')??j.layers[0]).key;
await this.selectLayer(this.key)
}catch(e){
const p=health.get('sat');health.set('sat',{ok:false,lastOk:p?.lastOk??null,err:e instanceof Error?e.message:'failed',ms:null});
this.on=false;this.h.status(`Satellite catalog unavailable: ${e instanceof Error?e.message:'unknown error'}`,'err',()=>void this.enable(true))}
finally{this.loading=false;this.h.change()}}
async selectLayer(key:string){
this.key=key;
if(!this.on){this.h.change();return}
this.tok++;this.stok++;this.saving=false;this.removeAll();this.meta=null;this.wmeta=null;this.bt=null;this.wbt=null;
const L=this.layer;if(!L){this.frames=[];return}
if(!this.views.includes(this.view))this.view=this.mode==='vis'?'cloud':'raw';
this.frames=L.times.slice();this.idx=this.frames.length-1;
await this.probe(L);
if(this.mode==='cmap')void this.ensureCmap();
if(this.mode==='lum')this.loadLum(L);
this.dstat='';
await this.show();this.h.change()}
provName(L:SatLayer|null){return this.catalog?.providers.find(p=>p.id===L?.provider)?.name??'Satellite'}
private async probe(L:SatLayer){
try{
for(let k=0;k<3&&this.frames.length>3;k++){
const u=tileUrl(L,this.frames[this.frames.length-1]).replace('{z}','3').replace('{y}','3').replace('{x}','6');
const r=await fetch(u);
if(!r.ok){this.frames.pop();continue}
const b=await r.blob();
if(L.kind==='vis'||b.size>=1200)break;
this.frames.pop()}
}catch{this.h.status(`${this.provName(L)} imagery could not be fetched by the browser. It may be blocked (CORS) or offline.`,'err')}
this.idx=this.frames.length-1}
cmapP:Promise<void>|null=null;
ensureCmap():Promise<void>{
if(this.cmapP)return this.cmapP;
if(!this.anchor||this.cmapState!=='idle')return Promise.resolve();
const p=this.loadCmap().finally(()=>{this.cmapP=null});this.cmapP=p;return p}
private async loadCmap(){
const L=this.anchor as SatLayer;
this.cmapState='loading';this.h.change();
try{
const r=await fetch(`/api/cmap?layer=${encodeURIComponent(L.id)}`);
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const c=parseColormap(await r.text());
this.cmap=c;this.cmapState=c.usable?'ok':'unusable'
}catch{this.cmapState='error'}
if(this.cmapOk&&this.engEff==='v2'){this.wmeta=null;this.wbt=null;this.invalidate()}
this.h.change();
if(this.mode==='cmap')this.scheduleDecode()}
private loadLum(L:SatLayer){
if(this.lums.has(this.key))return;
try{
const j=JSON.parse(localStorage.getItem(LK(L))||'null');
if(j&&Date.now()-j.at<14*DAY&&Array.isArray(j.lut)&&j.lut.length===256){
this.lums.set(this.key,{ok:true,lut:Float32Array.from(j.lut),rms:j.rms,n:j.n,corr:j.corr,chroma:0,why:''});
this.cal.set(this.key,{s:'ok',m:`RMS ${(+j.rms).toFixed(1)} K against GIBS, saved on this device ${new Date(j.at).toISOString().slice(0,10)}`})}
}catch{}}
async calibrate(L:SatLayer){
const k=this.key,set=(s:'working'|'ok'|'fail',m:string)=>{this.cal.set(k,{s,m});this.h.change()};
set('working','Fitting a brightness to temperature curve against NASA GIBS Clean IR');
try{
const A=this.anchor;
if(!A){set('fail','NASA GIBS Clean IR is not in the catalog, so there is nothing to calibrate against');return}
await this.ensureCmap();
if(!this.cmapOk){set('fail','The GIBS colormap is unavailable, so there is nothing to calibrate against');return}
const t=[...L.times].reverse().find(x=>A.times.includes(x));
if(t==null){set('fail','No frame time in common with GIBS Clean IR');return}
const r=wideRange(Math.min(4,L.maxzoom,A.maxzoom),Math.min(L.maxzoom,A.maxzoom)),w=(r.x1-r.x0+1)*TS,h=(r.y1-r.y0+1)*TS;
const [src,ref]=await Promise.all([this.mosaic(L,t,r),this.mosaic(A,t,r)]),c=this.cmap as CMap;
const job:CalibIn={w,h,src,ref,rgb:c.rgb.slice(),btv:c.bt.slice(),mask:diskArrays(r)};
const fit=await this.call<Fit>('calib',job);
if(!fit.ok){set('fail',`Calibration rejected: ${fit.why}`);return}
this.lums.set(k,fit);
try{localStorage.setItem(LK(L),JSON.stringify({at:Date.now(),lut:Array.from(fit.lut),rms:fit.rms,n:fit.n,corr:fit.corr}))}catch{}
set('ok',`RMS ${fit.rms.toFixed(1)} K against GIBS over ${fit.n.toLocaleString('en-US')} px`)
}catch{set('fail','Tiles for calibration could not be read. They may be blocked (CORS) or offline.')}}
async recalibrate(){
const L=this.layer;if(!L||this.mode!=='lum')return;
this.lums.delete(this.key);this.cal.delete(this.key);
try{localStorage.removeItem(LK(L))}catch{}
await this.calibrate(L);this.scheduleDecode()}
setIdx(i:number){
if(!this.frames.length)return;
const n=Math.max(0,Math.min(this.frames.length-1,i));
if(this.loopMode){if(n===this.lcur&&this.want===n)return;this.idx=n;this.showLoop(n);return}
if(n===this.idx&&this.front)return;
this.idx=n;void this.show()}
setOpacity(o:number){this.opacity=o;this.applyOpacity()}
setMix(m:number){this.mix=m;if(this.loopMode&&m<1&&!this.lneedRaw){this.invalidate();return}this.applyOpacity()}
private mixFor(v:View){return v==='enh'||v==='cloud'||v==='real'||v==='e2'?1:0.5}
private invalidate(){this.stok++;this.saving=false;this.dropLoop(true)}
setEngine(e:Eng){
this.eng=e;
if(this.view!=='raw'&&!this.views.includes(this.view))this.view=this.engEff==='v2'?(this.mode==='vis'?'e2':'real'):this.mode==='vis'?'cloud':'enh';
this.mix=this.mixFor(this.view);
this.wmeta=null;this.wbt=null;this.invalidate();this.h.change();this.scheduleDecode()}
setV2(g:'real'|'enh'|'bg',k:string,v:string|number){
if(g==='bg')this.v2.bg=v as V2P['bg'];
else (this.v2[g] as unknown as Record<string,string|number>)[k]=v;
this.invalidate();this.scheduleDecode()}
setView(v:View){
this.view=v;this.mix=this.mixFor(v);
this.invalidate();this.applyOpacity();this.h.change();this.scheduleDecode()}
setThr(t:number){this.thr=t;this.invalidate();this.scheduleDecode()}
setSmooth(l:number){this.smoothLv=l;this.invalidate();this.applyOpacity();this.h.change();this.scheduleDecode()}
setCov(c:Cov){this.cov=c;this.wmeta=null;this.wbt=null;this.applyOpacity();this.h.change();this.scheduleDecode()}
setBorders(b:boolean){this.borders=b;this.ensureBorders();this.h.change()}
setPlaying(p:boolean){this.playing=p;if(!p){if(this.saving&&this.byPlay)this.stopSaving();this.fadeMs=0;this.scheduleDecode()}}
private vis(m:Meta|null){return this.view!=='raw'&&!!m&&m.time===this.time&&m.key===this.curKey()}
private anyVis(){return this.vis(this.meta)||this.vis(this.wmeta)}
private covered(){const m=this.meta;if(!m||!this.vis(m))return false;const b=this.map.getBounds();return inside(m.box,{w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth()})}
private rawOp(){return Math.max(HIDE,this.opacity*(this.anyVis()?1-this.mix:1))}
private applyOpacity(){
const m=this.map;
if(this.loopMode){
if(this.front&&m.getLayer(this.front))m.setPaintProperty(this.front,'raster-opacity',0);
for(const i of['sat-dec','sat-decw'])if(m.getLayer(i))m.setPaintProperty(i,'raster-opacity',0);
this.showLoop(this.lcur<0?this.idx:this.lcur);return}
if(this.front&&m.getLayer(this.front))m.setPaintProperty(this.front,'raster-opacity',this.rawOp());
if(m.getLayer('sat-dec'))m.setPaintProperty('sat-dec','raster-opacity',this.vis(this.meta)?this.opacity*this.mix:0);
if(m.getLayer('sat-decw'))m.setPaintProperty('sat-decw','raster-opacity',this.vis(this.wmeta)&&!this.covered()?this.opacity*this.mix:0)}
private anchor0(){
const m=this.map;
if(m.getLayer('sat-coast'))return 'sat-coast';
return m.getStyle()?.layers?.find(l=>l.type==='symbol')?.id}
private before(){
const m=this.map;
if(m.getLayer('sat-decw'))return 'sat-decw';
if(m.getLayer('sat-dec'))return 'sat-dec';
return this.anchor0()}
private ensureBorders(){
const m=this.map,st=m.getStyle();
if(!st)return;
if(!this.on||!this.borders){for(const i of BND)if(m.getLayer(i))m.removeLayer(i);return}
if(m.getLayer('sat-coast'))return;
const vs=Object.entries(st.sources).find(([,s])=>(s as {type?:string}).type==='vector')?.[0];
if(!vs)return;
const before=st.layers.find(l=>l.type==='symbol')?.id,lvl=['to-number',['get','admin_level'],99],sea=['!=',['get','maritime'],1];
const add=(id:string,sl:string,filter:unknown,paint:Record<string,unknown>)=>{
try{m.addLayer({id,type:'line',source:vs,'source-layer':sl,filter:filter as never,layout:{'line-join':'round','line-cap':'round'},paint:paint as never},before)}catch{}};
add('sat-coast','water',['==',['get','class'],'ocean'],{'line-color':'rgba(12,22,32,0.75)','line-width':['interpolate',['linear'],['zoom'],2,0.6,6,1,10,1.6]});
add('sat-bnd-case','boundary',['all',['<=',lvl,2],sea],{'line-color':'rgba(255,255,255,0.55)','line-width':['interpolate',['linear'],['zoom'],2,1.8,6,3,10,5]});
add('sat-bnd','boundary',['all',['<=',lvl,2],sea],{'line-color':'rgba(12,22,32,0.9)','line-width':['interpolate',['linear'],['zoom'],2,0.7,6,1.3,10,2.2]});
add('sat-adm1','boundary',['all',['>',lvl,2],['<=',lvl,4],sea],{'line-color':'rgba(12,22,32,0.55)','line-width':['interpolate',['linear'],['zoom'],3,0.4,8,0.9],'line-dasharray':[3,2]})}
private removeBuf(id:string){
const m=this.map;
if(m.getLayer(id))m.removeLayer(id);
if(m.getSource(id))m.removeSource(id)}
private removeAll(){
this.dropLoop(false);
this.removeBuf('sat-a');this.removeBuf('sat-b');this.front=null;
this.removeBuf('sat-dec');this.removeBuf('sat-decw');
for(const i of BND)if(this.map.getLayer(i))this.map.removeLayer(i);
if(this.decUrl){URL.revokeObjectURL(this.decUrl);this.decUrl=null}
for(const e of this.wcache.values())URL.revokeObjectURL(e.url);
this.wcache.clear();this.wurl=null;this.meta=null;this.wmeta=null}
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
this.ensureBorders();
const tok=++this.tok,id=this.front==='sat-a'?'sat-b':'sat-a',url=tileUrl(L,t);
this.busy=true;this.errs=0;
this.removeBuf(id);
m.addSource(id,{type:'raster',tiles:[url],tileSize:TS,maxzoom:L.maxzoom,attribution:L.attribution});
m.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':HIDE,'raster-fade-duration':0,'raster-resampling':'linear'}},this.before());
const t0=performance.now();
await this.loaded(id,7000);
if(tok!==this.tok)return;
const old=this.front;this.front=id;this.busy=false;
this.applyOpacity();
if(old)this.removeBuf(old);
if(this.errs>0)this.h.status('Some satellite tiles were not returned for this time. They may be outside Himawari coverage or not yet published.','warn');
else{health.set(L.provider,{ok:true,lastOk:Date.now(),err:null,ms:Math.round(performance.now()-t0)});this.h.status('','info')}
this.h.change();this.scheduleDecode();void this.refreshInfo()}
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
const cap=this.mobile?120:220;
if(this.cache.size>cap){const k=this.cache.keys().next().value as string;this.cache.get(k)?.close();this.cache.delete(k)}
return bm}
private async mosaic(L:SatLayer,time:number,r:TileRng):Promise<Uint8ClampedArray>{
const w=(r.x1-r.x0+1)*TS,h=(r.y1-r.y0+1)*TS,cv=document.createElement('canvas');
cv.width=w;cv.height=h;
const ctx=cv.getContext('2d',{willReadFrequently:true}) as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled=false;
const base=tileUrl(L,time),jobs:Promise<void>[]=[],cells:[number,number][]=[];
let next=0;
for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++)cells.push([x,y]);
const lane=async()=>{
while(next<cells.length){
const [x,y]=cells[next++],bm=await this.tile(base.replace('{z}',String(r.z)).replace('{y}',String(y)).replace('{x}',String(x)));
if(bm)ctx.drawImage(bm,(x-r.x0)*TS,(y-r.y0)*TS)}};
for(let i=0;i<(this.mobile?4:6);i++)jobs.push(lane());
await Promise.all(jobs);
return ctx.getImageData(0,0,w,h).data}
private call<T>(kind:'decode'|'calib',job:DecodeIn|CalibIn):Promise<T>{
const local=()=>Promise.resolve(kind==='decode'?run(job as DecodeIn):calibrate(job as CalibIn)) as Promise<T>;
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
return new Promise<T>((res,rej)=>{
this.pending.set(id,r=>r.ok?res(r.res as T):rej(new Error(r.error)));
w.postMessage({id,kind,job})}).catch(()=>local())}
private coordsOf(r:TileRng):Coords{
const b=boxOf(r);
return[[b.w,b.n],[b.e,b.n],[b.e,b.s],[b.w,b.s]]}
private async job(L:SatLayer,t:number,r:TileRng,wide:boolean,hi:number|null=null){
const w=(r.x1-r.x0+1)*TS,h=(r.y1-r.y0+1)*TS,view=this.view,mode=this.mode as Mode,src:Src=mode;
const cur=await this.mosaic(L,t,r);
let prev:Uint8ClampedArray|null=null;
const pt=t-COOL_STEP,prevOk=this.frames.includes(pt);
if(view==='cool'&&prevOk&&mode!=='vis')prev=await this.mosaic(L,pt,r);
const native=!wide&&r.z===L.maxzoom&&this.map.getZoom()>=L.maxzoom-0.5;
const eng=this.engEff,scale=eng==='v1'&&w*h<=4200000&&(view==='enh'||view==='cold'||view==='cloud')?2:1;
const lum=mode==='lum'?(this.lumFit as Fit).lut:null,c=this.cmap;
const job:DecodeIn={w,h,cur,prev,view,thr:this.thr,native,rgb:this.palOn&&c?c.rgb.slice():new Uint8Array(0),btv:this.palOn&&c?c.bt.slice():new Float32Array(0),lum,src,mask:diskArrays(r),smooth:this.smoothLv,scale,ppd:ppdOf(r.z),eng,v2:JSON.parse(JSON.stringify(this.v2)),hi,ox:r.x0*TS,oy:r.y0*TS};
const key=this.curKey(),box=boxOf(r);
const mk=(res:{ow:number;oh:number;stats:Stats}):Meta=>({z:r.z,x0:r.x0,y0:r.y0,w,h,ow:res.ow,oh:res.oh,native,time:t,view,key,stats:res.stats,prevOk,wide,src,box,eng});
return{job,mk}}
private async process(L:SatLayer,t:number,r:TileRng,wide:boolean){
const {job,mk}=await this.job(L,t,r,wide),res=await this.call<DecodeOut>('decode',job);
return{res,meta:mk(res)}}
async decode(){
const L=this.layer,t=this.time;
if(!this.on||!L||t==null||this.playing||this.busy||this.loopMode||this.saving)return;
const mode=this.mode;
if(!mode)return;
if(this.engEff==='v2'&&this.view==='raw'){this.dstat='';this.dkind='info';this.applyOpacity();this.h.change();return}
if(mode==='cmap'){
if(this.cmapState==='idle'||this.cmapState==='loading'){await this.ensureCmap();if(this.engEff==='v1'||this.cmapOk)return}
if(this.engEff==='v1'&&!this.cmapOk)return}
if(mode==='lum'&&!this.lumFit){
if(!this.cal.has(this.key))await this.calibrate(L);
if(!this.lumFit)return}
const tok=++this.dtok;
try{
const detail=this.view==='conv'||this.view==='ot'||this.map.getZoom()>=this.wideZ+0.5;
await this.decodeWide(L,t,tok);
if(tok!==this.dtok)return;
if(detail)await this.decodeDetail(L,t,tok);
else{this.meta=null;this.bt=null}
if(tok!==this.dtok)return;
const st=(this.meta??this.wmeta)?.stats;
this.dstat=!st?'':st.valid===0?'No satellite pixels in this area':mode==='cmap'&&st.unmatched>st.valid*0.05?'Many pixel colours did not match the colormap, so temperatures may be unreliable here':'';
this.dkind=this.dstat?'warn':'info'
}catch{
if(tok!==this.dtok)return;
this.dstat='Decoding failed. Tiles could not be read or blocked by the browser (CORS).';this.dkind='err'}
this.applyOpacity();this.h.change()}
private async decodeWide(L:SatLayer,t:number,tok:number){
if(this.view==='conv'||this.view==='ot'){this.wmeta=null;this.wbt=null;this.applyOpacity();return}
const r=wideRange(this.wideZ,L.maxzoom),key=`${L.key}|${t}|${this.curKey()}|${r.z}`,hit=this.wcache.get(key);
if(hit){this.wcache.delete(key);this.wcache.set(key,hit);this.applyWide(hit);return}
this.dstat='Decoding full disk';this.dkind='info';this.h.change();
const {res,meta}=await this.process(L,t,r,true);
if(tok!==this.dtok)return;
const url=await this.encode(res.out,res.ow,res.oh);
if(tok!==this.dtok){URL.revokeObjectURL(url);return}
const e:WideEntry={url,meta,bt:res.bt,coords:this.coordsOf(r)};
this.wcache.set(key,e);
while(this.wcache.size>8){
const k=this.wcache.keys().next().value as string,o=this.wcache.get(k) as WideEntry;
this.wcache.delete(k);if(o.url!==this.wurl)URL.revokeObjectURL(o.url)}
this.applyWide(e)}
private applyWide(e:WideEntry){
const old=this.wurl;
this.wurl=e.url;this.wmeta=e.meta;this.wbt=e.bt;
this.setImage('sat-decw',e.url,e.coords,false);
if(old&&old!==e.url&&![...this.wcache.values()].some(v=>v.url===old))setTimeout(()=>URL.revokeObjectURL(old),2000);
this.applyOpacity()}
private async decodeDetail(L:SatLayer,t:number,tok:number){
const map=this.map,b=map.getBounds(),vb:Box={w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth()},cap=this.mobile?36:49,z=map.getZoom();
const need=tileRange(vb,z,L.maxzoom,cap),m=this.meta;
if(m&&m.time===t&&m.key===this.curKey()&&m.z===need.z&&inside(m.box,vb)){this.applyOpacity();return}
const r=tileRange(padBox(vb,0.25),z,L.maxzoom,cap);
this.dstat='Decoding visible area';this.dkind='info';this.h.change();
const {res,meta}=await this.process(L,t,r,false);
if(tok!==this.dtok)return;
await this.paint(res.out,res.ow,res.oh,r,meta.view==='conv'||meta.view==='ot');
if(tok!==this.dtok)return;
this.bt=res.bt;this.meta=meta}
private async encodeBlob(px:Uint8ClampedArray,w:number,h:number):Promise<Blob>{
const cv=document.createElement('canvas');cv.width=w;cv.height=h;
(cv.getContext('2d') as CanvasRenderingContext2D).putImageData(new ImageData(new Uint8ClampedArray(px),w,h),0,0);
const blob=await new Promise<Blob|null>(res=>cv.toBlob(res,'image/png'));
if(!blob)throw new Error('encode failed');
return blob}
private async encode(px:Uint8ClampedArray,w:number,h:number):Promise<string>{return URL.createObjectURL(await this.encodeBlob(px,w,h))}
private setImage(id:string,url:string,coords:Coords,nearest:boolean){
const m=this.map;
if(!m.getStyle())return;
this.ensureBorders();
const src=m.getSource(id) as maplibregl.ImageSource|undefined;
if(src)src.updateImage({url,coordinates:coords});
else{
m.addSource(id,{type:'image',url,coordinates:coords});
m.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0,'raster-fade-duration':0,'raster-resampling':nearest?'nearest':'linear'}},id==='sat-dec'?this.anchor0():m.getLayer('sat-dec')?'sat-dec':this.anchor0())}
if(m.getLayer(id))m.setPaintProperty(id,'raster-resampling',nearest?'nearest':'linear')}
private async paint(px:Uint8ClampedArray,w:number,h:number,r:TileRng,nearest:boolean){
const url=await this.encode(px,w,h),old=this.decUrl;
this.decUrl=url;
this.setImage('sat-dec',url,this.coordsOf(r),nearest);
if(old)setTimeout(()=>URL.revokeObjectURL(old),2000)}
private redrawDecoded(){if(this.on&&this.can&&this.ready)this.scheduleDecode()}
btAt(lon:number,lat:number):number|null{
if(this.mode==='vis'||this.time==null||this.engEff==='v2')return null;
const pick=(d:Meta|null,bt:Float32Array|null)=>{
if(!d||!bt||d.time!==this.time)return null;
const px=Math.floor((lonToX(lon,d.z)-d.x0)*TS),py=Math.floor((latToY(lat,d.z)-d.y0)*TS);
if(px<0||py<0||px>=d.w||py>=d.h)return null;
const v=bt[py*d.w+px];
return v===v?v:null};
return pick(this.meta,this.bt)??pick(this.wmeta,this.wbt)}
async refreshInfo(){
if(!supported()){this.cinfo='Local frame cache is not available in this browser';return}
const i=await cacheInfo();
this.cinfo=i?`${i.n.toLocaleString('en-US')} tiles saved on this device${i.bytes?`, about ${fmtBytes(i.bytes)}`:''}`:'Local frame cache is not available in this browser'}
get buffering(){
if(!this.loopMode)return false;
const n=this.frames.length,nx=this.idx>=n-1?0:this.idx+1;
return !this.lres.get(nx)?.ok}
private get hasDec(){return this.lwide.length>0||this.ldet.length>0}
private getPool(){
if(!this.pool){const hc=typeof navigator!=='undefined'?navigator.hardwareConcurrency||4:4;this.pool=new Pool(Math.max(1,Math.min(this.mobile?3:4,hc-1)))}
return this.pool}
private async hist(job:DecodeIn):Promise<Hist>{
const p=this.getPool();
if(p.size){try{return await p.call<Hist>('hist',job)}catch{}}
return histV2(job)}
private async decBlob(job:DecodeIn):Promise<Blob>{
type R={blob?:Blob;out?:Uint8ClampedArray;ow:number;oh:number};
const p=this.getPool();
let r:R;
if(p.size){try{r=await p.call<R>('ldec',job)}catch{const o=run(job);r={out:o.out,ow:o.ow,oh:o.oh}}}
else{const o=run(job);r={out:o.out,ow:o.ow,oh:o.oh}}
return r.blob??await this.encodeBlob(r.out as Uint8ClampedArray,r.ow,r.oh)}
private waitAll(ids:string[],on:(n:number)=>void,stall:number,alive:()=>boolean=()=>true):Promise<void>{
const m=this.map;
return new Promise(res=>{
let last=-1,t0=performance.now();
const ck=()=>{
const n=ids.filter(i=>!i||!m.getSource(i)||m.isSourceLoaded(i)).length;
if(n!==last){last=n;t0=performance.now();on(n)}
if(n>=ids.length||!alive()||performance.now()-t0>stall){res();return}
window.setTimeout(ck,100)};
ck()})}
private fits(){
const L=this.layer;
if(!L||!this.loopMode||this.lN!==this.frames.length)return false;
const z=this.map.getZoom(),b=this.map.getBounds(),vb:Box={w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth()};
if(this.lneedRaw&&!(this.rbox&&inside(this.rbox,vb)&&Math.abs(Math.min(L.maxzoom,Math.round(z+1))-this.rz)<=1))return false;
if(!this.hasDec)return true;
if(!(this.lnear||z>=this.wideZ+0.5))return true;
if(!this.lbox)return false;
return inside(this.lbox,vb)&&(z-this.lz<=1.3||this.lz>=L.maxzoom)}
private async tileBuf(k:number,z:number,x:number,y:number):Promise<ArrayBuffer|null>{
const key=`${k}/${z}/${x}/${y}`,h=this.tstore.get(key);
if(h)return h;
const pt=this.pt;
if(!pt)return null;
const r=await fetch(tileUrl(pt.L,pt.times[k]).replace('{z}',String(z)).replace('{y}',String(y)).replace('{x}',String(x)));
if(r.status===404)return null;
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const b=await r.arrayBuffer();
this.tstore.set(key,b);return b}
private async ensureProto(){
if(this.proto)return;
const ml=(await import('maplibre-gl')).default;
ml.addProtocol('satloop',async p=>{
const m=/^satloop:\/\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(p.url);
if(!m)throw new Error('bad tile');
const k=+m[1],z=+m[2],x=+m[3],y=+m[4];
this.tseen.add(`${z}/${x}/${y}`);
const b=await this.tileBuf(k,z,x,y);
if(!b)throw new Error('404');
return{data:b.slice(0)}});
this.proto=true}
async saveLoop(byPlay=false):Promise<boolean>{
const L=this.layer,m=this.map;
if(!this.on||!L||!this.frames.length)return false;
if(this.loopMode){if(byPlay&&this.fits())return true;this.dropLoop(false)}
if(this.saving)return false;
this.saving=true;this.byPlay=byPlay;this.errs=0;
if(this.mode==='cmap'&&(this.cmapState==='idle'||this.cmapState==='loading')){this.cstat='Loading the GIBS colormap';this.h.change();await this.ensureCmap();if(!this.saving||!this.on){this.saving=false;return false}}
const my=++this.stok,N=this.frames.length,times=this.frames.slice(),view=this.view,dec=view!=='raw'&&this.can&&!!this.mode,needRaw=!dec||this.mix<1;
const zoom=m.getZoom(),bb=m.getBounds(),vb:Box={w:bb.getWest(),s:bb.getSouth(),e:bb.getEast(),n:bb.getNorth()};
const sets:{r:TileRng;wide:boolean}[]=[];
if(dec){
if(!(view==='conv'||view==='ot'))sets.push({r:wideRange(this.wideZ,L.maxzoom),wide:true});
if(view==='conv'||view==='ot'||zoom>=this.wideZ+0.5)sets.push({r:tileRange(padBox(vb,0.25),zoom,L.maxzoom,this.mobile?36:49),wide:false})}
const stale=()=>my!==this.stok||!this.saving||!this.on,calib=dec&&view==='e2'?Math.min(N,8):0,total=(needRaw?N:0)+sets.length*N+calib;
let done=0,rawDone=0;
const prog=()=>{this.cstat=`Saving loop, ${done+rawDone} of ${total}`;this.h.change()};
const wide:(Blob|null)[]=[],det:(Blob|null)[]=[];
let rbox:Box|null=null,rz2=0;
const wipe=()=>{this.tstore.clear();this.tseen.clear()};
const rawTask=async()=>{
await this.ensureProto();
this.pt={L,times};this.tstore.clear();this.tseen.clear();
const id=this.lid(0);
this.removeBuf(id);
m.addSource(id,{type:'raster',tiles:['satloop://0/{z}/{x}/{y}'],tileSize:TS,maxzoom:L.maxzoom,attribution:L.attribution});
m.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':HIDE,'raster-fade-duration':0,'raster-resampling':'linear'}},this.anchor0());
await this.waitAll([id],()=>{},45000,()=>!stale());
this.removeBuf(id);
if(stale())return;
const keys=new Set(this.tseen),pr=tileRange(padBox(vb,0.3),zoom+1,L.maxzoom,this.mobile?40:64);
for(let y=pr.y0;y<=pr.y1;y++)for(let x=pr.x0;x<=pr.x1;x++)keys.add(`${pr.z}/${x}/${y}`);
const list=[...keys].map(k=>k.split('/').map(Number)),mz=Math.max(...list.map(t=>t[0])),top=list.filter(t=>t[0]===mz);
const xs=top.map(t=>t[1]),ys=top.map(t=>t[2]);
rbox={w:xToLon(Math.min(...xs),mz),e:xToLon(Math.max(...xs)+1,mz),n:yToLat(Math.min(...ys),mz),s:yToLat(Math.max(...ys)+1,mz)};rz2=mz;
const jobs:number[][]=[];
for(let k=0;k<N;k++)for(const t of list)jobs.push([k,t[0],t[1],t[2]]);
let ji=0,jd=0;
const lane=async()=>{while(!stale()){const i=ji++;if(i>=jobs.length)return;const [k,z,x,y]=jobs[i];try{await this.tileBuf(k,z,x,y)}catch{this.errs++}jd++;rawDone=Math.floor(jd/list.length);if(jd%12===0)prog()}};
await Promise.all(Array.from({length:this.mobile?8:12},lane));
rawDone=N;prog()};
const decTask=async()=>{
if(!sets.length)return;
const pool=this.getPool(),lanes=(pool.size||1)+1;
let hi:number|null=null;
if(calib){
const idx=Array.from({length:calib},(_,i)=>Math.round(i*(N-1)/Math.max(1,calib-1))),hs:Hist[]=[];
let ci=0;
const lane=async()=>{while(!stale()){const j=ci++;if(j>=idx.length)return;const {job}=await this.job(L,times[idx[j]],sets[0].r,sets[0].wide,null);hs[j]=await this.hist(job);done++;prog()}};
await Promise.all(Array.from({length:Math.min(lanes,idx.length)},lane));
if(stale())return;
hi=hiOf(mergeHist(hs))}
const tasks:{k:number;s:number}[]=[];
for(let k=0;k<N;k++)for(let si=0;si<sets.length;si++)tasks.push({k,s:si});
let ti=0;
const lane=async()=>{while(!stale()){const i=ti++;if(i>=tasks.length)return;const {k,s:si}=tasks[i],{job}=await this.job(L,times[k],sets[si].r,sets[si].wide,hi),blob=await this.decBlob(job);(sets[si].wide?wide:det)[k]=blob;done++;prog()}};
await Promise.all(Array.from({length:lanes},lane))};
try{
this.ensureBorders();prog();
await Promise.all([needRaw?rawTask():Promise.resolve(),decTask()]);
if(stale()){wipe();this.cstat=`Stopped at ${done+rawDone} of ${total}, nothing was kept`;return false}
const ws=sets.find(x=>x.wide),ds=sets.find(x=>!x.wide);
this.lneedRaw=needRaw;this.rbox=needRaw?rbox:null;this.rz=rz2;this.lwide=ws?wide:[];this.ldet=ds?det:[];this.lwc=ws?this.coordsOf(ws.r):null;this.ldc=ds?this.coordsOf(ds.r):null;
this.lbox=ds?boxOf(ds.r):null;this.lz=ds?ds.r.z:0;this.lnear=view==='conv'||view==='ot';this.lN=N;
this.loopMode=true;this.lcur=-1;this.want=-1;
this.applyOpacity();
await this.lres.get(this.idx)?.p;
this.cstat=`Loop saved on this device, ${N} frames${dec?' (decoded)':''}${this.errs?', some tiles were not returned':''}`;
return true
}catch(e){
wipe();this.dropLoop(false);this.cstat=`Loop could not be saved: ${e instanceof Error?e.message:'unknown error'}`;return false
}finally{
this.saving=false;
this.pool?.close();this.pool=null;
await this.refreshInfo();this.h.change();
if(!this.loopMode)this.scheduleDecode()}}
stopSaving(){this.saving=false;this.stok++}
private lid(k:number){return`sat-lr${k}`}
private resident(k:number){
if(this.lres.has(k))return;
const m=this.map,L=this.layer,dec:string[]=[],urls:string[]=[],all:string[]=[],u=++this.rid;
let raw:string|null=null;
if(!m.getStyle()||!L)return;
if(this.lneedRaw){
raw=`${this.lid(k)}.${u}`;
m.addSource(raw,{type:'raster',tiles:[`satloop://${k}/{z}/{x}/{y}`],tileSize:TS,maxzoom:L.maxzoom,attribution:L.attribution});
m.addLayer({id:raw,type:'raster',source:raw,paint:{'raster-opacity':HIDE,'raster-opacity-transition':{duration:0,delay:0},'raster-fade-duration':0,'raster-resampling':'linear'}},this.anchor0());
all.push(raw)}
const add=(bl:Blob|null|undefined,co:Coords|null,tag:string)=>{
if(!bl||!co)return;
const id=`sat-l${tag}${k}.${u}`,url=URL.createObjectURL(bl);
urls.push(url);
m.addSource(id,{type:'image',url,coordinates:co});
m.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':HIDE,'raster-opacity-transition':{duration:0,delay:0},'raster-fade-duration':0,'raster-resampling':this.lnear?'nearest':'linear'}},this.anchor0());
dec.push(id);all.push(id)};
add(this.lwide[k],this.lwc,'w');add(this.ldet[k],this.ldc,'d');
const e={raw,dec,urls,ok:false,p:Promise.resolve()};
e.p=this.waitAll(all,()=>{},15000).then(()=>{e.ok=true});
this.lres.set(k,e)}
private evict(k:number){
const e=this.lres.get(k);
if(!e)return;
if(e.raw)this.removeBuf(e.raw);
for(const id of e.dec)this.removeBuf(id);
for(const u of e.urls)URL.revokeObjectURL(u);
this.lres.delete(k)}
private ensureRing(n:number){
const N=this.lN,R=this.mobile?4:6,keep=new Set<number>();
for(let i=0;i<Math.min(R,N);i++)keep.add((n+i)%N);
if(this.lcur>=0)keep.add(this.lcur);
if(this.fadeA>=0)keep.add(this.fadeA);
for(const k of keep)this.resident(k);
for(const k of[...this.lres.keys()])if(!keep.has(k))this.evict(k)}
private paintLoop(a:number,b:number,f:number){
const m=this.map,dec=this.hasDec,w=(k:number)=>k===b?(a===b?1:f):k===a?1-f:0;
const set=(id:string,op:number)=>{if(m.getLayer(id))m.setPaintProperty(id,'raster-opacity',op)};
for(const [k,e] of this.lres){
if(e.raw)set(e.raw,Math.max(HIDE,this.opacity*(dec?1-this.mix:1)*w(k)));
for(const id of e.dec)set(id,Math.max(HIDE,this.opacity*this.mix*w(k)))}}
private runPaint(a:number,n:number,fade:boolean){
cancelAnimationFrame(this.lraf);
if(fade){
this.fadeA=a;
const t0=performance.now(),d=this.fadeMs,tick=(now:number)=>{
const f=Math.min(1,(now-t0)/d);
this.paintLoop(a,n,f);
if(f<1)this.lraf=requestAnimationFrame(tick);
else{this.fadeA=-1;if(this.loopMode&&this.lcur===n)this.ensureRing(n)}};
this.lraf=requestAnimationFrame(tick)}
else{this.fadeA=-1;this.paintLoop(n,n,1)}}
private showLoop(n:number){
const a=this.lcur;
this.want=n;this.ensureRing(n);
const e=this.lres.get(n),go=()=>{
if(this.want!==n||!this.loopMode)return;
const fade=this.fadeMs>0&&this.playing&&a>=0&&n===a+1&&!!this.lres.get(a)?.ok;
this.lcur=n;this.runPaint(a,n,fade);
if(!fade)window.setTimeout(()=>{if(this.loopMode&&this.lcur===n)this.ensureRing(n)},0)};
if(!e||e.ok)go();else void e.p.then(go)}
dropLoop(restore=true){
cancelAnimationFrame(this.lraf);
const was=this.loopMode;
for(const k of[...this.lres.keys()])this.evict(k);
this.tstore.clear();this.tseen.clear();this.pt=null;this.lneedRaw=false;this.rbox=null;this.lwide=[];this.ldet=[];this.lwc=null;this.ldc=null;this.lbox=null;this.loopMode=false;this.lcur=-1;this.want=-1;this.fadeA=-1;
if(was&&this.playing){this.lost=true;this.h.change()}
if(restore&&was&&this.on&&this.map.getStyle()){this.applyOpacity();void this.show()}}
async clearSaved(){await clearCache();this.dropLoop(true);await this.refreshInfo();this.cstat='';this.h.change()}}
