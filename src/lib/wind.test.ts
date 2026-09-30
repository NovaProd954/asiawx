import {describe,it,expect} from 'vitest';
import {toUV,toSpeedDir,msToKt,sampleInto,rampColor,type Field} from './wind';
import {parseGrid,type RawGrid} from '../data/grid';
import {validatePoint} from '../data/forecast';
import {parseCoord,inAsia} from '../data/geocode';
import {fmtTime,isMidnight,compass} from './time';
const g={lon0:0,lat0:0,d:10,nx:2,ny:2};
const fld=(u:number[],v:number[]):Field=>({g,u:Float32Array.from(u),v:Float32Array.from(v)});
describe('wind vectors',()=>{
it('north wind blows toward south',()=>{const[u,v]=toUV(10,0);expect(u).toBeCloseTo(0);expect(v).toBeCloseTo(-10)});
it('east wind blows toward west',()=>{const[u,v]=toUV(10,90);expect(u).toBeCloseTo(-10);expect(v).toBeCloseTo(0)});
it('round trips speed and direction',()=>{for(const d of[0,45,123,270,359]){const[u,v]=toUV(7,d),r=toSpeedDir(u,v);expect(r.speed).toBeCloseTo(7);expect(r.dir).toBeCloseTo(d)}});
it('converts m/s to knots',()=>{expect(msToKt(10)).toBeCloseTo(19.43844)});
});
describe('sampling',()=>{
const o=new Float32Array(2);
it('interpolates bilinearly',()=>{expect(sampleInto(fld([0,10,0,10],[0,0,10,10]),5,5,o)).toBe(true);expect(o[0]).toBeCloseTo(5);expect(o[1]).toBeCloseTo(5)});
it('returns exact corner values',()=>{sampleInto(fld([1,2,3,4],[5,6,7,8]),0,0,o);expect(o[0]).toBe(1);sampleInto(fld([1,2,3,4],[5,6,7,8]),10,10,o);expect(o[1]).toBe(8)});
it('refuses to interpolate across missing cells',()=>{expect(sampleInto(fld([0,NaN,0,0],[0,0,0,0]),5,5,o)).toBe(false)});
it('returns false outside the grid',()=>{expect(sampleInto(fld([0,0,0,0],[0,0,0,0]),-1,5,o)).toBe(false);expect(sampleInto(fld([0,0,0,0],[0,0,0,0]),5,11,o)).toBe(false)});
it('ramp clamps and interpolates',()=>{const r:[number,string][]=[[0,'#000000'],[10,'#ffffff']];expect(rampColor(-5,r)).toBe('#000000');expect(rampColor(5,r)).toBe('rgb(128,128,128)');expect(rampColor(99,r)).toBe('#ffffff')});
});
describe('grid parsing',()=>{
const raw:RawGrid={model:'m',run:null,lon0:0,lat0:0,d:10,nx:2,ny:1,times:[0,3600],speed:[[5,null],[6,7]],dir:[[90,null],[0,180]],missing:0,fetched:1};
it('maps null cells to NaN and keeps valid ones',()=>{const s=parseGrid(raw);expect(s.u[0][0]).toBeCloseTo(-5);expect(Number.isNaN(s.u[0][1])).toBe(true);expect(s.v[1][1]).toBeCloseTo(7)});
it('rejects malformed grids',()=>{expect(()=>parseGrid({...raw,speed:[[1,2]]})).toThrow();expect(()=>parseGrid({...raw,nx:3})).toThrow()});
});
describe('forecast validation',()=>{
it('rejects series with wrong length',()=>{expect(()=>validatePoint({model:'m',run:null,lat:0,lon:0,elev:null,times:[0,1],vars:{a:[1]},sunrise:[],sunset:[],fetched:0})).toThrow()});
});
describe('search helpers',()=>{
it('parses coordinates',()=>{expect(parseCoord('14.6, 121')?.lat).toBe(14.6);expect(parseCoord('Manila')).toBeNull();expect(parseCoord('95, 10')).toBeNull()});
it('bounds the Asian domain',()=>{expect(inAsia(35,139)).toBe(true);expect(inAsia(48,2)).toBe(false)});
});
describe('time',()=>{
it('formats UTC',()=>{expect(fmtTime(0,'UTC')).toBe('01 Jan 00:00 UTC')});
it('detects UTC midnight',()=>{expect(isMidnight(86400,'UTC')).toBe(true);expect(isMidnight(3600,'UTC')).toBe(false)});
it('names compass points',()=>{expect(compass(0)).toBe('N');expect(compass(225)).toBe('SW');expect(compass(359)).toBe('N')});
});
