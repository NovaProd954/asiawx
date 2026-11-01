import {describe,it,expect} from 'vitest';
import {pickTimes} from './decoder';
import {parseLevels,type RawLevels} from '../data/levels';
describe('wind decoder inputs',()=>{
const T=(...m:number[])=>m.map(x=>1000000+x*60);
it('picks the newest frame and one at least 25 minutes earlier',()=>{
const t=T(0,10,20,30,40,50,60);
expect(pickTimes(t,null)).toEqual({t1:t[6],t0:t[3]});
expect(pickTimes(t,t[4])).toEqual({t1:t[4],t0:t[1]});
expect(pickTimes(t,12345)).toEqual({t1:t[6],t0:t[3]})});
it('refuses when frames are too close together',()=>{
expect(pickTimes(T(0,10,20),null)).toBeNull();expect(pickTimes([5],null)).toBeNull()});
it('parses pressure-level data to temperature and wind components',()=>{
const n=4,lv=[925,850],mk=(v:number|null)=>Array.from({length:n},()=>v);
const r:RawLevels={model:'gfs_seamless',run:null,t:0,lon0:24,lat0:-12,d:6,nx:2,ny:2,levels:lv,temp:[mk(20),mk(15)],spd:[mk(10),[5,5,5,null]],dir:[mk(270),mk(180)],missing:0};
const L=parseLevels(r);
expect(L.p).toEqual(lv);expect(L.t[0][0]).toBe(20);
expect(L.u[0][0]).toBeCloseTo(10,5);expect(L.v[0][0]).toBeCloseTo(0,5);
expect(L.v[1][0]).toBeCloseTo(5,5);expect(L.u[1][3]).toBeNaN();
expect(()=>parseLevels({...r,temp:[mk(1)]})).toThrow()})});
