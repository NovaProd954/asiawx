export interface Circle{lat:number;lon:number;r:number;partial:boolean}
export interface Fix{h:number;t:number;lat:number;lon:number;prob:number|null;pressure:number|null;windKt:number|null;windMs:number|null;gustKt:number|null;gustMs:number|null;cat:string|null;scale:string|null;intensity:string|null;storm:Circle[]}
export interface Gdacs{id:number;name:string;lat:number;lon:number;alert:string;score:number;from:number;to:number;modified:number;agency:string;severity:string;country:string;report:string}
export interface Storm{id:string;number:number;year:number;nameEn:string;nameJp:string;cat:string;catName:string;issue:number|null;now:Fix|null;fc:Fix[];gale:Circle[];past:[number,number][];pre:[number,number][];speedKmh:number|null;speedKt:number|null;course:string|null;location:string|null;gdacs:Gdacs|null;notes:string[]}
export interface Warn{key:string;name:string;code:string;action:string;issued:number|null;updated:number|null;tc:boolean}
export interface SrcStat{id:string;name:string;ok:boolean;msg:string;ms:number|null;updated:number|null}
export interface TcPayload{fetched:number;storms:Storm[];gdacsOnly:Gdacs[];warnings:Warn[];sources:SrcStat[]}
export interface ListEntry{tropicalCyclone:string;typhoonNumber:string;category:string;issue:string}

const D=Math.PI/180;
export function hav(a1:number,o1:number,a2:number,o2:number):number{
const dl=(a2-a1)*D,dn=(o2-o1)*D,h=Math.sin(dl/2)**2+Math.cos(a1*D)*Math.cos(a2*D)*Math.sin(dn/2)**2;
return 12742*Math.asin(Math.min(1,Math.sqrt(h)))}
export function slerp(a:[number,number],b:[number,number],f:number):[number,number]{
const l1=a[0]*D,n1=a[1]*D,l2=b[0]*D,n2=b[1]*D;
const d=2*Math.asin(Math.min(1,Math.sqrt(Math.sin((l2-l1)/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin((n2-n1)/2)**2)));
if(d<1e-9)return[a[0],a[1]];
const A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
const x=A*Math.cos(l1)*Math.cos(n1)+B*Math.cos(l2)*Math.cos(n2),y=A*Math.cos(l1)*Math.sin(n1)+B*Math.cos(l2)*Math.sin(n2),z=A*Math.sin(l1)+B*Math.sin(l2);
return[Math.atan2(z,Math.hypot(x,y))/D,Math.atan2(y,x)/D]}

const num=(v:unknown):number|null=>{
if(typeof v==='number')return Number.isFinite(v)?v:null;
if(typeof v==='string'){const m=v.trim().match(/^-?\d+(?:\.\d+)?/);return m?Number(m[0]):null}
return null};
const str=(v:unknown):string|null=>typeof v==='string'&&v.trim()!==''&&v.trim()!=='-'?v.trim():null;
const ts=(v:unknown):number|null=>{if(typeof v!=='string')return null;const t=Date.parse(v);return Number.isFinite(t)?Math.round(t/1000):null};
const utc=(s:unknown)=>typeof s==='string'?(/(Z|[+-]\d\d:\d\d)$/.test(s)?s:s+'Z'):null;
const pt=(v:unknown):[number,number]|null=>{if(!Array.isArray(v)||v.length<2)return null;const a=num(v[0]),b=num(v[1]);return a!=null&&b!=null&&Math.abs(a)<=90&&Math.abs(b)<=360?[a,b]:null};
const pts=(v:unknown):[number,number][]=>Array.isArray(v)?v.map(pt).filter((x):x is [number,number]=>!!x):[];
const rec=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};

export function circles(a:unknown):Circle[]{
const out:Circle[]=[];if(!a||typeof a!=='object')return out;
const o=a as Record<string,unknown>;
const add=(c:unknown,r:unknown,ang?:unknown)=>{
const p=pt(c),rr=num(r);if(!p||rr==null||rr<=0||rr>4e6)return;
const full=!Array.isArray(ang)||ang.length<2||Math.abs((num(ang[1])??0)-(num(ang[0])??0))>=359;
out.push({lat:p[0],lon:p[1],r:rr,partial:!full})};
if(Array.isArray(o.arc))for(const e of o.arc)if(Array.isArray(e))add(e[0],e[1],e[2]);
if(o.center!==undefined)add(o.center,o.radius);
return out}

export const CATS:Record<string,string>={TD:'Tropical depression',TS:'Tropical storm',STS:'Severe tropical storm',TY:'Typhoon',EX:'Extratropical cyclone',L:'Low pressure area',LOW:'Low pressure area'};
const SCALE:Record<string,string>={'大型':'Large','超大型':'Very large'};
const INTENS:Record<string,string>={'強い':'Strong','非常に強い':'Very strong','猛烈な':'Violent'};
const COURSE:Record<string,string>={'北':'N','北北東':'NNE','北東':'NE','東北東':'ENE','東':'E','東南東':'ESE','南東':'SE','南南東':'SSE','南':'S','南南西':'SSW','南西':'SW','西南西':'WSW','西':'W','西北西':'WNW','北西':'NW','北北西':'NNW','ほとんど停滞':'Almost stationary'};
const en=(m:Record<string,string>,v:unknown)=>{const s=str(v);return s?(m[s]??s):null};

