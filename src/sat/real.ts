import {diskVis,LIMB} from './geo';
import type {DecodeIn,DecodeOut} from './decode';
import {paletteLut} from './pal';
export interface RealP{thr:number;ct:number;storm:number;soft:number;noise:number;relief:number;light:number;pal:'real'|'mono'}
export interface EnhP{thr:number;ct:number;soft:number;height:number;pal:'classic'|'enhanced'}
export interface V2P{real:RealP;enh:EnhP;bg:'clear'|'space'}
export const V2_DEF:V2P={real:{thr:0.08,ct:1.1,storm:0.7,soft:2,noise:0.35,relief:0.6,light:35,pal:'real'},enh:{thr:0.08,ct:1.1,soft:2,height:0.5,pal:'enhanced'},bg:'clear'};
export const v2Key=(p:V2P)=>{const r=p.real,e=p.enh;return`${r.thr}.${r.ct}.${r.storm}.${r.soft}.${r.noise}.${r.relief}.${r.light}.${r.pal}|${e.thr}.${e.ct}.${e.soft}.${e.height}.${e.pal}|${p.bg}`};
interface Mk{row:Float32Array;col:Float32Array}
type Stop=[number,number[]];
const REALISTIC:Stop[]=[[0,[4,8,14]],[0.08,[8,13,20]],[0.16,[22,29,38]],[0.28,[58,68,79]],[0.4,[112,120,129]],[0.52,[178,183,188]],[0.64,[224,227,229]],[0.74,[248,249,249]],[0.84,[214,205,196]],[0.92,[142,125,140]],[1,[58,42,58]]];
const FALSE_COLOR:Stop[]=[[0,[5,10,20]],[0.1,[8,20,50]],[0.2,[15,60,140]],[0.32,[30,130,175]],[0.44,[40,165,140]],[0.55,[80,180,60]],[0.65,[190,210,50]],[0.73,[235,215,40]],[0.8,[235,160,30]],[0.87,[220,90,35]],[0.9,[200,40,50]],[0.95,[180,45,150]],[1,[255,255,255]]];
const ENHANCED:Stop[]=[[0,[6,8,12]],[0.15,[38,42,48]],[0.3,[92,98,106]],[0.42,[168,173,180]],[0.5,[236,238,240]],[0.52,[70,200,230]],[0.6,[40,120,230]],[0.68,[40,200,90]],[0.76,[250,235,40]],[0.84,[245,130,30]],[0.91,[215,30,40]],[0.96,[140,20,110]],[1,[250,250,255]]];
function lutColorFrom(stops:Stop[],t:number):number[]{
t=Math.min(1,Math.max(0,t));
for(let i=0;i<stops.length-1;i++){
const a=stops[i],b=stops[i+1];
if(t>=a[0]&&t<=b[0]){const f=(t-a[0])/((b[0]-a[0])||1);return[a[1][0]+(b[1][0]-a[1][0])*f,a[1][1]+(b[1][1]-a[1][1])*f,a[1][2]+(b[1][2]-a[1][2])*f]}}
return[255,255,255]}
const PAL_LUTS:Record<string,Uint8Array>={};
for(const [k,s] of [['classic',FALSE_COLOR],['enhanced',ENHANCED]] as [string,Stop[]][]){
const l=new Uint8Array(3072);
for(let i=0;i<1024;i++){const c=lutColorFrom(s,i/1023);l[i*3]=c[0];l[i*3+1]=c[1];l[i*3+2]=c[2]}
PAL_LUTS[k]=l}
const HUE:number[][]=[[230,0.05],[200,0.15],[180,0.25],[150,0.35],[120,0.45],[90,0.52],[60,0.62],[40,0.72],[20,0.82],[0,0.92]];
export function intensityOf(r:number,g:number,b:number):number{
const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,v=max/255,sat=max===0?0:delta/max;
if(sat<0.16)return v*0.12;
let hue:number;
if(max===r)hue=60*(((g-b)/delta)%6);else if(max===g)hue=60*((b-r)/delta+2);else hue=60*((r-g)/delta+4);
if(hue<0)hue+=360;
let t:number;
if(hue>230)t=hue>=300?1:0.92+(hue-230)/70*0.08;
else{
t=HUE[HUE.length-1][1];
for(let i=0;i<HUE.length-1;i++){
if(hue<=HUE[i][0]&&hue>=HUE[i+1][0]){const span=HUE[i][0]-HUE[i+1][0]||1,f=(HUE[i][0]-hue)/span;t=HUE[i][1]+f*(HUE[i+1][1]-HUE[i][1]);break}}}
t*=(0.5+0.5*v)*(0.6+0.4*sat);
return Math.min(1,Math.max(0,t))}
const HK=new Int32Array(1<<16),HV=new Float32Array(1<<16);
export function intensityField(px:Uint8ClampedArray,n:number,valid:Uint8Array|null):Float32Array{
const f=new Float32Array(n);
HK.fill(-1);
for(let i=0;i<n;i++){
if(valid&&!valid[i])continue;
const q=i<<2,r=px[q],g=px[q+1],b=px[q+2],key=(r<<16)|(g<<8)|b;
const h=Math.imul(key,2654435761)>>>16;
let found=false;
for(let p=0;p<8;p++){
const s=(h+p)&0xffff;
if(HK[s]===key){f[i]=HV[s];found=true;break}
if(HK[s]===-1){const v=intensityOf(r,g,b);HK[s]=key;HV[s]=v;f[i]=v;found=true;break}}
if(!found)f[i]=intensityOf(r,g,b)}
return f}
function sstep(a:number,b:number,x:number){const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)}
export function boxBlur(src:Float32Array,w:number,h:number,radius:number):Float32Array{
if(radius<=0)return src;
const tmp=new Float32Array(w*h),out=new Float32Array(w*h);
for(let y=0;y<h;y++){
let sum=0,cnt=0;
for(let k=-radius;k<=radius;k++){const xx=Math.min(w-1,Math.max(0,k));sum+=src[y*w+xx];cnt++}
for(let x=0;x<w;x++){tmp[y*w+x]=sum/cnt;const addX=Math.min(w-1,x+radius+1),remX=Math.max(0,x-radius);sum+=src[y*w+addX]-src[y*w+remX]}}
for(let x=0;x<w;x++){
let sum=0,cnt=0;
for(let k=-radius;k<=radius;k++){const yy=Math.min(h-1,Math.max(0,k));sum+=tmp[yy*w+x];cnt++}
for(let y=0;y<h;y++){out[y*w+x]=sum/cnt;const addY=Math.min(h-1,y+radius+1),remY=Math.max(0,y-radius);sum+=tmp[addY*w+x]-tmp[remY*w+x]}}
return out}
export function trueField(d:Uint8ClampedArray,w:number,h:number,valid:Uint8Array|null):Float32Array{
const n=w*h,s=new Float32Array(n);
for(let i=0;i<n;i++){
if(valid&&!valid[i])continue;
const r=d[i*4],g=d[i*4+1],b=d[i*4+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);
if(mx===0)continue;
let sat=(mx-mn)/mx;
if(b>=mx)sat*=0.6;
s[i]=Math.pow((0.299*r+0.587*g+0.114*b)/255,1.3)*(1-sstep(0.10,0.55,sat))}
const B=Math.max(4,Math.round(Math.max(w,h)/56)),gw=Math.ceil(w/B),gh=Math.ceil(h/B),g0=new Float32Array(gw*gh).fill(1);
for(let y=0;y<h;y++){const row=((y/B)|0)*gw;for(let x=0;x<w;x++){const j=row+((x/B)|0),v=s[y*w+x];if(v<g0[j])g0[j]=v}}
const er=new Float32Array(gw*gh);
for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){let m=1;for(let dy=-2;dy<=2;dy++){const yy=Math.min(gh-1,Math.max(0,y+dy));for(let dx=-2;dx<=2;dx++){const v=g0[yy*gw+Math.min(gw-1,Math.max(0,x+dx))];if(v<m)m=v}}er[y*gw+x]=m}
const bg=boxBlur(boxBlur(er,gw,gh,2),gw,gh,2);
for(let y=0;y<h;y++){
const fy=Math.min(gh-1,Math.max(0,(y+0.5)/B-0.5)),y0=Math.floor(fy),y1=Math.min(gh-1,y0+1),ty=fy-y0;
for(let x=0;x<w;x++){
const fx=Math.min(gw-1,Math.max(0,(x+0.5)/B-0.5)),x0=Math.floor(fx),x1=Math.min(gw-1,x0+1),tx=fx-x0,a=bg[y0*gw+x0]*(1-tx)+bg[y0*gw+x1]*tx,c=bg[y1*gw+x0]*(1-tx)+bg[y1*gw+x1]*tx,k=0.8*Math.min(0.3,a*(1-ty)+c*ty),i=y*w+x;
s[i]=Math.max(0,Math.min(1,(s[i]-k)/(1-k)))}}
return s}
export interface Hist{hist:Uint32Array;tot:number;n:number}
export function histOf(a:Float32Array):Hist{
const B=512,hist=new Uint32Array(B);let tot=0,n=0;
for(let i=0;i<a.length;i+=2){tot++;if(a[i]>0.1){hist[Math.min(B-1,(a[i]*B)|0)]++;n++}}
return{hist,tot,n}}
export function hiOf(h:Hist):number{
const B=512;
if(h.n<h.tot*0.004)return 0.6;
let c=0;const t=h.n*0.985;
for(let i=0;i<B;i++){c+=h.hist[i];if(c>=t)return Math.max(0.4,Math.min(1,(i+1)/B))}
return 1}
export const mergeHist=(hs:Hist[]):Hist=>{const hist=new Uint32Array(512);let tot=0,n=0;for(const h of hs){for(let i=0;i<512;i++)hist[i]+=h.hist[i];tot+=h.tot;n+=h.n}return{hist,tot,n}};
function guided(p:Float32Array,w:number,h:number,r:number,eps:number):Float32Array{
const n=w*h,m=boxBlur(p,w,h,r),pp=new Float32Array(n);
for(let i=0;i<n;i++)pp[i]=p[i]*p[i];
const mm=boxBlur(pp,w,h,r),a=new Float32Array(n),b=new Float32Array(n);
for(let i=0;i<n;i++){const v=Math.max(0,mm[i]-m[i]*m[i]),k=v/(v+eps);a[i]=k;b[i]=(1-k)*m[i]}
const ma=boxBlur(a,w,h,r),mb=boxBlur(b,w,h,r),o=new Float32Array(n);
for(let i=0;i<n;i++)o[i]=ma[i]*p[i]+mb[i];
return o}
const hash2=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n)};
function valueNoise(x:number,y:number){
const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1),u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
function fbm(x:number,y:number){
let total=0,amp=0.55,freq=1,norm=0;
for(let o=0;o<3;o++){total+=valueNoise(x*freq,y*freq)*amp;norm+=amp;amp*=0.5;freq*=2.35}
return total/norm}
let NK="",NF:Float64Array|null=null;
export function noiseField(ox:number,oy:number,w:number,h:number):Float64Array{
const k=`${ox}|${oy}|${w}|${h}`;
if(k===NK&&NF)return NF;
const f=new Float64Array(w*h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++)f[y*w+x]=fbm((ox+x)*0.09,(oy+y)*0.09);
NK=k;NF=f;return f}
export interface RO{ox?:number;oy?:number;alpha:Float32Array;bg:'clear'|'space'}
export function renderReal(rawT:Float32Array,w:number,h:number,p:RealP,o:RO):{out:Uint8ClampedArray;flag:number}{
const n=w*h;
let t2:Float32Array=new Float32Array(n);
for(let i=0;i<n;i++){let v=(rawT[i]-p.thr)/(1-p.thr);v=Math.max(0,Math.min(1,v));t2[i]=Math.pow(v,1/p.ct)}
t2=boxBlur(t2,w,h,p.soft);
const nz=p.noise>0?noiseField(o.ox??0,o.oy??0,w,h):null,t3=new Float32Array(n);
for(let i=0;i<n;i++){const base=t2[i],mod=nz?(nz[i]-0.5)*p.noise*base:0;t3[i]=Math.max(0,Math.min(1,base+mod))}
const lr=p.light*Math.PI/180,lx=Math.cos(lr),ly=Math.sin(lr),out=new Uint8ClampedArray(n*4),mono=p.pal==='mono',al=o.alpha;
let flag=0;
for(let y=0;y<h;y++){
const ya=Math.max(0,y-1)*w,yb=Math.min(h-1,y+1)*w;
for(let x=0;x<w;x++){
const i=y*w+x,xL=t3[y*w+Math.max(0,x-1)],xR=t3[y*w+Math.min(w-1,x+1)],yU=t3[ya+x],yD=t3[yb+x],dx=(xR-xL)*p.relief*6,dy=(yD-yU)*p.relief*6;
let nx=-dx,ny=-dy,nzv=1;
const len=Math.sqrt(nx*nx+ny*ny+nzv*nzv)||1;
nx/=len;ny/=len;nzv/=len;
const shade=Math.max(0.25,Math.min(1.3,0.55+0.75*(nx*lx+ny*ly+nzv*0.82)));
let tc=t3[i];
if(tc>0.74)tc=0.74+(tc-0.74)*p.storm;
let r:number,g:number,b:number;
if(mono){const gg=tc<=0.74?tc/0.74*230+15:230-((tc-0.74)/0.26)*180;r=gg;g=gg;b=gg}
else{const c=lutColorFrom(REALISTIC,tc);r=c[0];g=c[1];b=c[2]}
const q=i*4,a=al[i];
out[q]=r*shade;out[q+1]=g*shade;out[q+2]=b*shade;
out[q+3]=a<=0?0:Math.round(255*a*(o.bg==='clear'?sstep(0,0.08,t3[i]):1));
if(t3[i]>=0.2)flag++}}
return{out,flag}}
export function renderEnh(rawT:Float32Array,w:number,h:number,p:EnhP,hiIn:number|null,o:RO):{out:Uint8ClampedArray;flag:number}{
const n=w*h,th=p.thr,ct=p.ct,sf=p.soft||0,H=p.height||0;
let s=sf>0?guided(rawT,w,h,sf,0.0025):rawT;
if(H>0){
const R=Math.max(5,Math.round(Math.max(w,h)*0.045)),M=boxBlur(boxBlur(s,w,h,R),w,h,R),m1=boxBlur(rawT,w,h,3),sq=new Float32Array(n);
for(let i=0;i<n;i++)sq[i]=rawT[i]*rawT[i];
const m2=boxBlur(sq,w,h,3),oo=new Float32Array(n);
for(let i=0;i<n;i++){const tx=Math.sqrt(Math.max(0,m2[i]-m1[i]*m1[i])),coh=0.6*sstep(0.12,0.6,M[i])+0.4*(1-Math.min(1,tx/0.12));oo[i]=s[i]*(1-H*0.55*(1-coh))}
s=oo}
const iv=1/(hiIn||hiOf(histOf(rawT))),lut=PAL_LUTS[p.pal]||PAL_LUTS.classic,out=new Uint8ClampedArray(n*4),al=o.alpha;
let flag=0;
for(let i=0;i<n;i++){
let v=Math.min(1,s[i]*iv);
v=(v-th)/(1-th);
v=v<0?0:Math.pow(v,1/ct);
const k=((v>1?1:v)*1023|0)*3,q=i*4,a=al[i];
out[q]=lut[k];out[q+1]=lut[k+1];out[q+2]=lut[k+2];
out[q+3]=a<=0?0:Math.round(255*a*(o.bg==='clear'?sstep(0,0.08,v):1));
if(v>=0.2)flag++}
return{out,flag}}
function fieldOf(i:DecodeIn){
const n=i.w*i.h,mk=i.mask as Mk|null|undefined,px=i.cur,valid=new Uint8Array(n),alpha=new Float32Array(n);
let cnt=0,unmatched=0;
for(let y=0;y<i.h;y++)for(let x=0;x<i.w;x++){
const k=y*i.w+x;
if(px[(k<<2)+3]<128)continue;
let a=1;
if(mk){const c=mk.row[y]*mk.col[x];if(c<=LIMB)continue;a=diskVis(c)}
valid[k]=1;alpha[k]=a;cnt++}
const pal=i.src!=='vis'&&i.rgb&&i.btv&&i.btv.length>=8&&i.rgb.length===i.btv.length*3;
let f:Float32Array;
if(i.view==='e2'&&i.src==='vis')f=trueField(px,i.w,i.h,valid);
else if(pal){
const lut=paletteLut(i.rgb,i.btv);f=new Float32Array(n);
for(let k=0;k<n;k++){
if(!valid[k])continue;
const q=k<<2,v=lut(px[q],px[q+1],px[q+2]);
if(v===v)f[k]=v;else{unmatched++;f[k]=intensityOf(px[q],px[q+1],px[q+2])}}}
else f=intensityField(px,n,valid);
return{f,alpha,cnt,unmatched}}
export function runV2(i:DecodeIn):DecodeOut{
const p=i.v2??V2_DEF,{f,alpha,cnt,unmatched}=fieldOf(i);
const r=i.view==='e2'?renderEnh(f,i.w,i.h,p.enh,i.hi??null,{alpha,bg:p.bg}):renderReal(f,i.w,i.h,p.real,{ox:i.ox,oy:i.oy,alpha,bg:p.bg});
return{out:r.out,ow:i.w,oh:i.h,bt:new Float32Array(0),stats:{valid:cnt,unmatched,min:null,flag:r.flag}}}
export function histV2(i:DecodeIn):Hist{return histOf(fieldOf(i).f)}
