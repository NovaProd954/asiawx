import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import {BOUNDS,START,MODELS,STYLES,BASES,rampFor,SOURCES} from './config';
import {loadGrid,type GridSet} from './data/grid';
import {loadPoint,valueAt,type Point} from './data/forecast';
import {search,parseCoord,inAsia,type Place} from './data/geocode';
import {health} from './lib/http';
import {sampleInto,toSpeedDir,msToKt,type Field} from './lib/wind';
import {fmtTime,fmtDay,fmtHM,compass,type Tz} from './lib/time';
import {WindLayer,type Quality} from './wind/particles';
import {renderMeteogram,renderTable} from './ui/meteogram';
import {SatController} from './sat/controller';
import {registerSW} from './sat/store';
import {satCard,satDecoderHtml,satDyn,satSig,VIEWS as DVIEWS} from './sat/ui';
import type {View,Eng} from './sat/decode';
import {TcController} from './tc/controller';
import {tcCard,tcPanel,tcSig} from './tc/ui';
import {icon,esc,PLAYI,PAUSEI,card,radios} from './ui/icons';
import {stationSvg} from './ui/station';
import {pickTicks} from './ui/timeline';
import {loadCmp,loadEns,type CmpData,type EnsData} from './data/compare';
import {loadClim,loadRecent,type ClimResp,type RecentResp} from './data/hist';
import {cmpPanel,cmpChart,cmpNow,ensBody,hisPanel,EVARS,type S as LS,type CmpState} from './cmp/ui';
import {bindPick} from './ui/charts';
import {drawDiff,nearestIdx,speedDiff,diffLegend} from './cmp/layer';
import {FieldController,FDEFS} from './fields/controller';
import {neutralRamp} from './fields/defs';
import {chips} from './cmp/ui';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const store={get(k:string){try{return localStorage.getItem(k)}catch{return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch{}}};
interface Pin{lat:number;lon:number;name:string}
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=()=>matchMedia('(max-width:760px)').matches;
const savedModel=store.get('asiawx.model');
const st={model:MODELS.some(m=>m.id===savedModel)?savedModel as string:MODELS[0].id,tz:'UTC' as Tz,idx:0,grid:null as GridSet|null,point:null as Point|null,pin:null as Pin|null,playing:false,windOn:!reduce,quality:(matchMedia('(pointer:coarse)').matches||(navigator.hardwareConcurrency||4)<=4?'low':'medium') as Quality,opacity:0.9,cmpMode:'off' as 'off'|'diff'|'split',modelB:MODELS[1].id,split:0.5,base:(BASES.some(b=>b.v===store.get('asiawx.base'))?store.get('asiawx.base'):'light') as string};
const modelInfo=()=>MODELS.find(m=>m.id===st.model) as typeof MODELS[number];


const fld=new FieldController({change:()=>{renderLayers();buildLegend();syncRamp();applyWind()},name:id=>(MODELS.find(m=>m.id===id)?.name??id),status:(m,k,r)=>setStatus(m,k,r),dark:()=>st.base==='dark',tz:()=>st.tz});
let map:maplibregl.Map|null=null,wind:WindLayer|null=null,wind2:WindLayer|null=null,gridB:GridSet|null=null,marker:maplibregl.Marker|null=null,sc:SatController|null=null,satSigV='';
const satOn=()=>!!(sc&&sc.ready);
const cur=()=>satOn()&&sc?sc.idx:st.idx;
const tmp=new Float32Array(2);
const tc=new TcController({change:tcChanged,open:openTc,tz:()=>st.tz});
tc.on=store.get('asiawx.tc')!=='off';
try{Object.assign(tc.opts,JSON.parse(store.get('asiawx.tco')||'{}'))}catch{}
let tcSigV='';
const tlTime=()=>satOn()&&sc&&sc.time!=null?sc.time:curT();

function setStatus(msg:string,kind:'info'|'warn'|'err',retry?:()=>void){
const el=$('status');el.className=msg?kind:'';el.textContent=msg;
if(msg&&retry){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent='Retry';b.onclick=retry;el.append(' ',b)}}

function hasGL(){try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch{return false}}
function field():Field|null{const g=st.grid;return g?{g:g.g,u:g.u[st.idx],v:g.v[st.idx]}:null}
function applyWind(){if(!wind)return;const on=st.windOn||st.cmpMode==='split';wind.setField(on?field():null);if(on&&st.grid)wind.start();else wind.stop();$('legend').hidden=!(fld.active||(on&&st.grid));applyCompare();updateRail()}
const curT=()=>st.grid?st.grid.times[st.idx]:Math.floor(Date.now()/3600000)*3600;
const nowIdx=(g:GridSet)=>{const n=Date.now()/1000;let k=0;for(let i=0;i<g.times.length;i++)if(g.times[i]<=n)k=i;return k};

function initMap(){
if(!hasGL()){setStatus('WebGL is not available on this device. The map and wind animation are off; search and forecasts still work.','warn');return}
try{
map=new maplibregl.Map({container:'map',style:STYLES[st.base],bounds:START,fitBoundsOptions:{padding:pad()},maxBounds:BOUNDS,minZoom:2,maxPitch:60,attributionControl:false});
map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
if(!mobile())map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right');
wind=new WindLayer(map,$<HTMLCanvasElement>('wind'));wind.setQuality(st.quality);wind.setOpacity(st.opacity);
wind2=new WindLayer(map,$<HTMLCanvasElement>('wind2'));wind2.setQuality(st.quality);wind2.setOpacity(st.opacity);syncRamp();
let dq=0;map.on('move',()=>{if(st.cmpMode!=='diff'||dq)return;dq=requestAnimationFrame(()=>{dq=0;paintDiff()})});map.on('resize',()=>{paintDiff();placeSplit()});
sc=new SatController(map,{change:satChanged,status:setStatus});tc.attach(map);fld.attach(map);fld.setOpacity(fld.opacity);renderLayers();
map.on('load',()=>health.set('basemap',{ok:true,lastOk:Date.now(),err:null,ms:null}));
map.on('error',e=>{if(String((e as unknown as {sourceId?:string}).sourceId??'').startsWith('sat-'))return;const p=health.get('basemap');health.set('basemap',{ok:false,lastOk:p?.lastOk??null,err:String(e.error?.message??'tile or style error'),ms:null})});
map.on('click',e=>{if(tc.hit(e.point))return;void selectPoint({lat:e.lngLat.lat,lon:e.lngLat.lng,name:coordName(e.lngLat.lat,e.lngLat.lng)})});
let pend=false;
map.on('mousemove',e=>{if(pend)return;pend=true;requestAnimationFrame(()=>{pend=false;readout(e.lngLat.lat,e.lngLat.lng,e.point)})});
map.on('mouseout',()=>{$('tip').hidden=true});map.on('movestart',()=>{$('tip').hidden=true});
}catch{setStatus('The map could not start on this device. Search and forecasts still work.','err');map=null;wind=null}}

const pad=()=>({top:84,bottom:mobile()?240:130,left:mobile()?12:(panelOpen()?470:96),right:mobile()?12:84});
const fmtLL=(lat:number,lon:number)=>`${Math.abs(lat).toFixed(3)}\u00b0 ${lat<0?'S':'N'}, ${Math.abs(lon).toFixed(3)}\u00b0 ${lon<0?'W':'E'}`;
const coordName=(lat:number,lon:number)=>`${Math.abs(lat).toFixed(2)}${lat<0?'S':'N'} ${Math.abs(lon).toFixed(2)}${lon<0?'W':'E'}`;
function readout(lat:number,lon:number,pt:{x:number;y:number}){
const f=field();let w='No wind data here';
if(f&&sampleInto(f,lon,lat,tmp)){const r=toSpeedDir(tmp[0],tmp[1]);w=`Wind ${r.speed.toFixed(1)} m/s (${msToKt(r.speed).toFixed(0)} kt) from ${Math.round(r.dir)}\u00b0 ${compass(r.dir)}`}
let cmpL='';if(st.cmpMode!=='off'&&st.grid&&gridB){const r=speedDiff(field() as Field,fieldB() as Field,lon,lat);if(r)cmpL=`<div>${esc(modelInfo().name)} ${r.a.toFixed(1)} m/s, ${esc(modelBInfo().name)} ${r.b.toFixed(1)} m/s, diff ${r.a-r.b>=0?'+':'\u2212'}${Math.abs(r.a-r.b).toFixed(1)}</div>`}
const fv=fld.valueAt(lon,lat),fL=fv?`<div>${esc(fv.d.label)} ${fv.v.toFixed(fv.d.dec)} ${fv.d.unit}</div>`:'';
const bt=sc?.btAt(lon,lat);
const tip=$('tip');tip.innerHTML=`<div>${coordName(lat,lon)}</div><div>${w}</div>${fL}${cmpL}${bt!=null?`<div>Cloud top ${bt.toFixed(1)} \u00b0C, approximate</div>`:''}`;tip.hidden=false;
const W=$('mapwrap').clientWidth,tw=tip.offsetWidth;tip.style.left=`${pt.x+18+tw>W?Math.max(4,pt.x-18-tw):pt.x+18}px`;tip.style.top=`${Math.max(4,pt.y+18)}px`}

const windRamp=()=>fld.active?neutralRamp(st.base==='dark'):rampFor(st.base);
function syncRamp(){const r=windRamp();wind?.setRamp(r);wind2?.setRamp(r)}
function buildLegend(){
if(fld.active){$('legend').innerHTML=fld.legend();return}
const r=rampFor(st.base),stops=r.map(([v,c])=>`${c} ${(v/25*100).toFixed(0)}%`).join(',');
$('legend').innerHTML=`<div class="lg-t">10 m wind speed, m/s</div><div class="lg-bar" style="background:linear-gradient(to right,${stops})"></div><div class="lg-ticks"><span>0</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25+</span></div>`}

const frameTimes=():number[]=>satOn()&&sc?sc.frames:st.grid?st.grid.times:[];
const tzOff=()=>st.tz==='UTC'?0:-new Date().getTimezoneOffset()*60;
function renderTicks(){
const ts=frameTimes(),el=$('ticks');
if(ts.length<2){el.innerHTML='';return}
const n=ts.length,tk=pickTicks(ts,mobile()?5:8,tzOff()),mj=new Set(tk.map(k=>k.i)),x=(i:number)=>(i/(n-1)*100).toFixed(3);
let h='';
if(n<=240)for(let i=0;i<n;i++)if(!mj.has(i))h+=`<i class="tk" style="left:${x(i)}%"></i>`;
for(const k of tk)h+=`<i class="tk mj${k.major?' dy':''}" style="left:${x(k.i)}%"><span>${k.major?fmtDay(k.t,st.tz):fmtHM(k.t,st.tz)}</span></i>`;
el.innerHTML=h}
function moveMark(){
const n=frameTimes().length,f=n>1?cur()/(n-1):0;
$('marker').style.left=`${(f*100).toFixed(3)}%`}
function updateTime(){
tc.setTime(tlTime());
const g=st.grid,el=$('tl-time');
if(satOn()&&sc&&sc.time!=null)el.innerHTML=`<strong>${fmtTime(sc.time,st.tz)}</strong><span>Observed, ${esc(sc.layer?sc.layer.name:'satellite')}</span>`;
else if(!g)el.innerHTML='<strong>No timeline</strong><span>Wind field not loaded</span>';
else{const t=g.times[st.idx],now=Date.now()/1000,h=g.run!=null?Math.round((t-g.run)/3600):null;el.innerHTML=`<strong>${fmtTime(t,st.tz)}</strong><span>${t>now+1800?'Forecast':'Model value'}${h!=null?`, +${h} h of run`:''}</span>`}
moveMark()}

function windIdxFor(t:number){const g=st.grid;if(!g)return 0;let k=0,b=Infinity;for(let i=0;i<g.times.length;i++){const d=Math.abs(g.times[i]-t);if(d<b){b=d;k=i}}return k}
function configSlider(){renderTicks();const s=$<HTMLInputElement>('slider');if(satOn()&&sc){s.max=String(sc.frames.length-1);s.value=String(sc.idx);s.disabled=false}else if(st.grid){s.max=String(st.grid.times.length-1);s.value=String(st.idx);s.disabled=false}else s.disabled=true;moveMark()}
function setFrame(i:number){if(!sc)return;sc.setIdx(i);$<HTMLInputElement>('slider').value=String(sc.idx);if(st.grid&&sc.time!=null)setWindIdx(windIdxFor(sc.time));else updateTime()}
function setIdx(i:number){if(satOn())setFrame(i);else setWindIdx(i)}
function satChanged(){
configSlider();
if(satOn()&&sc&&sc.time!=null&&st.grid){const k=windIdxFor(sc.time);if(k!==st.idx)setWindIdx(k)}
updateTime();
const sig=satSig(sc);
if(sig!==satSigV){satSigV=sig;renderLayers();renderDecoder()}satDyn(sc,st.tz);
if(sc?.lost){sc.lost=false;stop()}}
function setWindIdx(i:number){
const g=st.grid;if(!g)return;
st.idx=Math.max(0,Math.min(g.times.length-1,i));
if(!satOn())$<HTMLInputElement>('slider').value=String(st.idx);
if(st.grid)fld.setTime(st.grid.times[st.idx]);applyWind();updateTime();updateConditions();updateChart();updateCmp();paintDiff();
const v=$('dec-valid');if(v)v.textContent=fmtTime(g.times[st.idx],st.tz)}

let gctl:AbortController|null=null;
async function loadWind(){
gctl?.abort();const c=gctl=new AbortController();
setStatus(`Loading ${modelInfo().name} wind field`,'info');
try{
const g=await loadGrid(st.model,c.signal);
if(c.signal.aborted)return;
st.grid=g;configSlider();
if(satOn()&&sc)setFrame(sc.idx);else setWindIdx(nowIdx(g));renderDecoder();renderSources();
const age=Date.now()/1000-g.fetched;
if(g.missing>0)setStatus(`${g.missing} of ${g.g.nx*g.g.ny} grid cells were missing from the provider. Wind is not drawn there.`,'warn');
else if(age>6*3600)setStatus('Wind data is more than 6 hours old.','warn');
else setStatus('','info')
}catch{
if(c.signal.aborted)return;
st.grid=null;configSlider();applyWind();updateTime();renderDecoder();renderSources();
setStatus('Wind field unavailable. The provider or proxy did not respond with valid data.','err',loadWind)}}

function placeMarker(){
if(!map||!st.pin)return;
if(!marker){const el=document.createElement('div');el.className='pin';el.innerHTML='<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="7" fill="none" stroke="#0e1a22" stroke-width="2.5"/><circle cx="13" cy="13" r="7" fill="none" stroke="#58b6cc" stroke-width="1.2"/><path d="M13 1v6M13 19v6M1 13h6M19 13h6" stroke="#0e1a22" stroke-width="2" stroke-linecap="round"/></svg>';marker=new maplibregl.Marker({element:el}).setLngLat([st.pin.lon,st.pin.lat]).addTo(map)}
else marker.setLngLat([st.pin.lon,st.pin.lat])}

let pctl:AbortController|null=null;
async function selectPoint(p:Pin){
if(!inAsia(p.lat,p.lon)){setStatus('That point is outside the Asian domain (25E to 180E, 12S to 80N).','warn');return}
st.pin=p;placeMarker();renderTc();showCard('loc');updateRail();
await loadLocation()}
async function loadLocation(){
const p=st.pin;if(!p)return;
pctl?.abort();const c=pctl=new AbortController();
st.point=null;renderLocation('loading');
try{const d=await loadPoint(st.model,p.lat,p.lon,c.signal);if(c.signal.aborted)return;st.point=d;renderLocation('ok')}
catch{if(c.signal.aborted)return;renderLocation('err')}}

function updateConditions(){
const el=document.getElementById('cond'),p=st.point,pin=st.pin;if(!el||!p||!pin)return;
const t=curT(),val=(k:string)=>valueAt(p,k,t),none=(k:string)=>p.vars[k].every(x=>x==null)?'Not provided by this model':'-';
const fx=(k:string,d:number,u:string)=>{const v=val(k);return v==null?none(k):`${v.toFixed(d)} ${u}`};
const s=val('wind_speed_10m'),dr=val('wind_direction_10m'),pr=val('pressure_msl'),p3=valueAt(p,'pressure_msl',t-10800),tp=val('temperature_2m'),rh=val('relative_humidity_2m'),ap=val('apparent_temperature'),td=val('dew_point_2m');
const dp=pr!=null&&p3!=null?pr-p3:null,kt=s==null?null:msToKt(s);
const tile=(l:string,v:string,u:string,sub:string)=>`<div class="stat"><small>${l}</small><b>${v}<i>${u}</i></b><em>${sub}</em></div>`;
const n=Date.now()/1000,a=p.sunrise.find(x=>x>n),b=p.sunset.find(x=>x>n);
let h=`<div class="hero">${stationSvg({t:tp,td,p:pr,dp,cc:val('cloud_cover'),kt,dir:dr,south:pin.lat<0})}</div><div class="cap">Station model plotted from model values valid ${fmtTime(t,st.tz)}. These are forecast values, not observations.</div><div class="stats">`;
h+=tile('Temperature',tp==null?'-':tp.toFixed(1),'\u00b0C',ap==null?'&nbsp;':`Feels ${ap.toFixed(1)} \u00b0C`);
h+=tile('Wind',s==null?'-':s.toFixed(1),'m/s',s==null?'&nbsp;':`${kt==null?'':Math.round(kt)+' kt'}${dr==null?'':` ${compass(dr)} ${Math.round(dr)}\u00b0`}`);
h+=tile('Pressure',pr==null?'-':pr.toFixed(0),'hPa',dp==null?'&nbsp;':`${dp>0?'+':''}${dp.toFixed(1)} in 3 h`);
h+=tile('Humidity',rh==null?'-':rh.toFixed(0),'%',td==null?'&nbsp;':`Dew point ${td.toFixed(1)} \u00b0C`);
h+=`</div><dl class="kv rows"><dt>Gusts at 10 m</dt><dd>${fx('wind_gusts_10m',1,'m/s')}</dd><dt>Cloud cover</dt><dd>${fx('cloud_cover',0,'%')}</dd><dt>Rain, preceding hour</dt><dd>${fx('precipitation',1,'mm')}</dd><dt>Rain probability</dt><dd>${fx('precipitation_probability',0,'%')}</dd><dt>Next sunrise</dt><dd>${a?fmtTime(a,st.tz):'-'}</dd><dt>Next sunset</dt><dd>${b?fmtTime(b,st.tz):'-'}</dd></dl>`;
el.innerHTML=h}
function updateChart(){
const host=document.getElementById('mg'),p=st.point;if(!host||!p)return;
renderMeteogram(host,p,curT(),st.tz,t=>{const g=st.grid;if(!g)return;const i=Math.round((t-g.times[0])/3600);if(i>=0&&i<g.times.length)setIdx(i)});
const tb=document.getElementById('tb');if(tb)renderTable(tb,p,st.tz)}

const bookmarks=():Pin[]=>{try{return JSON.parse(store.get('asiawx.bm')||'[]')}catch{return[]}};
const isSaved=(p:Pin)=>bookmarks().some(x=>Math.abs(x.lat-p.lat)<0.01&&Math.abs(x.lon-p.lon)<0.01);
function placesHtml(){const b=bookmarks();return b.length?`<ul class="saved">${b.map((x,i)=>`<li><button type="button" class="link" data-act="go" data-i="${i}">${esc(x.name)}</button><button type="button" class="btn sm" data-act="del" data-i="${i}" aria-label="Remove ${esc(x.name)}">Remove</button></li>`).join('')}</ul>`:'<p class="note">No saved places yet. Open a forecast and choose Save.</p>'}
function renderLocation(state:'loading'|'ok'|'err'){
const el=$('p-loc'),p=st.pin;
if(!p){el.innerHTML='<div class="empty"><p>Select a point on the map or search for a place to open its forecast. Coordinates such as 14.6, 121.0 also work.</p></div>';return}
const sv=isSaved(p);
let h=`<div class="hd"><div><h2>${esc(p.name)}</h2><div class="coords">${fmtLL(p.lat,p.lon)}</div></div><button type="button" class="btn sm" data-act="save" ${sv?'disabled':''}>${sv?'Saved':'Save place'}</button></div>`;
if(state==='loading'){el.innerHTML=h+'<p class="note">Loading forecast</p>';return}
if(state==='err'||!st.point){el.innerHTML=h+`<p class="note err">The forecast could not be loaded. The provider or proxy failed, or the point is outside model coverage.</p><button type="button" class="btn" data-act="retry">Retry</button>`;return}
const d=st.point;
h+=`<div id="cond"></div><h3>Five-day meteogram</h3><div id="mg"></div><details><summary>Data table, every 3 hours</summary><div id="tb" class="scroll"></div></details><details><summary>Source and model run</summary><dl class="kv"><dt>Model</dt><dd>${esc(modelInfo().name)}, ${esc(modelInfo().res)}</dd><dt>Run</dt><dd>${d.run!=null?fmtTime(d.run,st.tz):'Not provided by source'}</dd><dt>Fetched</dt><dd>${fmtTime(d.fetched,st.tz)}</dd><dt>Source</dt><dd>Open-Meteo API</dd><dt>Model cell elevation</dt><dd>${d.elev==null?'-':Math.round(d.elev)+' m'}</dd></dl></details>`;
el.innerHTML=h;updateConditions();updateChart()}

function renderDecoder(){
const m=modelInfo(),g=st.grid;
$('p-dec').innerHTML=(satOn()?'':`<section class="lay off"><div class="lay-h"><span class="tile">${icon('sat',20)}</span><span class="lab"><b>Satellite is off</b><small>The decoder works on the satellite layer</small></span></div><div class="lay-b"><p class="note">Turn on a Himawari product to decode cloud temperature, convective candidates and cloud structure.</p><button type="button" class="btn pri" data-act="sat-on">Turn on satellite</button></div></section><section class="lay off"><div class="lay-h"><span class="tile">${icon('dec',20)}</span><span class="lab"><b>Decoder views</b><small>${DVIEWS.length} views, available with satellite on</small></span></div><div class="lay-b"><ul class="vl">${DVIEWS.map(v=>`<li><b>${esc(v[1])}</b><small>${esc(v[2])}</small></li>`).join('')}</ul></div></section>`)+satDecoderHtml(sc,st.tz)+`<details><summary>About the 10 m wind field</summary><dl class="kv"><dt>Measures</dt><dd>Horizontal wind velocity 10 m above ground, computed by a numerical weather model</dd><dt>Units</dt><dd>Metres per second; knots shown in readouts</dd><dt>Product type</dt><dd>Model forecast, interpolated between grid points. Not an observation.</dd><dt>Model</dt><dd>${esc(m.name)} (${esc(m.org)}), ${esc(m.res)}</dd><dt>Run</dt><dd>${g?(g.run!=null?fmtTime(g.run,st.tz):'Not provided by source'):'No data loaded'}</dd><dt>Valid</dt><dd id="dec-valid">${g?fmtTime(g.times[st.idx],st.tz):'-'}</dd><dt>Delivered via</dt><dd>Open-Meteo API, fetched ${g?fmtTime(g.fetched,st.tz):'-'}</dd><dt>Field grid</dt><dd>${g?`${g.g.nx} by ${g.g.ny} points every ${g.g.d} deg, ${g.g.lon0}E to ${g.g.lon0+(g.g.nx-1)*g.g.d}E, ${g.g.lat0}N to ${g.g.lat0+(g.g.ny-1)*g.g.d}N`:'-'}</dd><dt>Level</dt><dd>10 m above ground (the only level in this build)</dd><dt>Colors</dt><dd>Particle color encodes speed on the legend scale. Particle length and trail follow direction.</dd></dl>
<details><summary>Method</summary><p>Each grid point supplies speed s and meteorological direction d (the direction the wind blows from). Components are u = -s sin(d) and v = -s cos(d), with u eastward and v northward. Each particle samples u and v by bilinear interpolation in longitude and latitude. If any of the four surrounding grid values is missing, the particle is removed instead of interpolating across the gap. Each frame a particle moves proportionally to its local speed in screen pixels, so apparent motion scales with wind speed but is not real-time displacement. Fields change in hourly steps with no temporal interpolation.</p></details>
<h3>Limitations</h3><ul class="lim"><li>The field is sampled every 6 degrees, coarser than the model. Jets, tropical cyclone cores, sea breezes and terrain flows are smoothed or absent.</li><li>Forecast values at past hours are model output, not measurements.</li><li>Missing cells are left empty, never filled.</li><li>Radar and nowcasting are not in this build; satellite and cyclone layers describe themselves when enabled.</li></ul></details>`}

function renderSources(){
const stat=(k:string)=>{const h=health.get(k);if(!h)return'No request made yet';if(h.ok)return`Responding${h.ms!=null?`, ${h.ms} ms`:''}${h.lastOk?`, last success ${fmtTime(h.lastOk/1000,st.tz)}`:''}`;return`Failing: ${esc(h.err??'unknown error')}${h.lastOk?`, last success ${fmtTime(h.lastOk/1000,st.tz)}`:''}`};
$('p-src').innerHTML=`<h2>Data sources</h2>`+SOURCES.map(s=>`<article class="src"><h3>${esc(s.name)}</h3><dl class="kv"><dt>Provides</dt><dd>${esc(s.what)}</dd><dt>Status</dt><dd class="${health.get(s.key)?.ok===false?'err':''}">${stat(s.key)}</dd><dt>License</dt><dd>${esc(s.license)}</dd><dt>Attribution</dt><dd>${esc(s.attribution)}</dd><dt>Coverage</dt><dd>${esc(s.coverage)}</dd><dt>Updates</dt><dd>${esc(s.update)}</dd></dl></article>`).join('')+`<article class="src"><h3>Models behind the forecasts</h3><dl class="kv">${MODELS.map(m=>`<dt>${esc(m.name)}</dt><dd>${esc(m.org)}; ${esc(m.res)}; ${esc(m.license)}</dd>`).join('')}</dl></article>`}

function renderTc(){if($('p-tc').hidden)return;$('p-tc').innerHTML=tcPanel(tc,st.tz,st.pin)}
function tcChanged(){const g=tcSig(tc);if(g!==tcSigV){tcSigV=g;renderLayers()}if(!$('p-tc').hidden)renderTc();if(!$('p-src').hidden)renderSources()}
function openTc(){showCard('tc')}
function setModel(id:string){st.model=id;store.set('asiawx.model',id);fixB();fld.setModel(id);stop();void loadWind();if(st.pin)void loadLocation();if(st.cmpMode!=='off'){gridB=null;void loadB()}renderLayers()}
function setBase(v:string){st.base=v;$('app').classList.toggle('lt',v!=='dark');store.set('asiawx.base',v);map?.setStyle(STYLES[v]);syncRamp();buildLegend();renderLayers()}
function renderModelSeg(){
$('modelseg').innerHTML=MODELS.map(x=>`<label title="${esc(x.org)}, ${esc(x.res)}"><input type="radio" name="l-model" value="${x.id}" ${x.id===st.model?'checked':''}><span>${esc(x.name)}</span></label>`).join('')}
function windCard(){
return card({id:'wind',icon:'wind',label:'Wind particles',sub:'10 m wind, animated',sw:{id:'l-wind',on:st.windOn},body:`<div class="ctl"><label for="l-op">Opacity</label><input type="range" id="l-op" min="0.2" max="1" step="0.05" value="${st.opacity}"></div><div class="ctl"><label for="l-q">Particle density</label><select id="l-q"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><p class="note">Density defaults to Low on touch and low-core devices. Animation starts off when reduced motion is requested.</p>`})}
function updateRail(){
const on:Record<string,boolean>={fc:!!st.pin,wx:st.windOn||fld.active||st.cmpMode!=='off',sat:satOn(),dec:satOn(),tc:tc.on,map:false,src:false};
for(const b of document.querySelectorAll<HTMLElement>('#rail .rl')){const v=b.dataset.v as string;b.toggleAttribute('data-on',!!on[v])}}
function renderLayers(){
const a=document.activeElement as HTMLInputElement|null,host=$('panel');
const fk=a&&host.contains(a)&&a.closest('.lay')?(a.id?`#${a.id}`:a.name?`input[name="${a.name}"][value="${a.value}"]`:''):'';
const bs=BASES.find(b=>b.v===st.base);
$('h-wx').innerHTML=windCard()+fldCard()+cmpCard();
$('h-sat').innerHTML=satCard(sc);
$('h-tc').innerHTML=tcCard(tc);
$('h-map').innerHTML=card({id:'base',icon:'map',label:'Base map',sub:bs?bs.l:'',body:radios('l-base','Base map',BASES,st.base)})+card({id:'places',icon:'pin',label:'Saved places',sub:bookmarks().length?`${bookmarks().length} saved`:'None saved',body:placesHtml()});
const q=document.getElementById('l-q') as HTMLSelectElement|null;if(q)q.value=st.quality;
renderModelSeg();updateRail();
if(fk){const f=host.querySelector<HTMLElement>(fk);f?.focus()}}

const FT=['loc','cmp','his'],VIEWS=['fc','wx','sat','dec','tc','map','src'];
const VT:Record<string,[string,string]>={fc:['Forecast','Point forecast, model comparison and history'],wx:['Weather layers','Model maps, wind and model comparison'],sat:['Satellite','Himawari imagery and saved loops'],dec:['Cloud Decoder','Decode temperature and cloud structure from imagery'],tc:['Tropical cyclones','Active storms, tracks and warnings'],map:['Map and places','Base map and saved places'],src:['Data sources','Where each layer comes from and its status']};
let view='wx',fsub='loc';
const panelOpen=()=>!$('app').classList.contains('pclosed');
function setTabs(list:string[],n:string){for(const t of list){const on=t===n;$(`t-${t}`).setAttribute('aria-selected',String(on));$(`t-${t}`).tabIndex=on?0:-1;$(`p-${t}`).hidden=!on}}
function onTab(n:string){if(n==='cmp'){renderCmp();void ensureCmp()}else if(n==='his'){renderHis();void ensureHis()}}
function setPanel(o:boolean){$('app').classList.toggle('pclosed',!o);for(const b of document.querySelectorAll<HTMLElement>('#rail .rl'))b.setAttribute('aria-pressed',String(o&&b.dataset.v===view));if(map&&!mobile())setTimeout(()=>map?.resize(),0)}
function setView(v:string,open=true){
view=v;for(const x of VIEWS)$(`v-${x}`).hidden=x!==v;
$('ptitle').textContent=VT[v][0];$('psub').textContent=VT[v][1];
$('p-tc').hidden=v!=='tc';$('p-dec').hidden=v!=='dec';$('p-src').hidden=v!=='src';
if(v==='fc'){setTabs(FT,fsub);onTab(fsub)}else for(const t of FT)$(`p-${t}`).hidden=true;
if(v==='tc')renderTc();else if(v==='dec')renderDecoder();else if(v==='src')renderSources();
setPanel(open)}
function showCard(n:string){if(n==='tc')setView('tc');else{fsub=n;setView('fc')}}
function closeCard(){setPanel(false)}
function tabKeys(host:HTMLElement,list:string[],pick:(n:string)=>void){
host.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('button[role=tab]');if(b)pick(b.id.slice(2))});
host.addEventListener('keydown',e=>{const i=list.findIndex(t=>$(`t-${t}`).getAttribute('aria-selected')==='true'),d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(d){const n=list[(i+d+list.length)%list.length];pick(n);$(`t-${n}`).focus()}})}
function setTz(t:Tz){st.tz=t;$('tz-u').setAttribute('aria-pressed',String(t==='UTC'));$('tz-l').setAttribute('aria-pressed',String(t!=='UTC'));updateTime();renderTicks();renderDecoder();renderSources();renderTc();renderCmp();renderHis();if(st.pin)renderLocation(st.point?'ok':'loading')}

