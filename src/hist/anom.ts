import type {ClimD,RecentResp} from '../data/hist';
import {doy} from '../../api/_stats';
export interface Day{t:number;v:number|null;mean:number|null;p10:number|null;p90:number|null;anom:number|null}
export function dailySeries(r:RecentResp,c:ClimD,key:'tmean'|'tmax'|'tmin'|'wmax'|'prcp'):Day[]{
return r.times.map((t,i)=>{
const d=doy(t),v=r[key][i]??null;
if(key==='prcp'){const m=c.prcp.mean[d]??null;return{t,v,mean:m,p10:null,p90:null,anom:v!=null&&m!=null?v-m:null}}
const s=c[key],m=s.mean[d]??null;
return{t,v,mean:m,p10:s.p10[d]??null,p90:s.p90[d]??null,anom:v!=null&&m!=null?v-m:null}})}
export interface Win{days:number;n:number;tAnom:number|null;tMean:number|null;rain:number|null;rainNormal:number|null;rainPct:number|null;wetDays:number|null;wetNormal:number|null}
export function windowSummary(r:RecentResp,c:ClimD,days:number):Win{
const n0=r.times.length,from=Math.max(0,n0-days);
let ta=0,tn=0,tm=0,rs=0,rn=0,rc=0,wet=0,wetN=0;
for(let i=from;i<n0;i++){
const d=doy(r.times[i]),t=r.tmean[i],cm=c.tmean.mean[d];
if(t!=null&&cm!=null){ta+=t-cm;tm+=t;tn++}
const p=r.prcp[i],pm=c.prcp.mean[d],pw=c.prcp.wet[d];
if(p!=null&&pm!=null){rs+=p;rn+=pm;rc++;if(p>=1)wet++;if(pw!=null)wetN+=pw}}
const ok=tn>=Math.ceil(days*0.8),okr=rc>=Math.ceil(days*0.8);
return{days,n:n0-from,tAnom:ok?ta/tn:null,tMean:ok?tm/tn:null,rain:okr?rs:null,rainNormal:okr?rn:null,rainPct:okr&&rn>0.5?rs/rn*100:null,wetDays:okr?wet:null,wetNormal:okr?wetN:null}}
export type Band3='below'|'within'|'above'|'none';
export function placeInBand(d:Day):Band3{
if(d.v==null||d.p10==null||d.p90==null)return'none';
return d.v<d.p10?'below':d.v>d.p90?'above':'within'}
export function lastValid(s:Day[]):Day|null{for(let i=s.length-1;i>=0;i--)if(s[i].v!=null)return s[i];return null}
