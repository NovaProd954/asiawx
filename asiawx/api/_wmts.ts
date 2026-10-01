export interface LayerDef{key:string;id:string;name:string;kind:'ir'|'vis'|'rgb'}
export interface LayerInfo{key:string;id:string;name:string;kind:string;tms:string;maxzoom:number;format:string;template:string;times:number[];step:number}
export const LAYERS:LayerDef[]=[
{key:'ir',id:'Himawari_AHI_Band13_Clean_Infrared',name:'Clean infrared, Band 13 (10.4 um)',kind:'ir'},
{key:'vis',id:'Himawari_AHI_Band3_Red_Visible_1km',name:'Visible red, Band 3 (0.64 um)',kind:'vis'},
{key:'airmass',id:'Himawari_AHI_Air_Mass',name:'Air Mass RGB',kind:'rgb'}];
const attrs=(s:string)=>{const o:Record<string,string>={};for(const m of s.matchAll(/([\w:]+)="([^"]*)"/g))o[m[1]]=m[2];return o};
export function parseDuration(s:string):number{
const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
if(!m)return 0;
return(+(m[1]||0))*86400+(+(m[2]||0))*3600+(+(m[3]||0))*60+(+(m[4]||0))}
const ts=(s:string)=>{const t=Date.parse(s);return Number.isFinite(t)?Math.floor(t/1000):NaN};
export function latestFrames(values:string[],n:number):{times:number[];step:number}{
const ranges:{a:number;b:number;s:number}[]=[],singles:number[]=[];
for(const raw of values)for(const v of raw.split(',')){
const t=v.trim();if(!t)continue;
const p=t.split('/');
if(p.length>=3){const a=ts(p[0]),b=ts(p[1]),s=parseDuration(p[2]);if(Number.isFinite(a)&&Number.isFinite(b)&&s>0&&b>=a)ranges.push({a,b,s})}
else if(p.length===1){const x=ts(p[0]);if(Number.isFinite(x))singles.push(x)}}
const maxR=ranges.reduce((m,r)=>Math.max(m,r.b),-Infinity),maxS=singles.reduce((m,x)=>Math.max(m,x),-Infinity);
if(ranges.length&&maxR>=maxS){
const r=ranges.find(x=>x.b===maxR) as {a:number;b:number;s:number},out:number[]=[];
for(let k=n-1;k>=0;k--){const t=r.b-k*r.s;if(t>=r.a)out.push(t)}
return{times:out,step:r.s}}
const u=[...new Set(singles)].sort((x,y)=>x-y).slice(-n);
return{times:u,step:u.length>1?u[u.length-1]-u[u.length-2]:0}}
export function layerBlock(xml:string,id:string):string|null{
const tag=`<ows:Identifier>${id}</ows:Identifier>`;
let from=0;
for(;;){
const p=xml.indexOf(tag,from);if(p<0)return null;
const s=xml.lastIndexOf('<Layer',p),e=xml.indexOf('</Layer>',p);
if(s>=0&&e>s&&xml.slice(s,p).indexOf('</Layer>')<0)return xml.slice(s,e+8);
from=p+tag.length}}
export function parseLayer(xml:string,def:LayerDef,n:number):LayerInfo|null{
const b=layerBlock(xml,def.id);if(!b)return null;
const tms=/<TileMatrixSet>([^<]+)<\/TileMatrixSet>/.exec(b)?.[1]?.trim();
if(!tms)return null;
let template='',format='';
for(const m of b.matchAll(/<ResourceURL\s+([^>]*?)\/?>/g)){
const a=attrs(m[1]);
if((a.resourceType||'tile')==='tile'&&a.template){template=a.template;format=a.format||'';break}}
if(!template)return null;
if(!format)format=/<Format>([^<]+)<\/Format>/.exec(b)?.[1]?.trim()||'image/png';
const dim=[...b.matchAll(/<Dimension>([\s\S]*?)<\/Dimension>/g)].find(d=>/<ows:Identifier>\s*time\s*<\/ows:Identifier>/i.test(d[1]));
if(!dim)return null;
const values=[...dim[1].matchAll(/<Value>([^<]+)<\/Value>/g)].map(m=>m[1]);
const def2=/<Default>([^<]+)<\/Default>/.exec(dim[1])?.[1];
if(def2&&!values.length)values.push(def2);
const {times,step}=latestFrames(values,n);
if(!times.length)return null;
const lv=/Level(\d+)/.exec(tms);
return{key:def.key,id:def.id,name:def.name,kind:def.kind,tms,maxzoom:lv?+lv[1]:6,format,template:template.replace('{TileMatrixSet}',tms),times,step}}
export function buildTileUrl(template:string,time:number):string{
const iso=new Date(time*1000).toISOString().replace(/\.\d{3}Z$/,'Z');
return template.replace(/\{Time\}/gi,iso).replace('{TileMatrix}','{z}').replace('{TileRow}','{y}').replace('{TileCol}','{x}')}
