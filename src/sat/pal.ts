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
else if(q>=0){const i=ord[k];I[k]=Math.min(intensityOf(rgb[i*3],rgb[i*3+1],rgb[i*3+2]),I[q])}
else{const f=B[p]>bn?(B[p]-B[k])/(B[p]-bn):1;I[k]=I[p]+(1-I[p])*f}}
let m=0;
for(let k=0;k<n;k++){m=Math.max(m,Math.min(1,Math.max(0,I[k])));out[ord[k]]=m}
return out}
export function fastLut(rgb:Uint8Array,bt:Float32Array,val:Float32Array,maxD=30):(r:number,g:number,b:number)=>number{
const n=val.length,ord=Array.from({length:n},(_,i)=>i).sort((a,b)=>bt[b]-bt[a]||a-b);
let S=64;while(S<n*4)S<<=1;
const m=S-1,keys=new Int32Array(S).fill(-1),vals=new Float32Array(S);
for(let i=0;i<n;i++){
const k=(rgb[i*3]<<16)|(rgb[i*3+1]<<8)|rgb[i*3+2];
let s=(Math.imul(k,0x9E3779B1)>>>16)&m;
while(keys[s]!==-1&&keys[s]!==k)s=(s+1)&m;
if(keys[s]===-1){keys[s]=k;vals[s]=val[i]}}
const PR=new Float64Array(n),PG=new Float64Array(n),PB=new Float64Array(n),PV=new Float64Array(n);
ord.forEach((i,k)=>{PR[k]=rgb[i*3];PG[k]=rgb[i*3+1];PB[k]=rgb[i*3+2];PV[k]=val[i]});
const md2=maxD*maxD;
const proj=(r:number,g:number,b:number)=>{
let best=Infinity,v=NaN;
if(n===1){const dr=r-PR[0],dg=g-PG[0],db=b-PB[0];best=dr*dr+dg*dg+db*db;v=PV[0]}
for(let k=0;k<n-1;k++){
const ax=PR[k],ay=PG[k],az=PB[k],dx=PR[k+1]-ax,dy=PG[k+1]-ay,dz=PB[k+1]-az,l2=dx*dx+dy*dy+dz*dz;
let t=l2>0?((r-ax)*dx+(g-ay)*dy+(b-az)*dz)/l2:0;
t=t<0?0:t>1?1:t;
const ex=r-ax-t*dx,ey=g-ay-t*dy,ez=b-az-t*dz,d=ex*ex+ey*ey+ez*ez;
if(d<best){best=d;v=PV[k]+(PV[k+1]-PV[k])*t}}
return best>md2?NaN:v};
const tab=new Float32Array(1<<18),done=new Uint8Array(1<<18);
return(r,g,b)=>{
const k=(r<<16)|(g<<8)|b;
let s=(Math.imul(k,0x9E3779B1)>>>16)&m;
while(keys[s]!==-1){if(keys[s]===k)return vals[s];s=(s+1)&m}
const q=((r>>2)<<12)|((g>>2)<<6)|(b>>2);
if(done[q])return tab[q];
const v=proj(r,g,b);tab[q]=v;done[q]=1;return v}}
const hashOf=(rgb:Uint8Array,bt:Float32Array)=>{
let h=2166136261;
for(let i=0;i<rgb.length;i++)h=Math.imul(h^rgb[i],16777619);
for(let i=0;i<bt.length;i++)h=Math.imul(h^Math.round(bt[i]*100),16777619);
return`${rgb.length}|${bt.length}|${h>>>0}`};
type Lut=(r:number,g:number,b:number)=>number;
let IK='',IF:Lut|null=null,TK='',TF:Lut|null=null;
export function paletteLut(rgb:Uint8Array,bt:Float32Array):Lut{
const k=hashOf(rgb,bt);
if(k===IK&&IF)return IF;
IF=fastLut(rgb,bt,paletteIntensities(rgb,bt));IK=k;return IF}
export function btLut(rgb:Uint8Array,bt:Float32Array):Lut{
const k=hashOf(rgb,bt);
if(k===TK&&TF)return TF;
TF=fastLut(rgb,bt,bt);TK=k;return TF}
