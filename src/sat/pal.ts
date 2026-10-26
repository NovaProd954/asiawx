import {buildLut} from './colormap';
import {intensityOf} from './real';
const SAT=0.16;
export const isGrey=(r:number,g:number,b:number)=>{const mx=Math.max(r,g,b);return mx===0||(mx-Math.min(r,g,b))/mx<SAT};
export function paletteIntensities(rgb:Uint8Array,bt:Float32Array):Float32Array{
const n=bt.length,out=new Float32Array(n);
if(!n)return out;
const ord=Array.from({length:n},(_,i)=>i).sort((a,b)=>bt[b]-bt[a]||a-b),B=ord.map(i=>bt[i]),I=new Float64Array(n).fill(NaN),anc:number[]=[];
ord.forEach((i,k)=>{if(!isGrey(rgb[i*3],rgb[i*3+1],rgb[i*3+2])){I[k]=intensityOf(rgb[i*3],rgb[i*3+1],rgb[i*3+2]);anc.push(k)}});
const b0=B[0],bn=B[n-1];
if(!anc.length){for(let k=0;k<n;k++)I[k]=b0>bn?(b0-B[k])/(b0-bn):0}
else for(let k=0;k<n;k++){
if(I[k]===I[k])continue;
let p=-1,q=-1;
for(const a of anc){if(a<k)p=a;else if(a>k){q=a;break}}
if(p>=0&&q>=0){const f=B[p]>B[q]?(B[p]-B[k])/(B[p]-B[q]):0;I[k]=I[p]+(I[q]-I[p])*f}
else if(q>=0){const f=b0>B[q]?(b0-B[k])/(b0-B[q]):0;I[k]=I[q]*f}
else{const f=B[p]>bn?(B[p]-B[k])/(B[p]-bn):1;I[k]=I[p]+(1-I[p])*f}}
let m=0;
for(let k=0;k<n;k++){m=Math.max(m,Math.min(1,Math.max(0,I[k])));out[ord[k]]=m}
return out}
let LK='',LF:((r:number,g:number,b:number)=>number)|null=null;
export function paletteLut(rgb:Uint8Array,bt:Float32Array){
let h=2166136261;
for(let i=0;i<rgb.length;i++)h=Math.imul(h^rgb[i],16777619);
for(let i=0;i<bt.length;i++)h=Math.imul(h^Math.round(bt[i]*100),16777619);
const k=`${rgb.length}|${bt.length}|${h>>>0}`;
if(k===LK&&LF)return LF;
const it=paletteIntensities(rgb,bt);
LF=buildLut({rgb,bt:it,n:it.length,total:it.length,usable:true});LK=k;return LF}
