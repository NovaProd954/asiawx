import {describe,it,expect} from 'vitest';
import {pct,alignModels,memberSeries,bandOf,dailyRain,summarizeEns,climatology,doy} from '../../api/_stats';
import {spreadOf,dailyRange,pickAt} from './stats';
import {validateCmp,validateEns,type CmpData} from '../data/compare';
import {validateClim,validateRecent} from '../data/hist';
import {dailySeries,windowSummary,placeInBand,lastValid} from '../hist/anom';
const T0=Date.UTC(2026,9,8)/1000;
const hrs=(n:number)=>Array.from({length:n},(_,i)=>T0+i*3600);
describe('percentile',()=>{
it('interpolates',()=>{expect(pct([1,2,3,4,5],.5)).toBe(3);expect(pct([0,10],.25)).toBe(2.5);expect(pct([7],.9)).toBe(7)});
it('is NaN for empty',()=>expect(pct([],.5)).toBeNaN())});
describe('alignModels',()=>{
const ts=hrs(4);
it('maps by time and nulls gaps',()=>{
const a=alignModels([{id:'a',name:'A',ok:true,times:ts,vars:{x:[1,2,3,4]}},{id:'b',name:'B',ok:true,times:ts.slice(1),vars:{x:[20,30,40]}}],['x']);
expect(a.models[1].vars.x).toEqual([null,20,30,40]);expect(a.times).toEqual(ts)});
it('marks failed and empty models',()=>{
const a=alignModels([{id:'a',name:'A',ok:true,times:ts,vars:{x:[1,2,3,4]}},{id:'b',name:'B',ok:false,err:'upstream HTTP 400'},{id:'c',name:'C',ok:true,times:ts,vars:{x:[null,null,null,null]}}],['x']);
expect(a.models[1].ok).toBe(false);expect(a.models[1].err).toBe('upstream HTTP 400');expect(a.models[2].ok).toBe(false)});
it('returns no times when nothing responded',()=>{expect(alignModels([{id:'a',name:'A',ok:false,err:'x'}],['x']).times).toEqual([])})});
describe('ensemble parsing',()=>{
const h={time:hrs(3),temperature_2m:[1,2,3],temperature_2m_member01:[2,3,4],temperature_2m_member02:[3,4,5],temperature_2m_member03:[4,5,6],temperature_2m_member04:[5,6,7],temperature_2m_member05:[6,7,8],wind_speed_100m:[9,9,9],wind_speed_10m:[1,1,1]};
it('collects control and members only for the exact variable',()=>{expect(memberSeries(h,'temperature_2m').length).toBe(6);expect(memberSeries(h,'wind_speed_10m').length).toBe(1)});
it('accepts model-suffixed keys',()=>{expect(memberSeries({a:1,temperature_2m_member01_ncep_gefs025:[1],temperature_2m_ncep_gefs025:[1]},'temperature_2m').length).toBe(2)});
it('computes bands and requires enough members',()=>{
const ms=memberSeries(h,'temperature_2m'),b=bandOf(ms,3);
expect(b.min[0]).toBe(1);expect(b.max[0]).toBe(6);expect(b.p50[0]).toBe(3.5);
expect(bandOf(ms.slice(0,3),3).p50[0]).toBeNull()});
it('summarises and skips variables with too few members',()=>{
const s=summarizeEns({hourly:h},['temperature_2m','wind_speed_10m']);
expect(s?.members).toBe(6);expect(Object.keys(s?.vars??{})).toEqual(['temperature_2m'])});
it('returns null for unusable payloads',()=>{expect(summarizeEns({},['x'])).toBeNull();expect(summarizeEns({hourly:{time:[1]}},['x'])).toBeNull()})});
describe('daily rain shares',()=>{
const t=hrs(48);
const mem=(perHour:number)=>t.map(()=>perHour);
it('sums complete days per member and reports member shares',()=>{
const ms=[0,0,0.05,0.05,0.5,0.5,1.2,1.2].map(mem);
const d=dailyRain(t,ms);
expect(d.length).toBe(2);expect(d[0].n).toBe(8);
expect(d[0].ge1).toBe(0.75);expect(d[0].ge10).toBe(0.5);expect(d[0].ge25).toBe(0.25);expect(d[0].p50).toBe(6.6)});
it('drops partial days and days with too few members',()=>{
expect(dailyRain(t.slice(0,30),[mem(1),mem(1),mem(1),mem(1),mem(1)].map(a=>a.slice(0,30))).length).toBe(1);
expect(dailyRain(t,[mem(1),mem(1)]).length).toBe(0)});
it('skips members with gaps instead of filling',()=>{
const bad=mem(1);bad[3]=null as unknown as number;
expect(dailyRain(t,[bad,...[1,1,1,1,1].map(mem)])[0].n).toBe(5)})});
const mk=(ids:[string,number[]|null][]):CmpData=>({lat:1,lon:1,fetched:0,times:hrs(3),models:ids.map(([id,v])=>({id,name:id,ok:!!v,vars:{x:v??[]}}))});
describe('model spread',()=>{
it('uses only responding models and needs two',()=>{
const d=mk([['a',[1,2,3]],['b',[3,2,9]],['c',null]]),s=spreadOf(d,'x');
expect(s[0]).toMatchObject({min:1,max:3,mean:2,n:2});expect(s[2].max).toBe(9);
expect(spreadOf(mk([['a',[1,2,3]]]),'x')[0].max).toBeNull()});
it('averages the range per day',()=>{
const d=mk([['a',[1,2,3]],['b',[3,2,9]]]),r=dailyRange(d.times,spreadOf(d,'x'));
expect(r.length).toBe(1);expect(r[0].range).toBeCloseTo((2+0+6)/3,6)});
it('picks nearest time index',()=>{expect(pickAt(hrs(5),T0+3600*2.4)).toBe(2)})});
describe('validators',()=>{
it('reject malformed comparison and ensemble',()=>{
expect(()=>validateCmp({lat:0,lon:0,fetched:0,times:[1,2],models:[{id:'a',name:'a',ok:true,vars:{x:[1]}}]})).toThrow();
expect(()=>validateEns({lat:0,lon:0,fetched:0,ens:[{id:'a',name:'a',org:'',ok:true,times:[1,2],vars:{x:{p10:[1],p25:[1],p50:[1],p75:[1],p90:[1],min:[1],max:[1],mean:[1]}}}]})).toThrow()});
it('reject malformed climatology and history',()=>{
expect(()=>validateClim({clim:{tmean:{mean:[1]},prcp:{mean:[1]}}} as never)).toThrow();
expect(()=>validateRecent({times:[1,2],tmean:[1],tmax:[1],tmin:[1],prcp:[1],wmax:[1]} as never)).toThrow()})});
describe('climatology',()=>{
const yr=(y:number)=>{const o:number[]=[];for(let d=0;d<365;d++)o.push(Date.UTC(y,0,1+d)/1000);return o};
const ys=[2001,2002,2003,2004,2005];
const times=ys.flatMap(yr),tm=times.map((_,i)=>10+(Math.floor(i/365)-2)),pr=times.map((_,i)=>i%2?0:4);
const c=climatology(times,{tmean:tm,tmax:tm,tmin:tm,wmax:tm,prcp:pr},3,10);
it('maps Feb 29 to Feb 28 and uses a 365-day calendar',()=>{expect(doy(Date.UTC(2024,1,29)/1000)).toBe(doy(Date.UTC(2024,1,28)/1000));expect(doy(Date.UTC(2023,11,31)/1000)).toBe(364);expect(doy(Date.UTC(2023,0,1)/1000)).toBe(0)});
it('averages over the window and years',()=>{expect(c.tmean.mean[100]).toBe(10);expect(c.years).toBe(5);expect(c.tmean.mean.length).toBe(365);expect(c.tmean.sd[100]).toBeGreaterThan(1)});
it('wraps around the year end',()=>{expect(c.tmean.mean[0]).not.toBeNull();expect(c.tmean.mean[364]).not.toBeNull()});
it('gives null where samples are too few',()=>{const e=climatology(times.slice(0,5),{tmean:tm.slice(0,5),tmax:tm.slice(0,5),tmin:tm.slice(0,5),wmax:tm.slice(0,5),prcp:pr.slice(0,5)},3,10);expect(e.tmean.mean[200]).toBeNull()});
it('tracks wet-day frequency',()=>{expect(c.prcp.wet[100]).toBeGreaterThan(0.3);expect(c.prcp.wet[100]).toBeLessThan(0.7)});
describe('anomalies',()=>{
const days=60,rt=Array.from({length:days},(_,i)=>Date.UTC(2006,5,1+i)/1000);
const rec={source:'',model:'era5',lat:0,lon:0,fetched:0,times:rt,tmean:rt.map(()=>13),tmax:rt.map(()=>15),tmin:rt.map(()=>9),prcp:rt.map(()=>2),wmax:rt.map(()=>5)};
it('computes daily anomaly against the date normal',()=>{const s=dailySeries(rec,c,'tmean');expect(s[10].anom).toBeCloseTo(3,1);expect(s[10].mean).toBe(10)});
it('summarises windows and rain against normal',()=>{const w=windowSummary(rec,c,30);expect(w.tAnom).toBeCloseTo(3,1);expect(w.rain).toBe(60);expect(w.rainNormal).not.toBeNull();expect(w.rainPct).toBeGreaterThan(80)});
it('refuses a summary when too many days are missing',()=>{const m={...rec,tmean:rec.tmean.map((x,i)=>i%2?null:x)};expect(windowSummary(m,c,30).tAnom).toBeNull()});
it('places a day against the 10th and 90th percentile band',()=>{
const s=dailySeries(rec,c,'tmean')[5];
expect(placeInBand({...s,v:100})).toBe('above');expect(placeInBand({...s,v:-100})).toBe('below');expect(placeInBand({...s,v:null})).toBe('none');expect(placeInBand({...s,v:s.mean})).toBe('within')});
it('finds the latest valid day',()=>{const s=dailySeries({...rec,tmean:[...rec.tmean.slice(0,-3),null,null,null]},c,'tmean');expect(lastValid(s)?.t).toBe(rt[days-4])})})});
import {diffPx,nearestIdx,speedDiff,DMAX,DEAD} from './layer';
import {toUV} from '../lib/wind';
describe('layer compare helpers',()=>{
it('leaves small differences clear and saturates large ones',()=>{
expect(diffPx(0)[3]).toBe(0);expect(diffPx(DEAD-0.01)[3]).toBe(0);expect(diffPx(NaN)[3]).toBe(0);
const hi=diffPx(DMAX),lo=diffPx(-DMAX*3);
expect(hi[0]).toBe(255);expect(lo[2]).toBe(255);expect(hi[3]).toBe(Math.round(0.8*255));expect(lo[3]).toBe(hi[3])});
it('is monotone in magnitude',()=>{expect(diffPx(3)[3]).toBeGreaterThan(diffPx(1)[3])});
it('finds the nearest time',()=>{expect(nearestIdx([0,3600,7200],5000)).toBe(1);expect(nearestIdx([],1)).toBe(0)});
it('differences speed between two fields and refuses gaps',()=>{
const g={lon0:0,lat0:0,d:6,nx:2,ny:2},mk=(s:number)=>{const [u,v]=toUV(s,270);return{g,u:new Float32Array(4).fill(u),v:new Float32Array(4).fill(v)}};
const r=speedDiff(mk(10),mk(7),3,3);expect(r?.a).toBeCloseTo(10,5);expect(r?.b).toBeCloseTo(7,5);
const bad=mk(7);bad.u[0]=NaN;expect(speedDiff(mk(10),bad,3,3)).toBeNull();
expect(speedDiff(mk(10),mk(7),50,3)).toBeNull()})});
import {dayTicks,monthTicks} from '../ui/charts';
describe('chart ticks',()=>{
const ts=Array.from({length:240},(_,i)=>T0+i*3600);
it('uses day numbers only on long axes',()=>{const t=dayTicks(ts,'UTC');expect(t.length).toBe(10);expect(t.every(k=>/^\d\d$/.test(k.label))).toBe(true)});
it('keeps full labels on short axes',()=>{expect(dayTicks(ts.slice(0,100),'UTC').every(k=>k.label.length>2)).toBe(true)});
it('places month ticks on the first of the month',()=>{const d=Array.from({length:70},(_,i)=>Date.UTC(2026,7,20+i)/1000);expect(monthTicks(d).map(k=>k.label)).toEqual(['Sep','Oct'])})});
