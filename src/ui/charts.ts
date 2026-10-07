import {fmtDay,isMidnight,type Tz} from '../lib/time';
export type V=number|null;
export interface Ser{label:string;color:string;vals:V[];w?:number;dash?:string}
export interface BandS{lo:V[];hi:V[];color:string;op:number}
export interface Tick{t:number;label:string}
export interface ChartOpts{title:string;ts:number[];series:Ser[];bands?:BandS[];bars?:{vals:V[];pos:string;neg:string};floor?:number;zero?:boolean;h?:number;ticks:Tick[];cursor?:number|null;desc:string;dec?:number}
const W=360,L=34,R=8,PW=W-L-R;
const MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function dayTicks(ts:number[],tz:Tz):Tick[]{
const m=ts.filter(t=>isMidnight(t,tz)),long=m.length>6;
return m.map(t=>({t,label:long?fmtDay(t,tz).slice(0,2):fmtDay(t,tz)}))}
export function monthTicks(ts:number[],every=1):Tick[]{
const o:Tick[]=[];let k=0;
for(const t of ts){const d=new Date(t*1000);if(d.getUTCDate()===1){if(k++%every===0)o.push({t,label:MO[d.getUTCMonth()]})}}
return o}
const nn=(a:V[])=>a.filter((x):x is number=>x!=null&&Number.isFinite(x));
function path(x:(t:number)=>number,ts:number[],a:V[],y:(v:number)=>number){
let d='',pen=false;
for(let i=0;i<ts.length;i++){const v=a[i];if(v==null){pen=false;continue}d+=`${pen?'L':'M'}${x(ts[i]).toFixed(1)} ${y(v).toFixed(1)}`;pen=true}
return d}
function bandPath(x:(t:number)=>number,ts:number[],lo:V[],hi:V[],y:(v:number)=>number){
const ix:number[]=[];for(let i=0;i<ts.length;i++)if(lo[i]!=null&&hi[i]!=null)ix.push(i);
if(ix.length<2)return'';
let s='';
// split into contiguous runs
let run:number[]=[];
const flush=()=>{if(run.length>1){s+='M'+run.map(i=>`${x(ts[i]).toFixed(1)} ${y(hi[i] as number).toFixed(1)}`).join('L')+'L'+[...run].reverse().map(i=>`${x(ts[i]).toFixed(1)} ${y(lo[i] as number).toFixed(1)}`).join('L')+'Z'}run=[]};
for(const i of ix){if(run.length&&i!==run[run.length-1]+1)flush();run.push(i)}
flush();return s}
export function chart(o:ChartOpts):string{
const H=o.h??120,top=14,bot=16,ph=H-top-bot,t0=o.ts[0],t1=o.ts[o.ts.length-1],x=(t:number)=>L+(t-t0)/Math.max(1,t1-t0)*PW;
const all:V[]=[];
for(const s of o.series)all.push(...s.vals);
for(const b of o.bands??[]){all.push(...b.lo,...b.hi)}
if(o.bars)all.push(...o.bars.vals);
const v=nn(all);
let lo=v.length?Math.min(...v):0,hi=v.length?Math.max(...v):1;
if(o.floor!==undefined)lo=Math.min(lo,o.floor);
if(o.zero){lo=Math.min(lo,0);hi=Math.max(hi,0)}
if(hi-lo<1){hi+=0.5;lo-=0.5}
const pad=(hi-lo)*0.06;
if(o.floor===undefined&&!o.zero)lo-=pad;
hi+=pad;
if(o.floor!==undefined)lo=o.floor;
const y=(val:number)=>top+ph-(val-lo)/(hi-lo)*ph,dec=o.dec??(hi-lo<6?1:0);
let s=`<text x="${L}" y="9" class="mg-cap">${o.title}</text>`;
for(let g=0;g<=2;g++){const val=lo+(hi-lo)*g/2;s+=`<line x1="${L}" x2="${W-R}" y1="${y(val).toFixed(1)}" y2="${y(val).toFixed(1)}" class="mg-grid"/><text x="${L-4}" y="${(y(val)+3).toFixed(1)}" text-anchor="end" class="mg-lab">${val.toFixed(dec)}</text>`}
for(const k of o.ticks){if(k.t<t0||k.t>t1)continue;s+=`<line x1="${x(k.t).toFixed(1)}" x2="${x(k.t).toFixed(1)}" y1="${top}" y2="${top+ph}" class="mg-day"/><text x="${(x(k.t)+3).toFixed(1)}" y="${H-3}" class="mg-lab">${k.label}</text>`}
if(o.zero&&lo<0&&hi>0)s+=`<line x1="${L}" x2="${W-R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="mg-zero"/>`;
for(const b of o.bands??[]){const d=bandPath(x,o.ts,b.lo,b.hi,y);if(d)s+=`<path d="${d}" fill="${b.color}" fill-opacity="${b.op}" stroke="none"/>`}
if(o.bars){const bw=Math.max(0.6,PW/o.ts.length*0.9),z=y(0);for(let i=0;i<o.ts.length;i++){const val=o.bars.vals[i];if(val==null)continue;const yy=y(val);s+=`<rect x="${(x(o.ts[i])-bw/2).toFixed(2)}" y="${Math.min(yy,z).toFixed(1)}" width="${bw.toFixed(2)}" height="${Math.max(0.4,Math.abs(yy-z)).toFixed(1)}" fill="${val>=0?o.bars.pos:o.bars.neg}"/>`}}
for(const sr of o.series){const d=path(x,o.ts,sr.vals,y);if(d)s+=`<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="${sr.w??1.4}"${sr.dash?` stroke-dasharray="${sr.dash}"`:''} stroke-linejoin="round"/>`}
if(o.cursor!=null&&o.cursor>=t0&&o.cursor<=t1)s+=`<line x1="${x(o.cursor).toFixed(1)}" x2="${x(o.cursor).toFixed(1)}" y1="${top}" y2="${top+ph}" class="mg-cur"/>`;
return`<svg viewBox="0 0 ${W} ${H}" class="mg" role="img" aria-label="${o.title.replace(/"/g,'')}" data-t0="${t0}" data-t1="${t1}"><title>${o.title}</title><desc>${o.desc}</desc>${s}</svg>`}
export function bindPick(host:HTMLElement,onPick:(t:number)=>void){
const svg=host.querySelector('svg') as SVGSVGElement|null;if(!svg)return;
const t0=Number(svg.dataset.t0),t1=Number(svg.dataset.t1);
svg.addEventListener('pointerdown',e=>{const r=svg.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W,t=t0+Math.min(1,Math.max(0,(px-L)/PW))*(t1-t0);onPick(Math.round(t/3600)*3600)})}
export const legend=(items:{label:string;color:string;dash?:boolean}[])=>`<ul class="lgd">${items.map(i=>`<li><svg width="18" height="8" viewBox="0 0 18 8" aria-hidden="true"><path d="M1 4h16" stroke="${i.color}" stroke-width="2" stroke-linecap="round"${i.dash?' stroke-dasharray="3 2"':''}/></svg>${i.label}</li>`).join('')}</ul>`;
