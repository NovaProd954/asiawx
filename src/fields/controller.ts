import type maplibregl from 'maplibre-gl';
import {loadFields,type FieldSet} from '../data/fields';
import {fdef,FDEFS,makeLut,legendCss,legendPos,type FDef} from './defs';
import {fieldValues} from './values';
import {extentOf,rasterSize,renderRaster} from './render';
import {fineGrid,contours,extrema} from './contour';
import {sampleCR} from './sample';
import {fmtTime,type Tz} from '../lib/time';
export interface FcHooks{change:()=>void;name:(id:string)=>string;status:(m:string,k:'info'|'warn'|'err',retry?:()=>void)=>void;dark:()=>boolean;tz:()=>Tz}
const BLANK='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const FONT=['Noto Sans Regular'];
export class FieldController{
key:string|null=null;model='';set:FieldSet|null=null;state:'idle'|'loading'|'ok'|'err'='idle';err='';opacity=0.75;contours=true;hours:number|null=null;
private map:maplibregl.Map|null=null;private time=0;private seq=0;private ctl:AbortController|null=null;private cur:Float32Array|null=null;
private urls=new Map<string,string>();private cv=document.createElement('canvas');private last='';
constructor(private h:FcHooks){}
get def():FDef|null{return fdef(this.key)}
get active():boolean{return !!this.def}
get missingVar():boolean{const d=this.def;return !!d&&!!this.set&&!this.set.vars[d.src]}
attach(m:maplibregl.Map){this.map=m;m.on('style.load',()=>{this.last='';this.draw()});this.draw()}
configure(model:string,key:string|null){this.model=model;this.key=fdef(key)?key:null;if(this.key)void this.load();else this.h.change()}
setKey(k:string|null){this.key=fdef(k)?k:null;this.last='';if(this.key&&(!this.set||this.set.model!==this.model||this.state==='err'))void this.load();else{this.draw();this.h.change()}}
setModel(m:string){if(m===this.model)return;this.model=m;this.set=null;this.cur=null;this.last='';if(this.key)void this.load();else this.h.change()}
setTime(t:number){this.time=t;this.draw()}
setOpacity(o:number){this.opacity=o;const m=this.map;if(m?.getLayer('mf-img'))m.setPaintProperty('mf-img','raster-opacity',o)}
setContours(on:boolean){this.contours=on;this.last='';this.draw();this.h.change()}
redraw(){this.last='';this.draw()}
async load(){
this.ctl?.abort();const c=this.ctl=new AbortController(),want=this.model;
this.state='loading';this.err='';this.h.change();this.draw();
try{
const s=await loadFields(want,c.signal);
if(c.signal.aborted)return;
this.set=s;this.state='ok';this.last='';
if(s.missing>0)this.h.status(`${s.missing} of ${s.g.nx*s.g.ny} grid cells were missing from the provider. Model maps have gaps there.`,'warn');
}catch{
if(c.signal.aborted)return;
this.state='err';this.err='The model fields could not be loaded.';
this.h.status('The model map data could not be loaded.','err',()=>void this.load())}
this.h.change();this.draw()}
private ensure():boolean{
const m=this.map;
if(!m)return false;
let ok=false;try{ok=!!m.getStyle()}catch{ok=false}
if(!ok)return false;
const g=this.set?.g,e=g?extentOf(g):{lon0:24,lon1:180,lat0:-12,lat1:80},co=[[e.lon0,e.lat1],[e.lon1,e.lat1],[e.lon1,e.lat0],[e.lon0,e.lat0]] as [[number,number],[number,number],[number,number],[number,number]];
if(!m.getSource('mf-img')){
m.addSource('mf-img',{type:'image',url:BLANK,coordinates:co});
const before=m.getStyle().layers.find(l=>l.type==='symbol')?.id;
m.addLayer({id:'mf-img',type:'raster',source:'mf-img',layout:{visibility:'none'},paint:{'raster-opacity':this.opacity,'raster-fade-duration':0,'raster-resampling':'linear'}},before);
m.addSource('mf-iso',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
m.addSource('mf-hl',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
m.addLayer({id:'mf-iso-line',type:'line',source:'mf-iso',layout:{visibility:'none','line-join':'round','line-cap':'round'},paint:{'line-color':this.h.dark()?'rgba(245,249,253,.82)':'rgba(24,36,48,.8)','line-width':['case',['==',['get','major'],1],1.6,0.9]}});
m.addLayer({id:'mf-iso-lab',type:'symbol',source:'mf-iso',layout:{visibility:'none','symbol-placement':'line','symbol-spacing':320,'text-field':['get','label'],'text-font':FONT,'text-size':11,'text-max-angle':35,'text-keep-upright':true},paint:{'text-color':this.h.dark()?'#f2f7fb':'#16222d','text-halo-color':this.h.dark()?'rgba(10,18,26,.85)':'rgba(255,255,255,.9)','text-halo-width':1.4}});
m.addLayer({id:'mf-hl-sym',type:'symbol',source:'mf-hl',layout:{visibility:'none','text-field':['concat',['get','t'],'\n',['get','v']],'text-font':FONT,'text-size':['case',['==',['get','t'],'H'],20,20],'text-line-height':1,'text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':['case',['==',['get','t'],'H'],'#5aa8ff','#ff6b5e'],'text-halo-color':this.h.dark()?'rgba(10,18,26,.9)':'rgba(255,255,255,.95)','text-halo-width':1.6}})}
return true}
private vis(id:string,on:boolean){const m=this.map;if(m?.getLayer(id))m.setLayoutProperty(id,'visibility',on?'visible':'none')}
private setImg(url:string){
const m=this.map,s=m?.getSource('mf-img') as maplibregl.ImageSource|undefined,g=this.set?.g;
if(!s||!g)return;
const e=extentOf(g);
s.updateImage({url,coordinates:[[e.lon0,e.lat1],[e.lon1,e.lat1],[e.lon1,e.lat0],[e.lon0,e.lat0]]})}
draw(){
if(!this.ensure())return;
const d=this.def,s=this.set,m=this.map as maplibregl.Map,dark=this.h.dark();
const on=!!d&&!!s&&!!s.vars[d.src];
this.vis('mf-img',on);
const iso=on&&!!d&&!!d.contour&&this.contours;
this.vis('mf-iso-line',iso);this.vis('mf-iso-lab',iso);this.vis('mf-hl-sym',on&&!!d&&!!d.hl&&this.contours);
if(!on||!d||!s){this.cur=null;this.hours=null;return}
const r=fieldValues(s,d,this.time);
if(!r){this.cur=null;this.hours=null;this.vis('mf-img',false);this.h.change();return}
this.cur=r.vals;
if(this.hours!==r.hours){this.hours=r.hours;this.h.change()}
const tk=d.interp==='lin'?String(Math.round(this.time/3600)):String(r.frame)+(d.interp==='sum24'?`@${Math.round(this.time/3600)}`:''),ck=`${d.k}|${s.model}|${s.run}|${dark?1:0}|${tk}`;
if(ck!==this.last){
this.last=ck;
const hit=this.urls.get(ck);
if(hit)this.setImg(hit);
else{
const {w,h}=rasterSize(extentOf(s.g)),lut=makeLut(d.stops(dark),d.vmin,d.vmax),px=renderRaster(s.g,r.vals,lut,d.vmin,d.vmax,w,h,d.lo,d.hi);
this.cv.width=w;this.cv.height=h;
const ctx=this.cv.getContext('2d') as CanvasRenderingContext2D,id=ctx.createImageData(w,h);id.data.set(px);ctx.putImageData(id,0,0);
const q=++this.seq;
this.cv.toBlob(b=>{
if(!b)return;
const u=URL.createObjectURL(b);this.urls.set(ck,u);
if(this.urls.size>28){const k=this.urls.keys().next().value as string;URL.revokeObjectURL(this.urls.get(k) as string);this.urls.delete(k)}
if(q===this.seq)this.setImg(u)},'image/png')}}
if(iso&&d.contour){
const f=fineGrid(s.g,r.vals,1),fmt=(l:number)=>String(Math.round(l));
(m.getSource('mf-iso') as maplibregl.GeoJSONSource).setData(contours(f,d.contour.step,d.contour.major,fmt) as never);
if(d.hl){
const ex=extrema(f).map(e=>({type:'Feature',properties:{t:e.t,v:String(Math.round(e.v))},geometry:{type:'Point',coordinates:[e.lon,e.lat]}}));
(m.getSource('mf-hl') as maplibregl.GeoJSONSource).setData({type:'FeatureCollection',features:ex} as never)}}
m.setPaintProperty('mf-iso-line','line-color',dark?'rgba(245,249,253,.82)':'rgba(24,36,48,.8)');
m.setPaintProperty('mf-iso-lab','text-color',dark?'#f2f7fb':'#16222d');
m.setPaintProperty('mf-iso-lab','text-halo-color',dark?'rgba(10,18,26,.85)':'rgba(255,255,255,.9)')}
valueAt(lon:number,lat:number):{d:FDef;v:number}|null{
const d=this.def,s=this.set;
if(!d||!s||!this.cur)return null;
const v=sampleCR(s.g,this.cur,lon,lat);
return v===v?{d,v:Math.max(d.lo??-Infinity,Math.min(d.hi??Infinity,v))}:null}
legend():string{
const d=this.def;
if(!d)return'';
const dk=this.h.dark(),ticks=d.ticks.map(t=>`<span style="left:${legendPos(d,t,dk).toFixed(1)}%">${t}</span>`).join('');
return`<div class="lg-t">${d.label}, ${d.unit}${d.interp==='sum24'&&this.hours!=null&&this.hours<24?` (next ${this.hours} h only)`:''}</div><div class="lg-bar fl" style="background:${legendCss(d,this.h.dark())}"></div><div class="lg-ticks fl">${ticks}</div>`}
status():string{
const s=this.set,d=this.def;
if(!d)return'Off';
if(this.state==='loading')return'Loading';
if(this.state==='err')return'Unavailable';
if(s&&!s.vars[d.src])return'Not provided by this model';
return s?`${d.label}, ${this.h.name(s.model)}${s.run!=null?`, run ${fmtTime(s.run,this.h.tz())}`:''}`:d.label}
}
export {FDEFS};
