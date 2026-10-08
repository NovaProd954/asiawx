export type Stop=[number,number,number,number,number];
export interface FDef{k:string;src:string;label:string;sub:string;unit:string;vmin:number;vmax:number;ticks:number[];dec:number;lo?:number;hi?:number;interp:'lin'|'near'|'sum24';stops:(dark:boolean)=>Stop[];contour?:{step:number;major:number};hl?:boolean}
const S=(v:number,c:string,a:number):Stop=>[v,parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16),a];
export const FDEFS:FDef[]=[
{k:'temp',src:'temperature_2m',label:'Temperature',sub:'2 m air temperature',unit:'\u00b0C',vmin:-20,vmax:46,ticks:[-20,0,10,20,30,40],dec:1,interp:'lin',contour:{step:4,major:20},
stops:()=>[S(-20,'#6a3fa8',.8),S(-10,'#3f5fd0',.8),S(0,'#3fa0e6',.8),S(10,'#3fc8a8',.8),S(18,'#86d65a',.8),S(25,'#f2e046',.82),S(30,'#f8a838',.84),S(35,'#ee6430',.86),S(40,'#c82a30',.88),S(46,'#7e1646',.9)]},
{k:'rain3',src:'precip3',label:'Rain, 3 h',sub:'Accumulation over the 3 hours to the model step',unit:'mm',vmin:0,vmax:50,ticks:[1,3,6,12,25,50],dec:1,lo:0,interp:'near',
stops:()=>[S(.1,'#78beff',0),S(.4,'#78beff',.45),S(1,'#3c8cff',.66),S(3,'#28c878',.74),S(6,'#fae13c',.8),S(12,'#fa8c28',.85),S(25,'#e63232',.88),S(50,'#c828c8',.9)]},
{k:'rain24',src:'precip3',label:'Rain, 24 h',sub:'Total over the next 24 hours of the timeline',unit:'mm',vmin:0,vmax:200,ticks:[2,5,10,25,50,100,200],dec:0,lo:0,interp:'sum24',
stops:()=>[S(.5,'#78beff',0),S(2,'#78beff',.5),S(5,'#3c8cff',.66),S(10,'#28c878',.72),S(25,'#fae13c',.78),S(50,'#fa8c28',.84),S(100,'#e63232',.88),S(200,'#c828c8',.9)]},
{k:'cloud',src:'cloud_cover',label:'Cloud cover',sub:'Total cloud cover',unit:'%',vmin:0,vmax:100,ticks:[0,25,50,75,100],dec:0,lo:0,hi:100,interp:'lin',
stops:d=>d?[[0,236,243,252,0],[20,236,243,252,.05],[50,236,243,252,.4],[80,236,243,252,.75],[100,246,250,255,.9]]:[[0,90,106,128,0],[20,90,106,128,.06],[50,90,106,128,.4],[80,90,106,128,.7],[100,70,86,108,.85]]},
{k:'pres',src:'pressure_msl',label:'Pressure',sub:'Mean sea level pressure with isobars',unit:'hPa',vmin:980,vmax:1040,ticks:[980,990,1000,1010,1020,1030,1040],dec:1,interp:'lin',contour:{step:4,major:20},hl:true,
stops:()=>[S(980,'#7a3ca8',.5),S(990,'#3c64d2',.46),S(1000,'#3ca8dc',.42),S(1010,'#6cd2a0',.36),S(1020,'#e6dc6e',.4),S(1030,'#f0a850',.46),S(1040,'#dc5a46',.52)]},
{k:'gust',src:'wind_gusts_10m',label:'Wind gusts',sub:'10 m wind gusts',unit:'m/s',vmin:0,vmax:40,ticks:[0,10,20,30,40],dec:1,lo:0,interp:'lin',
stops:()=>[S(0,'#64c8ff',0),S(5,'#64c8ff',.1),S(10,'#50dcbe',.4),S(15,'#8ce65a',.55),S(20,'#fae146',.66),S(25,'#fa9632',.76),S(32,'#f04650',.85),S(40,'#aa1e6e',.9)]},
{k:'rh',src:'relative_humidity_2m',label:'Humidity',sub:'2 m relative humidity',unit:'%',vmin:0,vmax:100,ticks:[0,20,40,60,80,100],dec:0,lo:0,hi:100,interp:'lin',
stops:()=>[S(0,'#b4783c',.75),S(20,'#be823c',.68),S(40,'#dcc86e',.5),S(60,'#6ebe8c',.45),S(80,'#3ca0c8',.62),S(100,'#2858c8',.8)]},
{k:'cape',src:'cape',label:'Convective energy',sub:'CAPE, potential for thunderstorms',unit:'J/kg',vmin:0,vmax:4000,ticks:[250,500,1000,2000,3500],dec:0,lo:0,interp:'lin',
stops:()=>[S(100,'#faeb78',0),S(250,'#faeb78',.45),S(500,'#fac846',.6),S(1000,'#fa8c32',.72),S(2000,'#eb463c',.82),S(3500,'#be2896',.9),S(4000,'#7814a0',.92)]}];
export const fdef=(k:string|null)=>FDEFS.find(d=>d.k===k)??null;
export function makeLut(stops:Stop[],vmin:number,vmax:number,n=4096):Uint8ClampedArray{
const o=new Uint8ClampedArray(n*4);
for(let i=0;i<n;i++){
const v=vmin+(vmax-vmin)*i/(n-1);
let a=stops[0],b=stops[stops.length-1];
if(v<=stops[0][0]){b=a}else if(v>=b[0]){a=b}else{for(let k=1;k<stops.length;k++)if(v<=stops[k][0]){a=stops[k-1];b=stops[k];break}}
const t=b[0]===a[0]?0:(v-a[0])/(b[0]-a[0]);
for(let c=0;c<3;c++)o[i*4+c]=a[c+1]+(b[c+1]-a[c+1])*t;
o[i*4+3]=(a[4]+(b[4]-a[4])*t)*255}
return o}
export const neutralRamp=(dark:boolean):[number,string][]=>dark?[[0,'#ffffff'],[25,'#ffffff']]:[[0,'#16222d'],[25,'#16222d']];
export function legendPos(d:FDef,v:number,dark:boolean):number{
const st=d.stops(dark),n=st.length-1;
if(v<=st[0][0])return 0;
if(v>=st[n][0])return 100;
for(let k=1;k<=n;k++)if(v<=st[k][0])return((k-1)+(v-st[k-1][0])/(st[k][0]-st[k-1][0]))/n*100;
return 100}
export function legendCss(d:FDef,dark:boolean):string{
const st=d.stops(dark),n=st.length-1;
return`linear-gradient(to right,${st.map((s,k)=>`rgba(${s[1]},${s[2]},${s[3]},${s[4]}) ${(k/n*100).toFixed(1)}%`).join(',')})`}
