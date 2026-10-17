import {diskVis,LIMB} from './geo';
export interface RealP{thr:number;ct:number;storm:number;soft:number;noise:number;relief:number;light:number;pal:'real'|'mono'}
export const REAL_DEF:RealP={thr:0.08,ct:1.1,storm:0.7,soft:2,noise:0.35,relief:0.6,light:35,pal:'real'};
export const realKey=(p:RealP)=>`${p.thr}.${p.ct}.${p.storm}.${p.soft}.${p.noise}.${p.relief}.${p.light}.${p.pal}`;
interface Mk{row:Float32Array;col:Float32Array}
const STOPS:number[][]=[[0,4,8,14],[0.08,8,13,20],[0.16,22,29,38],[0.28,58,68,79],[0.4,112,120,129],[0.52,178,183,188],[0.64,224,227,229],[0.74,248,249,249],[0.84,214,205,196],[0.92,142,125,140],[1,58,42,58]];
const HUE:number[][]=[[230,0.05],[200,0.15],[180,0.25],[150,0.35],[120,0.45],[90,0.52],[60,0.62],[40,0.72],[20,0.82],[0,0.92]];
const FLOOR=0.5;
let LUT:Uint8Array|null=null;
function lut():Uint8Array{
if(LUT)return LUT;
const l=new Uint8Array(3072);
for(let i=0;i<1024;i++){
const t=i/1023;let k=1;
while(k<STOPS.length-1&&t>STOPS[k][0])k++;
const a=STOPS[k-1],b=STOPS[k],f=(t-a[0])/((b[0]-a[0])||1);
for(let c=0;c<3;c++)l[i*3+c]=Math.round(a[c+1]+(b[c+1]-a[c+1])*f)}
return LUT=l}
export function intensityOf(r:number,g:number,b:number):number{
const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,v=mx/255,sat=mx===0?0:d/mx;
if(sat<0.16)return v*0.12;
let hue:number;
if(mx===r)hue=60*(((g-b)/d)%6);else if(mx===g)hue=60*((b-r)/d+2);else hue=60*((r-g)/d+4);
if(hue<0)hue+=360;
let t:number;
if(hue>230)t=hue>=300?1:0.92+(hue-230)/70*0.08;
else{
t=HUE[HUE.length-1][1];
for(let i=0;i<HUE.length-1;i++){
if(hue<=HUE[i][0]&&hue>=HUE[i+1][0]){const span=HUE[i][0]-HUE[i+1][0]||1;t=HUE[i][1]+(HUE[i][0]-hue)/span*(HUE[i+1][1]-HUE[i][1]);break}}}
t*=(0.5+0.5*v)*(0.6+0.4*sat);
return Math.min(1,Math.max(0,t))}
const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)};
function vnoise(x:number,y:number){
const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,a=hash(xi,yi),b=hash(xi+1,yi),c=hash(xi,yi+1),d=hash(xi+1,yi+1),u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function fbm(x:number,y:number){
let tot=0,amp=0.55,f=1,nm=0;
for(let o=0;o<3;o++){tot+=vnoise(x*f,y*f)*amp;nm+=amp;amp*=0.5;f*=2.35}
return tot/nm}
let NK='',NF:Float32Array|null=null;
export function noiseField(ox:number,oy:number,w:number,h:number,sc:number):Float32Array{
const k=`${ox}|${oy}|${w}|${h}|${sc}`;
if(k===NK&&NF)return NF;
const f=new Float32Array(w*h);
for(let y=0;y<h;y++){const py=(oy+(y+0.5)/sc-0.5)*0.09;for(let x=0;x<w;x++)f[y*w+x]=fbm((ox+(x+0.5)/sc-0.5)*0.09,py)}
NK=k;NF=f;return f}
export function boxBlur(src:Float32Array,w:number,h:number,r:number):Float32Array{
if(r<=0)return src;
const tmp=new Float32Array(w*h),out=new Float32Array(w*h),cnt=2*r+1;
for(let y=0;y<h;y++){
let s=0;
for(let k=-r;k<=r;k++)s+=src[y*w+Math.min(w-1,Math.max(0,k))];
for(let x=0;x<w;x++){tmp[y*w+x]=s/cnt;s+=src[y*w+Math.min(w-1,x+r+1)]-src[y*w+Math.max(0,x-r)]}}
for(let x=0;x<w;x++){
let s=0;
for(let k=-r;k<=r;k++)s+=tmp[Math.min(h-1,Math.max(0,k))*w+x];
for(let y=0;y<h;y++){out[y*w+x]=s/cnt;s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}}
return out}
function up2(s:Float32Array,w:number,h:number):Float32Array{
const W=w*2,H=h*2,o=new Float32Array(W*H);
for(let Y=0;Y<H;Y++){
const sy=(Y+0.5)/2-0.5,y0=Math.floor(sy),fy=sy-y0,ya=Math.max(0,y0),yb=Math.min(h-1,y0+1);
for(let X=0;X<W;X++){
const sx=(X+0.5)/2-0.5,x0=Math.floor(sx),fx=sx-x0,xa=Math.max(0,x0),xb=Math.min(w-1,x0+1);
o[Y*W+X]=(s[ya*w+xa]*(1-fx)+s[ya*w+xb]*fx)*(1-fy)+(s[yb*w+xa]*(1-fx)+s[yb*w+xb]*fx)*fy}}
return o}
const sstep=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
export interface RealOut{out:Uint8ClampedArray;ow:number;oh:number;valid:number;flag:number}
export function renderReal(px:Uint8ClampedArray,w:number,h:number,p:RealP,o:{scale?:number;mask?:Mk|null;ox?:number;oy?:number}={}):RealOut{
const n=w*h,sc=o.scale===2?2:1,mk=o.mask??null,ow=w*sc,oh=h*sc,iv=1/(1-p.thr),ic=1/p.ct;
let t:Float32Array=new Float32Array(n);
const vf=mk?new Float32Array(n):null;
let valid=0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
const i=y*w+x,q=i<<2;
if(px[q+3]<128)continue;
if(mk){const c=mk.row[y]*mk.col[x];if(c<=LIMB)continue;(vf as Float32Array)[i]=diskVis(c)}
valid++;
let v=(intensityOf(px[q],px[q+1],px[q+2])-p.thr)*iv;
v=v<=0?0:Math.pow(Math.min(1,v),ic);
t[i]=v}
t=boxBlur(t,w,h,Math.round(p.soft));
if(sc===2)t=up2(t,w,h);
const nz=p.noise>0?noiseField(o.ox??0,o.oy??0,ow,oh,sc):null,t3=new Float32Array(ow*oh);
for(let i=0;i<t3.length;i++){const b=t[i];t3[i]=Math.max(0,Math.min(1,nz?b+(nz[i]-0.5)*p.noise*b:b))}
const L=lut(),la=p.light*Math.PI/180,lx=Math.cos(la),ly=Math.sin(la),ks=p.relief*6*sc,out=new Uint8ClampedArray(ow*oh*4);
let flag=0;
for(let Y=0;Y<oh;Y++){
const ya=Math.max(0,Y-1)*ow,yb=Math.min(oh-1,Y+1)*ow;
for(let X=0;X<ow;X++){
const i=Y*ow+X,b=t3[i];
const src=vf?(vf[Math.floor(Y/sc)*w+Math.floor(X/sc)]):1,al=sstep(0.015,0.28,b)*src;
if(al<=0.004)continue;
const dx=(t3[Y*ow+Math.min(ow-1,X+1)]-t3[Y*ow+Math.max(0,X-1)])*ks,dy=(t3[yb+X]-t3[ya+X])*ks,len=Math.sqrt(dx*dx+dy*dy+1);
const sh=Math.max(0.25,Math.min(1.3,0.55+0.75*((-dx*lx-dy*ly+0.82)/len)));
let tc=b>0.74?0.74+(b-0.74)*p.storm:b;
if(tc<FLOOR)tc=FLOOR;
const q=i<<2;
if(p.pal==='mono'){const g=tc<=0.74?tc/0.74*230+15:230-((tc-0.74)/0.26)*180;out[q]=g*sh;out[q+1]=g*sh;out[q+2]=g*sh}
else{const k=Math.round(tc*1023)*3;out[q]=L[k]*sh;out[q+1]=L[k+1]*sh;out[q+2]=L[k+2]*sh}
out[q+3]=Math.round(245*al);
if(al>0.5&&(sc===1||(X%2===0&&Y%2===0)))flag++}}
return{out,ow,oh,valid,flag}}
