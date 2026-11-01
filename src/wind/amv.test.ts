import {describe,it,expect} from 'vitest';
import {track,heightOf,windAt,vectors,analyse,fuseBT,down2,mPerPx,xToLon,yToLat,P_LEV,type Levels,type Trk} from './amv';
const W=420,H=420;
const blobs=[[120,130,34],[250,110,40],[300,260,36],[140,290,38],[210,200,30]];
const cloud=(x:number,y:number)=>{let s=0;for(const [cx,cy,r] of blobs)s+=Math.exp(-((x-cx)**2+(y-cy)**2)/(2*r*r));return s};
const field=(dx:number,dy:number)=>{const f=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const X=x-dx,Y=y-dy,c=cloud(X,Y);f[y*W+x]=28-85*Math.min(1,c)+(c>0.15?5*Math.sin(X/4.1+Y/9)*Math.cos(Y/5.3-X/11)*Math.min(1,c):0)}return f};
const lev=(u:number[],v:number[]):Levels=>{const nx=27,ny=16,n=nx*ny,T=[23,18,8,-6,-32,-55];return{lon0:24,lat0:-12,d:6,nx,ny,p:P_LEV,t:T.map(t=>new Float32Array(n).fill(t)),u:u.map(x=>new Float32Array(n).fill(x)),v:v.map(x=>new Float32Array(n).fill(x))}};
describe('cloud motion tracking',()=>{
it('recovers a known sub-pixel displacement',()=>{
const t=track(field(0,0),field(4.3,-2.6),W,H);
expect(t.length).toBeGreaterThan(15);
const med=(a:number[])=>a.sort((p,q)=>p-q)[a.length>>1];
expect(Math.abs(med(t.map(k=>k.dx))-4.3)).toBeLessThan(0.35);
expect(Math.abs(med(t.map(k=>k.dy))+2.6)).toBeLessThan(0.35);
expect(Math.min(...t.map(k=>k.corr))).toBeGreaterThan(0.7)});
it('splitting the rows across workers gives the same vectors as one pass',()=>{
const a=field(0,0),b=field(3.2,1.4),all=track(a,b,W,H),parts=[0,1,2].flatMap(k=>track(a,b,W,H,{part:[k,3]}));
expect(parts.length).toBe(all.length);
expect(parts.map(p=>`${p.x},${p.y},${p.dx.toFixed(3)}`).sort()).toEqual(all.map(p=>`${p.x},${p.y},${p.dx.toFixed(3)}`).sort())});
it('finds nothing in clear sky or featureless cloud',()=>{
expect(track(new Float32Array(W*H).fill(28),new Float32Array(W*H).fill(28),W,H)).toHaveLength(0);
expect(track(new Float32Array(W*H).fill(-60),new Float32Array(W*H).fill(-60),W,H)).toHaveLength(0)});
it('handles gaps (NaN) without producing vectors there',()=>{
const a=field(0,0),b=field(3,1);
for(let y=0;y<H;y++)for(let x=0;x<W/2;x++){a[y*W+x]=NaN;b[y*W+x]=NaN}
const t=track(a,b,W,H);
expect(t.every(k=>k.x>W/2-8)).toBe(true)})});
describe('height and wind helpers',()=>{
it('assigns cloud height from the model temperature profile',()=>{
const T=[23,18,8,-6,-32,-55];
expect(heightOf(0,T,P_LEV).p).toBeGreaterThan(500);expect(heightOf(0,T,P_LEV).p).toBeLessThan(700);
expect(heightOf(-80,T,P_LEV)).toEqual({p:200,clamped:true});
expect(heightOf(30,T,P_LEV)).toEqual({p:925,clamped:true});
expect(heightOf(-6,T,P_LEV).p).toBeCloseTo(500,0);
expect(heightOf(0,[NaN,...T.slice(1)],P_LEV).p).toBeNaN()});
it('interpolates model wind in log pressure',()=>{
const u=[4,5,8,12,25,35],v=[0,0,0,0,0,0];
expect(windAt(u,v,P_LEV,850)[0]).toBe(5);expect(windAt(u,v,P_LEV,1000)[0]).toBe(4);expect(windAt(u,v,P_LEV,100)[0]).toBe(35);
const m=windAt(u,v,P_LEV,Math.sqrt(500*300))[0];expect(m).toBeCloseTo(18.5,1)});
it('fuses and downsamples with NaN awareness',()=>{
const f=fuseBT(Float32Array.of(1,NaN,NaN,5),Float32Array.of(3,2,NaN,NaN));
expect([...f].map(x=>x===x?x:null)).toEqual([2,2,null,5]);
const d=down2(Float32Array.of(1,2,3,4,NaN,NaN,NaN,NaN,5,5,5,5,5,5,5,5),4,4);
expect(d.w).toBe(2);expect(d.d[0]).toBeNaN();expect(d.d[1]).toBeNaN()})});
describe('vectors and analysis',()=>{
const win={z:4,x0:11,y0:5,w:W,h:H};
const trk=(n:number,dx:number,dy:number,bt:number):Trk[]=>Array.from({length:n},(_,i)=>({x:60+(i%6)*40,y:60+Math.floor(i/6)*40,dx,dy,corr:0.95,sharp:0.8,tex:5,bt}));
it('converts pixel motion to metres per second with the Mercator scale',()=>{
const L=lev([4,5,8,12,25,35],[0,0,0,0,0,0]),lat=yToLat(win.y0+60/256,4),v=vectors(trk(1,4,0,-40),win,1800,L);
expect(v[0].u).toBeCloseTo(4*mPerPx(lat,4)/1800,3);expect(Math.abs(v[0].v)).toBeLessThan(1e-9);
const vn=vectors(trk(1,0,-5,-40),win,1800,L);expect(vn[0].v).toBeGreaterThan(0);
expect(xToLon(win.x0+60/256,4)).toBeGreaterThan(60)});
it('flags a vector that disagrees with the model background',()=>{
const L=lev([4,5,8,12,25,35],[0,0,0,0,0,0]),good=vectors(trk(1,5,0,-40),win,1800,L)[0],bad=vectors(trk(1,-30,12,-40),win,1800,L)[0];
expect(good.p).toBeLessThan(400);expect(good.ok).toBe(true);expect(good.qi).toBeGreaterThan(0.6);
expect(bad.ok).toBe(false);expect(bad.qi).toBeLessThan(good.qi)});
it('with no usable vectors the analysis is the model and confidence is zero',()=>{
const L=lev([4,5,8,12,25,35],[1,1,0,0,0,0]),a=analyse([],L);
expect(a.bands).toHaveLength(3);
for(const b of a.bands){expect(Math.max(...b.conf)).toBe(0)}
expect(a.bands[0].u[0]).toBeCloseTo(5,3);expect(a.bands[2].u[500]).toBeGreaterThan(25)});
it('pulls the analysis toward good tracked winds only near them and in the right level band',()=>{
const L=lev([4,5,8,12,25,35],[0,0,0,0,0,0]);
const vs=vectors(trk(30,6.4,0,-45),win,1800,L).map(v=>({...v,u:v.u+15,ok:true}));
const a=analyse(vs,L,{lon0:60,lat0:-12});
const hi=a.bands.find(b=>b.id==='high')!,lo=a.bands.find(b=>b.id==='low')!;
expect(hi.n).toBe(30);expect(lo.n).toBe(0);
const lat=vs[0].lat,lon=vs[0].lon,i=Math.round(lon-60),j=Math.round(lat+12),k=j*121+i;
expect(hi.conf[k]).toBeGreaterThan(0.5);expect(hi.u[k]).toBeGreaterThan(30);
const far=(Math.min(120,i+60))+(Math.max(0,j-60))*121;expect(hi.conf[far]).toBeLessThan(0.05);
expect(Math.max(...lo.conf)).toBe(0);
expect(a.stats.tracked).toBe(30)})});
