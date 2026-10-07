import {hav,type Jt,type JtFix,type Quad,type Storm} from './_tc.js';
const QI:Record<string,number>={NORTHEAST:0,SOUTHEAST:1,SOUTHWEST:2,NORTHWEST:3};
function dtg(dd:number,hh:number,mm:number,ref:number):number{
const r=new Date(ref*1000);let best=0,bd=Infinity;
for(const dm of[-1,0,1]){const t=Date.UTC(r.getUTCFullYear(),r.getUTCMonth()+dm,dd,hh,mm)/1000,d=Math.abs(t-ref);if(d<bd&&new Date(t*1000).getUTCDate()===dd){bd=d;best=t}}
return best||ref}
export function parseJtwc(text:string,ref:number):Jt|null{
const hd=text.match(/(SUPER TYPHOON|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION|SUBTROPICAL STORM|TROPICAL CYCLONE)\s+(\d{2}[A-Z])\s*(?:\(([^)]*)\))?\s+WARNING\s+NR\s+(\d+)/i);
if(!hd)return null;
const is=text.match(/\bW[A-Z]{3}\d{2}\s+PGTW\s+(\d{2})(\d{2})(\d{2})/),issue=is?dtg(+is[1],+is[2],+is[3],ref):null,base=issue??ref;
const fixes:JtFix[]=[];let cur:JtFix|null=null,h=0,kt=0;
for(const raw of text.replace(/\r/g,'').split('\n')){
const l=raw.trim();
if(/^(REMARKS|NEXT WARNING|NNNN)/i.test(l)&&fixes.length)break;
let m=l.match(/^(\d+)\s+HRS,\s*VALID AT/i);
if(m){h=+m[1];kt=0;continue}
m=l.match(/^(\d{2})(\d{2})(\d{2})Z\s*---\s*(?:NEAR\s+)?(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/i);
if(m){cur={h,t:dtg(+m[1],+m[2],+m[3],base),lat:+m[4]*(m[5].toUpperCase()==='S'?-1:1),lon:+m[6]*(m[7].toUpperCase()==='W'?-1:1),windKt:null,gustKt:null,r34:null,r50:null,r64:null};fixes.push(cur);kt=0;h=0;continue}
if(!cur)continue;
m=l.match(/MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT(?:,\s*GUSTS\s*(\d+)\s*KT)?/i);
if(m){cur.windKt=+m[1];cur.gustKt=m[2]?+m[2]:null;kt=0;continue}
let rest=l;
m=l.match(/RADIUS OF\s+(\d{3})\s*KT WINDS\s*-?\s*(.*)$/i);
if(m){const k=+m[1];kt=k===34||k===50||k===64?k:0;rest=m[2]}
if(!kt)continue;
const re=/(\d+)\s*NM\s+(NORTHEAST|SOUTHEAST|SOUTHWEST|NORTHWEST)\s+QUADRANT/ig;
let q:RegExpExecArray|null;
while((q=re.exec(rest))){const key=`r${kt}` as 'r34'|'r50'|'r64';const a=(cur[key]??(cur[key]=[0,0,0,0])) as Quad;a[QI[q[2].toUpperCase()]]=+q[1]}}
for(const f of fixes)for(const k of['r34','r50','r64'] as const)if(f[k]&&f[k]!.every(v=>v===0))f[k]=null;
if(!fixes.length)return null;
return{id:hd[2].toUpperCase(),name:(hd[3]??'').trim().toUpperCase(),type:hd[1].toUpperCase(),nr:+hd[4],issue,fixes}}
export function matchJtwc(ss:Storm[],js:Jt[]):Jt[]{
const used=new Set<string>();
for(const s of ss){
if(!s.now)continue;
const nm=s.nameEn.toUpperCase();
let b:Jt|undefined=nm?js.find(j=>!used.has(j.id)&&j.name===nm&&hav(s.now!.lat,s.now!.lon,j.fixes[0].lat,j.fixes[0].lon)<600):undefined;
if(!b){let d0=Infinity;for(const j of js){if(used.has(j.id))continue;const d=hav(s.now.lat,s.now.lon,j.fixes[0].lat,j.fixes[0].lon);if(d<350&&d<d0){d0=d;b=j}}}
if(b){used.add(b.id);s.jt=b}}
return js.filter(j=>!used.has(j.id))}
export const jtwcLinks=(body:string):string[]=>[...new Set([...body.matchAll(/https?:\/\/[^\s"'<>]*\/products\/(?:wp\d{4}web\.txt)/gi)].map(m=>m[0].replace(/^http:/,'https:')))];
