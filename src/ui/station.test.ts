import {describe,it,expect} from 'vitest';
import {oktas,barbCount,barbPath,stationSvg} from './station';
describe('station model',()=>{
it('converts cloud cover to oktas',()=>{expect(oktas(0)).toBe(0);expect(oktas(50)).toBe(4);expect(oktas(100)).toBe(8);expect(oktas(null)).toBeNull();expect(oktas(140)).toBe(8)});
it('counts flags, feathers and half feathers',()=>{expect(barbCount(65)).toMatchObject({flags:1,full:1,half:1});expect(barbCount(48)).toMatchObject({flags:1,full:0,half:0});expect(barbCount(15)).toMatchObject({flags:0,full:1,half:1});expect(barbCount(2).calm).toBe(true);expect(barbCount(3).half).toBe(1)});
it('draws nothing for calm',()=>{expect(barbPath(1,90,false,100,78,15)).toBe('')});
const xs=(d:string)=>[...d.matchAll(/L(-?[\d.]+) /g)].map(m=>+m[1]);
it('puts feathers clockwise in the north and flips in the south for a north wind',()=>{const n=xs(barbPath(20,0,false,100,78,15)),s=xs(barbPath(20,0,true,100,78,15));expect(Math.max(...n)).toBeGreaterThan(100);expect(Math.min(...n)).toBeGreaterThanOrEqual(99.9);expect(Math.min(...s)).toBeLessThan(100);expect(Math.max(...s)).toBeLessThanOrEqual(100.1)});
it('renders model values and a tendency arrow',()=>{const s=stationSvg({t:28.4,td:24.1,p:1008.3,dp:-1.2,cc:75,kt:22,dir:225,south:false});expect(s).toContain('28.4');expect(s).toContain('24.1');expect(s).toContain('1008.3');expect(s).toContain('-1.2');expect(s).toContain('st-b')});
it('survives missing values',()=>{const s=stationSvg({t:null,td:null,p:null,dp:null,cc:null,kt:null,dir:null,south:false});expect(s).toContain('--');expect(s).not.toContain('NaN')})});
