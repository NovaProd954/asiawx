import type {CmpData} from '../data/compare';
export interface Sp{min:number|null;max:number|null;mean:number|null;sd:number|null;n:number}
export function spreadOf(d:CmpData,v:string):Sp[]{
const ok=d.models.filter(m=>m.ok);
return d.times.map((_,i)=>{
const a:number[]=[];
for(const m of ok){const x=m.vars[v]?.[i];if(x!=null&&Number.isFinite(x))a.push(x)}
if(a.length<2)return{min:null,max:null,mean:null,sd:null,n:a.length};
const mean=a.reduce((s,x)=>s+x,0)/a.length,sd=Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length-1));
return{min:Math.min(...a),max:Math.max(...a),mean,sd,n:a.length}})}
export interface LeadRow{day:number;t:number;range:number|null;n:number}
export function dailyRange(times:number[],sp:Sp[]):LeadRow[]{
const m=new Map<number,number[]>();
times.forEach((t,i)=>{const d=t-((t%86400)+86400)%86400;let a=m.get(d);if(!a){a=[];m.set(d,a)}a.push(i)});
return [...m].sort((a,b)=>a[0]-b[0]).map(([d,ix],k)=>{
const r=ix.map(i=>sp[i]).filter(s=>s.max!=null&&s.min!=null).map(s=>(s.max as number)-(s.min as number));
return{day:k,t:d,range:r.length?r.reduce((s,x)=>s+x,0)/r.length:null,n:Math.max(0,...ix.map(i=>sp[i].n))}})}
export function valueAtModel(d:CmpData,id:string,v:string,t:number):number|null{
const m=d.models.find(x=>x.id===id);if(!m||!m.ok)return null;
const i=d.times.indexOf(t);if(i<0)return null;
const x=m.vars[v]?.[i];return x==null?null:x}
export function pickAt(times:number[],t:number):number{
let k=0,b=Infinity;for(let i=0;i<times.length;i++){const e=Math.abs(times[i]-t);if(e<b){b=e;k=i}}return k}
