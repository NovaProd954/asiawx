import type {SatController} from './controller';
import {ACK} from '../config';
import {BANDS,COOL_K,CONV_T,OT_T,OT_DELTA,TEX_SD,enhColor,type View} from './decode';
import {fmtTime,type Tz} from '../lib/time';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const DEF=[{key:'ir',name:'Clean infrared, Band 13 (10.4 um)'},{key:'vis',name:'Visible red, Band 3 (0.64 um)'},{key:'airmass',name:'Air Mass RGB'}];
export const VIEWS:[View,string,string][]=[
['raw','Raw GIBS imagery','Observed, colour-rendered by NASA GIBS'],
['enh','Enhanced infrared','Enhanced: AsiaWX palette applied to decoded brightness temperature'],
['cold','Cold cloud mask','Derived: threshold on decoded brightness temperature'],
['conv','Convective candidates','Interpretive: heuristic flag, not confirmed convection'],
['ot','Overshooting-top candidates','Interpretive: heuristic flag at native resolution only'],
['cool','30 min cooling rate','Derived: brightness temperature change over 30 minutes']];
const THR=[-32,-42,-52,-62,-72];
export const satSig=(c:SatController|null)=>c?`${c.on}|${c.key}|${c.view}|${c.cmapState}|${c.loading}|${!!c.catalog}|${c.frames.length>0}`:'none';
export function satLayerControls(c:SatController|null):string{
if(!c)return'<h2>Satellite</h2><p class="note">Satellite layers need WebGL and the map.</p>';
const l=(c.catalog?c.catalog.layers:DEF).map(x=>`<option value="${x.key}" ${x.key===c.key?'selected':''}>${esc(x.name)}</option>`).join('');
return`<h2 class="gap">Satellite</h2><div class="ctl"><label><input type="checkbox" id="l-sat" ${c.on?'checked':''}> Himawari-9 imagery</label></div><div class="ctl"><label for="l-sp">Product</label><select id="l-sp">${l}</select></div><div class="ctl"><label for="l-so">Imagery opacity</label><input type="range" id="l-so" min="0.2" max="1" step="0.05" value="${c.opacity}"></div><p class="note">${c.loading?'Loading satellite catalog':'Observed imagery in about 4 hours of 10 minute frames. Switching it on changes the timeline to observation times; wind follows the nearest model hour.'}</p>`}
function legend(c:SatController):string{
const v=c.view;
if(v==='enh'){const st=[];for(let t=40;t>=-90;t-=10){const k=enhColor(t);st.push(`rgb(${k.join(',')}) ${((40-t)/130*100).toFixed(0)}%`)}
return`<div class="lgp"><div class="lg-bar" style="background:linear-gradient(to right,${st.join(',')})"></div><div class="lg-ticks"><span>40</span><span>0</span><span>-30</span><span>-50</span><span>-70</span><span>-90 deg C</span></div></div>`}
if(v==='cold'){return`<div class="lgp">${BANDS.map((b,i)=>`<div><span class="sw" style="background:rgb(${b.join(',')})"></span>${i===BANDS.length-1?`${c.thr-10*i} deg C and colder`:`${c.thr-10*i} to ${c.thr-10*(i+1)} deg C`}</div>`).join('')}</div>`}
if(v==='conv')return`<div class="lgp"><div><span class="sw" style="background:rgb(255,140,0)"></span>BT at or below ${CONV_T} deg C with local BT texture of ${TEX_SD} K or more (7 by 7 px)</div></div>`;
if(v==='ot')return`<div class="lgp"><div><span class="sw" style="background:rgb(255,0,200)"></span>BT at or below ${OT_T} deg C and at least ${OT_DELTA} K colder than the surrounding ring</div></div>`;
if(v==='cool')return`<div class="lgp"><div class="lg-bar" style="background:linear-gradient(to right,rgb(255,230,40),rgb(255,30,0))"></div><div class="lg-ticks"><span>${COOL_K} K</span><span>${COOL_K+14} K or more cooling in 30 min</span></div></div>`;
return'<div class="lgp note">GIBS colour scale as published by NASA. Open the decoded views for temperature-based products.</div>'}
export function satDecoderHtml(c:SatController|null,tz:Tz):string{
if(!c||!c.on)return'';
const L=c.layer;
if(!L||!c.frames.length)return`<h2>Satellite Cloud Decoder</h2><p class="note">${c.loading?'Loading satellite catalog':'No satellite frames are loaded.'}</p><hr class="sp">`;
const t=c.time as number,ir=L.kind==='ir',can=ir&&c.cmapOk,vi=VIEWS.find(x=>x[0]===c.view) as typeof VIEWS[number];
let h=`<h2>Satellite Cloud Decoder</h2><dl class="kv"><dt>Product</dt><dd>${esc(L.name)}</dd><dt>Layer</dt><dd>${esc(L.id)}</dd><dt>Platform</dt><dd>Himawari-9, AHI, operated by JMA; delivered by NASA GIBS</dd><dt>Valid</dt><dd id="sd-valid">${fmtTime(t,tz)}</dd><dt>Frames</dt><dd>${c.frames.length} frames, ${L.step?Math.round(L.step/60)+' min spacing':'spacing not provided'}</dd><dt>Tiles</dt><dd>${esc(L.tms)}, ${esc(L.format)}, native zoom ${L.maxzoom}</dd><dt>Class</dt><dd>${esc(can?vi[2]:VIEWS[0][2])}</dd></dl>`;
if(!ir)h+=`<p class="note">The decoder reads temperature from the Clean infrared product. Select it under Layers to use the decoded views.</p>`;
else if(c.cmapState==='loading'||c.cmapState==='idle')h+=`<p class="note">Loading the published GIBS colormap</p>`;
else if(c.cmapState==='error')h+=`<p class="note err">The GIBS colormap could not be loaded, so temperatures cannot be decoded. Raw imagery is unaffected.</p>`;
else if(c.cmapState==='unusable')h+=`<p class="note err">The GIBS colormap for this layer has no temperature labels that AsiaWX can read, so temperatures are not decoded. Raw imagery is unaffected.</p>`;
h+=`<div class="ctl"><label for="sd-view">View</label><select id="sd-view" ${can?'':'disabled'}>${VIEWS.map(x=>`<option value="${x[0]}" ${x[0]===c.view?'selected':''}>${esc(x[1])}</option>`).join('')}</select></div>`;
if(can&&c.view==='cold')h+=`<div class="ctl"><label for="sd-thr">Cold threshold</label><select id="sd-thr">${THR.map(x=>`<option value="${x}" ${x===c.thr?'selected':''}>${x} deg C</option>`).join('')}</select></div>`;
if(can&&c.view!=='raw')h+=`<div class="ctl"><label for="sd-mix">Raw to decoded</label><input type="range" id="sd-mix" min="0" max="1" step="0.05" value="${c.mix}"></div><p class="note">An opacity crossfade between the raw GIBS layer and the decoded layer, not a swipe.</p>`;
h+=can?legend(c):'';
h+=`<div id="sd-stat" class="note"></div><div id="sd-stats"></div>`;
h+=`<details><summary>Method</summary><p>Each pixel colour in a GIBS tile is matched to an entry of the published GIBS colormap and converted to a brightness temperature (BT) taken from that entry's label; a colour that falls in a bin of several degrees yields the bin midpoint. BT is the temperature a sensor infers from 10.4 um radiance. For thick cold cloud it approximates the cloud top; for thin or small clouds it is warmer than the true top. Enhanced infrared applies the AsiaWX palette to BT. The cold mask colours pixels at or below the chosen threshold in 10 K steps. Convective candidates are pixels at or below ${CONV_T} deg C whose 7 by 7 pixel neighbourhood has a BT standard deviation of at least ${TEX_SD} K, a texture heuristic meant to separate bumpy convective tops from smooth cirrus shields. Overshooting-top candidates are evaluated only on native-resolution tiles: BT at or below ${OT_T} deg C and at least ${OT_DELTA} K colder than the mean of the ring between 5 by 5 and 13 by 13 pixels around it. The cooling view subtracts BT from 30 minutes earlier and shows cooling of at least ${COOL_K} K where BT is at or below 0 deg C.</p></details><h3>Limitations</h3><ul class="lim"><li>Temperatures are only as precise as the GIBS colormap bins. They are decoded from colours, not from raw radiance.</li><li>Candidate views are heuristics with fixed thresholds that have not been validated here. They do not confirm convection, hail or severe weather.</li><li>Parallax displaces high cloud from its true ground position, more at high latitude and far from 140.7E.</li><li>Cooling includes cloud motion as well as cloud-top growth, because pixels are compared at fixed locations.</li><li>Only the visible map area is decoded, at the tile zoom shown below the legend. Zoom in to the native zoom for overshooting-top candidates.</li><li>Himawari-9 coverage ends near the edge of its full disk. Far western and far northern Asia are poorly viewed or absent.</li><li>The visible product is dark at night and is not decoded.</li></ul><p class="note">${esc(ACK)}</p><hr class="sp">`;
return h}
export function satDyn(c:SatController|null,tz:Tz){
if(!c||!c.on)return;
const v=document.getElementById('sd-valid');if(v&&c.time!=null)v.textContent=fmtTime(c.time,tz);
const s=document.getElementById('sd-stat');
if(s){s.textContent=c.dstat;s.className=c.dkind==='err'?'err':c.dkind==='warn'?'warn-t':'note'}
const o=document.getElementById('sd-stats');if(!o)return;
const m=c.meta,L=c.layer;
if(!m||!L||m.time!==c.time){o.innerHTML='';return}
const st=m.stats,vw=m.view,rows:string[]=[];
rows.push(`<dt>Decoded area</dt><dd>Zoom ${m.z} of ${L.maxzoom}${m.native?', native resolution':', below native resolution'}; ${m.w} by ${m.h} px</dd>`);
rows.push(`<dt>Pixels with data</dt><dd>${st.valid.toLocaleString('en-US')}</dd>`);
rows.push(`<dt>Coldest BT in view</dt><dd>${st.min==null?'-':st.min.toFixed(1)+' deg C, approximate'}</dd>`);
if(vw==='cold')rows.push(`<dt>At or below ${c.thr} deg C</dt><dd>${st.flag.toLocaleString('en-US')} px</dd>`);
else if(vw==='conv')rows.push(`<dt>Candidate pixels</dt><dd>${st.flag.toLocaleString('en-US')}</dd>`);
else if(vw==='ot')rows.push(m.native?`<dt>Candidate pixels</dt><dd>${st.flag.toLocaleString('en-US')}</dd>`:`<dt>Status</dt><dd>Not evaluated. Zoom in to native resolution (zoom ${L.maxzoom}).</dd>`);
else if(vw==='cool')rows.push(m.prevOk?`<dt>Cooling pixels</dt><dd>${st.flag.toLocaleString('en-US')}</dd>`:`<dt>Status</dt><dd>No frame 30 minutes earlier in the loaded set.</dd>`);
o.innerHTML=`<dl class="kv">${rows.join('')}</dl>`}
