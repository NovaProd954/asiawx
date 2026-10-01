import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import {BOUNDS,START,MODELS,STYLES,RAMP,SOURCES} from './config';
import {loadGrid,type GridSet} from './data/grid';
import {loadPoint,valueAt,type Point} from './data/forecast';
import {search,parseCoord,inAsia,type Place} from './data/geocode';
import {health} from './lib/http';
import {sampleInto,toSpeedDir,msToKt,type Field} from './lib/wind';
import {fmtTime,compass,type Tz} from './lib/time';
import {WindLayer,type Quality} from './wind/particles';
import {renderMeteogram,renderTable} from './ui/meteogram';
import {SatController} from './sat/controller';
import {satLayerControls,satDecoderHtml,satDyn,satSig} from './sat/ui';
import type {View} from './sat/decode';

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const store={get(k:string){try{return localStorage.getItem(k)}catch{return null}},set(k:string,v:string){try{localStorage.setItem(k,v)}catch{}}};
interface Pin{lat:number;lon:number;name:string}
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile=()=>matchMedia('(max-width:760px)').matches;
const savedModel=store.get('asiawx.model');
const st={model:MODELS.some(m=>m.id===savedModel)?savedModel as string:MODELS[0].id,tz:'UTC' as Tz,idx:0,grid:null as GridSet|null,point:null as Point|null,pin:null as Pin|null,playing:false,windOn:!reduce,quality:(matchMedia('(pointer:coarse)').matches||(navigator.hardwareConcurrency||4)<=4?'low':'medium') as Quality,opacity:0.9,base:'light'};
const modelInfo=()=>MODELS.find(m=>m.id===st.model) as typeof MODELS[number];
const PLAY='<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
const PAUSE='<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';

let map:maplibregl.Map|null=null,wind:WindLayer|null=null,marker:maplibregl.Marker|null=null,sc:SatController|null=null,satSigV='';
const satOn=()=>!!(sc&&sc.ready);
const cur=()=>satOn()&&sc?sc.idx:st.idx;
const tmp=new Float32Array(2);

function setStatus(msg:string,kind:'info'|'warn'|'err',retry?:()=>void){
const el=$('status');el.className=msg?kind:'';el.textContent=msg;
if(msg&&retry){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent='Retry';b.onclick=retry;el.append(' ',b)}}

function hasGL(){try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch{return false}}
function field():Field|null{const g=st.grid;return g?{g:g.g,u:g.u[st.idx],v:g.v[st.idx]}:null}
function applyWind(){if(!wind)return;wind.setField(st.windOn?field():null);if(st.windOn&&st.grid)wind.start();else wind.stop();$('legend').hidden=!(st.windOn&&st.grid)}
const curT=()=>st.grid?st.grid.times[st.idx]:Math.floor(Date.now()/3600000)*3600;
const nowIdx=(g:GridSet)=>{const n=Date.now()/1000;let k=0;for(let i=0;i<g.times.length;i++)if(g.times[i]<=n)k=i;return k};

function initMap(){
if(!hasGL()){setStatus('WebGL is not available on this device. The map and wind animation are off; search and forecasts still work.','warn');return}
try{
map=new maplibregl.Map({container:'map',style:STYLES.light,bounds:START,fitBoundsOptions:{padding:16},maxBounds:BOUNDS,minZoom:2,maxPitch:60,attributionControl:false});
map.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');
map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right');
wind=new WindLayer(map,$<HTMLCanvasElement>('wind'));wind.setQuality(st.quality);wind.setOpacity(st.opacity);
sc=new SatController(map,{change:satChanged,status:setStatus});renderLayers();
map.on('load',()=>health.set('basemap',{ok:true,lastOk:Date.now(),err:null,ms:null}));
map.on('error',e=>{if(String((e as unknown as {sourceId?:string}).sourceId??'').startsWith('sat-'))return;const p=health.get('basemap');health.set('basemap',{ok:false,lastOk:p?.lastOk??null,err:String(e.error?.message??'tile or style error'),ms:null})});
map.on('click',e=>selectPoint({lat:e.lngLat.lat,lon:e.lngLat.lng,name:coordName(e.lngLat.lat,e.lngLat.lng)}));
let pend=false;
map.on('mousemove',e=>{if(pend)return;pend=true;requestAnimationFrame(()=>{pend=false;readout(e.lngLat.lat,e.lngLat.lng)})});
}catch{setStatus('The map could not start on this device. Search and forecasts still work.','err');map=null;wind=null}}