let ptimer=0;
function stop(){st.playing=false;sc?.setPlaying(false);clearInterval(ptimer);$('play').innerHTML=PLAYI;$('play').setAttribute('aria-label','Play timeline')}
function play(){const n=()=>satOn()&&sc?sc.frames.length:st.grid?st.grid.times.length:0;if(!n())return;st.playing=true;sc?.setPlaying(true);$('play').innerHTML=PAUSEI;$('play').setAttribute('aria-label','Pause timeline');clearInterval(ptimer);
const sp=+(document.querySelector('#speedseg [aria-pressed="true"]') as HTMLElement).dataset.ms!,go=()=>{if(sc)sc.fadeMs=Math.min(350,Math.round(sp*0.85));ptimer=window.setInterval(()=>{if(satOn()&&(sc?.busy||sc?.buffering))return;const c=cur();setIdx(c>=n()-1?0:c+1)},sp)};
if(satOn()&&sc&&!sc.loopMode){void sc.saveLoop(true).then(ok=>{if(!st.playing)return;if(!ok){stop();return}go()});return}
go()}

function initUi(){
$('app').classList.toggle('lt',st.base!=='dark');
$('play').innerHTML=PLAYI;
$('tz-u').addEventListener('click',()=>setTz('UTC'));$('tz-l').addEventListener('click',()=>setTz('Local'));
$('play').addEventListener('click',()=>st.playing?stop():play());
$('prev').addEventListener('click',()=>{stop();setIdx(cur()-1)});
$('next').addEventListener('click',()=>{stop();setIdx(cur()+1)});
$('slider').addEventListener('input',e=>{stop();setIdx(+(e.target as HTMLInputElement).value)});
$('now').addEventListener('click',()=>{stop();if(satOn()&&sc)setFrame(sc.frames.length-1);else if(st.grid)setWindIdx(nowIdx(st.grid))});
$('speedseg').addEventListener('click',e=>{let b=(e.target as HTMLElement).closest('button[data-ms]') as HTMLElement|null;if(!b)return;if(mobile()){const all=[...$('speedseg').querySelectorAll<HTMLElement>('button')];b=all[(all.indexOf(b)+1)%all.length]}for(const x of $('speedseg').querySelectorAll('button'))x.setAttribute('aria-pressed',String(x===b));if(st.playing)play()});
$('zin').addEventListener('click',()=>map?.zoomIn());
$('zout').addEventListener('click',()=>map?.zoomOut());
$('fit').addEventListener('click',()=>map?.fitBounds(START,{padding:pad()}));
$('pclose').addEventListener('click',closeCard);
for(const b of document.querySelectorAll<HTMLElement>('#rail .rl'))b.addEventListener('click',()=>{const v=b.dataset.v as string;if(v===view&&panelOpen())setPanel(false);else setView(v)});
tabKeys($('fcseg'),FT,n=>{fsub=n;setTabs(FT,n);onTab(n)});
$('p-cmp').addEventListener('change',e=>{const t=e.target as HTMLInputElement;if(t.name==='cv')cm.cv=t.value;else if(t.name==='ce')cm.ei=t.value;else if(t.name==='cev')cm.ev=t.value;else return;renderCmp();document.querySelector<HTMLInputElement>(`#p-cmp input[name="${t.name}"][value="${t.value}"]`)?.focus()});
$('p-cmp').addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('[data-act]') as HTMLElement|null;if(!b)return;if(b.dataset.act==='cmp-retry')void ensureCmp(true);else if(b.dataset.act==='ens-retry')void ensureEns(true)});
$('p-his').addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('[data-act]') as HTMLElement|null;if(b?.dataset.act==='his-retry')void ensureHis(true)});
matchMedia('(max-width:760px)').addEventListener('change',()=>{setPanel(!mobile());renderTicks();moveMark();map?.resize()});
new ResizeObserver(()=>{renderTicks();moveMark()}).observe($('track'));
$('panel').addEventListener('change',e=>{const t=e.target as HTMLInputElement;
if(t.name==='l-model'){setModel(t.value);return}
if(t.name==='l-base'){setBase(t.value);return}
if(t.name==='l-fld'){const k=t.value==='off'?null:t.value;store.set('asiawx.fld',k??'off');fld.setKey(k);return}
if(t.id==='l-fc'){fld.setContours(t.checked);return}
if(t.name==='l-cm'){setCmpMode(t.value as 'off'|'diff'|'split');return}
if(t.id==='l-mb'){st.modelB=t.value;gridB=null;void loadB();renderLayers();return}
if(t.id==='l-wind'){st.windOn=t.checked;applyWind();return}
if(t.id==='l-q'){st.quality=t.value as Quality;wind?.setQuality(st.quality);wind2?.setQuality(st.quality);return}
if(t.id==='l-tc'){store.set('asiawx.tc',t.checked?'on':'off');void tc.enable(t.checked);return}
const ok:Record<string,keyof typeof tc.opts>={'l-tcp':'prob','l-tcw':'warn','l-tcpast':'past','l-tcr':'radii','l-tcd':'danger'};
if(ok[t.id]){tc.setOpts({[ok[t.id]]:t.checked});store.set('asiawx.tco',JSON.stringify(tc.opts));return}
if(!sc)return;
if(t.id==='l-sat'){stop();void sc.enable(t.checked).then(()=>{if(!sc?.on)t.checked=false;satChanged()})}
else if(t.name==='l-sp'){stop();void sc.selectLayer(t.value)}
else if(t.id==='l-sb')sc.setBorders(t.checked)});
$('panel').addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='l-fo'){fld.setOpacity(+t.value);return}
if(t.id==='l-op'){st.opacity=+t.value;wind?.setOpacity(st.opacity);wind2?.setOpacity(st.opacity)}else if(t.id==='l-so')sc?.setOpacity(+t.value)});
$('panel').addEventListener('click',e=>{
const el=e.target as HTMLElement;
const b=el.closest('button') as HTMLElement|null;if(!b)return;
const a=b.dataset.act,i=Number(b.dataset.i),bm=bookmarks();
if(a==='fld-retry')void fld.load();
else if(a==='sat-on'&&sc){stop();void sc.enable(true).then(()=>satChanged())}
else if(a==='go'&&bm[i]){map?.flyTo({center:[bm[i].lon,bm[i].lat],zoom:6});void selectPoint(bm[i])}
else if(a==='del'){bm.splice(i,1);store.set('asiawx.bm',JSON.stringify(bm));renderLayers();if(st.pin)renderLocation(st.point?'ok':'loading')}
else if(sc){if(b.id==='l-save'){if(sc.saving)sc.stopSaving();else void sc.saveLoop()}else if(b.id==='l-clear')void sc.clearSaved()}});
$('p-dec').addEventListener('change',e=>{const t=e.target as HTMLSelectElement;if(!sc)return;if(t.id==='sd-view')sc.setView(t.value as View);else if(t.id==='sd-thr')sc.setThr(+t.value);else if(t.id==='sd-sm')sc.setSmooth(+t.value);else if(t.id==='sd-cov')sc.setCov(t.value as 'fast'|'fine');else if(t.id==='sd-eng'){stop();sc.setEngine(t.value as Eng)}else if(t.id==='sd-v2-bg')sc.setV2('bg','',t.value);else if(t.id.startsWith('sd-v2-')&&t.id.endsWith('-pal'))sc.setV2(t.id.slice(6,-4) as 'real'|'enh','pal',t.value)});
$('p-dec').addEventListener('click',e=>{const t=(e.target as HTMLElement).closest('button');if(t?.id==='sd-recal')void sc?.recalibrate()});
$('p-dec').addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='sd-mix')sc?.setMix(+t.value);else if(sc&&/^sd-v2-(real|enh)-/.test(t.id)){const [,g,k]=t.id.match(/^sd-v2-(real|enh)-(.+)$/) as string[],v=+t.value;sc.setV2(g as 'real'|'enh',k,v);const o=document.getElementById(`sd-v2v-${g}-${k}`);if(o)o.textContent=k==='light'?`${Math.round(v)} deg`:k==='soft'?String(v):v.toFixed(2)}});
$('p-tc').addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('[data-act]') as HTMLElement|null;if(!b)return;const a=b.dataset.act,id=b.dataset.id??'';
if(a==='sel'){tc.select(id);tc.fly(id)}else if(a==='fly'||a==='flyg'){tc.fly(id);if(mobile())closeCard()}else if(a==='refresh')void tc.load()});
$('full').addEventListener('click',()=>{if(!document.fullscreenEnabled){setStatus('Fullscreen is not supported in this browser.','warn');return}if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>setStatus('Fullscreen was blocked.','warn'))});
$('locate').addEventListener('click',()=>{
if(!navigator.geolocation){setStatus('Geolocation is not available in this browser.','warn');return}
navigator.geolocation.getCurrentPosition(pos=>{const p={lat:pos.coords.latitude,lon:pos.coords.longitude,name:'My location'};if(!inAsia(p.lat,p.lon)){setStatus('Your location is outside the Asian domain.','warn');return}map?.flyTo({center:[p.lon,p.lat],zoom:6});void selectPoint(p)},()=>setStatus('Location permission was denied or unavailable.','warn'),{timeout:10000})});
$('p-loc').addEventListener('click',e=>{
const b=(e.target as HTMLElement).closest('[data-act]') as HTMLElement|null;if(!b)return;
const a=b.dataset.act;
if(a==='save'&&st.pin){const bm=bookmarks();if(!isSaved(st.pin)){bm.push(st.pin);store.set('asiawx.bm',JSON.stringify(bm))}renderLocation(st.point?'ok':'loading');renderLayers()}
else if(a==='retry')void loadLocation()});
$('modelseg').addEventListener('change',e=>{const t=e.target as HTMLInputElement;if(t.name==='l-model')setModel(t.value)});
initSearch()}

