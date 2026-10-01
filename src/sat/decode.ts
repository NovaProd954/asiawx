import {buildLut} from './colormap';
export type View='raw'|'enh'|'cold'|'conv'|'ot'|'cool';
export interface DecodeIn{w:number;h:number;cur:Uint8ClampedArray;prev:Uint8ClampedArray|null;view:View;thr:number;native:boolean;rgb:Uint8Array;btv:Float32Array}
export interface Stats{valid:number;unmatched:number;min:number|null;flag:number}
export interface DecodeOut{out:Uint8ClampedArray;bt:Float32Array;stats:Stats}
export const COOL_K=6;
export const CONV_T=-52,OT_T=-62,OT_DELTA=6,TEX_SD=2.5;
const ENH:number[][]=[[40,25,25,25],[0,190,190,190],[-20,120,170,220],[-30,60,120,210],[-40,40,180,120],[-50,240,220,40],[-60,240,130,30],[-70,220,40,40],[-80,200,60,200],[-90,255,255,255]];
export const BANDS:number[][]=[[70,160,230],[60,200,150],[240,220,50],[240,130,30],[220,50,50],[200,60,200]];
export function enhColor(t:number):number[]{
if(t>=ENH[0][0])return ENH[0].slice(1);
for(let i=1;i<ENH.length;i++){if(t>=ENH[i][0]){const a=ENH[i-1],b=ENH[i],f=(a[0]-t)/(a[0]-b[0]);return[0,1,2].map(k=>Math.round(a[k+1]+(b[k+1]-a[k+1])*f))}}
return ENH[ENH.length-1].slice(1)}
export function decodeBT(px:Uint8ClampedArray,lut:(r:number,g:number,b:number)=>number,o:{unmatched:number}):Float32Array{
const n=px.length>>2,bt=new Float32Array(n);
for(let i=0;i<n;i++){
const p=i<<2;
if(px[p+3]<128){bt[i]=NaN;continue}
const v=lut(px[p],px[p+1],px[p+2]);
if(v!==v)o.unmatched++;
bt[i]=v}
return bt}
interface Integral{s:Float64Array;q:Float64Array;c:Int32Array;w:number}
function integral(bt:Float32Array,w:number,h:number):Integral{
const W=w+1,s=new Float64Array(W*(h+1)),q=new Float64Array(W*(h+1)),c=new Int32Array(W*(h+1));
for(let y=0;y<h;y++){
let rs=0,rq=0,rc=0;
for(let x=0;x<w;x++){
const v=bt[y*w+x];
if(v===v){rs+=v;rq+=v*v;rc++}
const i=(y+1)*W+x+1,u=y*W+x+1;
s[i]=s[u]+rs;q[i]=q[u]+rq;c[i]=c[u]+rc}}
return{s,q,c,w:W}}
function win(I:Integral,x:number,y:number,r:number,h:number,w:number){
const x0=Math.max(0,x-r),y0=Math.max(0,y-r),x1=Math.min(w,x+r+1),y1=Math.min(h,y+r+1),W=I.w;
const a=y0*W+x0,b=y0*W+x1,c=y1*W+x0,d=y1*W+x1;
return{s:I.s[d]-I.s[b]-I.s[c]+I.s[a],q:I.q[d]-I.q[b]-I.q[c]+I.q[a],n:I.c[d]-I.c[b]-I.c[c]+I.c[a],full:(x1-x0)*(y1-y0)}}
export function render(bt:Float32Array,prev:Float32Array|null,w:number,h:number,view:View,thr:number,native:boolean):{out:Uint8ClampedArray;flag:number}{
const out=new Uint8ClampedArray(w*h*4);let flag=0;
const put=(i:number,c:number[],a:number)=>{const p=i<<2;out[p]=c[0];out[p+1]=c[1];out[p+2]=c[2];out[p+3]=a};
if(view==='enh'){
for(let i=0;i<bt.length;i++){const v=bt[i];if(v===v){put(i,enhColor(v),255);if(v<=thr)flag++}}
return{out,flag}}
if(view==='cold'){
for(let i=0;i<bt.length;i++){const v=bt[i];if(v===v&&v<=thr){put(i,BANDS[Math.min(BANDS.length-1,Math.floor((thr-v)/10))],210);flag++}}
return{out,flag}}
if(view==='conv'){
const I=integral(bt,w,h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x,v=bt[i];
if(!(v<=CONV_T))continue;
const a=win(I,x,y,3,h,w);
if(a.n<a.full*0.8)continue;
const m=a.s/a.n,sd=Math.sqrt(Math.max(0,a.q/a.n-m*m));
if(sd>=TEX_SD){put(i,[255,140,0],215);flag++}}
return{out,flag}}
if(view==='ot'){
if(!native)return{out,flag};
const I=integral(bt,w,h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x,v=bt[i];
if(!(v<=OT_T))continue;
const o=win(I,x,y,6,h,w),n=win(I,x,y,2,h,w),cnt=o.n-n.n;
if(o.full-n.full<1||cnt<(o.full-n.full)*0.8)continue;
const ring=(o.s-n.s)/cnt;
if(v<=ring-OT_DELTA){put(i,[255,0,200],245);flag++}}
return{out,flag}}
if(view==='cool'){
if(!prev)return{out,flag};
for(let i=0;i<bt.length;i++){
const v=bt[i],p=prev[i];
if(!(v===v&&p===p&&v<=0))continue;
const d=v-p;
if(d<=-COOL_K){const t=Math.min(1,(-d-COOL_K)/14);put(i,[255,Math.round(230-200*t),Math.round(40-40*t)],215);flag++}}
return{out,flag}}
return{out,flag}}
export function run(i:DecodeIn):DecodeOut{
const lut=buildLut({rgb:i.rgb,bt:i.btv,n:i.btv.length,total:i.btv.length,usable:true}),o={unmatched:0};
const bt=decodeBT(i.cur,lut,o);
const prev=i.prev?decodeBT(i.prev,lut,{unmatched:0}):null;
let valid=0,min=Infinity;
for(let k=0;k<bt.length;k++){const v=bt[k];if(v===v){valid++;if(v<min)min=v}}
const r=render(bt,prev,i.w,i.h,i.view,i.thr,i.native);
return{out:r.out,bt,stats:{valid,unmatched:o.unmatched,min:valid?min:null,flag:r.flag}}}