const coordName=(lat:number,lon:number)=>`${Math.abs(lat).toFixed(2)}${lat<0?'S':'N'} ${Math.abs(lon).toFixed(2)}${lon<0?'W':'E'}`;
function readout(lat:number,lon:number){
const f=field();let w=' No wind data at this point';
if(f&&sampleInto(f,lon,lat,tmp)){const r=toSpeedDir(tmp[0],tmp[1]);w=` Wind ${r.speed.toFixed(1)} m/s (${msToKt(r.speed).toFixed(0)} kt) from ${Math.round(r.dir)} deg ${compass(r.dir)}, interpolated model value`}
const bt=sc?.btAt(lon,lat);
$('coord').textContent=coordName(lat,lon)+w+(bt!=null?`. Cloud-top brightness temperature ${bt.toFixed(1)} deg C, decoded from GIBS colours, approximate`:'')}

function buildLegend(){
const stops=RAMP.map(([v,c])=>`${c} ${(v/25*100).toFixed(0)}%`).join(',');
$('legend').innerHTML=`<div class="lg-t">10 m wind speed, m/s</div><div class="lg-bar" style="background:linear-gradient(to right,${stops})"></div><div class="lg-ticks"><span>0</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25+</span></div>`}

function updateTime(){
const g=st.grid,el=$('tl-time');
if(satOn()&&sc&&sc.time!=null){el.innerHTML=`<strong>${fmtTime(sc.time,st.tz)}</strong> <span>Observed, ${esc(sc.layer?sc.layer.name:'satellite')}; wind is model hour ${g?fmtTime(g.times[st.idx],st.tz):'(not loaded)'}</span>`;return}
if(!g){el.textContent='Wind timeline not loaded';return}
const t=g.times[st.idx],now=Date.now()/1000;
const sub=g.run!=null?`+${Math.round((t-g.run)/3600)} h from ${fmtTime(g.run,st.tz)} run`:'run time not provided by source';
el.innerHTML=`<strong>${fmtTime(t,st.tz)}</strong> <span>${t>now+1800?'Forecast':'Model value for a past hour'}; ${sub}</span>`}

function windIdxFor(t:number){const g=st.grid;if(!g)return 0;let k=0,b=Infinity;for(let i=0;i<g.times.length;i++){const d=Math.abs(g.times[i]-t);if(d<b){b=d;k=i}}return k}
function configSlider(){const s=$<HTMLInputElement>('slider');if(satOn()&&sc){s.max=String(sc.frames.length-1);s.value=String(sc.idx);s.disabled=false}else if(st.grid){s.max=String(st.grid.times.length-1);s.value=String(st.idx);s.disabled=false}else s.disabled=true}
function setFrame(i:number){if(!sc)return;sc.setIdx(i);$<HTMLInputElement>('slider').value=String(sc.idx);if(st.grid&&sc.time!=null)setWindIdx(windIdxFor(sc.time));else updateTime()}
function setIdx(i:number){if(satOn())setFrame(i);else setWindIdx(i)}
function satChanged(){
configSlider();
if(satOn()&&sc&&sc.time!=null&&st.grid){const k=windIdxFor(sc.time);if(k!==st.idx)setWindIdx(k)}
updateTime();
const sig=satSig(sc);
if(sig!==satSigV){satSigV=sig;renderLayers();renderDecoder()}else satDyn(sc,st.tz)}
function setWindIdx(i:number){
const g=st.grid;if(!g)return;
st.idx=Math.max(0,Math.min(g.times.length-1,i));
if(!satOn())$<HTMLInputElement>('slider').value=String(st.idx);
applyWind();updateTime();updateConditions();updateChart();
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
st.pin=p;placeMarker();showTab('loc');if(mobile())openSheet(true);
await loadLocation()}
async function loadLocation(){
const p=st.pin;if(!p)return;
pctl?.abort();const c=pctl=new AbortController();
st.point=null;renderLocation('loading');
try{const d=await loadPoint(st.model,p.lat,p.lon,c.signal);if(c.signal.aborted)return;st.point=d;renderLocation('ok')}
catch{if(c.signal.aborted)return;renderLocation('err')}}

