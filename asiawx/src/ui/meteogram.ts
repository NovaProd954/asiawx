import type {Point} from '../data/forecast';
import {fmtDay,fmtHM,isMidnight,compass,type Tz} from '../lib/time';
const W=360,L=34,R=8,PW=W-L-R;
const nn=(a:(number|null)[])=>a.filter((x):x is number=>x!=null);
function range(sets:(number|null)[][],floor?:number){const v=sets.flatMap(nn);if(!v.length)return[0,1];let lo=Math.min(...v),hi=Math.max(...v);if(floor!==undefined)lo=Math.min(lo,floor);if(hi-lo<1){hi+=0.5;lo-=0.5}const pad=(hi-lo)*0.08;return[floor!==undefined?floor:lo-pad,hi+pad]}
function path(x:(t:number)=>number,ts:number[],a:(number|null)[],y:(v:number)=>number){let d='',pen=false;for(let i=0;i<ts.length;i++){const v=a[i];if(v==null){pen=false;continue}d+=`${pen?'L':'M'}${x(ts[i]).toFixed(1)} ${y(v).toFixed(1)}`;pen=true}return d}
export function renderMeteogram(host:HTMLElement,p:Point,cursor:number|null,tz:Tz,onPick:(t:number)=>void){
const ts=p.times,t0=ts[0],t1=ts[ts.length-1],x=(t:number)=>L+(t-t0)/(t1-t0)*PW;
const V=p.vars,panels=[{y:6,h:92,title:'Temperature and dew point (deg C)',sets:[V.temperature_2m,V.dew_point_2m],floor:undefined,unit:''},{y:120,h:56,title:'Precipitation, mm in preceding hour',sets:[V.precipitation],floor:0,unit:''},{y:198,h:76,title:'Wind speed and gusts at 10 m (m/s)',sets:[V.wind_speed_10m,V.wind_gusts_10m],floor:0,unit:''}];
let s='';
for(let i=0;i<ts.length;i++)if(isMidnight(ts[i],tz)){s+=`<line x1="${x(ts[i]).toFixed(1)}" x2="${x(ts[i]).toFixed(1)}" y1="6" y2="274" class="mg-day"/><text x="${(x(ts[i])+3).toFixed(1)}" y="288" class="mg-lab">${fmtDay(ts[i],tz)}</text>`}
for(const pn of panels){
const[lo,hi]=range(pn.sets,pn.floor),y=(v:number)=>pn.y+pn.h-(v-lo)/(hi-lo)*pn.h;
s+=`<text x="${L}" y="${pn.y-1}" class="mg-cap">${pn.title}</text>`;
for(let g=0;g<=2;g++){const v=lo+(hi-lo)*g/2;s+=`<line x1="${L}" x2="${W-R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="mg-grid"/><text x="${L-4}" y="${(y(v)+3).toFixed(1)}" text-anchor="end" class="mg-lab">${v.toFixed(Math.abs(hi-lo)<6?1:0)}</text>`}
if(pn.title.startsWith('Precip')){const pr=V.precipitation;for(let i=0;i<ts.length;i++){const v=pr[i];if(v!=null&&v>0)s+=`<rect x="${(x(ts[i])-1).toFixed(1)}" y="${y(v).toFixed(1)}" width="2" height="${(pn.y+pn.h-y(v)).toFixed(1)}" class="mg-bar"/>`}}
else if(pn.title.startsWith('Temp')){s+=`<path d="${path(x,ts,V.dew_point_2m,y)}" class="mg-l2"/><path d="${path(x,ts,V.temperature_2m,y)}" class="mg-l1"/>`}
else{s+=`<path d="${path(x,ts,V.wind_gusts_10m,y)}" class="mg-gust"/><path d="${path(x,ts,V.wind_speed_10m,y)}" class="mg-l3"/>`}}
if(cursor!=null&&cursor>=t0&&cursor<=t1)s+=`<line x1="${x(cursor).toFixed(1)}" x2="${x(cursor).toFixed(1)}" y1="6" y2="274" class="mg-cur"/>`;
host.innerHTML=`<svg viewBox="0 0 ${W} 296" role="img" aria-labelledby="mgt mgd" class="mg"><title id="mgt">Five-day forecast meteogram</title><desc id="mgd">Temperature, dew point, precipitation and wind for the selected location. Click or tap to move the timeline. A data table follows.</desc>${s}</svg>`;
const svg=host.querySelector('svg') as SVGSVGElement;
svg.addEventListener('pointerdown',e=>{const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W,t=t0+Math.min(1,Math.max(0,(px-L)/PW))*(t1-t0);onPick(Math.round(t/3600)*3600)})}
export function renderTable(host:HTMLElement,p:Point,tz:Tz){
const V=p.vars,f=(a:(number|null)[],i:number,d=1)=>a[i]==null?'-':(a[i] as number).toFixed(d);
let r='';
for(let i=0;i<Math.min(p.times.length,96);i+=3)r+=`<tr><th scope="row">${fmtDay(p.times[i],tz)} ${fmtHM(p.times[i],tz)}</th><td>${f(V.temperature_2m,i)}</td><td>${f(V.apparent_temperature,i)}</td><td>${f(V.precipitation,i)}</td><td>${f(V.precipitation_probability,i,0)}</td><td>${f(V.wind_speed_10m,i)}</td><td>${f(V.wind_gusts_10m,i)}</td><td>${V.wind_direction_10m[i]==null?'-':compass(V.wind_direction_10m[i] as number)}</td><td>${f(V.cloud_cover,i,0)}</td><td>${f(V.pressure_msl,i,0)}</td></tr>`;
host.innerHTML=`<table class="tbl"><thead><tr><th scope="col">Time</th><th scope="col">T C</th><th scope="col">Feels C</th><th scope="col">Rain mm</th><th scope="col">Prob %</th><th scope="col">Wind m/s</th><th scope="col">Gust m/s</th><th scope="col">Dir</th><th scope="col">Cloud %</th><th scope="col">MSLP hPa</th></tr></thead><tbody>${r}</tbody></table>`}