const cm={cv:'temperature_2m',ev:'temperature_2m',ei:'',cmp:null as CmpData|null,ens:null as EnsData|null,cs:'idle' as LS,es:'idle' as LS,key:'',ekey:''};
const hi={clim:null as ClimResp|null,rec:null as RecentResp|null,hs:'idle' as LS,key:''};
let cctl:AbortController|null=null,ectl:AbortController|null=null,hctl:AbortController|null=null,bctl:AbortController|null=null;
const pk=()=>st.pin?`${st.pin.lat.toFixed(3)},${st.pin.lon.toFixed(3)}`:'';
const cmpState=():CmpState=>({pin:st.pin,tz:st.tz,cursor:curT(),cmp:cm.cmp,cs:cm.cs,ens:cm.ens,es:cm.es,cv:cm.cv,ev:cm.ev,ei:cm.ei});
const ensCur=()=>{const o=cm.ens?.ens.filter(x=>x.ok)??[];return o.find(x=>x.id===cm.ei)??o[0]};
function bindCharts(){const pick=(t:number)=>{const g=st.grid;if(!g)return;const i=Math.round((t-g.times[0])/3600);if(i>=0&&i<g.times.length)setIdx(i)};for(const id of ['cm-chart','cm-ens']){const h=document.getElementById(id);if(h)bindPick(h,pick)}}
function renderCmp(){if($('p-cmp').hidden)return;$('p-cmp').innerHTML=cmpPanel(cmpState());bindCharts()}
function updateCmp(){
if($('p-cmp').hidden)return;
const S=cmpState(),a=document.getElementById('cm-chart'),b=document.getElementById('cm-now'),e=document.getElementById('cm-ens');
if(a&&cm.cmp)a.innerHTML=cmpChart(S);if(b&&cm.cmp)b.innerHTML=cmpNow(S);
const cur=ensCur();if(e&&cur)e.innerHTML=ensBody(S,cur,EVARS.find(x=>x.k===cm.ev)??EVARS[0]);
bindCharts()}
async function ensureCmp(force=false){
const p=st.pin;if(!p)return;
void ensureEns(force);
const k=pk();if(!force&&cm.key===k&&cm.cs!=='err')return;
cm.key=k;cctl?.abort();const c=cctl=new AbortController();cm.cs='loading';cm.cmp=null;renderCmp();
try{const d=await loadCmp(p.lat,p.lon,c.signal);if(c.signal.aborted)return;cm.cmp=d;cm.cs='ok'}catch{if(c.signal.aborted)return;cm.cs='err'}
renderCmp()}
async function ensureEns(force=false){
const p=st.pin;if(!p)return;
const k=pk();if(!force&&cm.ekey===k&&cm.es!=='err')return;
cm.ekey=k;ectl?.abort();const c=ectl=new AbortController();cm.es='loading';cm.ens=null;renderCmp();
try{const d=await loadEns(p.lat,p.lon,c.signal);if(c.signal.aborted)return;cm.ens=d;cm.es='ok';if(!d.ens.some(x=>x.ok&&x.id===cm.ei))cm.ei=d.ens.find(x=>x.ok)?.id??''}catch{if(c.signal.aborted)return;cm.es='err'}
renderCmp()}
const hisState=()=>({pin:st.pin,tz:st.tz,clim:hi.clim,rec:hi.rec,hs:hi.hs});
function renderHis(){if($('p-his').hidden)return;$('p-his').innerHTML=hisPanel(hisState())}
async function ensureHis(force=false){
const p=st.pin;if(!p)return;
const k=pk();if(!force&&hi.key===k&&hi.hs!=='err')return;
hi.key=k;hctl?.abort();const c=hctl=new AbortController();hi.hs='loading';hi.clim=null;hi.rec=null;renderHis();
try{const[cl,rc]=await Promise.all([loadClim(p.lat,p.lon,c.signal),loadRecent(p.lat,p.lon,c.signal)]);if(c.signal.aborted)return;hi.clim=cl;hi.rec=rc;hi.hs='ok'}catch{if(c.signal.aborted)return;hi.hs='err'}
renderHis()}