const ROWS:[string,string,string,number][]=[['Temperature','temperature_2m','deg C',1],['Feels like','apparent_temperature','deg C',1],['Dew point','dew_point_2m','deg C',1],['Relative humidity','relative_humidity_2m','%',0],['Precipitation, preceding hour','precipitation','mm',1],['Precipitation probability','precipitation_probability','%',0],['Sea-level pressure','pressure_msl','hPa',0],['Cloud cover','cloud_cover','%',0]];
function updateConditions(){
const el=document.getElementById('cond'),p=st.point;if(!el||!p)return;
const t=curT(),val=(k:string)=>valueAt(p,k,t),none=(k:string)=>p.vars[k].every(x=>x==null)?'Not provided by this model':'-';
const fx=(k:string,d:number,u:string)=>{const v=val(k);return v==null?none(k):`${v.toFixed(d)} ${u}`};
let h=`<div class="cap">Model values valid ${fmtTime(t,st.tz)}. These are forecast values, not observations.</div><dl class="kv">`;
for(const[l,k,u,d]of ROWS)h+=`<dt>${l}</dt><dd>${fx(k,d,u)}</dd>`;
const s=val('wind_speed_10m'),dr=val('wind_direction_10m');
h+=`<dt>Wind at 10 m</dt><dd>${s==null?none('wind_speed_10m'):`${s.toFixed(1)} m/s (${msToKt(s).toFixed(0)} kt)${dr==null?'':` from ${Math.round(dr)} deg ${compass(dr)}`}`}</dd><dt>Gusts at 10 m</dt><dd>${fx('wind_gusts_10m',1,'m/s')}</dd></dl>`;
el.innerHTML=h}
function updateChart(){
const host=document.getElementById('mg'),p=st.point;if(!host||!p)return;
renderMeteogram(host,p,curT(),st.tz,t=>{const g=st.grid;if(!g)return;const i=Math.round((t-g.times[0])/3600);if(i>=0&&i<g.times.length)setIdx(i)});
const tb=document.getElementById('tb');if(tb)renderTable(tb,p,st.tz)}

const bookmarks=():Pin[]=>{try{return JSON.parse(store.get('asiawx.bm')||'[]')}catch{return[]}};
function savedHtml(){const b=bookmarks();return b.length?`<h3>Saved locations</h3><ul class="saved">${b.map((x,i)=>`<li><button type="button" class="link" data-act="go" data-i="${i}">${esc(x.name)}</button><button type="button" class="btn sm" data-act="del" data-i="${i}" aria-label="Remove ${esc(x.name)}">Remove</button></li>`).join('')}</ul>`:''}
function renderLocation(state:'loading'|'ok'|'err'){
const el=$('p-loc'),p=st.pin;
if(!p){el.innerHTML=`<div class="empty"><p>Click the map or search a place to open its forecast. Coordinates such as 14.6, 121.0 also work.</p></div>${savedHtml()}`;return}
let h=`<div class="hd"><h2>${esc(p.name)}</h2><button type="button" class="btn sm" data-act="save">Save location</button></div><div class="cap">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</div>`;
if(state==='loading'){el.innerHTML=h+'<p class="note">Loading forecast</p>'+savedHtml();return}
if(state==='err'||!st.point){el.innerHTML=h+`<p class="note err">The forecast could not be loaded. The provider or proxy failed, or the point is outside model coverage.</p><button type="button" class="btn" data-act="retry">Retry</button>`+savedHtml();return}
const d=st.point,n=Date.now()/1000,a=d.sunrise.find(x=>x>n),b=d.sunset.find(x=>x>n);
h+=`<dl class="kv meta"><dt>Model</dt><dd>${esc(modelInfo().name)}, ${esc(modelInfo().res)}</dd><dt>Run</dt><dd>${d.run!=null?fmtTime(d.run,st.tz):'Not provided by source'}</dd><dt>Fetched</dt><dd>${fmtTime(d.fetched,st.tz)}</dd><dt>Source</dt><dd>Open-Meteo API</dd><dt>Model cell elevation</dt><dd>${d.elev==null?'-':Math.round(d.elev)+' m'}</dd><dt>Next sunrise</dt><dd>${a?fmtTime(a,st.tz):'-'}</dd><dt>Next sunset</dt><dd>${b?fmtTime(b,st.tz):'-'}</dd></dl><div id="cond"></div><h3>Five-day meteogram</h3><div id="mg"></div><details><summary>Data table, every 3 hours</summary><div id="tb" class="scroll"></div></details>`+savedHtml();
el.innerHTML=h;updateConditions();updateChart()}

