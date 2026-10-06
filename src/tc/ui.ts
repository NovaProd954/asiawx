import type {TcController} from './controller';
import {STALE} from './controller';
import type {Storm,Fix,Circle} from '../../api/_tc';
import {hav} from '../../api/_tc';
import {fixes,approach,brg} from './geo';
import {fmtTime,compass,type Tz} from '../lib/time';
import {card} from '../ui/icons';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const n=(v:number|null,d=0,u='')=>v==null?'not provided':`${v.toFixed(d)}${u}`;
const km=(m:number)=>`${Math.round(m/1000)} km (${Math.round(m/1852)} nm)`;
export const tcSig=(c:TcController|null)=>c?`${c.on}|${c.state}|${c.opts.prob}|${c.opts.warn}|${c.opts.past}`:'none';
export function tcCard(c:TcController|null):string{
if(!c)return'';
const cb=(id:string,l:string,v:boolean)=>`<div class="ctl"><label class="chk"><input type="checkbox" id="${id}" ${v?'checked':''}> ${l}</label></div>`;
const n=c.data?c.data.storms.length:0;
const sub=!c.on?'Off':c.state==='loading'&&!c.data?'Loading':c.state==='err'&&!c.data?'Unavailable':`${n} active, JMA`;
const body=`${c.on?cb('l-tcp','Probability circles',c.opts.prob)+cb('l-tcw','Gale and storm areas',c.opts.warn)+cb('l-tcpast','Past track',c.opts.past)+'<div class="ctl"><span></span><button type="button" class="btn sm" data-act="opentc">View storms</button></div>':''}<p class="note">${c.state==='loading'?'Loading cyclone data':c.state==='err'?esc(c.err):'Positions, tracks and warning areas are JMA values; nothing is estimated. The timeline ring is interpolated between official forecast points.'}</p>`;
return card({id:'tc',icon:'tc',label:'Cyclones',sub,sw:{id:'l-tc',on:c.on},body})}
function chart(s:Storm):string{
const f=fixes(s).filter(x=>x.windKt!=null);
if(f.length<2)return'';
const W=320,H=120,L=30,R=8,T=8,B=20,hm=Math.max(...f.map(x=>x.h),24),top=Math.max(70,Math.ceil(Math.max(...f.map(x=>Math.max(x.windKt??0,x.gustKt??0)))/10)*10+10);
const X=(h:number)=>L+(h/hm)*(W-L-R),Y=(v:number)=>T+(1-v/top)*(H-T-B);
const grid=[34,48,64].filter(v=>v<top).map(v=>`<line class="mg-grid" x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="mg-lab" x="${L-3}" y="${Y(v)+3}" text-anchor="end">${v}</text>`).join('');
const ticks=f.map(x=>`<text class="mg-lab" x="${X(x.h)}" y="${H-6}" text-anchor="middle">${x.h===0?'now':'+'+x.h+'h'}</text>`).join('');
const pl=(k:'windKt'|'gustKt',cl:string)=>{const g=f.filter(x=>x[k]!=null);return g.length>1?`<polyline class="${cl}" points="${g.map(x=>`${X(x.h).toFixed(1)},${Y(x[k] as number).toFixed(1)}`).join(' ')}"/>`:''};
return`<svg class="mg" viewBox="0 0 ${W} ${H}" role="img" aria-label="JMA forecast maximum sustained wind in knots by lead time">${grid}<line class="mg-grid" x1="${L}" x2="${W-R}" y1="${Y(0)}" y2="${Y(0)}"/>${pl('gustKt','mg-gust')}${pl('windKt','mg-l1')}${f.map(x=>`<circle cx="${X(x.h).toFixed(1)}" cy="${Y(x.windKt as number).toFixed(1)}" r="2.6" fill="#f08a5d"/>`).join('')}${ticks}<text class="mg-cap" x="${L}" y="7">kt</text></svg><div class="cap">Solid: maximum sustained wind, 10-minute mean (JMA). Dashed: maximum gust. Guides at 34, 48 and 64 kt, the JMA tropical storm, severe tropical storm and typhoon thresholds.</div>`}
const circ=(c:Circle[])=>c.length?c.map(x=>km(x.r)).join(', '):'none in the feed';
function detail(s:Storm,tz:Tz,pin:{lat:number;lon:number;name:string}|null):string{
const w=s.now,nm=s.nameEn||(s.nameJp?s.nameJp:`No. ${s.number}`);
const age=s.issue!=null?Date.now()/1000-s.issue:null;
let h=`<div class="hd"><h2>${esc(nm)}</h2><button type="button" class="btn sm" data-act="fly" data-id="${esc(s.id)}">Show on map</button></div><div class="cap">${esc(s.catName)} (JMA category ${esc(s.cat)}), system No. ${s.number} of ${s.year}, JMA id ${esc(s.id)}</div>`;
if(age!=null&&age>STALE)h+=`<p class="note err">The latest JMA issue is ${Math.round(age/3600)} hours old.</p>`;
for(const x of s.notes)h+=`<p class="note">${esc(x)}.</p>`;
h+=`<dl class="kv"><dt>JMA issued</dt><dd>${s.issue!=null?fmtTime(s.issue,tz):'not provided'}</dd>`;
if(w){h+=`<dt>Analysis valid</dt><dd>${fmtTime(w.t,tz)}</dd><dt>Centre</dt><dd>${w.lat.toFixed(1)}N ${w.lon.toFixed(1)}E</dd><dt>Central pressure</dt><dd>${w.pressure!=null?w.pressure+' hPa':'not provided'}</dd><dt>Max sustained wind</dt><dd>${w.windKt!=null?`${w.windKt} kt (${n(w.windMs)} m/s), 10-minute mean`:'not provided'}</dd><dt>Max gust</dt><dd>${w.gustKt!=null?`${w.gustKt} kt (${n(w.gustMs)} m/s)`:'not provided'}</dd>`;
h+=`<dt>Size and strength</dt><dd>${[w.scale,w.intensity].filter(Boolean).join(', ')||'Not classified by JMA at this stage'}</dd>`}
h+=`<dt>Movement</dt><dd>${s.speedKt!=null||s.speedKmh!=null?`${s.course??'direction not provided'} at ${s.speedKt!=null?s.speedKt+' kt':''}${s.speedKmh!=null?` (${s.speedKmh} km/h)`:''}`:'not provided'}</dd><dt>Gale-force area</dt><dd>${circ(s.gale)}</dd><dt>Storm warning area</dt><dd>${w?circ(w.storm):'not provided'}</dd>`;
if(s.location)h+=`<dt>JMA location text</dt><dd lang="ja">${esc(s.location)}</dd>`;
h+=`</dl>`;
if(s.fc.length){
h+=`<h3>JMA forecast</h3><div class="scroll"><table class="tbl"><thead><tr><th>Valid</th><th>Lead</th><th>Position</th><th>Wind kt</th><th>hPa</th><th>70% circle</th></tr></thead><tbody>${s.fc.map((f:Fix)=>`<tr><td>${fmtTime(f.t,tz)}</td><td>+${f.h} h</td><td>${f.lat.toFixed(1)}N ${f.lon.toFixed(1)}E</td><td>${f.windKt??'-'}</td><td>${f.pressure??'-'}</td><td>${f.prob!=null?Math.round(f.prob/1000)+' km':'-'}</td></tr>`).join('')}</tbody></table></div><div class="cap">The forecast circle is JMA's probability circle: the centre is forecast to stay inside it with 70% probability. It does not show the extent of the winds.</div>`;
h+=chart(s)}
if(pin&&w){
const a=approach(s,pin.lat,pin.lon);
if(a){h+=`<h3>Relative to ${esc(pin.name)}</h3><dl class="kv"><dt>Centre now</dt><dd>${a.nowKm!=null?`${Math.round(a.nowKm)} km ${compass(brg(pin.lat,pin.lon,w.lat,w.lon))} of the point`:'-'}</dd><dt>Closest approach</dt><dd>${s.fc.length?`${Math.round(a.minKm)} km around ${fmtTime(a.minT,tz)}, along the official track (derived)`:'No forecast track to evaluate'}</dd><dt>In a forecast circle</dt><dd>${a.inCircle?`Yes, first at +${a.inCircle.h} h (${Math.round(a.inCircle.km)} km from that centre)`:'Not at any forecast time'}</dd><dt>In a JMA warning area</dt><dd>${a.inWarn!=null?`Yes, first at the +${a.inWarn} h forecast`:'Not at any forecast time shown'}</dd></dl><p class="note">This is geometry on the official track. It is not a warning for the point and does not include impacts from rain, surge or waves far from the centre.</p>`}}
if(s.gdacs){const g=s.gdacs;h+=`<h3>GDACS cross-check</h3><dl class="kv"><dt>Alert level</dt><dd>${esc(g.alert)}</dd><dt>Agency behind GDACS entry</dt><dd>${esc(g.agency)}</dd><dt>GDACS position</dt><dd>${g.lat.toFixed(1)}N ${g.lon.toFixed(1)}E, ${Math.round(w?hav(w.lat,w.lon,g.lat,g.lon):0)} km from the JMA analysis</dd><dt>Last advisory</dt><dd>${fmtTime(g.to,tz)}</dd><dt>Severity text</dt><dd>${esc(g.severity)}</dd>${g.report?`<dt>Report</dt><dd><a href="${esc(g.report)}" target="_blank" rel="noopener noreferrer">GDACS event page</a></dd>`:''}</dl><p class="note">GDACS is a humanitarian alert, not a national warning. Its wind figure is the highest value on the track including forecast, and its agency basis (often JTWC, 1-minute winds) differs from JMA's 10-minute winds.</p>`}
return h}
export function tcPanel(c:TcController|null,tz:Tz,pin:{lat:number;lon:number;name:string}|null):string{
if(!c)return'<h2>Storms</h2><p class="note">Cyclone data is unavailable.</p>';
let h=`<div class="hd"><h2>Tropical cyclones and warnings</h2><button type="button" class="btn sm" data-act="refresh">Refresh</button></div>`;
if(!c.on)return h+'<p class="note">The cyclone layer is off. Switch it on under Layers.</p>';
if(c.state==='loading'&&!c.data)return h+'<p class="note">Loading cyclone data</p>';
if(!c.data)return h+`<p class="note err">${esc(c.err||'No data loaded.')}</p>`;
const d=c.data,jma=d.sources.find(x=>x.id==='jma');
h+=`<div class="cap">Fetched ${fmtTime(d.fetched,tz)}${c.state==='loading'?', refreshing':''}</div>`;
if(c.state==='err')h+=`<p class="note err">The last refresh failed. Showing the previous data.</p>`;
if(jma&&!jma.ok)h+=`<p class="note err">JMA did not respond (${esc(jma.msg)}). The list of JMA systems below is incomplete; it is not a statement that no cyclones exist.</p>`;
else if(!d.storms.length)h+=`<p class="note">JMA lists no active tropical cyclones right now.</p>`;
if(d.storms.length)h+=`<ul class="tc-list">${d.storms.map(s=>{const p=s.now;return`<li><button type="button" class="tc-item" data-act="sel" data-id="${esc(s.id)}" aria-pressed="${s.id===c.sel}"><span><strong>${esc(s.nameEn||'No. '+s.number)}</strong> <span class="note">${esc(s.catName)}</span></span><span class="note">${p?`${p.windKt!=null?p.windKt+' kt, ':''}${p.pressure!=null?p.pressure+' hPa':''}`:'no analysis'}</span></button></li>`}).join('')}</ul>`;
const s=c.storm;
if(s)h+=detail(s,tz,pin);
if(d.gdacsOnly.length)h+=`<h3>Other systems reported by GDACS</h3><ul class="tc-list">${d.gdacsOnly.map(g=>`<li><button type="button" class="tc-item" data-act="flyg" data-id="${g.id}"><span><strong>${esc(g.name)}</strong> <span class="note">${esc(g.agency)}, ${esc(g.alert)} alert</span></span><span class="note">${g.lat.toFixed(1)}N ${g.lon.toFixed(1)}E</span></button></li>`).join('')}</ul><p class="note">Position only. These are not in JMA's list, so no JMA track, intensity or warning area is available. GDACS times are treated as UTC.</p>`;
h+=`<h3>Warnings in force</h3>`;
const hk=d.sources.find(x=>x.id==='hko');
if(!hk||!hk.ok)h+=`<p class="note err">Hong Kong Observatory warnings could not be loaded${hk?` (${esc(hk.msg)})`:''}.</p>`;
else if(!d.warnings.length)h+=`<p class="note">Hong Kong Observatory reports no warnings in force.</p>`;
else h+=`<ul class="lim">${d.warnings.map(x=>`<li>${esc(x.name)}${x.tc?' (tropical cyclone signal)':''}${x.updated?`, updated ${fmtTime(x.updated,tz)}`:''}</li>`).join('')}</ul>`;
h+=`<p class="note">Only Hong Kong's official warnings are integrated so far. Warnings from PAGASA, CMA, TMD, IMD and other agencies are not shown, because no verified open machine-readable feed from them has been confirmed in this build. Follow your national agency for official warnings.</p><h3>Limitations</h3><ul class="lim"><li>JMA reports 10-minute mean wind. JTWC and many other agencies use 1-minute sustained wind, which reads higher for the same storm, so numbers are not comparable across agencies.</li><li>Track and intensity beyond a day or two carry large errors. The probability circle is the official statement of that uncertainty.</li><li>Warning areas are drawn from JMA geometry as published. Where JMA gives sectors, they are drawn as full circles with lighter fill.</li><li>The timeline ring is a straight-in-time interpolation between official forecast points and exists only between the analysis and the last forecast hour.</li><li>JTWC warnings are not read directly: the direct sources were not confirmed reliable. Use /api/tcprobe on the live site to test them.</li></ul>`;
return h}
