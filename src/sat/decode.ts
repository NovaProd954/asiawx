import {buildLut} from './colormap';
import {fitCurve,lumOf,type Fit} from './calib';
import {LIMB,diskVis} from './geo';
export type View='raw'|'enh'|'cold'|'conv'|'ot'|'cool'|'cloud';
export type Src='cmap'|'lum'|'vis';
export interface Mask{row:Float32Array;col:Float32Array}
export interface DecodeIn{w:number;h:number;cur:Uint8ClampedArray;prev:Uint8ClampedArray|null;view:View;thr:number;native:boolean;rgb:Uint8Array;btv:Float32Array;lum?:Float32Array|null;src?:Src;mask?:Mask|null;smooth?:number;scale?:number;ppd?:number}
export interface Stats{valid:number;unmatched:number;min:number|null;flag:number}
export interface DecodeOut{out:Uint8ClampedArray;ow:number;oh:number;bt:Float32Array;stats:Stats}
export interface CalibIn{w:number;h:number;src:Uint8ClampedArray;ref:Uint8ClampedArray;rgb:Uint8Array;btv:Float32Array;mask:Mask}
export interface RenderOpt{smooth?:number;scale?:number;ppd?:number;src?:Src;mask?:Mask|null}
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
export function decodeVis(px:Uint8ClampedArray):Float32Array{
const n=px.length>>2,o=new Float32Array(n);
for(let i=0;i<n;i++){
const p=i<<2;
if(px[p+3]<128){o[i]=NaN;continue}
const r=px[p],g=px[p+1],b=px[p+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx>0?(mx-mn)/mx:0;
o[i]=(0.299*r+0.587*g+0.114*b)*(1-0.7*sat)}
return o}
const KER:number[][]=[[1],[1,2,1],[1,4,6,4,1]];
export function smooth(bt:Float32Array,w:number,h:number,level:number):Float32Array{
if(level<=0)return bt;
const k=KER[Math.min(2,level)],r=k.length>>1,n=bt.length,a=new Float32Array(n),aw=new Float32Array(n);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
let s=0,ws=0;
for(let d=-r;d<=r;d++){const xx=x+d;if(xx<0||xx>=w)continue;const v=bt[y*w+xx];if(v===v){const kw=k[d+r];s+=v*kw;ws+=kw}}
a[y*w+x]=s;aw[y*w+x]=ws}
const o=new Float32Array(n);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x;
if(bt[i]!==bt[i]){o[i]=NaN;continue}
let s=0,ws=0;
for(let d=-r;d<=r;d++){const yy=y+d;if(yy<0||yy>=h)continue;const j=yy*w+x,kw=k[d+r];s+=a[j]*kw;ws+=aw[j]*kw}
o[i]=ws>0?s/ws:bt[i]}
return o}
export function up2(s:Float32Array,w:number,h:number):Float32Array{
const W=w*2,H=h*2,o=new Float32Array(W*H);
for(let Y=0;Y<H;Y++){
const sy=(Y+0.5)/2-0.5,y0=Math.floor(sy),fy=sy-y0,ya=Math.max(0,y0),yb=Math.min(h-1,y0+1);
for(let X=0;X<W;X++){
const sx=(X+0.5)/2-0.5,x0=Math.floor(sx),fx=sx-x0,xa=Math.max(0,x0),xb=Math.min(w-1,x0+1);
const near=s[(fy<0.5?ya:yb)*w+(fx<0.5?xa:xb)];
if(near!==near){o[Y*W+X]=NaN;continue}
const v00=s[ya*w+xa],v10=s[ya*w+xb],v01=s[yb*w+xa],v11=s[yb*w+xb];
let sum=0,ws=0;
if(v00===v00){const k=(1-fx)*(1-fy);sum+=v00*k;ws+=k}
if(v10===v10){const k=fx*(1-fy);sum+=v10*k;ws+=k}
if(v01===v01){const k=(1-fx)*fy;sum+=v01*k;ws+=k}
if(v11===v11){const k=fx*fy;sum+=v11*k;ws+=k}
o[Y*W+X]=ws>0?sum/ws:near}}
return o}
export function clearRef(s:Float32Array,w:number,h:number,ppd:number,q:number,warm:boolean,lo:number,hi:number):(x:number,y:number)=>number{
const B=Math.max(24,Math.min(160,Math.round(8*ppd))),gw=Math.max(1,Math.ceil(w/B)),gh=Math.max(1,Math.ceil(h/B)),HB=hi-lo+1;
const hist=new Uint16Array(gw*gh*HB),cnt=new Int32Array(gw*gh);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const v=s[y*w+x];if(v!==v)continue;
const g=Math.floor(y/B)*gw+Math.floor(x/B),b=Math.max(0,Math.min(HB-1,Math.round(v)-lo));
hist[g*HB+b]++;cnt[g]++}
const grid=new Float32Array(gw*gh).fill(NaN),vals:number[]=[];
for(let g=0;g<gw*gh;g++){
const gx=g%gw,gy=Math.floor(g/gw),area=Math.min(B,w-gx*B)*Math.min(B,h-gy*B);
if(cnt[g]<area*0.25)continue;
const need=cnt[g]*(warm?1-q:q);let acc=0;
if(warm){for(let b=HB-1;b>=0;b--){acc+=hist[g*HB+b];if(acc>=need){grid[g]=b+lo;break}}}
else{for(let b=0;b<HB;b++){acc+=hist[g*HB+b];if(acc>=need){grid[g]=b+lo;break}}}
if(grid[g]===grid[g])vals.push(grid[g])}
if(!vals.length)return()=>NaN;
vals.sort((a,b)=>a-b);
const med=vals[vals.length>>1];
for(let g=0;g<gw*gh;g++)if(grid[g]!==grid[g])grid[g]=med;
return(x,y)=>{
const fx=Math.max(0,Math.min(gw-1,(x+0.5)/B-0.5)),fy=Math.max(0,Math.min(gh-1,(y+0.5)/B-0.5));
const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(gw-1,x0+1),y1=Math.min(gh-1,y0+1),tx=fx-x0,ty=fy-y0;
return(grid[y0*gw+x0]*(1-tx)+grid[y0*gw+x1]*tx)*(1-ty)+(grid[y1*gw+x0]*(1-tx)+grid[y1*gw+x1]*tx)*ty}}
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
export function render(bt:Float32Array,prev:Float32Array|null,w:number,h:number,view:View,thr:number,native:boolean,o:RenderOpt={}):{out:Uint8ClampedArray;flag:number;ow:number;oh:number}{
let flag=0;
const lv=o.smooth??0,mk=o.mask??null,vf=mk?(x:number,y:number)=>diskVis(mk.row[y]*mk.col[x]):null;
const grid=view==='enh'||view==='cold'||view==='cool'||view==='cloud',sc=grid&&o.scale===2?2:1,ow=w*sc,oh=h*sc;
const out=new Uint8ClampedArray(ow*oh*4);
const put=(i:number,c:number[],a:number)=>{const p=i<<2;out[p]=c[0];out[p+1]=c[1];out[p+2]=c[2];out[p+3]=a};
const fa=(X:number,Y:number)=>vf?vf(Math.floor(X/sc),Math.floor(Y/sc)):1;
const fld=(a:Float32Array)=>{const s=smooth(a,w,h,lv);return sc===2?up2(s,w,h):s};
if(view==='enh'){
const f=fld(bt);
for(let Y=0;Y<oh;Y++)for(let X=0;X<ow;X++){const i=Y*ow+X,v=f[i];if(v!==v)continue;const a=fa(X,Y);if(a<=0)continue;put(i,enhColor(v),Math.round(255*a))}
for(let i=0;i<bt.length;i++){const v=bt[i];if(v===v&&v<=thr)flag++}
return{out,flag,ow,oh}}
if(view==='cold'){
const f=fld(bt);
for(let Y=0;Y<oh;Y++)for(let X=0;X<ow;X++){
const i=Y*ow+X,v=f[i];if(v!==v)continue;
const sf=lv>0?Math.max(0,Math.min(1,(thr+1-v)/2)):(v<=thr?1:0);
if(sf<=0)continue;
const a=fa(X,Y);if(a<=0)continue;
put(i,BANDS[Math.min(BANDS.length-1,Math.floor(Math.max(0,thr-v)/10))],Math.round(210*sf*a))}
for(let i=0;i<bt.length;i++){const v=bt[i];if(v===v&&v<=thr)flag++}
return{out,flag,ow,oh}}
if(view==='conv'){
const I=integral(bt,w,h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x,v=bt[i];
if(!(v<=CONV_T))continue;
const a=win(I,x,y,3,h,w);
if(a.n<a.full*0.8)continue;
const m=a.s/a.n,sd=Math.sqrt(Math.max(0,a.q/a.n-m*m));
if(sd>=TEX_SD){const k=vf?vf(x,y):1;if(k>0){put(i,[255,140,0],Math.round(215*k));flag++}}}
return{out,flag,ow,oh}}
if(view==='ot'){
if(!native)return{out,flag,ow,oh};
const I=integral(bt,w,h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x,v=bt[i];
if(!(v<=OT_T))continue;
const q=win(I,x,y,6,h,w),n=win(I,x,y,2,h,w),cnt=q.n-n.n;
if(q.full-n.full<1||cnt<(q.full-n.full)*0.8)continue;
const ring=(q.s-n.s)/cnt;
if(v<=ring-OT_DELTA){const k=vf?vf(x,y):1;if(k>0){put(i,[255,0,200],Math.round(245*k));flag++}}}
return{out,flag,ow,oh}}
if(view==='cool'){
if(!prev)return{out,flag,ow,oh};
const d=new Float32Array(bt.length);
for(let i=0;i<bt.length;i++){const v=bt[i],p=prev[i];d[i]=v===v&&p===p?v-p:NaN;if(d[i]<=-COOL_K&&v<=0)flag++}
const fv=fld(bt),fd=fld(d);
for(let Y=0;Y<oh;Y++)for(let X=0;X<ow;X++){
const i=Y*ow+X,v=fv[i],dd=fd[i];
if(!(v===v&&dd===dd&&v<=0)||dd>-COOL_K)continue;
const a=fa(X,Y);if(a<=0)continue;
const t=Math.min(1,(-dd-COOL_K)/14);
put(i,[255,Math.round(230-200*t),Math.round(40-40*t)],Math.round(215*a))}
return{out,flag,ow,oh}}
if(view==='cloud'){
const vis=o.src==='vis',s=smooth(bt,w,h,Math.max(lv,1)),ppd=o.ppd??11.4;
const ref=vis?clearRef(s,w,h,ppd,0.2,false,0,255):clearRef(s,w,h,ppd,0.9,true,-100,60);
const f=sc===2?up2(s,w,h):s;
for(let Y=0;Y<oh;Y++)for(let X=0;X<ow;X++){
const i=Y*ow+X,v=f[i];if(v!==v)continue;
const r=ref((X+0.5)/sc-0.5,(Y+0.5)/sc-0.5);if(r!==r)continue;
const d=vis?v-r:r-v,span=vis?Math.max(40,(255-r)*0.6):23,t=Math.max(0,Math.min(1,(d-(vis?12:3))/span)),e=t*t*(3-2*t);
if(e<=0.01)continue;
const a=fa(X,Y)*e;if(a<=0.01)continue;
if(sc===1||(X%2===0&&Y%2===0)){if(d>=(vis?25:8))flag++}
const g=vis?Math.round(205+50*Math.min(1,v/255)):Math.round(170+80*Math.max(0,Math.min(1,(d-8)/55)));
put(i,[g,Math.min(255,g+3),Math.min(255,g+8)],Math.round(245*a))}
return{out,flag,ow,oh}}
return{out,flag,ow,oh}}
function applyMask(bt:Float32Array,w:number,h:number,m:Mask){
for(let y=0;y<h;y++){const ry=m.row[y];for(let x=0;x<w;x++)if(ry*m.col[x]<=LIMB)bt[y*w+x]=NaN}}
export function run(i:DecodeIn):DecodeOut{
const o={unmatched:0},src=i.src??(i.lum?'lum':'cmap');
let lut:(r:number,g:number,b:number)=>number;
if(src==='lum'&&i.lum){const L=i.lum;lut=(r,g,b)=>L[lumOf(r,g,b)]}
else lut=buildLut({rgb:i.rgb,bt:i.btv,n:i.btv.length,total:i.btv.length,usable:true});
const bt=src==='vis'?decodeVis(i.cur):decodeBT(i.cur,lut,o);
const prev=i.prev&&src!=='vis'?decodeBT(i.prev,lut,{unmatched:0}):null;
if(i.mask){applyMask(bt,i.w,i.h,i.mask);if(prev)applyMask(prev,i.w,i.h,i.mask)}
let valid=0,min=Infinity;
for(let k=0;k<bt.length;k++){const v=bt[k];if(v===v){valid++;if(v<min)min=v}}
const r=render(bt,prev,i.w,i.h,i.view,i.thr,i.native,{smooth:i.smooth,scale:i.scale,ppd:i.ppd,src,mask:i.mask});
return{out:r.out,ow:r.ow,oh:r.oh,bt,stats:{valid,unmatched:o.unmatched,min:valid&&src!=='vis'?min:null,flag:r.flag}}}
export function calibrate(j:CalibIn):Fit{
const lut=buildLut({rgb:j.rgb,bt:j.btv,n:j.btv.length,total:j.btv.length,usable:true}),bt=decodeBT(j.ref,lut,{unmatched:0});
applyMask(bt,j.w,j.h,j.mask);
return fitCurve(j.src,bt)}