function renderDecoder(){
const m=modelInfo(),g=st.grid;
$('p-dec').innerHTML=satDecoderHtml(sc,st.tz)+`<h2>10 m wind field</h2><dl class="kv"><dt>Measures</dt><dd>Horizontal wind velocity 10 m above ground, computed by a numerical weather model</dd><dt>Units</dt><dd>Metres per second; knots shown in readouts</dd><dt>Product type</dt><dd>Model forecast, interpolated between grid points. Not an observation.</dd><dt>Model</dt><dd>${esc(m.name)} (${esc(m.org)}), ${esc(m.res)}</dd><dt>Run</dt><dd>${g?(g.run!=null?fmtTime(g.run,st.tz):'Not provided by source'):'No data loaded'}</dd><dt>Valid</dt><dd id="dec-valid">${g?fmtTime(g.times[st.idx],st.tz):'-'}</dd><dt>Delivered via</dt><dd>Open-Meteo API, fetched ${g?fmtTime(g.fetched,st.tz):'-'}</dd><dt>Field grid</dt><dd>${g?`${g.g.nx} by ${g.g.ny} points every ${g.g.d} deg, ${g.g.lon0}E to ${g.g.lon0+(g.g.nx-1)*g.g.d}E, ${g.g.lat0}N to ${g.g.lat0+(g.g.ny-1)*g.g.d}N`:'-'}</dd><dt>Level</dt><dd>10 m above ground (the only level in this build)</dd><dt>Colors</dt><dd>Particle color encodes speed on the legend scale. Particle length and trail follow direction.</dd></dl>
<details><summary>Method</summary><p>Each grid point supplies speed s and meteorological direction d (the direction the wind blows from). Components are u = -s sin(d) and v = -s cos(d), with u eastward and v northward. Each particle samples u and v by bilinear interpolation in longitude and latitude. If any of the four surrounding grid values is missing, the particle is removed instead of interpolating across the gap. Each frame a particle moves proportionally to its local speed in screen pixels, so apparent motion scales with wind speed but is not real-time displacement. Fields change in hourly steps with no temporal interpolation.</p></details>
<h3>Limitations</h3><ul class="lim"><li>The field is sampled every 6 degrees, coarser than the model. Jets, tropical cyclone cores, sea breezes and terrain flows are smoothed or absent.</li><li>Forecast values at past hours are model output, not measurements.</li><li>Missing cells are left empty, never filled.</li><li>Observations, satellite, radar and derived fields are not in this build.</li></ul>`}

