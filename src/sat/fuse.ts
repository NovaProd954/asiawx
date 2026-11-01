import {btLut} from './pal';
import {lumOf} from './calib';
import {diskVis} from './geo';
import {run,decodeBT,smooth,clearRef,applyMask,type DecodeIn,type DecodeOut} from './decode';
export function fuseBT(a:Float32Array,b:Float32Array):Float32Array{
const n=a.length,o=new Float32Array(n);
for(let i=0;i<n;i++){const p=a[i],q=b[i];o[i]=p===p?(q===q?(p+q)/2:p):q}
return o}
export const FUSE_TOP=0.5;
export function cloudAlpha(bt:Float32Array,w:number,h:number,ppd:number,lv:number):Float32Array{
const n=w*h,a=new Float32Array(n);
let any=false;
for(let i=0;i<n;i++)if(bt[i]===bt[i]){any=true;break}
if(!any)return a;
const s=smooth(bt,w,h,Math.max(lv,1)),ref=clearRef(s,w,h,ppd,0.9,true,-100,60);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x,v=s[i];if(v!==v)continue;
const r=ref(x,y);if(r!==r)continue;
const t=Math.max(0,Math.min(1,(r-v-3)/23)),e=t*t*(3-2*t);
if(e>0.01)a[i]=e}
return a}
export function composite(cb:Uint8ClampedArray,ab:Float32Array,ct:Uint8ClampedArray|null,at:Float32Array|null,top:number,vis:((i:number)=>number)|null,n:number):{out:Uint8ClampedArray;flag:number}{
const out=new Uint8ClampedArray(n*4);
let flag=0;
for(let i=0;i<n;i++){
const k=vis?vis(i):1;if(k<=0)continue;
const aB=ab[i]*k,aT=at?at[i]*k*top:0,a=aT+aB*(1-aT);
if(a<0.004)continue;
const p=i<<2,wb=aB*(1-aT);
if(at&&aT>0){out[p]=(ct![p]*aT+cb[p]*wb)/a;out[p+1]=(ct![p+1]*aT+cb[p+1]*wb)/a;out[p+2]=(ct![p+2]*aT+cb[p+2]*wb)/a}
else{out[p]=cb[p];out[p+1]=cb[p+1];out[p+2]=cb[p+2]}
out[p+3]=Math.round(a*255);
if(a>0.5)flag++}
return{out,flag}}
export function runFuse(i:DecodeIn):DecodeOut{
const {w,h}=i,n=w*h,o={unmatched:0},lv=i.smooth??1,ppd=i.ppd??11.4,top=Math.max(0,Math.min(1,i.fuse?.top??FUSE_TOP));
const bg=i.rgb.length?decodeBT(i.cur,btLut(i.rgb,i.btv),o):new Float32Array(n).fill(NaN);
const L=i.lum,j=i.cur2??null,bj=j&&L?decodeBT(j,(r,g,b)=>L[lumOf(r,g,b)],{unmatched:0}):new Float32Array(n).fill(NaN);
const bt=fuseBT(bg,bj);
if(i.mask)applyMask(bt,w,h,i.mask);
const m=i.mask,vis=m?(k:number)=>diskVis(m.row[(k/w)|0]*m.col[k%w]):null,a=cloudAlpha(bt,w,h,ppd,lv),ag=new Float32Array(n),aj=j&&L?new Float32Array(n):null;
let valid=0,min=Infinity;
for(let k=0;k<n;k++){const v=bt[k];if(v!==v)continue;valid++;if(v<min)min=v;if(bg[k]===bg[k])ag[k]=a[k];if(aj&&bj[k]===bj[k])aj[k]=a[k]}
const {out,flag}=composite(i.cur,ag,j,aj,top,vis,n);
return{out,ow:w,oh:h,bt,stats:{valid,unmatched:o.unmatched,min:valid?min:null,flag}}}
export const runAny=(i:DecodeIn):DecodeOut=>i.fuse?runFuse(i):run(i);
