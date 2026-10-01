import type {Map as GLMap} from 'maplibre-gl';
import {RAMP} from '../config';
import {sampleInto,rampColor,type Field} from '../lib/wind';
export type Quality='low'|'medium'|'high';
const Q={low:{div:1400,cap:1800,fps:30,dpr:1},medium:{div:800,cap:4500,fps:45,dpr:1.5},high:{div:450,cap:9000,fps:60,dpr:2}};
const NB=8,VMAX=25,RAD=Math.PI/180;
export class WindLayer{
private ctx:CanvasRenderingContext2D;private field:Field|null=null;private q:Quality='medium';
private lon=new Float32Array(0);private lat=new Float32Array(0);private px=new Float32Array(0);private py=new Float32Array(0);
private age=new Uint16Array(0);private life=new Uint16Array(0);
private w=0;private h=0;private moving=false;private running=false;private raf=0;private last=0;
private out=new Float32Array(2);private cols:string[];private seg:Float32Array[]=[];private cnt=new Int32Array(NB);
constructor(private map:GLMap,private canvas:HTMLCanvasElement){
this.ctx=canvas.getContext('2d') as CanvasRenderingContext2D;
this.cols=Array.from({length:NB},(_,i)=>rampColor((i+0.5)*VMAX/NB,RAMP));
map.on('movestart',()=>{this.moving=true});map.on('moveend',()=>{this.moving=false});
map.on('resize',()=>this.resize());this.resize()}
setField(f:Field|null){this.field=f}
setQuality(q:Quality){this.q=q;this.resize()}
setOpacity(o:number){this.canvas.style.opacity=String(o)}
resize(){
const c=Q[this.q],el=this.map.getContainer(),w=el.clientWidth,h=el.clientHeight;
this.w=w;this.h=h;this.canvas.width=Math.round(w*c.dpr);this.canvas.height=Math.round(h*c.dpr);
this.ctx.setTransform(c.dpr,0,0,c.dpr,0,0);
const n=Math.min(c.cap,Math.max(300,Math.floor(w*h/c.div)));
this.lon=new Float32Array(n);this.lat=new Float32Array(n);this.px=new Float32Array(n);this.py=new Float32Array(n);
this.age=new Uint16Array(n).fill(65535);this.life=new Uint16Array(n);
this.seg=Array.from({length:NB},()=>new Float32Array(n*4));
for(let i=0;i<n;i++){this.seed(i);this.age[i]=Math.floor(Math.random()*this.life[i])}}
get count(){return this.lon.length}
private seed(i:number){
for(let t=0;t<6;t++){
const x=Math.random()*this.w,y=Math.random()*this.h,ll=this.map.unproject([x,y]);
if(this.field&&sampleInto(this.field,ll.lng,ll.lat,this.out)){this.lon[i]=ll.lng;this.lat[i]=ll.lat;this.px[i]=x;this.py[i]=y;this.age[i]=0;this.life[i]=40+Math.floor(Math.random()*80);return}}
this.age[i]=65535;this.life[i]=1}
start(){if(this.running)return;this.running=true;this.raf=requestAnimationFrame(this.loop)}
stop(){this.running=false;cancelAnimationFrame(this.raf);this.ctx.clearRect(0,0,this.w,this.h)}
private loop=(t:number)=>{
if(!this.running)return;
this.raf=requestAnimationFrame(this.loop);
if(document.hidden||t-this.last<1000/Q[this.q].fps-2)return;
this.last=t;this.frame()};
private frame(){
const ctx=this.ctx,f=this.field;
if(!f){ctx.clearRect(0,0,this.w,this.h);return}
ctx.globalCompositeOperation='destination-out';ctx.fillStyle=`rgba(0,0,0,${this.moving?1:0.08})`;ctx.fillRect(0,0,this.w,this.h);
ctx.globalCompositeOperation='source-over';
const degPx=360/(512*2**this.map.getZoom()),k=0.28,n=this.lon.length,o=this.out;
this.cnt.fill(0);
for(let i=0;i<n;i++){
if(this.age[i]>=this.life[i]){this.seed(i);continue}
this.age[i]++;
if(!sampleInto(f,this.lon[i],this.lat[i],o)){this.age[i]=this.life[i];continue}
const sp=Math.hypot(o[0],o[1]);
this.lon[i]+=o[0]*k*degPx;this.lat[i]+=o[1]*k*degPx*Math.cos(this.lat[i]*RAD);
const p=this.map.project([this.lon[i],this.lat[i]]),b=Math.min(NB-1,Math.floor(sp/(VMAX/NB))),s=this.seg[b],c=this.cnt[b]*4;
s[c]=this.px[i];s[c+1]=this.py[i];s[c+2]=p.x;s[c+3]=p.y;this.cnt[b]++;
this.px[i]=p.x;this.py[i]=p.y}
ctx.lineWidth=1.3;ctx.lineCap='round';
for(let b=0;b<NB;b++){const s=this.seg[b],c=this.cnt[b]*4;if(!c)continue;ctx.strokeStyle=this.cols[b];ctx.beginPath();for(let j=0;j<c;j+=4){ctx.moveTo(s[j],s[j+1]);ctx.lineTo(s[j+2],s[j+3])}ctx.stroke()}}}