const modelBInfo=()=>MODELS.find(m=>m.id===st.modelB)??MODELS[1];
function fixB(){if(st.modelB===st.model)st.modelB=(MODELS.find(m=>m.id!==st.model) as typeof MODELS[number]).id}
const bIdx=()=>gridB&&st.grid?nearestIdx(gridB.times,st.grid.times[st.idx]):0;
function fieldB():Field|null{const g=gridB;if(!g)return null;const i=bIdx();return{g:g.g,u:g.u[i],v:g.v[i]}}
function paintDiff(){
const cv=$<HTMLCanvasElement>('diff'),on=st.cmpMode==='diff'&&!!map&&!!st.grid&&!!gridB;
cv.hidden=!on;if(!on||!map)return;
drawDiff(map,cv,field(),fieldB())}
function placeSplit(){
const w=$('mapwrap').clientWidth,x=Math.round(w*st.split),sp=$('split'),g=$('grip');
sp.style.left=`${x}px`;g.setAttribute('aria-valuenow',String(Math.round(st.split*100)));
$('wind').style.clipPath=st.cmpMode==='split'?`inset(0 ${w-x}px 0 0)`:'';
$('wind2').style.clipPath=`inset(0 0 0 ${x}px)`}
function applyCompare(){
const split=st.cmpMode==='split'&&!!gridB&&!!st.grid;
$('wind2').hidden=!split;$('split').hidden=!split;
if(split){$('sp-a').textContent=modelInfo().name;$('sp-b').textContent=modelBInfo().name;placeSplit()}else $('wind').style.clipPath='';
if(wind2){wind2.setField(split?fieldB():null);if(split)wind2.start();else wind2.stop()}
paintDiff()}
async function loadB(){
bctl?.abort();
if(st.cmpMode==='off'){gridB=null;applyWind();return}
const c=bctl=new AbortController(),want=st.modelB;
setStatus(`Loading ${modelBInfo().name} wind field for comparison`,'info');
try{const g=await loadGrid(want,c.signal);if(c.signal.aborted)return;gridB=g;setStatus('','info');applyWind()}
catch{if(c.signal.aborted)return;gridB=null;st.cmpMode='off';applyWind();renderLayers();setStatus(`The ${modelBInfo().name} wind field could not be loaded, so the comparison is off.`,'err',()=>{st.cmpMode='diff';renderLayers();void loadB()})}}
function setCmpMode(m:'off'|'diff'|'split'){st.cmpMode=m;fixB();if(m==='off'){bctl?.abort();gridB=null;applyWind();renderLayers();return}if(gridB&&gridB.model===st.modelB){applyWind();renderLayers();return}gridB=null;renderLayers();void loadB()}
function cmpCard(){
const A=modelInfo().name,B=modelBInfo().name,sub=st.cmpMode==='off'?'Two models side by side':`${A} and ${B}`;
const opts=MODELS.filter(m=>m.id!==st.model).map(m=>`<option value="${m.id}"${m.id===st.modelB?' selected':''}>${esc(m.name)}</option>`).join('');
return card({id:'cmp',icon:'compare',label:'Compare models',sub,body:radios('l-cm','Model comparison on the map',[{v:'off',l:'Off'},{v:'diff',l:'Difference map',s:'10 m wind speed, first model minus second'},{v:'split',l:'Split view',s:'Wind particles, first model left, second right'}],st.cmpMode)+`<div class="ctl"><label for="l-mb">Second model</label><select id="l-mb">${opts}</select></div><p class="note">The first model is the one chosen under Forecast model.</p>`+(st.cmpMode==='diff'?diffLegend(esc(A),esc(B)):'')+(st.cmpMode==='split'?'<p class="note">Drag the handle to move the divider. Both halves animate, so lower the particle density on slow devices.</p>':'')+(st.cmpMode!=='off'?'<p class="note">Both fields are sampled every 6 degrees, so only broad-scale differences show. Hover a point for both values.</p>':'')})}
function fldCard(){
const d=fld.def,sub=fld.status();
const items=[{v:'off',l:'Off'},...FDEFS.map(x=>({v:x.k,l:x.label}))];
let body=chips('l-fld','Model map',items,fld.key??'off');
if(d){
body+=`<p class="note">${esc(d.sub)}</p>`;
body+=`<div class="ctl"><label for="l-fo">Opacity</label><input type="range" id="l-fo" min="0.2" max="1" step="0.05" value="${fld.opacity}"></div>`;
if(d.contour)body+=`<div class="ctl"><label for="l-fc">${d.hl?'Isobars and pressure centres':'Contour lines'}</label><input type="checkbox" id="l-fc"${fld.contours?' checked':''}></div>`;
if(fld.state==='err')body+=`<p class="note err">${esc(fld.err)}</p><button type="button" class="btn sm" data-act="fld-retry">Retry</button>`;
else if(fld.missingVar)body+=`<p class="note warn-t">${esc(modelInfo().name)} does not provide this field, so nothing is drawn. Choose another model under Forecast model.</p>`;
else body+=`<p class="note">Model values sampled every 4 degrees and smoothed between points. They show broad patterns, not local detail${d.k==='rain3'||d.k==='rain24'?'; rain areas are especially smoothed and a small shower will not appear':''}. On a computer, hover the map for a value.</p>`;
if(d.k==='rain24'&&fld.hours!=null&&fld.hours<24)body+=`<p class="note warn-t">Only ${fld.hours} h of the 24 h window are inside the 48 h model timeline here.</p>`}
return card({id:'fld',icon:'field',label:'Model maps',sub,body})}

