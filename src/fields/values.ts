import type {FieldSet} from '../data/fields';
import type {FDef} from './defs';
import {mix} from './sample';
export function bracket(times:number[],t:number):{i:number;j:number;w:number}{
const n=times.length;
if(n===1||t<=times[0])return{i:0,j:0,w:0};
if(t>=times[n-1])return{i:n-1,j:n-1,w:0};
let j=1;while(times[j]<t)j++;
return{i:j-1,j,w:(t-times[j-1])/(times[j]-times[j-1])}}
export function nearestFrame(times:number[],t:number):number{
let k=0,b=Infinity;
for(let i=0;i<times.length;i++){const e=Math.abs(times[i]-t);if(e<b){b=e;k=i}}
return k}
export interface Vals{vals:Float32Array;frame:number;hours:number|null}
export function fieldValues(s:FieldSet,d:FDef,t:number):Vals|null{
const fr=s.vars[d.src];
if(!fr)return null;
if(d.interp==='near'){const k=nearestFrame(s.times,t);return{vals:fr[k],frame:k,hours:null}}
if(d.interp==='sum24'){
const n=fr[0].length,o=new Float32Array(n);let c=0;
s.times.forEach((ft,k)=>{if(ft>t&&ft<=t+86400){c++;for(let i=0;i<n;i++)o[i]+=fr[k][i]}});
if(!c)return null;
return{vals:o,frame:nearestFrame(s.times,t),hours:c*3}}
const b=bracket(s.times,t);
return{vals:b.w===0?fr[b.i]:mix(fr[b.i],fr[b.j],b.w),frame:b.w<0.5?b.i:b.j,hours:null}}
