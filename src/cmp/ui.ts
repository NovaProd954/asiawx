import type {CmpData,EnsData,EnsOne} from '../data/compare';
import type {ClimResp,RecentResp} from '../data/hist';
import {chart,legend,dayTicks,monthTicks,type Ser,type V} from '../ui/charts';
import {spreadOf,dailyRange,pickAt} from './stats';
import {dailySeries,windowSummary,placeInBand,lastValid} from '../hist/anom';
import {fmtTime,fmtDay,type Tz} from '../lib/time';
import {esc} from '../ui/icons';
export type S='idle'|'loading'|'ok'|'err';
export interface CV{k:string;l:string;u:string;dec:number;floor?:number}
export const CVARS:CV[]=[{k:'temperature_2m',l:'Temperature',u:'\u00b0C',dec:1},{k:'wind_speed_10m',l:'Wind 10 m',u:'m/s',dec:1,floor:0},{k:'pressure_msl',l:'Pressure',u:'hPa',dec:1},{k:'precipitation',l:'Rain',u:'mm/h',dec:1,floor:0},{k:'cloud_cover',l:'Cloud',u:'%',dec:0,floor:0}];
export const EVARS:CV[]=[CVARS[0],CVARS[1],CVARS[2],{k:'precipitation',l:'Rain',u:'mm/day',dec:1,floor:0}];
const COL=['#6ec1ff','#ffb86b','#9be37a','#e08cff','#ff8fa3','#f2e07a'];
const f=(v:number|null|undefined,d:number)=>v==null||!Number.isFinite(v)?'-':v.toFixed(d);
const sg=(v:number|null,d:number)=>v==null?'-':`${v>0?'+':v<0?'\u2212':''}${Math.abs(v).toFixed(d)}`;
export function chips(name:string,label:string,items:{v:string;l:string}[],cur:string){
return`<div class="chips" role="radiogroup" aria-label="${esc(label)}">${items.map(x=>`<label class="chip"><input type="radio" name="${name}" value="${esc(x.v)}" ${x.v===cur?'checked':''}><span>${esc(x.l)}</span></label>`).join('')}</div>`}
export interface CmpState{pin:{lat:number;lon:number;name:string}|null;tz:Tz;cursor:number;cmp:CmpData|null;cs:S;ens:EnsData|null;es:S;cv:string;ev:string;ei:string}
const head=(t:string,sub:string)=>`<div class="hd"><div><h2>${t}</h2><div class="coords">${sub}</div></div></div>`;
export function cmpChart(S:CmpState):string{
const d=S.cmp;if(!d)return'';
const v=CVARS.find(x=>x.k===S.cv)??CVARS[0],ok=d.models.filter(m=>m.ok);
const ser:Ser[]=d.models.map((m,i)=>({label:m.name,color:COL[i%COL.length],vals:m.ok?m.vars[v.k]??[]:[],w:1.4}));
const sp=spreadOf(d,v.k);
const band=ok.length>=2?[{lo:sp.map(x=>x.min),hi:sp.map(x=>x.max),color:'#ffffff',op:0.09}]:[];
return chart({title:`${v.l}, ${v.u}`,ts:d.times,series:ser.filter((_,i)=>d.models[i].ok),bands:band,floor:v.floor,h:150,ticks:dayTicks(d.times,S.tz),cursor:S.cursor,dec:v.dec,desc:`${v.l} from ${ok.length} models. The shaded area spans the lowest to the highest model. Click or tap to move the timeline.`})
+legend(d.models.map((m,i)=>({label:m.name+(m.ok?'':' (unavailable)'),color:m.ok?COL[i%COL.length]:'#667788'})))}
export function cmpNow(S:CmpState):string{
const d=S.cmp;if(!d)return'';
const v=CVARS.find(x=>x.k===S.cv)??CVARS[0],i=pickAt(d.times,S.cursor),t=d.times[i];
const rows=d.models.map((m,k)=>({m,k,x:m.ok?m.vars[v.k]?.[i]??null:null})).filter(r=>r.m.ok);
const xs=rows.map(r=>r.x).filter((x):x is number=>x!=null);
const rng=xs.length>=2?Math.max(...xs)-Math.min(...xs):null;
return`<div class="cap">Values at ${fmtTime(t,S.tz)}${Math.abs(t-S.cursor)>1800?' (nearest model hour)':''}</div><table class="tbl mt"><tbody>${rows.map(r=>`<tr><th scope="row"><i class="sw" style="background:${COL[r.k%COL.length]}"></i>${esc(r.m.name)}</th><td>${f(r.x,v.dec)} ${v.u}</td></tr>`).join('')}<tr class="sum"><th scope="row">Range between models</th><td>${f(rng,v.dec)} ${v.u}</td></tr></tbody></table>`}
function agree(S:CmpState):string{
const d=S.cmp;if(!d||d.models.filter(m=>m.ok).length<2)return'';
const vs=[CVARS[0],CVARS[1],CVARS[2]],rs=vs.map(v=>dailyRange(d.times,spreadOf(d,v.k)));
return`<h3>Model agreement by day</h3><div class="scroll"><table class="tbl"><thead><tr><th scope="col">Day</th>${vs.map(v=>`<th scope="col">${v.l} ${v.u}</th>`).join('')}<th scope="col">Models</th></tr></thead><tbody>${rs[0].map((r,k)=>`<tr><th scope="row">${fmtDay(r.t,S.tz)}</th>${rs.map(a=>`<td>${f(a[k]?.range??null,1)}</td>`).join('')}<td>${r.n}</td></tr>`).join('')}</tbody></table></div><p class="note">Mean gap between the highest and lowest model over each UTC day. A wider gap means the models disagree more. It is a spread, not a probability, and it says nothing about which model is right.</p>`}
function modelStatus(d:CmpData,tz:Tz):string{
return`<details><summary>Model status</summary><dl class="kv">${d.models.map(m=>`<dt>${esc(m.name)}</dt><dd class="${m.ok?'':'err'}">${m.ok?`Responding${m.ms!=null?`, ${m.ms} ms`:''}${m.run!=null?`, run ${fmtTime(m.run,tz)}`:''}`:`Unavailable: ${esc(m.err??'no data')}`}</dd>`).join('')}<dt>Fetched</dt><dd>${fmtTime(d.fetched,tz)}</dd></dl></details>`}
function ensBlock(S:CmpState):string{
const head='<h3>Ensemble spread, 10 days</h3>';
if(S.es==='loading')return head+'<p class="note">Loading ensemble members</p>';
if(S.es==='err'||!S.ens)return head+'<p class="note err">The ensemble service did not respond with usable members.</p><button type="button" class="btn sm" data-act="ens-retry">Retry</button>';
const oks=S.ens.ens.filter(e=>e.ok),cur=oks.find(e=>e.id===S.ei)??oks[0];
if(!cur)return head+`<p class="note err">No ensemble returned members: ${S.ens.ens.map(e=>`${esc(e.name)} (${esc(e.err??'no data')})`).join('; ')}</p><button type="button" class="btn sm" data-act="ens-retry">Retry</button>`;
const ev=EVARS.find(x=>x.k===S.ev)??EVARS[0];
let h=head+chips('ce','Ensemble',oks.map(e=>({v:e.id,l:`${e.name}, ${e.members} members`})),cur.id)+chips('cev','Ensemble variable',EVARS.map(x=>({v:x.k,l:x.l})),ev.k);
h+=`<div id="cm-ens">${ensBody(S,cur,ev)}</div>`;
const bad=S.ens.ens.filter(e=>!e.ok);
if(bad.length)h+=`<p class="note warn-t">${bad.map(e=>`${esc(e.name)} unavailable: ${esc(e.err??'no data')}`).join('. ')}</p>`;
return h}
export function ensBody(S:CmpState,cur:EnsOne,ev:{k:string;l:string;u:string;dec:number;floor?:number}):string{
const ts=cur.times??[],b=cur.vars?.[ev.k],n=cur.members??0;
if(ev.k==='precipitation'){
const r=cur.rain??[];
if(!r.length)return'<p class="note">Daily rain shares could not be built from this ensemble.</p>';
return`<div class="scroll"><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">Median mm</th><th scope="col">P90 mm</th><th scope="col">\u2265 1 mm</th><th scope="col">\u2265 10 mm</th><th scope="col">\u2265 25 mm</th></tr></thead><tbody>${r.map(x=>`<tr><th scope="row">${fmtDay(x.day,S.tz)}</th><td>${f(x.p50,1)}</td><td>${f(x.p90,1)}</td><td>${Math.round(x.ge1*100)}%</td><td>${Math.round(x.ge10*100)}%</td><td>${Math.round(x.ge25*100)}%</td></tr>`).join('')}</tbody></table></div><p class="note">Daily totals per member (UTC day), then the share of ${n} members at or above each amount. These shares count members; they are not calibrated chances of rain.</p>`}
if(!b||!ts.length)return`<p class="note">This ensemble did not provide ${ev.l.toLowerCase()}.</p>`;
const c=chart({title:`${ev.l}, ${ev.u}: member spread`,ts,series:[{label:'Median',color:'#ffffff',vals:b.p50,w:1.6}],bands:[{lo:b.min,hi:b.max,color:'#6ec1ff',op:0.08},{lo:b.p10,hi:b.p90,color:'#6ec1ff',op:0.2},{lo:b.p25,hi:b.p75,color:'#6ec1ff',op:0.3}],floor:ev.floor,h:150,ticks:dayTicks(ts,S.tz),cursor:S.cursor,dec:ev.dec,desc:`${ev.l} median with the 25 to 75 and 10 to 90 percent member ranges and the full member range, ${n} members.`});
const byDay=new Map<number,number[]>();
ts.forEach((t,i)=>{const lo=b.p10[i],hi=b.p90[i];if(lo==null||hi==null)return;const d=t-((t%86400)+86400)%86400;let a=byDay.get(d);if(!a){a=[];byDay.set(d,a)}a.push(hi-lo)});
const rows=[...byDay].sort((a,c)=>a[0]-c[0]).filter(([,a])=>a.length>=12).map(([d,a])=>`<tr><th scope="row">${fmtDay(d,S.tz)}</th><td>${f(a.reduce((s,x)=>s+x,0)/a.length,ev.dec)} ${ev.u}</td></tr>`).join('');
return c+legend([{label:'Median',color:'#ffffff'},{label:'25 to 75% of members',color:'rgba(110,193,255,.7)'},{label:'10 to 90%',color:'rgba(110,193,255,.4)'},{label:'All members',color:'rgba(110,193,255,.2)'}])+`<h3>Spread by day</h3><table class="tbl"><thead><tr><th scope="col">Day</th><th scope="col">10th to 90th percentile width</th></tr></thead><tbody>${rows}</tbody></table><p class="note">${n} real model runs. A wide band means the members diverge and the forecast is less certain; it is not the forecast error. Values are grid-cell values, not corrected for terrain or station bias.</p>`}
export function cmpPanel(S:CmpState):string{
const p=S.pin;
if(!p)return'<div class="empty"><p>Select a point on the map or search for a place, then open Compare to see how several weather models and ensemble members differ there.</p></div>';
let h=head('Model comparison',esc(p.name));
if(S.cs==='loading'||S.cs==='idle')h+='<p class="note">Loading six models</p>';
else if(S.cs==='err'||!S.cmp)h+='<p class="note err">The comparison could not be loaded. The provider or proxy failed.</p><button type="button" class="btn" data-act="cmp-retry">Retry</button>';
else{
const ok=S.cmp.models.filter(m=>m.ok).length;
h+=`<p class="note">${ok} of ${S.cmp.models.length} models responded. Raw model output at the grid cell nearest the point.</p>`+chips('cv','Variable',CVARS.map(x=>({v:x.k,l:x.l})),S.cv)+`<div id="cm-chart">${cmpChart(S)}</div><div id="cm-now">${cmpNow(S)}</div>`+agree(S)+modelStatus(S.cmp,S.tz)}
return h+ensBlock(S)}
export interface HisState{pin:{lat:number;lon:number;name:string}|null;tz:Tz;clim:ClimResp|null;rec:RecentResp|null;hs:S}
const tile=(l:string,v:string,u:string,sub:string)=>`<div class="stat"><small>${l}</small><b>${v}<i>${u}</i></b><em>${sub}</em></div>`;
export function hisPanel(S:HisState):string{
const p=S.pin;
if(!p)return'<div class="empty"><p>Select a point on the map or search for a place to see how recent weather compares with the 1991 to 2020 normal.</p></div>';
let h=head('Recent weather and anomalies',esc(p.name));
if(S.hs==='idle'||S.hs==='loading')return h+'<p class="note">Loading reanalysis history. The first request for a new area can take several seconds.</p>';
if(S.hs==='err'||!S.clim||!S.rec)return h+'<p class="note err">History could not be loaded. The archive service did not respond with usable data.</p><button type="button" class="btn" data-act="his-retry">Retry</button>';
const c=S.clim.clim,r=S.rec,tz=S.tz;
const w30=windowSummary(r,c,30),w90=windowSummary(r,c,90),tm=dailySeries(r,c,'tmean'),last=lastValid(tm);
const bandTxt=last?({below:'below the 10th percentile for this date',above:'above the 90th percentile for this date',within:'within the normal 10th to 90th percentile range',none:'no band available'} as const)[placeInBand(last)]:'';
h+=`<p class="note">Latest day with data: ${last?fmtDay(last.t,tz):'-'}${last?`, ${f(last.v,1)} \u00b0C mean, ${sg(last.anom,1)} \u00b0C against normal, ${bandTxt}`:''}.</p><div class="stats">`;
h+=tile('Temperature, 30 days',sg(w30.tAnom,1),'\u00b0C',w30.tMean==null?'&nbsp;':`mean ${w30.tMean.toFixed(1)} \u00b0C`);
h+=tile('Temperature, 90 days',sg(w90.tAnom,1),'\u00b0C',w90.tMean==null?'&nbsp;':`mean ${w90.tMean.toFixed(1)} \u00b0C`);
h+=tile('Rain, 30 days',f(w30.rain,0),'mm',w30.rainPct==null?'&nbsp;':`${Math.round(w30.rainPct)}% of normal`);
h+=tile('Rain, 90 days',f(w90.rain,0),'mm',w90.rainPct==null?'&nbsp;':`${Math.round(w90.rainPct)}% of normal`);
h+='</div>';
const s120=tm.slice(-120),ts120=s120.map(x=>x.t);
h+=chart({title:'Daily mean temperature, last 120 days, \u00b0C',ts:ts120,series:[{label:'Normal',color:'#a6b5c1',vals:s120.map(x=>x.mean),w:1,dash:'3 2'},{label:'Observed',color:'#ff9d7a',vals:s120.map(x=>x.v),w:1.5}],bands:[{lo:s120.map(x=>x.p10),hi:s120.map(x=>x.p90),color:'#a6b5c1',op:0.16}],h:150,ticks:monthTicks(ts120),desc:'Daily mean temperature from reanalysis against the 1991 to 2020 normal and its 10th to 90th percentile band.'})+legend([{label:'Daily mean',color:'#ff9d7a'},{label:'1991-2020 normal',color:'#a6b5c1',dash:true},{label:'10th to 90th percentile',color:'rgba(166,181,193,.4)'}]);
const s365=tm,ts365=s365.map(x=>x.t);
h+=chart({title:'Daily temperature anomaly, last 14 months, \u00b0C',ts:ts365,series:[],bars:{vals:s365.map(x=>x.anom),pos:'#ff9d7a',neg:'#6ec1ff'},zero:true,h:120,ticks:monthTicks(ts365,2),dec:1,desc:'Daily mean temperature minus the 1991 to 2020 normal for the same date. Warm days are drawn above zero.'});
const n90=r.times.length>90?r.times.length-90:0,pr=r.times.slice(n90),pd=dailySeries(r,c,'prcp').slice(n90);
let a=0,b=0;const ca:V[]=[],cb:V[]=[];
for(const x of pd){a+=x.v??0;b+=x.mean??0;ca.push(a);cb.push(b)}
h+=chart({title:'Cumulative rain, last 90 days, mm',ts:pr,series:[{label:'Normal',color:'#a6b5c1',vals:cb,w:1.1,dash:'3 2'},{label:'Observed',color:'#5aa6ff',vals:ca,w:1.6}],floor:0,h:120,ticks:monthTicks(pr),dec:0,desc:'Running total of daily rain from reanalysis against the running total of the 1991 to 2020 daily mean.'})+legend([{label:'Rain so far',color:'#5aa6ff'},{label:'1991-2020 normal',color:'#a6b5c1',dash:true}]);
h+=`<details><summary>Source and method</summary><dl class="kv"><dt>Data</dt><dd>${esc(S.clim.source)}; reanalysis, not station observations</dd><dt>Model</dt><dd>${esc(r.model==='era5'?'ERA5 (ECMWF), about 0.25 deg':'Provider default, mixed reanalysis (ERA5 selection was refused)')}</dd><dt>Grid cell</dt><dd>${S.clim.lat.toFixed(2)}, ${S.clim.lon.toFixed(2)}${S.clim.elev!=null?`, ${Math.round(S.clim.elev)} m`:''}</dd><dt>Normal</dt><dd>${esc(S.clim.period)}, ${S.clim.clim.years} years, \u00b1${S.clim.clim.window} days around each date</dd><dt>Latency</dt><dd>Reanalysis lags real time by several days; the last day with data is shown above</dd><dt>Fetched</dt><dd>${fmtTime(r.fetched,tz)}</dd></dl><p class="note">Anomaly is the daily value minus the mean of the same calendar date in 1991 to 2020. Rain totals are compared with the sum of daily means. The point is snapped to the reanalysis grid, so values describe a grid cell of about 25 km, which can differ from a station, especially in mountains and coasts.</p></details>`;
return h}