export function normJma(e:ListEntry,fc:unknown,sp:unknown):Storm{
const notes:string[]=[],tn=String(e?.typhoonNumber??'');
const spec=new Map<number,Record<string,any>>();
if(Array.isArray(sp))for(const r of sp)if(r&&typeof r.advancedHours==='number')spec.set(r.advancedHours,r);
else if(sp!==null&&!Array.isArray(sp))notes.push('specifications.json had an unexpected shape');
const fix=(r:Record<string,any>,h:number):Fix|null=>{
const c=pt(r.center),t=ts(r.validtime?.UTC);if(!c||t==null)return null;
const s=rec(spec.get(h)),w=rec(s.maximumWind),su=rec(w.sustained),gu=rec(w.gust);
return{h,t,lat:c[0],lon:c[1],prob:num(r.probabilityCircle?.radius),pressure:num(s.pressure),windKt:num(su.kt),windMs:num(su['m/s']),gustKt:num(gu.kt),gustMs:num(gu['m/s']),cat:str(rec(s.category).en),scale:en(SCALE,s.scale),intensity:en(INTENS,s.intensity),storm:circles(r.stormWarningArea)}};
let nameEn='',nameJp='',now:Fix|null=null,gale:Circle[]=[],past:[number,number][]=[],pre:[number,number][]=[];
const fcs:Fix[]=[];let badWarn=false,partial=false;
if(Array.isArray(fc)){
for(const r0 of fc){
const r=rec(r0);
if(r.part==='title'){nameEn=str(rec(r.name).en)??'';nameJp=str(rec(r.name).jp)??'';continue}
if(typeof r.advancedHours!=='number')continue;
const f=fix(r,r.advancedHours);if(!f){notes.push(`Dropped a fix at +${r.advancedHours} h with no valid position or time`);continue}
if(r.stormWarningArea&&!f.storm.length)badWarn=true;
if(f.storm.some(c=>c.partial))partial=true;
if(r.advancedHours===0){now=f;gale=circles(r.galeWarningArea);if(r.galeWarningArea&&!gale.length)badWarn=true;past=pts(r.track?.typhoon);pre=pts(r.track?.preTyphoon)}
else fcs.push(f)}
}else notes.push('No forecast data was available for this system');
fcs.sort((a,b)=>a.h-b.h);
if(Array.isArray(fc)&&!now)notes.push('No current analysis fix in forecast.json');
if(badWarn)notes.push('A warning area was present in the feed but its geometry was not recognised, so it is not drawn');
if(partial)notes.push('Some warning-area entries are sectors. Sector limits are not applied, so they are drawn as full circles with lighter fill');
const s0=rec(spec.get(0)),sp0=rec(s0.speed);
const cat=String(e?.category??'').toUpperCase();
return{id:String(e?.tropicalCyclone??''),number:num(tn.slice(2))??0,year:2000+(num(tn.slice(0,2))??0),nameEn,nameJp,cat,catName:CATS[cat]??cat,issue:ts(e?.issue),now,fc:fcs,gale,past,pre,speedKmh:num(sp0['km/h']),speedKt:num(sp0.kt),course:en(COURSE,s0.course),location:str(s0.location),gdacs:null,notes}}

export function normGdacs(j:unknown,now:number):Gdacs[]{
const fs=(j as {features?:unknown})?.features;
if(!Array.isArray(fs))throw new Error('unexpected response shape');
const out:Gdacs[]=[];
for(const f of fs){
const p=rec(rec(f).properties),c=rec(rec(f).geometry).coordinates;
if(p.eventtype!=='TC'||String(p.iscurrent)!=='true'||!Array.isArray(c))continue;
const lon=num(c[0]),lat=num(c[1]),to=ts(utc(p.todate)),from=ts(utc(p.fromdate)),mod=ts(utc(p.datemodified)),id=num(p.eventid);
if(lon==null||lat==null||to==null||id==null)continue;
if(now-to>12*3600)continue;
if(lon<25||lon>180||lat<-12||lat>80)continue;
const rp=str(rec(p.url).report);
out.push({id,name:str(p.eventname)??str(p.name)??'Unnamed',lat,lon,alert:str(p.episodealertlevel)??str(p.alertlevel)??'Unknown',score:num(p.episodealertscore)??0,from:from??to,to,modified:mod??to,agency:str(p.source)??'Unknown',severity:str(rec(p.severitydata).severitytext)??'',country:str(p.country)??'',report:rp&&rp.startsWith('https://www.gdacs.org/')?rp:''})}
return out.sort((a,b)=>b.modified-a.modified)}

const nk=(s:string)=>s.toLowerCase().replace(/-\d\d$/,'').replace(/[^a-z]/g,'');
export function matchGdacs(ss:Storm[],gs:Gdacs[]):Gdacs[]{
const used=new Set<number>();
for(const s of ss){
const k=nk(s.nameEn);
let g=k?gs.find(x=>!used.has(x.id)&&nk(x.name)===k):undefined;
if(!g&&s.now){let b=Infinity;for(const x of gs){if(used.has(x.id))continue;const d=hav(s.now.lat,s.now.lon,x.lat,x.lon);if(d<300&&d<b){b=d;g=x}}}
if(g){used.add(g.id);s.gdacs=g}}
return gs.filter(x=>!used.has(x.id))}

export function normHko(j:unknown):Warn[]{
if(!j||typeof j!=='object'||Array.isArray(j))throw new Error('unexpected response shape');
const out:Warn[]=[];
for(const[k,v]of Object.entries(j as Record<string,unknown>)){
if(!v||typeof v!=='object')continue;
const o=v as Record<string,unknown>,code=String(o.code??k),act=String(o.actionCode??'');
if(act==='CANCEL')continue;
out.push({key:k,name:String(o.name??k),code,action:act,issued:ts(o.issueTime),updated:ts(o.updateTime),tc:k==='WTCSGNL'||/^TC/.test(code)})}
return out}
