export interface Station{t:number|null;td:number|null;p:number|null;dp:number|null;cc:number|null;kt:number|null;dir:number|null;south:boolean}
export const oktas=(cc:number|null)=>cc==null?null:Math.max(0,Math.min(8,Math.round(cc/12.5)));
export function barbCount(kt:number){const r=Math.round(kt/5)*5,f=Math.floor(r/50),l=Math.floor((r-f*50)/10),h=(r-f*50-l*10)>=5?1:0;return{kt:r,flags:f,full:l,half:h,calm:r===0}}
const f1=(x:number)=>x.toFixed(1);
export function barbPath(kt:number,dir:number,south:boolean,cx:number,cy:number,r:number,len=46){
const b=barbCount(kt);if(b.calm)return'';
const a=dir*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),sg=south?-1:1,px=-dy*sg,py=dx*sg;
const sx=cx+dx*r,sy=cy+dy*r,ex=cx+dx*(r+len),ey=cy+dy*(r+len);
let d=`M${f1(sx)} ${f1(sy)}L${f1(ex)} ${f1(ey)}`,pos=0;
const at=(k:number)=>[ex-dx*k,ey-dy*k];
for(let i=0;i<b.flags;i++){const[ax,ay]=at(pos),[bx,by]=at(pos+7);d+=`M${f1(ax)} ${f1(ay)}L${f1(ax+px*15+dx*3)} ${f1(ay+py*15+dy*3)}L${f1(bx)} ${f1(by)}Z`;pos+=8}
if(b.flags)pos+=1;
for(let i=0;i<b.full;i++){const[ax,ay]=at(pos);d+=`M${f1(ax)} ${f1(ay)}L${f1(ax+px*15+dx*5)} ${f1(ay+py*15+dy*5)}`;pos+=5.5}
if(b.half){if(!b.full&&!b.flags)pos+=5.5;const[ax,ay]=at(pos);d+=`M${f1(ax)} ${f1(ay)}L${f1(ax+px*8+dx*2.5)} ${f1(ay+py*8+dy*2.5)}`}
return d}
function sky(n:number,cx:number,cy:number,r:number){
if(n===0)return'';
if(n===8)return`<circle cx="${cx}" cy="${cy}" r="${r}" class="st-f"/>`;
const q=(k:number)=>{const a=[[0,-1],[1,0],[0,1],[-1,0]],s=a[k%4],e=a[(k+1)%4];return`M${cx} ${cy}L${cx+s[0]*r} ${cy+s[1]*r}A${r} ${r} 0 0 1 ${cx+e[0]*r} ${cy+e[1]*r}Z`};
const line=`<path d="M${cx} ${cy-r}V${cy+r}" class="st-l"/>`;
if(n===1)return line;
const k=n===2||n===3?1:n===4||n===5?2:3;
let d='';for(let i=0;i<k;i++)d+=q(i);
const out=`<path d="${d}" class="st-f"/>`;
if(n===7)return`<circle cx="${cx}" cy="${cy}" r="${r}" class="st-f"/><path d="M${cx} ${cy-r}V${cy+r}" class="st-g"/>`;
return out+(n%2===1?line:'')}
const num=(x:number|null,d=0)=>x==null?'--':x.toFixed(d);
export function stationSvg(s:Station){
const cx=100,cy=78,r=15,n=oktas(s.cc),dp=s.dp;
const pt=dp==null?'':`${dp>0?'+':dp<0?'-':''}${Math.abs(dp).toFixed(1)}`;
const calm=s.kt!=null&&barbCount(s.kt).calm;
const wind=s.kt==null||s.dir==null?'':calm?`<circle cx="${cx}" cy="${cy}" r="${r+5}" class="st-k"/>`:`<path d="${barbPath(s.kt,s.dir,s.south,cx,cy,r)}" class="st-b"/>`;
const arrow=dp==null||dp===0?'':`<path d="${dp>0?'M0 3L3 0L6 3':'M0 0L3 3L6 0'}" class="st-k" transform="translate(${cx+r+9} ${cy+13})"/>`;
return`<svg class="station" viewBox="0 0 200 156" role="img" aria-label="Station model drawn from forecast values: temperature ${num(s.t,1)}, dew point ${num(s.td,1)}, pressure ${num(s.p,1)} hectopascals, sky cover ${n==null?'unknown':n+' oktas'}, wind ${s.kt==null?'unknown':Math.round(s.kt)+' knots'}"><circle cx="${cx}" cy="${cy}" r="${r}" class="st-c"/>${sky(n??0,cx,cy,r)}${wind}<g class="st-t"><text x="${cx-r-10}" y="${cy-14}" text-anchor="end" class="st-hot">${num(s.t,1)}</text><text x="${cx-r-10}" y="${cy+24}" text-anchor="end" class="st-cool">${num(s.td,1)}</text><text x="${cx+r+10}" y="${cy-14}" class="st-p">${num(s.p,1)}</text><text x="${cx+r+18}" y="${cy+24}" class="st-p">${pt}</text></g>${arrow}</svg>`}
