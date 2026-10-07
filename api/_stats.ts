export type N=number|null;
export const fin=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export function pct(s:number[],p:number):number{
if(!s.length)return NaN;
const k=(s.length-1)*p,i=Math.floor(k),f=k-i;
return i+1<s.length?s[i]*(1-f)+s[i+1]*f:s[i]}
export const r1=(x:number)=>Math.round(x*10)/10;
export const r2=(x:number)=>Math.round(x*100)/100;
export interface ModelIn{id:string;name:string;ok:boolean;err?:string;ms?:number;times?:number[];vars?:Record<string,N[]>}
export interface ModelOut{id:string;name:string;ok:boolean;err?:string;ms?:number;vars:Record<string,N[]>}
export function alignModels(list:ModelIn[],names:string[]):{times:number[];models:ModelOut[]}{
const ref=list.find(m=>m.ok&&m.times?.length);
if(!ref||!ref.times)return{times:[],models:list.map(m=>({id:m.id,name:m.name,ok:false,err:m.err??'no data',ms:m.ms,vars:{}}))};
const times=ref.times;
const models=list.map((m):ModelOut=>{
if(!m.ok||!m.times||!m.vars)return{id:m.id,name:m.name,ok:false,err:m.err??'no data',ms:m.ms,vars:{}};
const ix=new Map<number,number>();m.times.forEach((t,i)=>ix.set(t,i));
const vars:Record<string,N[]>={};let any=false;
for(const v of names){
const a=m.vars[v]??[];
const o=times.map(t=>{const i=ix.get(t);const x=i==null?null:a[i];return fin(x)?x:null});
if(o.some(x=>x!=null))any=true;
vars[v]=o}
return any?{id:m.id,name:m.name,ok:true,ms:m.ms,vars}:{id:m.id,name:m.name,ok:false,err:'model returned no values for this point',ms:m.ms,vars}});
return{times,models}}
export function memberSeries(h:any,v:string):N[][]{
const re=new RegExp(`^${v}(_member\\d+)?(_[a-z][a-z0-9_]*)?$`);
const out:N[][]=[];
if(!h||typeof h!=='object')return out;
for(const k of Object.keys(h))if(re.test(k)&&Array.isArray(h[k]))out.push(h[k].map((x:unknown)=>fin(x)?x:null));
return out}
export interface Band{p10:N[];p25:N[];p50:N[];p75:N[];p90:N[];min:N[];max:N[];mean:N[]}
export function bandOf(ms:N[][],len:number,minN=5):Band{
const b:Band={p10:[],p25:[],p50:[],p75:[],p90:[],min:[],max:[],mean:[]};
for(let t=0;t<len;t++){
const v:number[]=[];
for(const m of ms){const x=m[t];if(fin(x))v.push(x)}
if(v.length<minN){for(const k of Object.keys(b) as (keyof Band)[])b[k].push(null);continue}
v.sort((a,c)=>a-c);
b.p10.push(r1(pct(v,.1)));b.p25.push(r1(pct(v,.25)));b.p50.push(r1(pct(v,.5)));b.p75.push(r1(pct(v,.75)));b.p90.push(r1(pct(v,.9)));
b.min.push(r1(v[0]));b.max.push(r1(v[v.length-1]));b.mean.push(r1(v.reduce((s,x)=>s+x,0)/v.length))}
return b}
export interface Day{day:number;n:number;p10:number;p50:number;p90:number;ge1:number;ge10:number;ge25:number}
export function dailyRain(times:number[],ms:N[][],minN=5):Day[]{
const days=new Map<number,number[]>();
times.forEach((t,i)=>{const d=t-((t%86400)+86400)%86400;let a=days.get(d);if(!a){a=[];days.set(d,a)}a.push(i)});
const out:Day[]=[];
for(const [d,ix] of [...days].sort((a,b)=>a[0]-b[0])){
if(ix.length<24)continue;
const tot:number[]=[];
for(const m of ms){let s=0,ok=true;for(const i of ix){const x=m[i];if(!fin(x)){ok=false;break}s+=x}if(ok)tot.push(s)}
if(tot.length<minN)continue;
const s=[...tot].sort((a,b)=>a-b),f=(th:number)=>r2(tot.filter(x=>x>=th).length/tot.length);
out.push({day:d,n:tot.length,p10:r1(pct(s,.1)),p50:r1(pct(s,.5)),p90:r1(pct(s,.9)),ge1:f(1),ge10:f(10),ge25:f(25)})}
return out}
export interface EnsOut{members:number;times:number[];vars:Record<string,Band>;rain:Day[]}
export function summarizeEns(j:any,names:string[]):EnsOut|null{
const h=j?.hourly;
if(!h||!Array.isArray(h.time)||!h.time.length)return null;
const len=h.time.length,vars:Record<string,Band>={};let members=0,rain:Day[]=[];
for(const v of names){
const ms=memberSeries(h,v).filter(a=>a.length===len);
if(ms.length>members)members=ms.length;
if(ms.length<5)continue;
vars[v]=bandOf(ms,len);
if(v==='precipitation')rain=dailyRain(h.time,ms)}
if(!Object.keys(vars).length)return null;
return{members,times:h.time,vars,rain}}
const MD=[31,28,31,30,31,30,31,31,30,31,30,31];
const START=[0,31,59,90,120,151,181,212,243,273,304,334];
export function doy(t:number):number{
const d=new Date(t*1000),m=d.getUTCMonth(),dd=d.getUTCDate();
return START[m]+Math.min(dd,MD[m])-1}
export interface ClimStat{mean:N[];sd:N[];p10:N[];p90:N[]}
export interface Clim{tmean:ClimStat;tmax:ClimStat;tmin:ClimStat;wmax:ClimStat;prcp:{mean:N[];wet:N[]};years:number;window:number}
const mean=(a:number[])=>a.reduce((s,x)=>s+x,0)/a.length;
export function climatology(times:number[],d:{tmean:N[];tmax:N[];tmin:N[];wmax:N[];prcp:N[]},window=7,minN=40):Clim{
const keys=['tmean','tmax','tmin','wmax','prcp'] as const;
const bk:Record<string,number[][]>={};
for(const k of keys)bk[k]=Array.from({length:365},()=>[]);
times.forEach((t,i)=>{const dy=doy(t);for(const k of keys){const x=d[k][i];if(fin(x))bk[k][dy].push(x)}});
const stat=(k:typeof keys[number]):ClimStat=>{
const o:ClimStat={mean:[],sd:[],p10:[],p90:[]};
for(let dy=0;dy<365;dy++){
const v:number[]=[];
for(let w=-window;w<=window;w++)v.push(...bk[k][((dy+w)%365+365)%365]);
if(v.length<minN){o.mean.push(null);o.sd.push(null);o.p10.push(null);o.p90.push(null);continue}
const m=mean(v),sd=Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1));
v.sort((a,b)=>a-b);
o.mean.push(r2(m));o.sd.push(r2(sd));o.p10.push(r2(pct(v,.1)));o.p90.push(r2(pct(v,.9)))}
return o};
const pm:N[]=[],pw:N[]=[];
for(let dy=0;dy<365;dy++){
const v:number[]=[];
for(let w=-window;w<=window;w++)v.push(...bk.prcp[((dy+w)%365+365)%365]);
if(v.length<minN){pm.push(null);pw.push(null);continue}
pm.push(r2(mean(v)));pw.push(r2(v.filter(x=>x>=1).length/v.length))}
const yrs=new Set(times.map(t=>new Date(t*1000).getUTCFullYear())).size;
return{tmean:stat('tmean'),tmax:stat('tmax'),tmin:stat('tmin'),wmax:stat('wmax'),prcp:{mean:pm,wet:pw},years:yrs,window}}
