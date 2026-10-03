export interface Fit{ok:boolean;lut:Float32Array;rms:number;n:number;corr:number;chroma:number;why:string}
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
if(Math.abs(corr)<0.9)return fail(`brightness and GIBS temperature do not line up (correlation ${corr.toFixed(2)}); the tile geometry or time may differ`,corr);
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
if(rms>6)return{...fail(`residual of ${rms.toFixed(1)} K is too large to trust`,corr),rms};
return{ok:true,lut,rms,n,corr,chroma,why:''}}