function renderSources(){
const stat=(k:string)=>{const h=health.get(k);if(!h)return'No request made yet';if(h.ok)return`Responding${h.ms!=null?`, ${h.ms} ms`:''}${h.lastOk?`, last success ${fmtTime(h.lastOk/1000,st.tz)}`:''}`;return`Failing: ${esc(h.err??'unknown error')}${h.lastOk?`, last success ${fmtTime(h.lastOk/1000,st.tz)}`:''}`};
$('p-src').innerHTML=`<h2>Data sources</h2>`+SOURCES.map(s=>`<article class="src"><h3>${esc(s.name)}</h3><dl class="kv"><dt>Provides</dt><dd>${esc(s.what)}</dd><dt>Status</dt><dd class="${health.get(s.key)?.ok===false?'err':''}">${stat(s.key)}</dd><dt>License</dt><dd>${esc(s.license)}</dd><dt>Attribution</dt><dd>${esc(s.attribution)}</dd><dt>Coverage</dt><dd>${esc(s.coverage)}</dd><dt>Updates</dt><dd>${esc(s.update)}</dd></dl></article>`).join('')+`<article class="src"><h3>Models behind the forecasts</h3><dl class="kv">${MODELS.map(m=>`<dt>${esc(m.name)}</dt><dd>${esc(m.org)}; ${esc(m.res)}; ${esc(m.license)}</dd>`).join('')}</dl></article>`}

function renderLayers(){
$('p-lay').innerHTML=`<h2>Layers</h2><div class="ctl"><label><input type="checkbox" id="l-wind" ${st.windOn?'checked':''}> Wind particles, 10 m</label></div><div class="ctl"><label for="l-op">Wind opacity</label><input type="range" id="l-op" min="0.2" max="1" step="0.05" value="${st.opacity}"></div><div class="ctl"><label for="l-q">Particle density</label><select id="l-q"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div><div class="ctl"><label for="l-base">Base map</label><select id="l-base"><option value="light">Light</option><option value="standard">Standard</option></select></div><p class="note">Density defaults to Low on touch and low-core devices. Animation starts off when reduced motion is requested.</p>`+satLayerControls(sc);
$<HTMLSelectElement>('l-q').value=st.quality;$<HTMLSelectElement>('l-base').value=st.base;
$('l-wind').addEventListener('change',e=>{st.windOn=(e.target as HTMLInputElement).checked;applyWind()});
$('l-op').addEventListener('input',e=>{st.opacity=+(e.target as HTMLInputElement).value;wind?.setOpacity(st.opacity)});
$('l-q').addEventListener('change',e=>{st.quality=(e.target as HTMLSelectElement).value as Quality;wind?.setQuality(st.quality)});
$('l-base').addEventListener('change',e=>{st.base=(e.target as HTMLSelectElement).value;map?.setStyle(STYLES[st.base])})}

const TABS=['loc','lay','dec','src'];
function showTab(n:string){for(const t of TABS){const on=t===n;$(`t-${t}`).setAttribute('aria-selected',String(on));$(`t-${t}`).tabIndex=on?0:-1;$(`p-${t}`).hidden=!on}if(n==='src')renderSources()}
function openSheet(o:boolean){$('panel').classList.toggle('open',o);$('sheetbtn').setAttribute('aria-expanded',String(o));$('sheetbtn').textContent=o?'Map':'Details';setTimeout(()=>{map?.resize()},50)}

let ptimer=0;
function stop(){st.playing=false;sc?.setPlaying(false);clearInterval(ptimer);$('play').innerHTML=PLAY;$('play').setAttribute('aria-label','Play timeline')}
function play(){const n=()=>satOn()&&sc?sc.frames.length:st.grid?st.grid.times.length:0;if(!n())return;st.playing=true;sc?.setPlaying(true);$('play').innerHTML=PAUSE;$('play').setAttribute('aria-label','Pause timeline');clearInterval(ptimer);ptimer=window.setInterval(()=>{if(satOn()&&sc?.busy)return;const c=cur();setIdx(c>=n()-1?0:c+1)},+$<HTMLSelectElement>('speed').value)}

