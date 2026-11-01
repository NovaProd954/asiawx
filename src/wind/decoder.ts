import type {SatController} from '../sat/controller';
import {Pool} from '../sat/pool';
import {fusedBT} from './bt';
import {track,vectors,analyse,type Analysis,type Trk,type Win} from './amv';
import {loadLevels} from '../data/levels';
export interface WdResult{t:number;t0:number;dt:number;model:string;lvModel:string;note:string;a:Analysis;ms:{total:number;frames:number;track:number;analyse:number};workers:number}
export const WD_Z=4,WD_MIN_DT=1500;
export function pickTimes(times:number[],want:number|null):{t1:number;t0:number}|null{
const s=[...times].sort((a,b)=>a-b);
if(s.length<2)return null;
const t1=want!=null&&s.includes(want)?want:s[s.length-1],c=s.filter(x=>x<=t1-WD_MIN_DT);
if(!c.length)return null;
return{t1,t0:c[c.length-1]}}
export class WindDecoder{
private cache=new Map<string,WdResult>();private pool:Pool|null=null;private tok=0;
last:WdResult|null=null;busy=false;err='';phase='';
private getPool(){if(!this.pool){const hc=typeof navigator!=='undefined'?navigator.hardwareConcurrency||4:4;this.pool=new Pool(Math.max(1,Math.min(4,hc-1)))}return this.pool}
dispose(){this.pool?.close();this.pool=null;this.tok++}
cached(model:string,t:number){return this.cache.get(`${model}|${t}`)??null}
async run(sc:SatController,model:string,want:number|null,hook:()=>void=()=>{}):Promise<WdResult|null>{
const my=++this.tok,stale=()=>my!==this.tok;
this.busy=true;this.err='';this.phase='Preparing satellite inputs';hook();
try{
const prep=await sc.windPrep();
if(stale())return null;
if(!prep.ok)throw new Error(prep.why);
const tt=pickTimes(prep.times,want);
if(!tt)throw new Error('Fewer than two usable fused frames 25 minutes or more apart');
const hit=this.cached(model,tt.t1);
if(hit){this.last=hit;return hit}
const t0=performance.now(),pool=this.getPool(),n=Math.max(1,pool.size);
this.phase='Loading tiles and model levels';hook();
const frame=async(t:number):Promise<{bt:Float32Array;w:number;h:number;win:Win;ppd:number}> =>{
const inp=sc.windInput(t,WD_Z);if(!inp)throw new Error('Inputs not ready');
let r:{bt:Float32Array}|null=null;
if(pool.size&&typeof OffscreenCanvas!=='undefined'){try{r=await pool.call<{bt:Float32Array}>('wbt',inp.job,[],inp.tiles)}catch{r=null}}
if(!r){const m=await inp.main();r=fusedBT({...inp.job,cur:m.cur,cur2:m.cur2})}
return{bt:r.bt,w:inp.w,h:inp.h,win:inp.win,ppd:inp.ppd}};
let lvModel=model;
const lv=loadLevels(model,tt.t1).catch(e=>{if(model==='gfs_seamless')throw e;lvModel='gfs_seamless';return loadLevels('gfs_seamless',tt.t1)}).catch(e=>{throw new Error(`Model pressure-level data unavailable (${e instanceof Error?e.message:'error'})`)});
const [L,f1,f0]=await Promise.all([lv,frame(tt.t1),frame(tt.t0)]);
if(stale())return null;
const t1=performance.now();
this.phase='Tracking cloud motion';hook();
const o={ppd:f1.ppd};
let trk:Trk[];
if(pool.size){const parts=await Promise.all(Array.from({length:n},(_,k)=>pool.call<Trk[]>('amv',{b0:f0.bt,b1:f1.bt,w:f1.w,h:f1.h,o:{...o,part:[k,n]}})));trk=parts.flat()}
else trk=track(f0.bt,f1.bt,f1.w,f1.h,o);
if(stale())return null;
const t2=performance.now();
this.phase='Blending with model winds';hook();
const dt=tt.t1-tt.t0;
let a:Analysis;
if(pool.size){try{a=await pool.call<Analysis>('wan',{trk,win:f1.win,dt,L})}catch{a=analyse(vectors(trk,f1.win,dt,L),L)}}
else a=analyse(vectors(trk,f1.win,dt,L),L);
if(stale())return null;
const t3=performance.now(),res:WdResult={t:tt.t1,t0:tt.t0,dt,model,lvModel,note:prep.why,a,ms:{total:t3-t0,frames:t1-t0,track:t2-t1,analyse:t3-t2},workers:pool.size};
this.cache.set(`${model}|${tt.t1}`,res);
while(this.cache.size>6)this.cache.delete(this.cache.keys().next().value as string);
this.last=res;return res
}catch(e){
if(!stale())this.err=e instanceof Error?e.message:'Wind decoding failed';
return null
}finally{if(!stale()){this.busy=false;this.phase='';hook()}}}}
