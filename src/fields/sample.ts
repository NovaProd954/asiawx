export interface G2{lon0:number;lat0:number;d:number;nx:number;ny:number}
export const cr=(a:number,b:number,c:number,d:number,t:number)=>b+0.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
export function sampleCR(g:G2,v:ArrayLike<number>,lon:number,lat:number):number{
const fx=(lon-g.lon0)/g.d,fy=(lat-g.lat0)/g.d;
if(!(fx>=0&&fy>=0&&fx<=g.nx-1&&fy<=g.ny-1))return NaN;
const i=Math.min(Math.floor(fx),g.nx-2),j=Math.min(Math.floor(fy),g.ny-2),tx=fx-i,ty=fy-j,nx=g.nx,ny=g.ny;
const colAt=(a:number)=>{
const b=v[j*nx+a],c=v[(j+1)*nx+a];
const p0=j-1>=0?v[(j-1)*nx+a]:2*b-c,p3=j+2<=ny-1?v[(j+2)*nx+a]:2*c-b;
return cr(p0,b,c,p3,ty)};
const q1=colAt(i),q2=colAt(i+1);
const q0=i-1>=0?colAt(i-1):2*q1-q2,q3=i+2<=nx-1?colAt(i+2):2*q2-q1;
const r=cr(q0,q1,q2,q3,tx);
if(r===r)return r;
const q=[v[j*nx+i],v[j*nx+i+1],v[(j+1)*nx+i],v[(j+1)*nx+i+1]];
if(q.some(x=>x!==x))return NaN;
return(q[0]*(1-tx)+q[1]*tx)*(1-ty)+(q[2]*(1-tx)+q[3]*tx)*ty}
export function fillGaps(g:G2,v:Float32Array,passes=4):Float32Array{
const o=Float32Array.from(v);
for(let p=0;p<passes;p++){
let any=false;const n=Float32Array.from(o);
for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++){
const k=j*g.nx+i;if(o[k]===o[k])continue;
let s=0,c=0;
for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const a=i+di,b=j+dj;if(a<0||b<0||a>=g.nx||b>=g.ny)continue;const x=o[b*g.nx+a];if(x===x){s+=x;c++}}
if(c)n[k]=s/c;else any=true}
o.set(n);if(!any)break}
return o}
export function mix(a:Float32Array,b:Float32Array,w:number):Float32Array{
const o=new Float32Array(a.length);
for(let i=0;i<a.length;i++)o[i]=a[i]*(1-w)+b[i]*w;
return o}
export const merc=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
export const invMerc=(y:number)=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
