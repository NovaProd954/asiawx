import {describe,it,expect} from 'vitest';
import {parseColormap} from './colormap';
import {paletteIntensities,paletteLut,isGrey} from './pal';
import {runV2,intensityOf} from './real';
import {run,type DecodeIn} from './decode';
const ent=(rgb:string,v:string,x='')=>`<ColorMapEntry rgb="${rgb}" transparent="false" value="${v}"${x}/>`;
const xml=`<ColorMaps><ColorMap title="IR" units="&#176;C"><Entries>${[
ent('0,0,0','(40,+INF)'),ent('40,40,40','(30,40]'),ent('120,120,120','(10,30]'),ent('200,200,200','(-10,10]'),ent('255,255,255','(-30,-10]'),
ent('60,200,250','(-45,-30]'),ent('40,200,90','(-55,-45]'),ent('250,235,40','(-65,-55]'),ent('215,30,40','(-75,-65]'),ent('200,60,200','(-85,-75]'),ent('90,0,0','(-120,-85]')].join('')}</Entries></ColorMap><ColorMap title="No Data"><Entries><ColorMapEntry rgb="0,0,0" transparent="true" nodata="true"/></Entries></ColorMap></ColorMaps>`;
const cm=parseColormap(xml);
const rgbAt=(i:number)=>[cm.rgb[i*3],cm.rgb[i*3+1],cm.rgb[i*3+2]];
describe('official palette includes black and grey',()=>{
it('parses every visible entry including the open-ended black one',()=>{expect(cm.n).toBe(11);expect(cm.usable).toBe(true);expect(rgbAt(0)).toEqual([0,0,0]);expect(cm.bt[0]).toBeCloseTo(40)});
it('classifies black, grey and white as achromatic',()=>{expect(isGrey(0,0,0)).toBe(true);expect(isGrey(200,200,200)).toBe(true);expect(isGrey(60,200,250)).toBe(false)});
it('intensity never decreases as the temperature falls',()=>{
const it=paletteIntensities(cm.rgb,cm.bt),ord=Array.from(it.keys()).sort((a,b)=>cm.bt[b]-cm.bt[a]);
for(let k=1;k<ord.length;k++)expect(it[ord[k]]).toBeGreaterThanOrEqual(it[ord[k-1]]);
expect(it[0]).toBe(0)});
it('grey bands sit below the first colour and keep their order',()=>{
const it=paletteIntensities(cm.rgb,cm.bt);
expect(it[0]).toBeLessThan(it[2]);expect(it[2]).toBeLessThan(it[4]);expect(it[4]).toBeLessThanOrEqual(it[5])});
it('chromatic entries keep the original engine intensity',()=>{
const it=paletteIntensities(cm.rgb,cm.bt);
expect(it[6]).toBeCloseTo(intensityOf(40,200,90),5);expect(it[7]).toBeCloseTo(intensityOf(250,235,40),5)});
it('a palette with only greys maps linearly in temperature',()=>{
const rgb=Uint8Array.from([0,0,0,128,128,128,255,255,255]),bt=Float32Array.from([30,-30,-90]),it=paletteIntensities(rgb,bt);
expect(Array.from(it).map(v=>+v.toFixed(2))).toEqual([0,0.5,1])});
it('lookup is exact for palette colours and tolerant to small drift',()=>{
const f=paletteLut(cm.rgb,cm.bt),it=paletteIntensities(cm.rgb,cm.bt);
expect(f(0,0,0)).toBeCloseTo(it[0]);expect(f(121,120,119)).toBeCloseTo(it[2]);expect(f(5,250,5)).toBeNaN()})});
const W=12,H=8;
const frame=(cols:number[][])=>{const a=new Uint8ClampedArray(W*H*4);for(let i=0;i<W*H;i++)a.set([...cols[i%cols.length],255],i*4);return a};
const job=(cur:Uint8ClampedArray,pal:boolean,view:'real'|'e2'='real',bg:'clear'|'space'='space'):DecodeIn=>({w:W,h:H,cur,prev:null,view,thr:-52,native:true,rgb:pal?cm.rgb.slice():new Uint8Array(0),btv:pal?cm.bt.slice():new Float32Array(0),src:'cmap',eng:'v2',v2:{real:{thr:0.08,ct:1.1,storm:0.7,soft:0,noise:0,relief:0,light:35,pal:'real'},enh:{thr:0.08,ct:1.1,soft:0,height:0,pal:'enhanced'},bg}});
describe('V2 with the provider palette',()=>{
it('orders black, grey and white pixels by the palette temperature',()=>{
const px=frame([[0,0,0],[120,120,120],[255,255,255],[215,30,40]]),r=runV2(job(px,true));
expect(r.stats.unmatched).toBe(0);expect(r.stats.valid).toBe(W*H);
const lum=(i:number)=>r.out[i*4]+r.out[i*4+1]+r.out[i*4+2];
expect(lum(0)).toBeLessThan(lum(2))});
it('counts pixels far from the palette and leaves them transparent',()=>{
const px=frame([[0,0,0],[5,250,5]]),r=runV2(job(px,true,'real','clear'));
expect(r.stats.unmatched).toBe(W*H/2);expect(r.stats.valid).toBe(W*H/2);expect(r.out[7]).toBe(0)});
it('colours between two palette entries decode continuously instead of snapping',()=>{
const f=paletteLut(cm.rgb,cm.bt),a=f(60,200,250),b=f(40,200,90),m=f(50,200,170),mid=f(50,200,171);
expect(m).toBeGreaterThan(Math.min(a,b));expect(m).toBeLessThan(Math.max(a,b));expect(Math.abs(mid-m)).toBeLessThan(0.05)});
it('warm grey is never more opaque than the original colour engine made it',()=>{
const px=frame([[0,0,0],[120,120,120],[200,200,200]]),a=runV2(job(px,true,'real','clear')),b=runV2(job(px,false,'real','clear'));
for(let i=0;i<W*H;i++)expect(a.out[i*4+3]).toBeLessThanOrEqual(b.out[i*4+3])});
it('falls back to the colour engine without a palette',()=>{
const px=frame([[0,0,0],[60,200,250]]),a=runV2(job(px,false)),b=runV2(job(px,false));
expect(a.stats.unmatched).toBe(0);expect(Array.from(a.out)).toEqual(Array.from(b.out))});
it('is routed through run() and the enhanced view',()=>{
const px=frame([[0,0,0],[200,200,200],[250,235,40],[200,60,200]]),r=run(job(px,true,'e2'));
expect(r.out.length).toBe(W*H*4);expect(r.stats.flag).toBeGreaterThan(0)});
it('does not use the palette for true colour layers',()=>{
const px=frame([[240,242,246],[40,90,60]]),j={...job(px,true,'e2'),src:'vis' as const},r=runV2(j);
expect(r.stats.unmatched).toBe(0)})});
describe('V1 with the provider palette',()=>{
it('decodes black and grey pixels to their palette temperatures',()=>{
const px=frame([[0,0,0],[120,120,120],[255,255,255]]),r=run({...job(px,true),eng:'v1'});
expect(r.bt[0]).toBeCloseTo(40);expect(r.bt[1]).toBeCloseTo(20);expect(r.bt[2]).toBeCloseTo(-20);expect(r.stats.unmatched).toBe(0)})});
describe('palette decoding is stable under colour noise',()=>{
it('small colour drift never produces speckle or unmatched pixels',()=>{
const f=paletteLut(cm.rgb,cm.bt);let worst=0,nan=0;
for(let i=0;i<cm.n;i++)for(const d of [-3,-2,2,3]){
const r=Math.max(0,Math.min(255,cm.rgb[i*3]+d)),g=Math.max(0,Math.min(255,cm.rgb[i*3+1]-d)),b=Math.max(0,Math.min(255,cm.rgb[i*3+2]+d)),v=f(r,g,b),e=f(cm.rgb[i*3],cm.rgb[i*3+1],cm.rgb[i*3+2]);
if(v!==v)nan++;else worst=Math.max(worst,Math.abs(v-e))}
expect(nan).toBe(0);expect(worst).toBeLessThan(0.09)})});
