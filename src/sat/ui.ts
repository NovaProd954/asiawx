import type {SatController} from './controller';
import {BANDS,COOL_K,CONV_T,OT_T,OT_DELTA,TEX_SD,enhColor,type View} from './decode';
import {fmtTime,type Tz} from '../lib/time';
import {card,radios} from '../ui/icons';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
const DEF=[{key:'ir',name:'Clean infrared, Band 13 (10.4 um)'},{key:'vis',name:'Visible red, Band 3 (0.64 um)'},{key:'airmass',name:'Air Mass RGB'}];
export const VIEWS:[View,string,string][]=[
['raw','Raw source imagery','Observed, as published by the imagery provider'],
['enh','Enhanced infrared','Enhanced: AsiaWX palette applied to decoded brightness temperature'],
['cold','Cold cloud mask','Derived: threshold on decoded brightness temperature'],
['conv','Convective candidates','Interpretive: heuristic flag, not confirmed convection'],
['ot','Overshooting-top candidates','Interpretive: heuristic flag at native resolution only'],
['cool','30 min cooling rate','Derived: brightness temperature change over 30 minutes'],
['cloud','Cloud layer, background removed','Interpretive: clear-sky background estimated locally and removed; not an official cloud mask']];
const THR=[-32,-42,-52,-62,-72];
export const satSig=(c:SatController|null)=>c?`${c.on}|${c.key}|${c.view}|${c.cmapState}|${c.loading}|${!!c.catalog}|${c.frames.length>0}|${c.smoothLv}|${c.cov}|${c.borders}|${c.saving}|${c.cal.get(c.key)?.s??''}|${c.lums.has(c.key)}`:'none';
export function satCard(c:SatController|null):string{
if(!c)return card({id:'sat',icon:'sat',label:'Satellite',sub:'Needs WebGL',body:'<p class="note">Satellite layers need WebGL and the map.</p>'});
const items:{v:string;l:string;s?:string}[]=[];
const pv=c.catalog?.providers??[];
if(c.catalog){for(const x of c.catalog.layers)items.push({v:x.key,l:x.name,s:pv.find(p=>p.id===x.provider)?.name??x.provider})}
else for(const x of DEF)items.push({v:x.key,l:x.name});
const cur=c.catalog?.layers.find(x=>x.key===c.key)?.name??DEF.find(x=>x.key===c.key)?.name??'Himawari-9';
const pl=pv.length?`<ul class="lim">${pv.map(p=>`<li>${esc(p.name)}: ${p.ok?'available':'unavailable'}${p.msg?`. ${esc(p.msg)}`:''}</li>`).join('')}</ul>`:'';
const body=`${radios('l-sp','Satellite product',items,c.key)}<div class="ctl"><label for="l-so">Opacity</label><input type="range" id="l-so" min="0.2" max="1" step="0.05" value="${c.opacity}"></div><p class="note">${c.loading?'Loading satellite catalog':'Switching it on changes the timeline to observation times; wind follows the nearest model hour.'}</p>${c.on?`<div class="ctl"><label class="chk"><input type="checkbox" id="l-sb" ${c.borders?'checked':''}> Borders above imagery</label></div><div class="ctl"><span>Saved frames</span><span class="pair"><button type="button" class="btn sm" id="l-save">${c.saving?'Stop':'Save loop'}</button><button type="button" class="btn sm" id="l-clear">Clear</button></span></div><p class="note" id="sc-stat"></p><p class="note">Viewed tiles are kept on this device so replays do not hit the providers again. Decoder views are in Info, Decoder.</p>`:''}${pl}`;
return card({id:'sat',icon:'sat',label:'Satellite',sub:c.on?cur:'Himawari-9, off',sw:{id:'l-sat',on:c.on},body})}
function legend(c:SatController):string{
const v=c.view;
if(v==='enh'){const st=[];for(let t=40;t>=-90;t-=10){const k=enhColor(t);st.push(`rgb(${k.join(',')}) ${((40-t)/130*100).toFixed(0)}%`)}
return`<div class="lgp"><div class="lg-bar" style="background:linear-gradient(to right,${st.join(',')})"></div><div class="lg-ticks"><span>40</span><span>0</span><span>-30</span><span>-50</span><span>-70</span><span>-90 deg C</span></div></div>`}
if(v==='cold'){return`<div class="lgp">${BANDS.map((b,i)=>`<div><span class="sw" style="background:rgb(${b.join(',')})"></span>${i===BANDS.length-1?`${c.thr-10*i} deg C and colder`:`${c.thr-10*i} to ${c.thr-10*(i+1)} deg C`}</div>`).join('')}</div>`}
if(v==='conv')return`<div class="lgp"><div><span class="sw" style="background:rgb(255,140,0)"></span>BT at or below ${CONV_T} deg C with local BT texture of ${TEX_SD} K or more (7 by 7 px)</div></div>`;
if(v==='ot')return`<div class="lgp"><div><span class="sw" style="background:rgb(255,0,200)"></span>BT at or below ${OT_T} deg C and at least ${OT_DELTA} K colder than the surrounding ring</div></div>`;
if(v==='cool')return`<div class="lgp"><div class="lg-bar" style="background:linear-gradient(to right,rgb(255,230,40),rgb(255,30,0))"></div><div class="lg-ticks"><span>${COOL_K} K</span><span>${COOL_K+14} K or more cooling in 30 min</span></div></div>`;
if(v==='cloud')return`<div class="lgp"><div class="lg-bar" style="background:linear-gradient(to right,rgba(170,173,178,.05),rgb(170,173,178) 35%,rgb(250,253,255))"></div><div class="lg-ticks"><span>Thin or low</span><span>Thick or high</span></div></div>`;
return'<div class="lgp note">Raw imagery is shown as published by the provider. Open the decoded views for temperature or cloud products.</div>'}
export function satDecoderHtml(c:SatController|null,tz:Tz):string{
if(!c||!c.on)return'';
const L=c.layer;
if(!L||!c.frames.length)return`<h2>Satellite Cloud Decoder</h2><p class="note">${c.loading?'Loading satellite catalog':'No satellite frames are loaded.'}</p><hr class="sp">`;
const t=c.time as number,mode=c.mode,can=c.can,vw=c.views,vi=VIEWS.find(x=>x[0]===c.view) as typeof VIEWS[number];
let h=`<h2>Satellite Cloud Decoder</h2><dl class="kv"><dt>Product</dt><dd>${esc(L.name)}</dd><dt>Layer</dt><dd>${esc(L.id)}</dd><dt>Platform</dt><dd>${esc(L.provider==='gibs'?'NASA GIBS imagery':L.provider==='jma'?'JMA Himawari-9':'SSEC RealEarth')}</dd><dt>Valid</dt><dd id="sd-valid">${fmtTime(t,tz)}</dd><dt>Frames</dt><dd>${c.frames.length} frames, ${L.step?Math.round(L.step/60)+' min spacing':'spacing not provided'}</dd><dt>Tiles</dt><dd>${esc(L.tms)}, ${esc(L.format)}, native zoom ${L.maxzoom}</dd><dt>Decoding</dt><dd>${mode==='cmap'?'From the published GIBS colormap':mode==='lum'?'From image brightness, calibrated live against GIBS':mode==='vis'?'From image brightness, no colormap used':'Not available for this product'}</dd><dt>Class</dt><dd>${esc(can?vi[2]:VIEWS[0][2])}</dd></dl>`;
if(!mode)h+=`<p class="note">This product has no decoder. Choose Clean infrared (GIBS), JMA Band 13, a global infrared composite, or a visible product under Layers.</p>`;
else if(mode==='cmap'){
if(c.cmapState==='loading'||c.cmapState==='idle')h+=`<p class="note">Loading the published GIBS colormap</p>`;
else if(c.cmapState==='error')h+=`<p class="note err">The GIBS colormap could not be loaded, so temperatures cannot be decoded. Raw imagery is unaffected.</p>`;
else if(c.cmapState==='unusable')h+=`<p class="note err">The GIBS colormap for this layer has no temperature labels that AsiaWX can read, so temperatures are not decoded. Raw imagery is unaffected.</p>`}
else if(mode==='lum'){
const k=c.cal.get(c.key);
h+=`<p class="note ${k?.s==='fail'?'err':''}">${k?esc(k.s==='working'?'Calibrating: '+k.m:k.s==='ok'?'Brightness to temperature curve ready. '+k.m:k.m):'Waiting to calibrate'}</p>${k&&k.s!=='working'?`<div class="ctl"><span>Calibration</span><button type="button" class="btn sm" id="sd-recal">Recalibrate</button></div>`:''}`}
else h+=`<p class="note">Cloud is separated from the surface by brightness alone. There is no temperature for this product, so only the cloud layer is offered.</p>`;
h+=`<div class="ctl"><label for="sd-view">View</label><select id="sd-view" ${can?'':'disabled'}>${VIEWS.filter(x=>vw.includes(x[0])).map(x=>`<option value="${x[0]}" ${x[0]===c.view?'selected':''}>${esc(x[1])}</option>`).join('')}</select></div>`;
if(can&&c.view==='cold')h+=`<div class="ctl"><label for="sd-thr">Cold threshold</label><select id="sd-thr">${THR.map(x=>`<option value="${x}" ${x===c.thr?'selected':''}>${x} deg C</option>`).join('')}</select></div>`;
if(can&&c.view!=='raw')h+=`<div class="ctl"><label for="sd-mix">Raw to decoded</label><input type="range" id="sd-mix" min="0" max="1" step="0.05" value="${c.mix}"></div><p class="note">An opacity crossfade between the raw layer and the decoded layer, not a swipe.</p>`;
if(can)h+=`<div class="ctl"><label for="sd-sm">Smoothing</label><select id="sd-sm"><option value="0" ${c.smoothLv===0?'selected':''}>Off, native pixels</option><option value="1" ${c.smoothLv===1?'selected':''}>Light</option><option value="2" ${c.smoothLv===2?'selected':''}>Smooth</option></select></div><div class="ctl"><label for="sd-cov">Full disk detail</label><select id="sd-cov"><option value="fast" ${c.cov==='fast'?'selected':''}>Fast, zoom 4 (about 10 km)</option><option value="fine" ${c.cov==='fine'?'selected':''}>Fine, zoom 5 (about 5 km), slower</option></select></div>`;
h+=can&&mode!=='vis'?legend(c):c.view==='cloud'&&can?legend(c):'';
h+=`<div id="sd-stat" class="note"></div><div id="sd-stats"></div>`;
h+=`<details><summary>Method</summary><p>Pipeline: (1) the tiles of the chosen product are fetched and rasterised into one image in the browser for the whole region the Himawari-9 disk covers; (2) background is removed: everything beyond the satellite's limb is dropped using the geometry of the sub-satellite point at 140.7 E, the outer rim is faded because the viewing angle is too oblique, and no-data pixels are transparent; (3) the pixels are decoded. In colormap mode each pixel colour is matched to an entry of the published GIBS colormap and converted to a brightness temperature (BT) from that entry's label, giving the bin midpoint. In calibrated mode, for a grey-scale infrared source with no published colormap, a monotone curve from image brightness to BT is fitted against the GIBS Clean IR frame at the same time over the same tiles; its residual is shown, and the fit is rejected if the source is not grey-scale, does not line up with GIBS, or disagrees by more than 6 K. In brightness mode (visible products) nothing is converted to temperature. BT is the temperature a sensor infers from 10.4 um radiance. For thick cold cloud it approximates the cloud top; for thin or small clouds it is warmer than the true top. Smoothing applies a small binomial filter to BT before colouring, removes the stair-steps of the colormap bins, and for small windows doubles the output resolution by bilinear interpolation of BT before it is coloured. Candidate views use unsmoothed BT. The full-disk image is decoded at a fixed coarse zoom and kept under a finer decode of the area on screen. The cloud layer estimates the clear-sky background in each block of about 8 degrees as the 90th percentile of BT (warmest) for infrared, or the 20th percentile of brightness (darkest) for visible, and makes pixels transparent unless they are colder, or brighter, than that background. Enhanced infrared applies the AsiaWX palette to BT. The cold mask colours pixels at or below the chosen threshold in 10 K steps. Convective candidates are pixels at or below ${CONV_T} deg C whose 7 by 7 pixel neighbourhood has a BT standard deviation of at least ${TEX_SD} K, a texture heuristic meant to separate bumpy convective tops from smooth cirrus shields; they are only computed on the area on screen, where the pixels are fine enough. Overshooting-top candidates are evaluated only on native-resolution tiles: BT at or below ${OT_T} deg C and at least ${OT_DELTA} K colder than the mean of the ring between 5 by 5 and 13 by 13 pixels around it. The cooling view subtracts BT from 30 minutes earlier and shows cooling of at least ${COOL_K} K where BT is at or below 0 deg C.</p></details><h3>Limitations</h3><ul class="lim"><li>Temperatures are only as precise as the GIBS colormap bins, or as the calibration curve. They are decoded from colours or brightness, not from raw radiance.</li><li>Candidate views are heuristics with fixed thresholds that have not been validated here. They do not confirm convection, hail or severe weather, and are not drawn outside the area on screen.</li><li>The cloud layer is not an official cloud mask. A single channel cannot tell a cold surface from cloud, so snow, high plateaus in winter and cloud shields larger than the background window can be misjudged; low cloud over a warm sea is only found where clear sky is nearby.</li><li>Parallax displaces high cloud from its true ground position, more at high latitude and far from 140.7E.</li><li>Cooling includes cloud motion as well as cloud-top growth, because pixels are compared at fixed locations.</li><li>The full-disk decode is coarse. Zoom in for a finer decode of the area on screen; overshooting-top candidates need the native zoom.</li><li>Himawari-9 coverage ends at the edge of its full disk. Far western and far northern Asia are poorly viewed or absent.</li><li>The visible product is dark at night, so its cloud layer is empty on the night side.</li></ul><p class="note">${esc(L.provider==='gibs'?"We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).":L.attribution)}</p><hr class="sp">`;
return h}
export function satDyn(c:SatController|null,tz:Tz){
if(!c||!c.on)return;
const v=document.getElementById('sd-valid');if(v&&c.time!=null)v.textContent=fmtTime(c.time,tz);
const s=document.getElementById('sd-stat');
if(s){s.textContent=c.dstat;s.className=c.dkind==='err'?'err':c.dkind==='warn'?'warn-t':'note'}
const cs=document.getElementById('sc-stat');
if(cs)cs.textContent=[c.cstat,c.cinfo].filter(Boolean).join('. ');
const sv=document.getElementById('l-save');if(sv)sv.textContent=c.saving?'Stop':'Save loop';
const o=document.getElementById('sd-stats');if(!o)return;
const L=c.layer,t=c.time,ok=(m:typeof c.meta)=>!!m&&m.time===t&&m.key===`${c.view}|${c.thr}|${c.smoothLv}`;
const d=ok(c.meta)?c.meta:null,w=ok(c.wmeta)?c.wmeta:null,m=d??w;
if(!m||!L){o.innerHTML='';return}
const st=m.stats,vw=m.view,rows:string[]=[],vis=m.src==='vis';
if(w)rows.push(`<dt>Full disk</dt><dd>Zoom ${w.z} of ${L.maxzoom}; ${w.w} by ${w.h} px</dd>`);
else if(vw==='conv'||vw==='ot')rows.push(`<dt>Full disk</dt><dd>Not computed for this view. Candidates need fine pixels, so only the area on screen is decoded.</dd>`);
if(d)rows.push(`<dt>Visible area</dt><dd>Zoom ${d.z} of ${L.maxzoom}${d.native?', native resolution':', below native resolution'}; ${d.w} by ${d.h} px${d.ow>d.w?', smoothed to '+d.ow+' by '+d.oh+' px':''}</dd>`);
rows.push(`<dt>Pixels with data</dt><dd>${st.valid.toLocaleString('en-US')}${w&&d?' (visible area)':''}</dd>`);
if(!vis)rows.push(`<dt>Coldest BT in view</dt><dd>${st.min==null?'-':st.min.toFixed(1)+' deg C, approximate'}</dd>`);
if(vw==='cold')rows.push(`<dt>At or below ${c.thr} deg C</dt><dd>${st.flag.toLocaleString('en-US')} px</dd>`);
else if(vw==='conv')rows.push(`<dt>Candidate pixels</dt><dd>${st.flag.toLocaleString('en-US')}</dd>`);
else if(vw==='ot')rows.push(m.native?`<dt>Candidate pixels</dt><dd>${st.flag.toLocaleString('en-US')}</dd>`:`<dt>Status</dt><dd>Not evaluated. Zoom in to native resolution (zoom ${L.maxzoom}).</dd>`);
else if(vw==='cool')rows.push(m.prevOk?`<dt>Cooling pixels</dt><dd>${st.flag.toLocaleString('en-US')}</dd>`:`<dt>Status</dt><dd>No frame 30 minutes earlier in the loaded set.</dd>`);
else if(vw==='cloud')rows.push(`<dt>Cloudy pixels</dt><dd>${st.flag.toLocaleString('en-US')}${w&&d?' (visible area)':''}</dd>`);
o.innerHTML=`<dl class="kv">${rows.join('')}</dl>`}
