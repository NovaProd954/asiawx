import {cr,merc,invMerc,type G2} from './sample';
export interface Extent{lon0:number;lon1:number;lat0:number;lat1:number}
export const extentOf=(g:G2):Extent=>({lon0:g.lon0,lon1:g.lon0+(g.nx-1)*g.d,lat0:g.lat0,lat1:g.lat0+(g.ny-1)*g.d});
export function rasterSize(e:Extent,ppd=4):{w:number;h:number}{
const w=Math.round((e.lon1-e.lon0)*ppd),k=(merc(e.lat1)-merc(e.lat0))/((e.lon1-e.lon0)*Math.PI/180);
return{w,h:Math.round(w*k)}}
export function renderRaster(g:G2,v:ArrayLike<number>,lut:Uint8ClampedArray,vmin:number,vmax:number,w:number,h:number,lo?:number,hi?:number):Uint8ClampedArray{
const e=extentOf(g),out=new Uint8ClampedArray(w*h*4),yT=merc(e.lat1),yB=merc(e.lat0),n=lut.length/4,nx=g.nx,ny=g.ny;
const col=new Float64Array(nx),sc=(n-1)/(vmax-vmin);
for(let y=0;y<h;y++){
const lat=invMerc(yT-(y+.5)/h*(yT-yB)),fy=(lat-g.lat0)/g.d,j=Math.min(Math.max(0,Math.floor(fy)),ny-2),ty=fy-j;
for(let i=0;i<nx;i++){
const b=v[j*nx+i],c=v[(j+1)*nx+i];
if(b!==b||c!==c){col[i]=NaN;continue}
const a=j-1>=0?v[(j-1)*nx+i]:2*b-c,d=j+2<=ny-1?v[(j+2)*nx+i]:2*c-b;
col[i]=(a!==a||d!==d)?b*(1-ty)+c*ty:cr(a,b,c,d,ty)}
for(let x=0;x<w;x++){
const lon=e.lon0+(x+.5)/w*(e.lon1-e.lon0),fx=(lon-g.lon0)/g.d,i=Math.min(Math.max(0,Math.floor(fx)),nx-2),tx=fx-i;
const b=col[i],c=col[i+1];
if(b!==b||c!==c)continue;
const a=i-1>=0?col[i-1]:2*b-c,d=i+2<=nx-1?col[i+2]:2*c-b;
let val=(a!==a||d!==d)?b*(1-tx)+c*tx:cr(a,b,c,d,tx);
if(lo!==undefined&&val<lo)val=lo;
if(hi!==undefined&&val>hi)val=hi;
let k=Math.round((val-vmin)*sc);k=k<0?0:k>n-1?n-1:k;
const o=(y*w+x)*4,s=k*4;
out[o]=lut[s];out[o+1]=lut[s+1];out[o+2]=lut[s+2];out[o+3]=lut[s+3]}}
return out}
