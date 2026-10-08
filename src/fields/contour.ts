import {sampleCR,type G2} from './sample';
export interface Line{level:number;pts:[number,number][];closed:boolean}
export interface Fine{g:G2;v:Float32Array}
export function fineGrid(g:G2,v:ArrayLike<number>,step=1):Fine{
const nx=Math.floor((g.nx-1)*g.d/step)+1,ny=Math.floor((g.ny-1)*g.d/step)+1,o=new Float32Array(nx*ny);
for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)o[j*nx+i]=sampleCR(g,v,g.lon0+i*step,g.lat0+j*step);
return{g:{lon0:g.lon0,lat0:g.lat0,d:step,nx,ny},v:o}}
type Seg=[string,string];
const SEG:Record<number,number[][]>={1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],6:[[0,2]],7:[[3,2]],8:[[3,2]],9:[[0,2]],11:[[1,2]],12:[[1,3]],13:[[0,1]],14:[[3,0]]};
export function contourLevel(f:Fine,L:number):Line[]{
const {g,v}=f,nx=g.nx,ny=g.ny,pos=new Map<string,[number,number]>(),segs:Seg[]=[];
const key=(e:number,i:number,j:number)=>e===0?`h${i},${j}`:e===1?`v${i+1},${j}`:e===2?`h${i},${j+1}`:`v${i},${j}`;
const put=(e:number,i:number,j:number):string=>{
const k=key(e,i,j);
if(!pos.has(k)){
const [a,b,c,d]=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]];
const ends=e===0?[a,b]:e===1?[b,c]:e===2?[d,c]:[a,d];
const va=v[ends[0][1]*nx+ends[0][0]],vb=v[ends[1][1]*nx+ends[1][0]],t=(L-va)/(vb-va);
pos.set(k,[g.lon0+(ends[0][0]+(ends[1][0]-ends[0][0])*t)*g.d,g.lat0+(ends[0][1]+(ends[1][1]-ends[0][1])*t)*g.d])}
return k};
for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
const c0=v[j*nx+i],c1=v[j*nx+i+1],c2=v[(j+1)*nx+i+1],c3=v[(j+1)*nx+i];
if(c0!==c0||c1!==c1||c2!==c2||c3!==c3)continue;
const ci=(c0>=L?1:0)|(c1>=L?2:0)|(c2>=L?4:0)|(c3>=L?8:0);
let list:number[][]|undefined=SEG[ci];
if(ci===5||ci===10){
const hi=(c0+c1+c2+c3)/4>=L;
list=ci===5?(hi?[[0,1],[2,3]]:[[3,0],[1,2]]):(hi?[[3,0],[1,2]]:[[0,1],[2,3]])}
if(!list)continue;
for(const [a,b] of list)segs.push([put(a,i,j),put(b,i,j)])}
const adj=new Map<string,number[]>();
segs.forEach((s,k)=>{for(const e of s){let a=adj.get(e);if(!a){a=[];adj.set(e,a)}a.push(k)}});
const used=new Uint8Array(segs.length),out:Line[]=[];
const walk=(start:string,first:number):string[]=>{
const path=[start];let cur=start,sk=first;
for(;;){
used[sk]=1;
const s=segs[sk],nx2=s[0]===cur?s[1]:s[0];
path.push(nx2);cur=nx2;
const nb=(adj.get(cur)??[]).find(k=>!used[k]);
if(nb===undefined)break;
sk=nb}
return path};
for(const [e,l] of adj)if(l.length===1&&!used[l[0]]){const p=walk(e,l[0]);out.push({level:L,pts:p.map(k=>pos.get(k) as [number,number]),closed:false})}
segs.forEach((s,k)=>{if(used[k])return;const p=walk(s[0],k);out.push({level:L,pts:p.map(q=>pos.get(q) as [number,number]),closed:p[0]===p[p.length-1]})});
return out}
export function chaikin(pts:[number,number][],closed:boolean):[number,number][]{
if(pts.length<3)return pts;
const o:[number,number][]=[];
const n=pts.length;
if(!closed)o.push(pts[0]);
for(let i=0;i<n-1;i++){
const a=pts[i],b=pts[i+1];
o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75])}
if(closed)o.push(o[0]);else o.push(pts[n-1]);
return o}
export function contours(f:Fine,step:number,major:number,fmt:(l:number)=>string):unknown{
let mn=Infinity,mx=-Infinity;
for(const x of f.v)if(x===x){if(x<mn)mn=x;if(x>mx)mx=x}
const feats:unknown[]=[];
if(!(mx>mn))return{type:'FeatureCollection',features:feats};
for(let L=Math.ceil(mn/step)*step;L<=mx;L+=step){
for(const ln of contourLevel(f,L)){
if(ln.pts.length<3)continue;
const p=chaikin(ln.pts,ln.closed);
feats.push({type:'Feature',properties:{label:fmt(L),major:L%major===0?1:0,level:L},geometry:{type:'LineString',coordinates:p}})}}
return{type:'FeatureCollection',features:feats}}
export interface Ext{t:'H'|'L';v:number;lon:number;lat:number}
export function extrema(f:Fine,R=7,minDiff=2,sep=10,ring=10):Ext[]{
const {g,v}=f,nx=g.nx,ny=g.ny,cand:(Ext&{s:number})[]=[];
const dirs=Array.from({length:16},(_,k)=>[Math.round(ring*Math.cos(k*Math.PI/8)),Math.round(ring*Math.sin(k*Math.PI/8))]);
for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
const c=v[j*nx+i];if(c!==c)continue;
let isMax=true,isMin=true;
for(let dj=-R;dj<=R&&(isMax||isMin);dj++)for(let di=-R;di<=R;di++){
if(!di&&!dj)continue;
const a=i+di,b=j+dj;if(a<0||b<0||a>=nx||b>=ny)continue;
const x=v[b*nx+a];if(x!==x)continue;
if(x>=c)isMax=false;if(x<=c)isMin=false;
if(!isMax&&!isMin)break}
if(!(isMax||isMin))continue;
let sum=0,cnt=0;
for(const [di,dj] of dirs){const a=i+di,b=j+dj;if(a<0||b<0||a>=nx||b>=ny)continue;const x=v[b*nx+a];if(x===x){sum+=x;cnt++}}
if(cnt<6)continue;
const d=c-sum/cnt;
if(isMax&&d>=minDiff)cand.push({t:'H',v:c,lon:g.lon0+i*g.d,lat:g.lat0+j*g.d,s:d});
else if(isMin&&-d>=minDiff)cand.push({t:'L',v:c,lon:g.lon0+i*g.d,lat:g.lat0+j*g.d,s:-d})}
cand.sort((a,b)=>b.s-a.s);
const out:Ext[]=[];
for(const c of cand){if(out.some(o=>Math.hypot(o.lon-c.lon,o.lat-c.lat)<sep))continue;out.push({t:c.t,v:c.v,lon:c.lon,lat:c.lat})}
return out}
