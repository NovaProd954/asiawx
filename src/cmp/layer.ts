import type {Map as GLMap} from 'maplibre-gl';
import {sampleInto,type Field} from '../lib/wind';
export const DMAX=8,DEAD=0.4;
const POS=[255,122,89],NEG=[74,163,255];
export function diffPx(d:number):[number,number,number,number]{
const m=Math.abs(d);
if(!(m>=DEAD))return[0,0,0,0];
const c=d>0?POS:NEG,t=Math.min(1,(m-DEAD)/(DMAX-DEAD));
return[c[0],c[1],c[2],Math.round(Math.pow(t,0.7)*0.8*255)]}
export function nearestIdx(times:number[],t:number):number{
let k=0,b=Infinity;
for(let i=0;i<times.length;i++){const e=Math.abs(times[i]-t);if(e<b){b=e;k=i}}
return k}
export function speedDiff(a:Field,b:Field,lon:number,lat:number,oa=new Float32Array(2),ob=new Float32Array(2)):{a:number;b:number}|null{
if(!sampleInto(a,lon,lat,oa)||!sampleInto(b,lon,lat,ob))return null;
return{a:Math.hypot(oa[0],oa[1]),b:Math.hypot(ob[0],ob[1])}}
export function drawDiff(map:GLMap,cv:HTMLCanvasElement,a:Field|null,b:Field|null,step=6){
const el=map.getContainer(),cw=Math.max(1,Math.ceil(el.clientWidth/step)),ch=Math.max(1,Math.ceil(el.clientHeight/step));
if(cv.width!==cw)cv.width=cw;
if(cv.height!==ch)cv.height=ch;
const ctx=cv.getContext('2d') as CanvasRenderingContext2D;
if(!a||!b){ctx.clearRect(0,0,cw,ch);return}
const img=ctx.createImageData(cw,ch),oa=new Float32Array(2),ob=new Float32Array(2);
for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
const ll=map.unproject([x*step+step/2,y*step+step/2]),r=speedDiff(a,b,ll.lng,ll.lat,oa,ob);
if(!r)continue;
const p=diffPx(r.a-r.b),o=(y*cw+x)*4;
img.data[o]=p[0];img.data[o+1]=p[1];img.data[o+2]=p[2];img.data[o+3]=p[3]}
ctx.putImageData(img,0,0)}
export const diffLegend=(a:string,b:string)=>`<div class="lg-bar" style="background:linear-gradient(to right,rgb(74,163,255),rgba(74,163,255,.15) 45%,rgba(255,255,255,0) 50%,rgba(255,122,89,.15) 55%,rgb(255,122,89))"></div><div class="lg-ticks"><span>\u2212${DMAX}</span><span>0</span><span>+${DMAX} m/s</span></div><p class="note">Orange: ${a} is faster. Blue: ${b} is faster. Gaps under ${DEAD} m/s are left clear.</p>`;
