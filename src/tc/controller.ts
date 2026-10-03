import maplibregl from 'maplibre-gl';
import {fetchJson,health} from '../lib/http';
import {fmtTime,type Tz} from '../lib/time';
import type {TcPayload,Storm,Fix} from '../../api/_tc';
import {ring,fixes,track,posAt} from './geo';
export interface Opts{prob:boolean;warn:boolean;past:boolean}
export interface TcHooks{change:()=>void;open:(id:string)=>void;tz:()=>Tz}
export const STALE=9*3600;
const CATC:any=['match',['get','cat'],'TD','#3f88c5','TS','#2a9d68','STS','#c99412','TY','#d9601a','EX','#7468c4','#7d8a94'];
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const line=(a:[number,number][])=>({type:'LineString',coordinates:a.map(([la,lo])=>[lo,la])});
const F=(properties:Record<string,unknown>,geometry:unknown)=>({type:'Feature',properties,geometry});
const FC=(features:unknown[])=>({type:'FeatureCollection',features});
const GLYPH='<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9.5" fill="rgba(255,255,255,.78)" stroke="#26323a" stroke-width="1"/><path d="M11 11m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M11 3.5c-4.6 0-7 4.6-4.4 7.4M11 18.5c4.6 0 7-4.6 4.4-7.4" fill="none" stroke="#b5362a" stroke-width="1.8" stroke-linecap="round"/></svg>';
export class TcController{
on=true;opts:Opts={prob:true,warn:true,past:true};state:'idle'|'loading'|'ok'|'err'='idle';data:TcPayload|null=null;sel:string|null=null;err='';
private map:maplibregl.Map|null=null;private mk:maplibregl.Marker[]=[];private tm:maplibregl.Marker|null=null;private time:number|null=null;private timer=0;private ctl:AbortController|null=null;private pop:maplibregl.Popup|null=null;
constructor(private h:TcHooks){}
get storm():Storm|null{return this.data?.storms.find(s=>s.id===this.sel)??null}
attach(m:maplibregl.Map){
this.map=m;
m.on('style.load',()=>this.draw());
m.on('click','tc-pts',e=>{const f=e.features?.[0];if(!f)return;const p=f.properties as Record<string,unknown>;this.select(String(p.id));this.h.open(String(p.id));this.popup(e.lngLat,p)});
m.on('mouseenter','tc-pts',()=>{m.getCanvas().style.cursor='pointer'});
m.on('mouseleave','tc-pts',()=>{m.getCanvas().style.cursor=''});
this.draw()}
start(){
if(this.on)void this.load();
clearInterval(this.timer);
this.timer=window.setInterval(()=>{if(this.on&&!document.hidden)void this.load()},600000)}
async enable(on:boolean){this.on=on;if(on&&(!this.data||this.state==='err'))await this.load();else{this.draw();this.h.change()}}
setOpts(o:Partial<Opts>){this.opts={...this.opts,...o};this.draw();this.h.change()}
select(id:string){this.sel=id;this.draw();this.setTime(this.time);this.h.change()}
fly(id:string){const s=this.data?.storms.find(x=>x.id===id),g=this.data?.gdacsOnly.find(x=>String(x.id)===id),p=s?.now??s?.fc[0]??g;if(p&&this.map)this.map.flyTo({center:[p.lon,p.lat],zoom:Math.max(this.map.getZoom(),5)})}
hit(pt:maplibregl.PointLike):boolean{const m=this.map;return !!m&&!!m.getLayer('tc-pts')&&m.queryRenderedFeatures(pt,{layers:['tc-pts']}).length>0}
async load(){
this.ctl?.abort();const c=this.ctl=new AbortController();
this.state='loading';this.h.change();
try{
const d=await fetchJson<TcPayload>('tc','/api/tc',{signal:c.signal,timeout:25000,retries:1});
if(c.signal.aborted)return;
if(!d||!Array.isArray(d.storms)||!Array.isArray(d.sources))throw new Error('malformed response');
this.data=d;this.state='ok';this.err='';
for(const s of d.sources){const k=`tc-${s.id}`;health.set(k,{ok:s.ok,lastOk:s.ok?Date.now():health.get(k)?.lastOk??null,err:s.ok?null:s.msg,ms:s.ms})}
if(!this.sel||!d.storms.some(x=>x.id===this.sel))this.sel=d.storms[0]?.id??null}
catch{if(c.signal.aborted)return;this.state='err';this.err='The cyclone proxy did not return valid data.'}
this.draw();this.setTime(this.time);this.h.change()}
setTime(t:number|null){
this.time=t;
const m=this.map,s=this.storm;
this.tm?.remove();this.tm=null;
if(!m||!this.on||!s||t==null)return;
const p=posAt(s,t);if(!p)return;
const el=document.createElement('div');el.className='tct';el.setAttribute('role','img');el.setAttribute('aria-label',`Interpolated position of ${s.nameEn||'system'} at ${fmtTime(t,this.h.tz())}`);
el.innerHTML='<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="#26323a" stroke-width="3"/><circle cx="10" cy="10" r="7" fill="none" stroke="#fff" stroke-width="1.4"/></svg>';
this.tm=new maplibregl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(m)}
private popup(ll:maplibregl.LngLat,p:Record<string,unknown>){
if(!this.map)return;
this.pop?.remove();
const w=p.windKt!=null?`${p.windKt} kt (${p.windMs ?? '-'} m/s), 10-minute mean`:'wind not provided';
this.pop=new maplibregl.Popup({closeButton:true,maxWidth:'240px'}).setLngLat(ll).setHTML(`<strong>${esc(String(p.name))}</strong><br>${p.h===0?'Analysis':'Forecast +'+p.h+' h'}, ${esc(fmtTime(Number(p.t),this.h.tz()))}<br>${esc(w)}<br>Pressure ${p.pressure!=null?p.pressure+' hPa':'not provided'}<br>Source: JMA`).addTo(this.map)}
private put(id:string,data:unknown,layers:object[]){
const m=this.map as maplibregl.Map,s=m.getSource(id) as maplibregl.GeoJSONSource|undefined;
if(s){s.setData(data as never);return}
m.addSource(id,{type:'geojson',data:data as never});
for(const l of layers)m.addLayer({...l,source:id} as never)}
private clear(){
const m=this.map;if(!m)return;
for(const l of['tc-pts','tc-trk','tc-warn-l','tc-warn-f','tc-prob-l','tc-prob-f','tc-past-pre','tc-past'])if(m.getLayer(l))m.removeLayer(l);
for(const s of['tc-pts','tc-trk','tc-warn','tc-prob','tc-past'])if(m.getSource(s))m.removeSource(s);
this.mk.forEach(x=>x.remove());this.mk=[];this.tm?.remove();this.tm=null;this.pop?.remove()}
draw(){
const m=this.map;if(!m)return;
try{
if(!this.on||!this.data){this.clear();return}
const ss=this.data.storms,o=this.opts;
const past=o.past?ss.flatMap(s=>[...(s.past.length>1?[F({pre:0},line(s.past))]:[]),...(s.pre.length>1?[F({pre:1},line(s.pre))]:[])]):[];
const prob=o.prob?ss.flatMap(s=>s.fc.filter(f=>f.prob!=null).map(f=>F({cat:s.cat},{type:'Polygon',coordinates:[ring(f.lat,f.lon,f.prob as number)]}))):[];
const warn=o.warn?ss.flatMap(s=>[...fixes(s).flatMap(f=>f.storm.map(c=>({c,k:'storm'}))),...s.gale.map(c=>({c,k:'gale'}))].map(({c,k})=>F({kind:k,partial:c.partial},{type:'Polygon',coordinates:[ring(c.lat,c.lon,c.r)]}))):[];
const trk=ss.filter(s=>fixes(s).length>1).map(s=>F({cat:s.cat},{type:'LineString',coordinates:track(s)}));
const pts=ss.flatMap(s=>fixes(s).map((f:Fix)=>F({id:s.id,cat:s.cat,h:f.h,t:f.t,name:s.nameEn||`No. ${s.number}`,windKt:f.windKt,windMs:f.windMs,pressure:f.pressure},{type:'Point',coordinates:[f.lon,f.lat]})));
this.put('tc-past',FC(past),[{id:'tc-past',type:'line',filter:['==',['get','pre'],0],layout:{'line-join':'round'},paint:{'line-color':'#26323a','line-width':2.4,'line-opacity':.85}},{id:'tc-past-pre',type:'line',filter:['==',['get','pre'],1],paint:{'line-color':'#6c7b86','line-width':2,'line-dasharray':[2,2],'line-opacity':.85}}]);
this.put('tc-prob',FC(prob),[{id:'tc-prob-f',type:'fill',paint:{'fill-color':'#b5362a','fill-opacity':.06}},{id:'tc-prob-l',type:'line',paint:{'line-color':'#b5362a','line-width':1.2,'line-opacity':.8}}]);
this.put('tc-warn',FC(warn),[{id:'tc-warn-f',type:'fill',paint:{'fill-color':['match',['get','kind'],'gale','#e08a1e','#d1303a'] as any,'fill-opacity':['case',['get','partial'],.05,.12] as any}},{id:'tc-warn-l',type:'line',paint:{'line-color':['match',['get','kind'],'gale','#c9760f','#b12630'] as any,'line-width':1.4}}]);
this.put('tc-trk',FC(trk),[{id:'tc-trk',type:'line',layout:{'line-join':'round'},paint:{'line-color':'#b5362a','line-width':2.4,'line-dasharray':[3,2]}}]);
this.put('tc-pts',FC(pts),[{id:'tc-pts',type:'circle',paint:{'circle-radius':['case',['==',['get','h'],0],7,5] as any,'circle-color':CATC,'circle-stroke-color':'#ffffff','circle-stroke-width':1.6}}]);
this.mk.forEach(x=>x.remove());this.mk=[];
const add=(lon:number,lat:number,label:string,cls:string,id:string,gl:boolean)=>{
const el=document.createElement('button');el.type='button';el.className=cls;
el.innerHTML=gl?GLYPH:'<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="#fff" stroke="#26323a" stroke-width="1.3"/></svg>';
const sp=document.createElement('span');sp.textContent=label;el.append(sp);
el.setAttribute('aria-label',`${label}, tropical cyclone`);
el.addEventListener('click',ev=>{ev.stopPropagation();if(gl)this.select(id);this.h.open(id)});
this.mk.push(new maplibregl.Marker({element:el,anchor:'left',offset:[-11,0]}).setLngLat([lon,lat]).addTo(m))};
for(const s of ss){const p=s.now??s.fc[0];if(p)add(p.lon,p.lat,s.nameEn||`No. ${s.number}`,'tcm'+(s.id===this.sel?' sel':''),s.id,true)}
for(const g of this.data.gdacsOnly)add(g.lon,g.lat,g.name,'tcm alt',String(g.id),false)
}catch{m.once('idle',()=>this.draw())}}
}
