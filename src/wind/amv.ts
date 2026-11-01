import {cloudAlpha} from '../sat/fuse';
export const RE=6378137;
export const P_LEV=[925,850,700,500,300,200];
export const BANDS=[{id:'low',name:'Low level, about 850 hPa',p:850,lo:650,hi:1100,k:1},{id:'mid',name:'Mid level, about 500 hPa',p:500,lo:400,hi:650,k:1.6},{id:'high',name:'High level, about 250 hPa',p:250,lo:0,hi:400,k:2.4}] as const;
export type BandId=typeof BANDS[number]['id'];
export interface Win{z:number;x0:number;y0:number;w:number;h:number}
export interface Trk{x:number;y:number;dx:number;dy:number;corr:number;sharp:number;tex:number;bt:number}
export interface Vec{lon:number;lat:number;u:number;v:number;bt:number;qi:number;corr:number;p:number;vd:number;ok:boolean}
export interface Levels{lon0:number;lat0:number;d:number;nx:number;ny:number;p:number[];t:Float32Array[];u:Float32Array[];v:Float32Array[]}
export interface BandOut{id:BandId;u:Float32Array;v:Float32Array;conf:Float32Array;n:number}
export interface Analysis{lon0:number;lat0:number;d:number;nx:number;ny:number;bands:BandOut[];stats:Stats}
export interface Stats{tracked:number;accepted:number;rejected:number;rmsVD:number;medVD:number;clamped:number}
export const mPerPx=(lat:number,z:number)=>2*Math.PI*RE*Math.cos(lat*Math.PI/180)/(256*2**z);
export const xToLon=(x:number,z:number)=>x/2**z*360-180;
export const yToLat=(y:number,z:number)=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI;
export {fuseBT} from '../sat/fuse';
export function down2(s:Float32Array,w:number,h:number):{d:Float32Array;w:number;h:number}{
const W=w>>1,H=h>>1,d=new Float32Array(W*H);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
const i=2*y*w+2*x,a=s[i],b=s[i+1],c=s[i+w],e=s[i+w+1];
let n=0,t=0;
if(a===a){t+=a;n++}if(b===b){t+=b;n++}if(c===c){t+=c;n++}if(e===e){t+=e;n++}
d[y*W+x]=n>=3?t/n:NaN}
return{d,w:W,h:H}}
function stat(s:Float32Array,w:number,cx:number,cy:number,B:number,h:number){
const x0=cx-(B>>1),y0=cy-(B>>1);
if(x0<0||y0<0||x0+B>w||y0+B>h)return null;
let n=0,sum=0,sq=0;
for(let y=0;y<B;y++){const r=(y0+y)*w+x0;for(let x=0;x<B;x++){const v=s[r+x];if(v===v){n++;sum+=v;sq+=v*v}}}
if(n<B*B*0.9)return null;
const m=sum/n;
return{m,sd:Math.sqrt(Math.max(0,sq/n-m*m)),n}}
function ncc(a:Float32Array,b:Float32Array,w:number,h:number,ax:number,ay:number,bx:number,by:number,B:number,ma:number,sa:number):number{
const ax0=ax-(B>>1),ay0=ay-(B>>1),bx0=bx-(B>>1),by0=by-(B>>1);
if(bx0<0||by0<0||bx0+B>w||by0+B>h)return -2;
let n=0,sb=0,sbb=0,sab=0;
for(let y=0;y<B;y++){
const ra=(ay0+y)*w+ax0,rb=(by0+y)*w+bx0;
for(let x=0;x<B;x++){const p=a[ra+x],q=b[rb+x];if(p===p&&q===q){n++;sb+=q;sbb+=q*q;sab+=(p-ma)*q}}}
if(n<B*B*0.85)return -2;
const mb=sb/n,vb=sbb/n-mb*mb;
if(vb<1e-6)return -2;
return(sab/n)/(sa*Math.sqrt(vb))}
export interface TrackOpt{B?:number;S?:number;R?:number;minSd?:number;minCorr?:number;ppd?:number;part?:[number,number]}
export function track(b0:Float32Array,b1:Float32Array,w:number,h:number,o:TrackOpt={}):Trk[]{
const B=o.B??24,S=o.S??16,R=o.R??7,minSd=o.minSd??2,minCorr=o.minCorr??0.7;
const cl=cloudAlpha(b1,w,h,o.ppd??11.4,1),c0=down2(b0,w,h),c1=down2(b1,w,h),B2=B>>1,out:Trk[]=[];
let li=-1;
for(let cy=B;cy<h-B;cy+=S){
li++;
if(o.part&&li%o.part[1]!==o.part[0])continue;
for(let cx=B;cx<w-B;cx+=S){
let cn=0;
for(let y=0;y<B;y+=3)for(let x=0;x<B;x+=3)if(cl[(cy-(B>>1)+y)*w+cx-(B>>1)+x]>0.3)cn++;
if(cn<(B/3)*(B/3)*0.6)continue;
const st=stat(b1,w,cx,cy,B,h);
if(!st||st.sd<minSd)continue;
const hx=cx>>1,hy=cy>>1,s2=stat(c1.d,c1.w,hx,hy,B2,c1.h);
if(!s2||s2.sd<minSd*0.6)continue;
let best=-2,bx=0,by=0;
for(let sy=-R;sy<=R;sy++)for(let sx=-R;sx<=R;sx++){
const r=ncc(c1.d,c0.d,c1.w,c1.h,hx,hy,hx+sx,hy+sy,B2,s2.m,s2.sd);
if(r>best){best=r;bx=sx;by=sy}}
if(best<minCorr-0.15)continue;
const fx=bx*2,fy=by*2,sc=new Float32Array(25);
let fb=-2,ox=0,oy=0;
for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){
const r=ncc(b1,b0,w,h,cx,cy,cx+fx+i,cy+fy+j,B,st.m,st.sd);
sc[(j+2)*5+i+2]=r;
if(r>fb){fb=r;ox=i;oy=j}}
if(fb<minCorr)continue;
let sx=0,sy=0;
if(ox>-2&&ox<2&&oy>-2&&oy<2){
const g=(i:number,j:number)=>sc[(oy+j+2)*5+ox+i+2],c=g(0,0),dxx=g(-1,0)-2*c+g(1,0),dyy=g(0,-1)-2*c+g(0,1);
if(dxx<0)sx=Math.max(-0.5,Math.min(0.5,-(g(1,0)-g(-1,0))/(2*dxx)));
if(dyy<0)sy=Math.max(-0.5,Math.min(0.5,-(g(0,1)-g(0,-1))/(2*dyy)))}
let nb=0,ns=0;
for(const [i,j] of [[-1,0],[1,0],[0,-1],[0,1]] as number[][]){const x=ox+i,y=oy+j;if(x>=-2&&x<=2&&y>=-2&&y<=2){nb+=sc[(y+2)*5+x+2];ns++}}
const sharp=ns?Math.max(0,Math.min(1,(fb-nb/ns)/0.25)):0;
out.push({x:cx,y:cy,dx:-(fx+ox+sx),dy:-(fy+oy+sy),corr:fb,sharp,tex:st.sd,bt:st.m})}}
return out}
export function sampleGrid(a:Float32Array,L:{lon0:number;lat0:number;d:number;nx:number;ny:number},lon:number,lat:number):number{
const fx=Math.max(0,Math.min(L.nx-1.0001,(lon-L.lon0)/L.d)),fy=Math.max(0,Math.min(L.ny-1.0001,(lat-L.lat0)/L.d)),i=Math.floor(fx),j=Math.floor(fy),tx=fx-i,ty=fy-j,k=j*L.nx+i;
const p=a[k],q=a[k+1],r=a[k+L.nx],s=a[k+L.nx+1];
if(p!==p||q!==q||r!==r||s!==s)return NaN;
return(p*(1-tx)+q*tx)*(1-ty)+(r*(1-tx)+s*tx)*ty}
export function profile(L:Levels,lon:number,lat:number):{t:number[];u:number[];v:number[]}{
return{t:L.t.map(a=>sampleGrid(a,L,lon,lat)),u:L.u.map(a=>sampleGrid(a,L,lon,lat)),v:L.v.map(a=>sampleGrid(a,L,lon,lat))}}
export function heightOf(bt:number,t:number[],p:number[]):{p:number;clamped:boolean}{
const n=p.length;
if(t.some(x=>x!==x))return{p:NaN,clamped:true};
if(bt<=t[n-1])return{p:p[n-1],clamped:true};
if(bt>=t[0])return{p:p[0],clamped:true};
for(let k=n-1;k>0;k--){
if(t[k-1]>=bt&&bt>t[k]){const f=(t[k-1]-bt)/(t[k-1]-t[k]);return{p:Math.exp(Math.log(p[k-1])+f*(Math.log(p[k])-Math.log(p[k-1]))),clamped:false}}}
return{p:p[0],clamped:true}}
export function windAt(u:number[],v:number[],p:number[],pr:number):[number,number]{
const n=p.length;
if(pr>=p[0])return[u[0],v[0]];
if(pr<=p[n-1])return[u[n-1],v[n-1]];
for(let k=0;k<n-1;k++){
if(pr<=p[k]&&pr>=p[k+1]){const f=(Math.log(p[k])-Math.log(pr))/(Math.log(p[k])-Math.log(p[k+1]));return[u[k]+(u[k+1]-u[k])*f,v[k]+(v[k+1]-v[k])*f]}}
return[u[0],v[0]]}
export const VD_BASE=10,VD_FRAC=0.25;
export function vectors(tr:Trk[],win:Win,dt:number,L:Levels):Vec[]{
const out:Vec[]=[];
for(const t of tr){
const lon=xToLon(win.x0+t.x/256,win.z),lat=yToLat(win.y0+t.y/256,win.z),m=mPerPx(lat,win.z),u=t.dx*m/dt,v=-t.dy*m/dt;
const pf=profile(L,lon,lat),h=heightOf(t.bt,pf.t,L.p);
if(h.p!==h.p)continue;
const [mu,mv]=windAt(pf.u,pf.v,L.p,h.p),vd=Math.hypot(u-mu,v-mv),lim=VD_BASE+VD_FRAC*Math.hypot(mu,mv);
const agree=Math.max(0,1-vd/lim),sp=Math.hypot(u,v);
const qi=Math.max(0,Math.min(1,0.35*Math.min(1,(t.corr-0.6)/0.35)+0.2*t.sharp+0.35*agree+0.1*Math.min(1,t.tex/6)))*(h.clamped?0.85:1)*(sp>0.5?1:0.6);
out.push({lon,lat,u,v,bt:t.bt,qi,corr:t.corr,p:h.p,vd,ok:vd<=lim&&sp<120})}
return out}
export interface AOpt{lon0?:number;lat0?:number;d?:number;nx?:number;ny?:number;R?:number;W0?:number}
export function analyse(vs:Vec[],L:Levels,o:AOpt={}):Analysis{
const lon0=o.lon0??60,lat0=o.lat0??-12,d=o.d??1,nx=o.nx??121,ny=o.ny??85,R=o.R??4,W0=o.W0??0.6,n=nx*ny,r2=R*R,rc=Math.ceil(R/d);
const bands:BandOut[]=[];
const sorted=vs.filter(v=>v.ok).sort((a,b)=>a.vd-b.vd);
const prof=new Array(n);
for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)prof[j*nx+i]=profile(L,lon0+i*d,lat0+j*d);
const med=sorted.length?sorted[sorted.length>>1].vd:0,rms=sorted.length?Math.sqrt(sorted.reduce((s,v)=>s+v.vd*v.vd,0)/sorted.length):0;
for(const b of BANDS){
const bu=new Float32Array(n),bv=new Float32Array(n),sw=new Float64Array(n),su=new Float64Array(n),sv=new Float64Array(n),conf=new Float32Array(n);
for(let k=0;k<n;k++){const w=windAt(prof[k].u,prof[k].v,L.p,b.p);bu[k]=w[0];bv[k]=w[1]}
let cnt=0;
for(const v of vs){
if(!v.ok||!(v.p>=b.lo&&v.p<b.hi))continue;
const pf=profile(L,v.lon,v.lat),[mu,mv]=windAt(pf.u,pf.v,L.p,v.p),du=v.u-mu,dv=v.v-mv,wq=v.qi*v.qi;
cnt++;
const ci=Math.round((v.lon-lon0)/d),cj=Math.round((v.lat-lat0)/d);
for(let j=Math.max(0,cj-rc);j<=Math.min(ny-1,cj+rc);j++)for(let i=Math.max(0,ci-rc);i<=Math.min(nx-1,ci+rc);i++){
const dx=(lon0+i*d-v.lon)*Math.cos(v.lat*Math.PI/180),dy=lat0+j*d-v.lat,q=dx*dx+dy*dy;
if(q>=r2)continue;
const w=wq*(r2-q)/(r2+q),k=j*nx+i;
sw[k]+=w;su[k]+=w*du;sv[k]+=w*dv}}
for(let k=0;k<n;k++){
const a=sw[k]/(sw[k]+W0);
conf[k]=a;
if(sw[k]>0){bu[k]+=a*su[k]/sw[k];bv[k]+=a*sv[k]/sw[k]}}
bands.push({id:b.id,u:bu,v:bv,conf,n:cnt})}
return{lon0,lat0,d,nx,ny,bands,stats:{tracked:vs.length,accepted:sorted.length,rejected:vs.length-sorted.length,rmsVD:rms,medVD:med,clamped:vs.filter(v=>v.ok&&(v.p<=P_LEV[P_LEV.length-1]||v.p>=P_LEV[0])).length}}}