function initCompare(){
const g=()=>$('grip'),mv=(clientX:number)=>{const r=$('mapwrap').getBoundingClientRect();st.split=Math.min(0.9,Math.max(0.1,(clientX-r.left)/r.width));placeSplit()};
queueMicrotask(()=>{
g().addEventListener('pointerdown',e=>{g().setPointerCapture(e.pointerId);const m=(ev:PointerEvent)=>mv(ev.clientX),u=()=>{g().removeEventListener('pointermove',m);g().removeEventListener('pointerup',u);g().removeEventListener('pointercancel',u)};g().addEventListener('pointermove',m);g().addEventListener('pointerup',u);g().addEventListener('pointercancel',u)});
g().addEventListener('keydown',e=>{const d=e.key==='ArrowLeft'?-0.05:e.key==='ArrowRight'?0.05:0;if(!d)return;e.preventDefault();st.split=Math.min(0.9,Math.max(0.1,st.split+d));placeSplit()});
new ResizeObserver(()=>placeSplit()).observe($('mapwrap'))})}

function initSearch(){
const q=$<HTMLInputElement>('q'),ul=$('results');let items:Place[]=[],act=-1,ctl:AbortController|null=null,tm=0;
const close=()=>{ul.hidden=true;q.setAttribute('aria-expanded','false');q.removeAttribute('aria-activedescendant');act=-1};
const choose=(p:Place)=>{q.value=p.name;close();map?.flyTo({center:[p.lon,p.lat],zoom:7});void selectPoint({lat:p.lat,lon:p.lon,name:p.name})};
const show=(l:Place[],msg?:string)=>{items=l;act=-1;ul.innerHTML=l.length?l.map((p,i)=>`<li role="option" id="r${i}" data-i="${i}"><span>${esc(p.name)}</span><small>${esc(p.sub)}</small></li>`).join(''):`<li class="none" aria-disabled="true">${msg??'No matches in Asia'}</li>`;ul.hidden=false;q.setAttribute('aria-expanded','true')};
q.addEventListener('input',()=>{clearTimeout(tm);const v=q.value.trim();if(v.length<2){close();return}const c=parseCoord(v);if(c){show([c]);return}
tm=window.setTimeout(async()=>{ctl?.abort();const k=ctl=new AbortController();try{const r=await search(v,k.signal);if(!k.signal.aborted)show(r)}catch{if(!k.signal.aborted)show([],'Search is unavailable. Try coordinates such as 14.6, 121.0.')}},250)});
q.addEventListener('keydown',e=>{
if(e.key==='Escape')close();
else if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!items.length)return;e.preventDefault();act=(act+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;ul.querySelectorAll('li').forEach((li,i)=>li.setAttribute('aria-selected',String(i===act)));q.setAttribute('aria-activedescendant',`r${act}`)}
else if(e.key==='Enter'){const c=parseCoord(q.value.trim());if(c)choose(c);else if(items.length)choose(items[Math.max(act,0)])}});
ul.addEventListener('pointerdown',e=>{const li=(e.target as HTMLElement).closest('li[data-i]') as HTMLElement|null;if(li){e.preventDefault();choose(items[+(li.dataset.i as string)])}});
document.addEventListener('pointerdown',e=>{if(!(e.target as HTMLElement).closest('.search'))close()})}

initCompare();registerSW();initUi();buildLegend();renderLayers();renderLocation('ok');renderDecoder();renderSources();setView('wx',!mobile());initMap();{const k=store.get('asiawx.fld');fld.configure(st.model,k&&k!=='off'?k:null)}tc.start();updateTime();applyWind();void loadWind();
