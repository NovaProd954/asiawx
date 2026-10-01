export interface CMap{rgb:Uint8Array;bt:Float32Array;n:number;total:number;usable:boolean}
const NUM='(-?\\d+(?:\\.\\d+)?)';
const RE=new RegExp(`${NUM}(?:\\s*(?:to|\\u2013|-)\\s*${NUM})?\\s*\\u00b0?\\s*([CK])\\b`,'i');
export function parseBT(label:string):number|null{
const m=RE.exec(label.replace(/&#176;|&deg;/g,'\u00b0'));
if(!m)return null;
const a=parseFloat(m[1]),b=m[2]!=null?parseFloat(m[2]):a,v=(a+b)/2;
const c=m[3].toUpperCase()==='K'?v-273.15:v;
return Number.isFinite(c)&&c>-150&&c<80?c:null}
export function parseColormap(xml:string):CMap{
const rgb:number[]=[],bt:number[]=[];let total=0;
for(const m of xml.matchAll(/<ColorMapEntry\s+([^>]*?)\/?>/g)){
const a:Record<string,string>={};for(const x of m[1].matchAll(/([\w:]+)="([^"]*)"/g))a[x[1]]=x[2];
if(a.transparent==='true')continue;
const c=(a.rgb||'').split(',').map(Number);
if(c.length!==3||c.some(x=>!Number.isFinite(x)))continue;
total++;
const v=parseBT(a.label||'');
if(v==null)continue;
rgb.push(c[0],c[1],c[2]);bt.push(v)}
const n=bt.length;
return{rgb:Uint8Array.from(rgb),bt:Float32Array.from(bt),n,total,usable:n>=8&&n>=total*0.5}}
export function buildLut(c:CMap,tol=10):(r:number,g:number,b:number)=>number{
const exact=new Map<number,number>(),cache=new Map<number,number>();
for(let i=0;i<c.n;i++){const k=(c.rgb[i*3]<<16)|(c.rgb[i*3+1]<<8)|c.rgb[i*3+2];if(!exact.has(k))exact.set(k,c.bt[i])}
const t2=tol*tol;
return(r,g,b)=>{
const k=(r<<16)|(g<<8)|b;
const e=exact.get(k);if(e!==undefined)return e;
const h=cache.get(k);if(h!==undefined)return h;
let best=t2+1,v=NaN;
for(let i=0;i<c.n;i++){const dr=r-c.rgb[i*3],dg=g-c.rgb[i*3+1],db=b-c.rgb[i*3+2],d=dr*dr+dg*dg+db*db;if(d<best){best=d;v=c.bt[i]}}
if(best>t2)v=NaN;
cache.set(k,v);return v}}
