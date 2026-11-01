export interface Fit{ok:boolean;lut:Float32Array;rms:number;n:number;corr:number;chroma:number;why:string;approx?:boolean;fitR?:number;sx?:number;sy?:number;z?:number}
export const lumOf=(r:number,g:number,b:number)=>Math.round(0.299*r+0.587*g+0.114*b);
const MIN_BIN=20,MIN_N=30000;
export function pav(y:number[],wt:number[]):number[]{
const m:number[]=[],w:number[]=[],c:number[]=[];
for(let i=0;i<y.length;i++){
m.push(y[i]);w.push(wt[i]);c.push(1);
while(m.length>1&&m[m.length-2]>m[m.length-1]){
const k=m.length-1,tw=w[k-1]+w[k];
m[k-1]=(m[k-1]*w[k-1]+m[k]*w[k])/tw;w[k-1]=tw;c[k-1]+=c[k];m.pop();w.pop();c.pop()}}
const o:number[]=[];
for(let b=0;b<m.length;b++)for(let j=0;j<c[b];j++)o.push(m[b]);
return o}
export function fitCurve(src:Uint8ClampedArray,bt:Float32Array):Fit{
const S=new Float64Array(256),Q=new Float64Array(256),C=new Float64Array(256);
let n=0,sl=0,sb=0,sll=0,sbb=0,slb=0,ch=0;
for(let i=0;i<bt.length;i++){
const p=i<<2,v=bt[i];
if(v!==v||src[p+3]<128)continue;
const r=src[p],g=src[p+1],b=src[p+2],l=lumOf(r,g,b);
S[l]+=v;Q[l]+=v*v;C[l]++;n++;sl+=l;sb+=v;sll+=l*l;sbb+=v*v;slb+=l*v;ch+=Math.abs(r-g)+Math.abs(g-b)}
const chroma=n?ch/n:NaN;
const fail=(why:string,corr=NaN):Fit=>({ok:false,lut:new Float32Array(256),rms:NaN,n,corr,chroma,why});
if(n<MIN_N)return fail(`only ${n} overlapping pixels with data`);
const vl=sll/n-(sl/n)**2,vb=sbb/n-(sb/n)**2,corr=vl>0&&vb>0?(slb/n-sl/n*sb/n)/Math.sqrt(vl*vb):0;
if(chroma>8)return fail('the source is not a grey-scale image',corr);
if(Math.abs(corr)<0.3)return fail(`brightness and GIBS temperature do not line up (correlation ${corr.toFixed(2)}); the tile geometry or time may differ`,corr);
const sg=corr<0?-1:1,idx:number[]=[],ym:number[]=[],wt:number[]=[];
for(let l=0;l<256;l++)if(C[l]>=MIN_BIN){idx.push(l);ym.push(sg*S[l]/C[l]);wt.push(C[l])}
if(idx.length<8)return fail('too few brightness levels in the overlap',corr);
const iso=pav(ym,wt).map(v=>v*sg),lut=new Float32Array(256);
for(let l=0;l<256;l++){
if(l<=idx[0]){lut[l]=iso[0];continue}
if(l>=idx[idx.length-1]){lut[l]=iso[iso.length-1];continue}
let k=1;while(idx[k]<l)k++;
const f=(l-idx[k-1])/(idx[k]-idx[k-1]);lut[l]=iso[k-1]+(iso[k]-iso[k-1])*f}
let sse=0;
for(let l=0;l<256;l++)if(C[l]>0)sse+=Q[l]-2*lut[l]*S[l]+C[l]*lut[l]*lut[l];
const rms=Math.sqrt(Math.max(0,sse)/n);
const sst=Math.max(1e-9,vb*n),fitR=Math.sqrt(Math.max(0,1-sse/sst));
if(fitR>=0.93&&rms<=6)return{ok:true,lut,rms,n,corr,chroma,why:'',fitR};
if(fitR<0.6)return{...fail(`brightness and GIBS temperature do not line up (monotone fit ${fitR.toFixed(2)}, correlation ${corr.toFixed(2)}); the tile geometry or time may differ`,corr),rms,fitR};
const q=quantileLut(C,bt,src,sg);
if(!q)return{...fail('too few brightness levels in the overlap',corr),rms,fitR};
let s2=0;
for(let l=0;l<256;l++)if(C[l]>0)s2+=Q[l]-2*q[l]*S[l]+C[l]*q[l]*q[l];
return{ok:true,lut:q,rms:Math.sqrt(Math.max(0,s2)/n),n,corr,chroma,why:`matched by brightness distribution because the images are not pixel aligned (pixel fit ${fitR.toFixed(2)})`,approx:true,fitR}}
export function quantileLut(C:Float64Array,bt:Float32Array,src:Uint8ClampedArray,sg:number):Float32Array|null{
const LO=-120,STEP=0.25,NBIN=760,H=new Float64Array(NBIN);
let n=0;
for(let i=0;i<bt.length;i++){const v=bt[i];if(v!==v||src[(i<<2)+3]<128)continue;const b=Math.max(0,Math.min(NBIN-1,Math.floor((v-LO)/STEP)));H[b]++;n++}
if(n<MIN_N)return null;
const cdf=new Float64Array(NBIN);let a=0;
for(let b=0;b<NBIN;b++){a+=H[b];cdf[b]=a/n}
const at=(p:number)=>{let b=0;while(b<NBIN-1&&cdf[b]<p)b++;const lo=b>0?cdf[b-1]:0,f=cdf[b]>lo?(p-lo)/(cdf[b]-lo):0.5;return LO+(b+Math.max(0,Math.min(1,f)))*STEP};
const idx:number[]=[],val:number[]=[];
let cum=0;
for(let l=0;l<256;l++){
if(C[l]>0){const p=(cum+C[l]/2)/n;idx.push(l);val.push(at(sg>0?p:1-p))}
cum+=C[l]}
if(idx.length<8)return null;
const lut=new Float32Array(256);
for(let l=0;l<256;l++){
if(l<=idx[0]){lut[l]=val[0];continue}
if(l>=idx[idx.length-1]){lut[l]=val[val.length-1];continue}
let k=1;while(idx[k]<l)k++;
const f=(l-idx[k-1])/(idx[k]-idx[k-1]);lut[l]=val[k-1]+(val[k]-val[k-1])*f}
return lut}
export function shiftRGBA(s:Uint8ClampedArray,w:number,h:number,sx:number,sy:number):Uint8ClampedArray{
if(!sx&&!sy)return s;
const o=new Uint8ClampedArray(s.length);
for(let y=0;y<h;y++){const yy=y+sy;if(yy<0||yy>=h)continue;
const x0=Math.max(0,-sx),x1=Math.min(w,w-sx);
if(x1>x0)o.set(s.subarray((yy*w+x0+sx)<<2,(yy*w+x1+sx)<<2),(y*w+x0)<<2)}
return o}
export function findShift(src:Uint8ClampedArray,bt:Float32Array,w:number,h:number,R=4):{sx:number;sy:number;c0:number;c:number}{
const n=w*h,L=new Float32Array(n);
for(let i=0;i<n;i++){const p=i<<2;L[i]=src[p+3]<128?NaN:lumOf(src[p],src[p+1],src[p+2])}
const score=(sx:number,sy:number)=>{
let m=0,a=0,b=0,aa=0,bb=0,ab=0;
for(let y=R;y<h-R;y+=2){const r=y*w,r2=(y+sy)*w+sx;for(let x=R;x<w-R;x+=2){const v=bt[r+x],l=L[r2+x];if(v!==v||l!==l)continue;m++;a+=v;b+=l;aa+=v*v;bb+=l*l;ab+=v*l}}
if(m<Math.min(20000,n/40))return 0;
const va=aa/m-(a/m)**2,vb=bb/m-(b/m)**2;
return va>0&&vb>0?Math.abs((ab/m-a/m*b/m)/Math.sqrt(va*vb)):0};
const c0=score(0,0);
let best={sx:0,sy:0,c:c0};
for(let sy=-R;sy<=R;sy++)for(let sx=-R;sx<=R;sx++){if(!sx&&!sy)continue;const c=score(sx,sy);if(c>best.c)best={sx,sy,c}}
return{...best,c0}}
