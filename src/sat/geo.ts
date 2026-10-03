export const TS=256;
export const HIM_LON=140.7;
export const LIMB=0.17;
export const FADE=0.32;
export const WIDE={w:60,s:-12,e:180,n:72};
export interface TileRng{z:number;x0:number;y0:number;x1:number;y1:number}
export interface Box{w:number;s:number;e:number;n:number}
export const lonToX=(lon:number,z:number)=>(lon+180)/360*2**z;
export const latToY=(lat:number,z:number)=>{const r=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;return(1-Math.asinh(Math.tan(r))/Math.PI)/2*2**z};
export const xToLon=(x:number,z:number)=>x/2**z*360-180;
export const yToLat=(y:number,z:number)=>Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI;
export const ppdOf=(z:number)=>TS*2**z/360;
export function tileRange(b:Box,zoom:number,maxzoom:number,cap:number):TileRng{
let z=Math.min(maxzoom,Math.max(1,Math.round(zoom)));
for(;;){
const m=2**z-1,x0=Math.max(0,Math.min(m,Math.floor(lonToX(b.w,z)))),x1=Math.max(0,Math.min(m,Math.floor(lonToX(b.e,z))));
const y0=Math.max(0,Math.min(m,Math.floor(latToY(b.n,z)))),y1=Math.max(0,Math.min(m,Math.floor(latToY(b.s,z))));
if((x1-x0+1)*(y1-y0+1)<=cap||z<=1)return{z,x0,y0,x1,y1};
z--}}
export const wideRange=(z:number,maxzoom:number):TileRng=>tileRange(WIDE,z,maxzoom,400);
export function padBox(b:Box,f:number):Box{const dx=(b.e-b.w)*f,dy=(b.n-b.s)*f;return{w:Math.max(-180,b.w-dx),e:Math.min(180,b.e+dx),s:Math.max(-85,b.s-dy),n:Math.min(85,b.n+dy)}}
export function boxOf(r:TileRng):Box{return{w:xToLon(r.x0,r.z),e:xToLon(r.x1+1,r.z),n:yToLat(r.y0,r.z),s:yToLat(r.y1+1,r.z)}}
export const inside=(a:Box,b:Box)=>a.w<=b.w&&a.e>=b.e&&a.s<=b.s&&a.n>=b.n;
export function diskArrays(r:TileRng){
const w=(r.x1-r.x0+1)*TS,h=(r.y1-r.y0+1)*TS,row=new Float32Array(h),col=new Float32Array(w);
for(let y=0;y<h;y++)row[y]=Math.cos(yToLat(r.y0+(y+0.5)/TS,r.z)*Math.PI/180);
for(let x=0;x<w;x++)col[x]=Math.cos((xToLon(r.x0+(x+0.5)/TS,r.z)-HIM_LON)*Math.PI/180);
return{row,col}}
export const diskVis=(c:number)=>c<=LIMB?0:c>=FADE?1:(c-LIMB)/(FADE-LIMB);