function initUi(){
$('play').innerHTML=PLAY;
$<HTMLSelectElement>('model').innerHTML=MODELS.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
$<HTMLSelectElement>('model').value=st.model;
$('model').addEventListener('change',e=>{st.model=(e.target as HTMLSelectElement).value;store.set('asiawx.model',st.model);stop();loadWind();if(st.pin)loadLocation()});
$('tz').addEventListener('click',()=>{st.tz=st.tz==='UTC'?'Local':'UTC';const b=$('tz');b.textContent=st.tz==='UTC'?'UTC':'Local';b.setAttribute('aria-label',`Time zone: ${b.textContent}. Activate to switch`);updateTime();renderDecoder();renderSources();if(st.pin)renderLocation(st.point?'ok':'loading')});
$('play').addEventListener('click',()=>st.playing?stop():play());
$('prev').addEventListener('click',()=>{stop();setIdx(cur()-1)});
$('next').addEventListener('click',()=>{stop();setIdx(cur()+1)});
$('slider').addEventListener('input',e=>{stop();setIdx(+(e.target as HTMLInputElement).value)});
$('now').addEventListener('click',()=>{stop();if(satOn()&&sc)setFrame(sc.frames.length-1);else if(st.grid)setWindIdx(nowIdx(st.grid))});
$('speed').addEventListener('change',()=>{if(st.playing)play()});
$('p-lay').addEventListener('change',e=>{const t=e.target as HTMLInputElement;if(!sc)return;
if(t.id==='l-sat'){stop();void sc.enable(t.checked).then(()=>{if(!sc?.on)t.checked=false;satChanged()})}
else if(t.id==='l-sp'){stop();void sc.selectLayer(t.value)}});
$('p-lay').addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='l-so')sc?.setOpacity(+t.value)});
$('p-dec').addEventListener('change',e=>{const t=e.target as HTMLSelectElement;if(!sc)return;if(t.id==='sd-view')sc.setView(t.value as View);else if(t.id==='sd-thr')sc.setThr(+t.value)});
$('p-dec').addEventListener('input',e=>{const t=e.target as HTMLInputElement;if(t.id==='sd-mix')sc?.setMix(+t.value)});
$('sheetbtn').addEventListener('click',()=>openSheet(!$('panel').classList.contains('open')));
$('full').addEventListener('click',()=>{if(!document.fullscreenEnabled){setStatus('Fullscreen is not supported in this browser.','warn');return}if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>setStatus('Fullscreen was blocked.','warn'))});
$('locate').addEventListener('click',()=>{
if(!navigator.geolocation){setStatus('Geolocation is not available in this browser.','warn');return}
navigator.geolocation.getCurrentPosition(pos=>{const p={lat:pos.coords.latitude,lon:pos.coords.longitude,name:'My location'};if(!inAsia(p.lat,p.lon)){setStatus('Your location is outside the Asian domain.','warn');return}map?.flyTo({center:[p.lon,p.lat],zoom:6});void selectPoint(p)},()=>setStatus('Location permission was denied or unavailable.','warn'),{timeout:10000})});
const tabs=$('tabs');
tabs.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest('button[role=tab]');if(b)showTab(b.id.slice(2))});
tabs.addEventListener('keydown',e=>{const i=TABS.findIndex(t=>$(`t-${t}`).getAttribute('aria-selected')==='true');const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(d){const n=TABS[(i+d+TABS.length)%TABS.length];showTab(n);$(`t-${n}`).focus()}});
$('p-loc').addEventListener('click',e=>{
const b=(e.target as HTMLElement).closest('[data-act]') as HTMLElement|null;if(!b)return;
const a=b.dataset.act,i=Number(b.dataset.i),bm=bookmarks();
if(a==='save'&&st.pin){if(!bm.some(x=>Math.abs(x.lat-st.pin!.lat)<0.01&&Math.abs(x.lon-st.pin!.lon)<0.01)){bm.push(st.pin);store.set('asiawx.bm',JSON.stringify(bm))}renderLocation(st.point?'ok':'loading')}
else if(a==='del'){bm.splice(i,1);store.set('asiawx.bm',JSON.stringify(bm));renderLocation(st.pin?(st.point?'ok':'loading'):'ok')}
else if(a==='go'&&bm[i]){map?.flyTo({center:[bm[i].lon,bm[i].lat],zoom:6});void selectPoint(bm[i])}
else if(a==='retry')void loadLocation()});
initSearch()}

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

initUi();buildLegend();renderLayers();renderLocation('ok');renderDecoder();renderSources();showTab('loc');initMap();updateTime();applyWind();void loadWind();
