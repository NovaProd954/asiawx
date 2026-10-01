export const toUV=(s:number,d:number):[number,number]=>{const r=d*Math.PI/180;return[-s*Math.sin(r),-s*Math.cos(r)]};
export const toSpeedDir=(u:number,v:number)=>({speed:Math.hypot(u,v),dir:(Math.atan2(-u,-v)*180/Math.PI+360)%360});
export const msToKt=(x:number)=>x*1.943844;
export const msToKmh=(x:number)=>x*3.6;
export interface Geom{lon0:number;lat0:number;d:number;nx:number;ny:number}
export interface Field{g:Geom;u:Float32Array;v:Float32Array}
export function sampleInto(f:Field,lon:number,lat:number,o:Float32Array):boolean{
const g=f.g,fx=(lon-g.lon0)/g.d,fy=(lat-g.lat0)/g.d;
if(!(fx>=0&&fy>=0&&fx<=g.nx-1&&fy<=g.ny-1))return false;
const i=Math.min(Math.floor(fx),g.nx-2),j=Math.min(Math.floor(fy),g.ny-2),tx=fx-i,ty=fy-j,a=j*g.nx+i,c=a+g.nx;
const ua=f.u[a],ub=f.u[a+1],uc=f.u[c],ud=f.u[c+1],va=f.v[a],vb=f.v[a+1],vc=f.v[c],vd=f.v[c+1];
const sum=ua+ub+uc+ud+va+vb+vc+vd;
if(sum!==sum)return false;
o[0]=(ua*(1-tx)+ub*tx)*(1-ty)+(uc*(1-tx)+ud*tx)*ty;
o[1]=(va*(1-tx)+vb*tx)*(1-ty)+(vc*(1-tx)+vd*tx)*ty;
return true}
const hex=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
export function rampColor(s:number,r:[number,string][]):string{
if(s<=r[0][0])return r[0][1];
for(let i=1;i<r.length;i++){if(s<=r[i][0]){const t=(s-r[i-1][0])/(r[i][0]-r[i-1][0]),a=hex(r[i-1][1]),b=hex(r[i][1]);return`rgb(${a.map((x,k)=>Math.round(x+(b[k]-x)*t)).join(',')})`}}
return r[r.length-1][1]}
