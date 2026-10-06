import {describe,it,expect} from 'vitest';
import {pickTicks} from './timeline';
const H=3600,base=1767225600;
const hourly=Array.from({length:49},(_,i)=>base+i*H);
const ten=Array.from({length:37},(_,i)=>base+i*600);
describe('pickTicks',()=>{
it('48 hourly steps give about 8 labels on 6 h boundaries',()=>{const r=pickTicks(hourly,9);expect(r.length).toBeLessThanOrEqual(9);expect(r.length).toBeGreaterThanOrEqual(5);for(const k of r)expect(k.t%21600).toBe(0)});
it('10 minute frames over 6 h pick 30 or 60 minute marks',()=>{const r=pickTicks(ten,9);expect(r.length).toBeLessThanOrEqual(9);expect(r.length).toBeGreaterThanOrEqual(2);for(const k of r)expect(k.t%1800).toBe(0)});
it('marks midnight as major',()=>{const r=pickTicks(hourly,9);expect(r.filter(k=>k.major).every(k=>k.t%86400===0)).toBe(true);expect(r.some(k=>k.major)).toBe(true)});
it('respects a whole-hour time zone offset',()=>{const r=pickTicks(hourly,9,3600*8);expect(r.length).toBeGreaterThan(1);for(const k of r)expect((k.t+3600*8)%21600).toBe(0)});
it('falls back to even spacing for a half-hour offset on hourly data',()=>{const r=pickTicks(hourly,9,3600*5.5);expect(r.length).toBeGreaterThan(1);expect(r.length).toBeLessThanOrEqual(9)});
it('returns nothing for fewer than two frames',()=>{expect(pickTicks([base],8)).toEqual([])});
it('falls back to even sampling when no boundary fits',()=>{const odd=Array.from({length:20},(_,i)=>base+7+i*137);const r=pickTicks(odd,8);expect(r.length).toBeGreaterThan(0);expect(r.length).toBeLessThanOrEqual(8)})});
