import {describe,it,expect} from 'vitest';
import {parseBT,parseColormap,buildLut} from './colormap';
import {run,render,decodeBT,enhColor,type View} from './decode';
import {parseDuration,latestFrames,parseLayer,buildTileUrl,LAYERS} from '../../api/_wmts';
import {tileRange,lonToX,xToLon,latToY,yToLat} from './controller';
describe('brightness temperature labels',()=>{
it('reads Celsius and Kelvin',()=>{expect(parseBT('-80 \u00b0C')).toBeCloseTo(-80);expect(parseBT('190 K')).toBeCloseTo(190-273.15)});
it('averages ranges',()=>{expect(parseBT('-80 - -75 \u00b0C')).toBeCloseTo(-77.5);expect(parseBT('195 - 205 K')).toBeCloseTo(200-273.15)});
it('rejects labels without a unit or with absurd values',()=>{expect(parseBT('High')).toBeNull();expect(parseBT('42')).toBeNull();expect(parseBT('900 K')).toBeNull()});
});
const temps:number[]=[];for(let t=-90;t<=30;t+=5)temps.push(t);
const col=(i:number):[number,number,number]=>[10+i*2,(i*7)%256,(i*13)%256];
const xml=`<ColorMap><Entries>${temps.map((t,i)=>`<ColorMapEntry rgb="${col(i).join(',')}" transparent="false" value="[${i},${i+1})" label="${t} &#176;C"/>`).join('')}<ColorMapEntry rgb="0,0,0" transparent="true" value="[99,100)" label="no data"/></Entries></ColorMap>`;
describe('colormap',()=>{
const c=parseColormap(xml);
it('parses entries, skips transparent',()=>{expect(c.n).toBe(temps.length);expect(c.usable).toBe(true)});
it('is unusable without temperature labels',()=>{const b=parseColormap('<ColorMap><Entries>'+'<ColorMapEntry rgb="1,2,3" transparent="false" label="Low"/>'.repeat(20)+'</Entries></ColorMap>');expect(b.usable).toBe(false)});
it('matches exact and near colours but not distant ones',()=>{
const f=buildLut(c),k=col(3);
expect(f(k[0],k[1],k[2])).toBeCloseTo(temps[3]);
expect(f(k[0]+2,k[1],k[2])).toBeCloseTo(temps[3]);
expect(f(250,250,250)).toBeNaN()});
});
const px=(bts:number[])=>{const a=new Uint8ClampedArray(bts.length*4);bts.forEach((t,i)=>{if(t!==t){a[i*4+3]=0;return}const k=col(temps.indexOf(t));a.set([k[0],k[1],k[2],255],i*4)});return a};
const cm=parseColormap(xml);
const job=(bts:number[],w:number,view:View,o:{prev?:number[];thr?:number;native?:boolean}={})=>run({w,h:bts.length/w,cur:px(bts),prev:o.prev?px(o.prev):null,view,thr:o.thr??-52,native:o.native??true,rgb:cm.rgb,btv:cm.bt});
describe('decoder',()=>{
it('round trips brightness temperature',()=>{const b=[-90,-60,0,30],r=job(b,4,'raw');expect(Array.from(r.bt)).toEqual(b);expect(r.stats.min).toBe(-90);expect(r.stats.valid).toBe(4)});
it('ignores transparent pixels and counts unmatched colours',()=>{
const p=px([-60,NaN,-60]);p.set([250,250,250,255],8);
const o={unmatched:0},bt=decodeBT(p,buildLut(cm),o);
expect(bt[0]).toBeCloseTo(-60);expect(bt[1]).toBeNaN();expect(bt[2]).toBeNaN();expect(o.unmatched).toBe(1)});
it('cold mask flags only pixels at or below the threshold',()=>{const r=job([-30,-50,-55,-75],4,'cold');expect(r.stats.flag).toBe(2);expect(r.out[3]).toBe(0);expect(r.out[11]).toBe(210)});
it('enhanced view is opaque wherever data exists',()=>{const r=job([-60,NaN],2,'enh');expect(r.out[3]).toBe(255);expect(r.out[7]).toBe(0)});
it('enhanced palette is monotone at its ends',()=>{expect(enhColor(50)).toEqual([25,25,25]);expect(enhColor(-120)).toEqual([255,255,255])});
it('convective candidates need texture, not just cold',()=>{
const w=15,flat=new Array(w*w).fill(-60),bump=flat.map((_,i)=>((i%w)+Math.floor(i/w))%2?-60:-70);
expect(job(flat,w,'conv').stats.flag).toBe(0);
expect(job(bump,w,'conv').stats.flag).toBeGreaterThan(0)});
it('overshooting candidates need a colder spot than the ring and native zoom',()=>{
const w=31,a=new Array(w*w).fill(-65);a[15*w+15]=-80;
expect(job(a,w,'ot').stats.flag).toBe(1);
expect(job(a,w,'ot',{native:false}).stats.flag).toBe(0);
expect(job(new Array(w*w).fill(-80),w,'ot').stats.flag).toBe(0)});
it('cooling compares with the earlier frame and skips warm pixels',()=>{
const r=job([-60,-60,10],3,'cool',{prev:[-50,-58,25]});
expect(r.stats.flag).toBe(1);expect(r.out[3]).toBeGreaterThan(0);expect(r.out[7]).toBe(0);expect(r.out[11]).toBe(0)});
it('cooling view is empty without a previous frame',()=>{expect(job([-60],1,'cool').stats.flag).toBe(0)});
it('render with raw view is fully transparent',()=>{expect(render(Float32Array.from([-60]),null,1,1,'raw',-52,true).out[3]).toBe(0)});
});
const cap=`<Capabilities><Contents>
<Layer><ows:Title>x</ows:Title><ows:Identifier>Himawari_AHI_Band13_Clean_Infrared</ows:Identifier><Format>image/png</Format>
<Dimension><ows:Identifier>time</ows:Identifier><UOM>ISO8601</UOM><Default>2026-09-30T12:00:00Z</Default><Current>false</Current><Value>2022-01-01T00:00:00Z/2026-09-30T12:00:00Z/PT10M</Value></Dimension>
<TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level6</TileMatrixSet></TileMatrixSetLink>
<ResourceURL format="image/png" resourceType="tile" template="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13_Clean_Infrared/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/></Layer>
<Layer><ows:Identifier>Himawari_AHI_Air_Mass</ows:Identifier><Format>image/png</Format>
<Dimension><ows:Identifier>time</ows:Identifier><Value>2026-09-30T11:40:00Z,2026-09-30T11:50:00Z,2026-09-30T12:00:00Z</Value></Dimension>
<TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level6</TileMatrixSet></TileMatrixSetLink>
<ResourceURL format="image/png" resourceType="tile" template="https://x/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/></Layer>
</Contents></Capabilities>`;
describe('WMTS parsing',()=>{
it('parses ISO durations',()=>{expect(parseDuration('PT10M')).toBe(600);expect(parseDuration('PT1H')).toBe(3600);expect(parseDuration('P1D')).toBe(86400);expect(parseDuration('bad')).toBe(0)});
it('builds the last frames from a period range',()=>{const f=latestFrames(['2022-01-01T00:00:00Z/2026-09-30T12:00:00Z/PT10M'],4);expect(f.step).toBe(600);expect(f.times.length).toBe(4);expect(f.times[3]-f.times[0]).toBe(1800)});
it('uses discrete times when there is no range',()=>{const f=latestFrames(['2026-09-30T11:40:00Z,2026-09-30T11:50:00Z,2026-09-30T12:00:00Z'],2);expect(f.times.length).toBe(2);expect(f.step).toBe(600)});
it('does not run past the start of a short range',()=>{expect(latestFrames(['2026-09-30T11:50:00Z/2026-09-30T12:00:00Z/PT10M'],24).times.length).toBe(2)});
it('extracts layer, matrix set and template',()=>{
const l=parseLayer(cap,LAYERS[0],6);
expect(l?.tms).toBe('GoogleMapsCompatible_Level6');expect(l?.maxzoom).toBe(6);expect(l?.times.length).toBe(6);
expect(l?.template).toContain('GoogleMapsCompatible_Level6/{TileMatrix}/{TileRow}/{TileCol}.png')});
it('picks the right layer block and misses absent layers',()=>{
expect(parseLayer(cap,LAYERS[2],5)?.times.length).toBe(3);
expect(parseLayer(cap,LAYERS[1],5)).toBeNull()});
it('builds tile urls for MapLibre',()=>{
const l=parseLayer(cap,LAYERS[0],1),u=buildTileUrl(l?.template??'',Date.UTC(2026,8,30,12,0,0)/1000);
expect(u).toContain('/default/2026-09-30T12:00:00Z/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png')});
});
describe('tile geometry',()=>{
it('round trips lon/lat through tile coordinates',()=>{expect(xToLon(lonToX(121,5),5)).toBeCloseTo(121);expect(yToLat(latToY(14.6,5),5)).toBeCloseTo(14.6)});
it('respects the tile cap and the native zoom',()=>{
const b={w:100,s:-5,e:160,n:45};
const r=tileRange(b,6,6,49);
expect((r.x1-r.x0+1)*(r.y1-r.y0+1)).toBeLessThanOrEqual(49);
expect(r.z).toBeLessThan(6);
const s=tileRange({w:120,s:10,e:124,n:14},6,6,49);
expect(s.z).toBe(6)});
it('clamps to the world and to maxzoom',()=>{const r=tileRange({w:-200,s:-90,e:200,n:90},8,6,49);expect(r.x0).toBeGreaterThanOrEqual(0);expect(r.z).toBeLessThanOrEqual(6)});
});
