import {hav,slerp,type Storm,type Fix} from '../../api/_tc';
const R=6371008.8,D=Math.PI/180;
export function dest(lat:number,lon:number,brg:number,d:number):[number,number]{
const a=d/R,b=brg*D,p=lat*D,l=lon*D;
const p2=Math.asin(Math.sin(p)*Math.cos(a)+Math.cos(p)*Math.sin(a)*Math.cos(b));
const l2=l+Math.atan2(Math.sin(b)*Math.sin(a)*Math.cos(p),Math.cos(a)-Math.sin(p)*Math.sin(p2));
return[((l2/D+540)%360)-180,p2/D]}
export function ring(lat:number,lon:number,r:number,n=72):[number,number][]{const o:[number,number][]=[];for(let i=0;i<=n;i++)o.push(dest(lat,lon,i*360/n,r));return o}
export const fixes=(s:Storm):Fix[]=>s.now?[s.now,...s.fc]:s.fc;
export function track(s:Storm):[number,number][]{
const f=fixes(s),o:[number,number][]=[];
for(let i=0;i<f.length;i++){
if(i===0){o.push([f[0].lon,f[0].lat]);continue}
const a=f[i-1],b=f[i];
for(let k=1;k<=8;k++){const p=slerp([a.lat,a.lon],[b.lat,b.lon],k/8);o.push([p[1],p[0]])}}
return o}
export function posAt(s:Storm,t:number):{lat:number;lon:number}|null{
const f=fixes(s);
if(f.length<2||t<f[0].t||t>f[f.length-1].t)return null;
for(let i=0;i<f.length-1;i++){
const a=f[i],b=f[i+1];
if(t>=a.t&&t<=b.t){const k=b.t===a.t?0:(t-a.t)/(b.t-a.t),p=slerp([a.lat,a.lon],[b.lat,b.lon],k);return{lat:p[0],lon:p[1]}}}
return null}
export interface Approach{nowKm:number|null;minKm:number;minT:number;inCircle:{h:number;km:number}|null;inWarn:number|null}
export function approach(s:Storm,lat:number,lon:number):Approach|null{
const f=fixes(s);if(!f.length)return null;
let minKm=Infinity,minT=f[0].t;
for(let t=f[0].t;t<=f[f.length-1].t;t+=1800){
const p=posAt(s,t)??{lat:f[0].lat,lon:f[0].lon},d=hav(lat,lon,p.lat,p.lon);
if(d<minKm){minKm=d;minT=t}}
let inC:Approach['inCircle']=null,inW:number|null=null;
for(const x of s.fc){
if(inC==null&&x.prob!=null){const d=hav(lat,lon,x.lat,x.lon);if(d<=x.prob/1000)inC={h:x.h,km:d}}
if(inW==null&&x.storm.some(c=>hav(lat,lon,c.lat,c.lon)<=c.r/1000))inW=x.h}
return{nowKm:s.now?hav(lat,lon,s.now.lat,s.now.lon):null,minKm,minT,inCircle:inC,inWarn:inW}}
export const brg=(a1:number,o1:number,a2:number,o2:number)=>{const y=Math.sin((o2-o1)*D)*Math.cos(a2*D),x=Math.cos(a1*D)*Math.sin(a2*D)-Math.sin(a1*D)*Math.cos(a2*D)*Math.cos((o2-o1)*D);return(Math.atan2(y,x)/D+360)%360};
