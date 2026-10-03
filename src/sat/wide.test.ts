import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {smooth,up2,clearRef,render,run,decodeVis,calibrate,type DecodeIn} from './decode';
import {fitCurve,pav,lumOf} from './calib';
import {wideRange,diskArrays,diskVis,padBox,boxOf,inside,tileRange,WIDE,LIMB,TS} from './geo';
import {isSatUrl,SAT_RE,fmtBytes} from './store';
import {modeOf,lumCapable,visCapable,type SatLayer} from './controller';
const L=(o:Partial<SatLayer>)=>({key:'k',id:'x',name:'n',kind:'rgb',tms:'',maxzoom:5,format:'',template:'',times:[],step:600,provider:'jma',tfmt:'jma',attribution:'',decode:false,...o}) as SatLayer;
describe('smoothing',()=>{
it('leaves a flat field alone and keeps no-data pixels empty',()=>{const a=Float32Array.from([-40,-40,NaN,-40,-40,-40,-40,-40,-40]),s=smooth(a,3,3,2);expect(Number.isNaN(s[2])).toBe(true);for(let i=0;i<9;i++)if(i!==2)expect(s[i]).toBeCloseTo(-40,4)});
it('softens a one-bin step',()=>{const w=8,a=new Float32Array(w*3);for(let y=0;y<3;y++)for(let x=0;x<w;x++)a[y*w+x]=x<4?-60:-50;const s=smooth(a,w,3,2);expect(s[w+3]).toBeLessThan(-52);expect(s[w+3]).toBeGreaterThan(-60);expect(s[w+4]).toBeGreaterThan(-58);expect(s[w+4]).toBeLessThan(-50)});
it('level 0 returns the input',()=>{const a=Float32Array.from([1,2,3,4]);expect(smooth(a,2,2,0)).toBe(a)});
it('does not average across missing pixels',()=>{const a=Float32Array.from([-80,NaN,30]),s=smooth(a,3,1,1);expect(s[0]).toBeCloseTo(-80,4);expect(s[2]).toBeCloseTo(30,4)});
});
describe('upsampling',()=>{
it('doubles size and interpolates between pixels',()=>{const u=up2(Float32Array.from([0,10]),2,1);expect(u.length).toBe(8);expect(u[1]).toBeCloseTo(2.5,4);expect(u[2]).toBeCloseTo(7.5,4)});
it('keeps holes as holes',()=>{const u=up2(Float32Array.from([0,NaN,0,0]),2,2);expect(Number.isNaN(u[3])).toBe(true);expect(Number.isNaN(u[0])).toBe(false)});
});
describe('render options',()=>{
const bt=Float32Array.from([-60,-60,-30,-30]);
it('doubles enhanced output when asked',()=>{const r=render(bt,null,2,2,'enh',-52,false,{smooth:2,scale:2});expect(r.ow).toBe(4);expect(r.oh).toBe(4);expect(r.out.length).toBe(64)});
it('does not scale candidate views',()=>{const r=render(bt,null,2,2,'conv',-52,false,{scale:2});expect(r.ow).toBe(2)});
it('smoothed cold mask has a soft edge, unsmoothed is hard',()=>{const v=Float32Array.from([-60,-52.5,-51.5,-45]);const a=render(v,null,4,1,'cold',-52,false,{smooth:0}),b=render(v,null,4,1,'cold',-52,false,{smooth:1});expect(a.out[3]).toBe(210);expect(a.out[7]).toBe(210);expect(a.out[11]).toBe(0);expect(b.out[3]).toBeGreaterThan(0)});
it('cold flag counts raw pixels regardless of smoothing',()=>{expect(render(bt,null,2,2,'cold',-52,false,{smooth:2}).flag).toBe(2)});
});
describe('satellite disk',()=>{
const r=wideRange(4,6),d=diskArrays(r);
it('wide range covers the region at zoom 4 within a small tile budget',()=>{expect(r.z).toBe(4);expect((r.x1-r.x0+1)*(r.y1-r.y0+1)).toBeLessThanOrEqual(64);expect(r.x0).toBeLessThanOrEqual(10)});
it('wide range respects layer maxzoom',()=>{expect(wideRange(5,3).z).toBe(3)});
it('is fully visible under the sub-satellite point and hidden at the limb',()=>{expect(diskVis(1)).toBe(1);expect(diskVis(LIMB)).toBe(0);expect(diskVis(0)).toBe(0);expect(diskVis(0.25)).toBeGreaterThan(0)});
it('arrays match mosaic size and peak near 140.7E on the equator',()=>{expect(d.row.length).toBe((r.y1-r.y0+1)*TS);expect(d.col.length).toBe((r.x1-r.x0+1)*TS);expect(Math.max(...d.col)).toBeGreaterThan(0.999)});
it('masks pixels beyond the limb in a decode',()=>{const w=d.col.length,h=1,px=new Uint8ClampedArray(w*4).fill(255);const job:DecodeIn={w,h,cur:px,prev:null,view:'enh',thr:-52,native:false,rgb:Uint8Array.from([255,255,255]),btv:Float32Array.from([-40]),mask:{row:d.row.slice(0,1),col:d.col}};const out=run(job);expect(out.stats.valid).toBeLessThan(w);expect(out.stats.valid).toBeGreaterThan(0);expect(Number.isNaN(out.bt[0])).toBe(true)});
it('pads and measures boxes',()=>{const b={w:100,s:0,e:120,n:20},p=padBox(b,0.25);expect(p.w).toBe(95);expect(inside(p,b)).toBe(true);expect(inside(b,p)).toBe(false);const t=tileRange(WIDE,4,6,400),bx=boxOf(t);expect(bx.w).toBeLessThanOrEqual(WIDE.w);expect(bx.e).toBeGreaterThanOrEqual(WIDE.e-0.001)});
});
describe('cloud layer',()=>{
const W=64,H=64,field=(f:(x:number,y:number)=>number)=>{const a=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++)a[y*W+x]=f(x,y);return a};
it('removes warm clear-sky background and keeps cold cloud',()=>{const bt=field((x,y)=>x>=24&&x<40&&y>=24&&y<40?-45:27),r=render(bt,null,W,H,'cloud',-52,false,{smooth:1,ppd:3});const a=(x:number,y:number)=>r.out[(y*W+x)*4+3];expect(a(5,5)).toBe(0);expect(a(32,32)).toBeGreaterThan(200);expect(r.flag).toBeGreaterThan(100)});
it('works on a cold surface through the local reference',()=>{const bt=field((x,y)=>x>=24&&x<40&&y>=24&&y<40?-55:-10),r=render(bt,null,W,H,'cloud',-52,false,{smooth:1,ppd:3});expect(r.out[(5*W+5)*4+3]).toBe(0);expect(r.out[(32*W+32)*4+3]).toBeGreaterThan(200)});
it('visible mode keeps bright cloud over dark surface',()=>{const bt=field((x,y)=>x>=24&&x<40&&y>=24&&y<40?235:40),r=render(bt,null,W,H,'cloud',-52,false,{smooth:1,ppd:3,src:'vis'});expect(r.out[(5*W+5)*4+3]).toBe(0);expect(r.out[(32*W+32)*4+3]).toBeGreaterThan(200)});
it('is empty when nothing has data',()=>{const r=render(new Float32Array(16).fill(NaN),null,4,4,'cloud',-52,false,{smooth:1});expect(r.flag).toBe(0);expect(Array.from(r.out).every(v=>v===0)).toBe(true)});
it('reference follows a gradient',()=>{const s=field((x)=>30-x*0.2),f=clearRef(s,W,H,3,0.9,true,-100,60);expect(f(2,10)).toBeGreaterThan(f(60,10))});
it('visible decode penalises saturated pixels',()=>{const v=decodeVis(Uint8ClampedArray.from([240,240,240,255,40,160,40,255,0,0,0,0]));expect(v[0]).toBeCloseTo(240,0);expect(v[1]).toBeLessThan(110);expect(Number.isNaN(v[2])).toBe(true)});
});
describe('brightness calibration',()=>{
const rgbLum=(l:number)=>[l,l,l,255];
const make=(f:(l:number)=>number,noise=0,n=64000)=>{const px=new Uint8ClampedArray(n*4),bt=new Float32Array(n);for(let i=0;i<n;i++){const l=Math.floor((i*7919)%256),c=rgbLum(l);px.set(c,i*4);bt[i]=f(l)+(noise?((i*31)%100/100-0.5)*noise:0)}return{px,bt}};
it('recovers a decreasing curve',()=>{const {px,bt}=make(l=>40-l*0.5);const f=fitCurve(px,bt);expect(f.ok).toBe(true);expect(f.rms).toBeLessThan(0.5);expect(f.lut[0]).toBeCloseTo(40,0);expect(f.lut[200]).toBeCloseTo(-60,0)});
it('is monotone even when noisy',()=>{const {px,bt}=make(l=>40-l*0.5,3);const f=fitCurve(px,bt);expect(f.ok).toBe(true);for(let l=1;l<256;l++)expect(f.lut[l]).toBeLessThanOrEqual(f.lut[l-1]+1e-6)});
it('also accepts an increasing curve',()=>{const {px,bt}=make(l=>-90+l*0.45);const f=fitCurve(px,bt);expect(f.ok).toBe(true);expect(f.lut[255]).toBeGreaterThan(f.lut[0])});
it('rejects a colour source',()=>{const {px,bt}=make(l=>40-l*0.5);for(let i=0;i<px.length;i+=4)px[i]=Math.min(255,px[i]+90);const f=fitCurve(px,bt);expect(f.ok).toBe(false);expect(f.why).toMatch(/grey/)});
it('rejects an unrelated image',()=>{const {px,bt}=make(l=>((l*37)%256)/4-30);const f=fitCurve(px,bt);expect(f.ok).toBe(false);expect(f.why).toMatch(/correlation|line up/)});
it('rejects too little overlap',()=>{const {px,bt}=make(l=>40-l*0.5,0,500);const f=fitCurve(px,bt);expect(f.ok).toBe(false);expect(f.why).toMatch(/overlapping/)});
it('pool adjacent violators makes a sequence non-decreasing',()=>{const o=pav([1,3,2,4],[1,1,1,1]);expect(o).toEqual([1,2.5,2.5,4])});
it('luminance helper matches Rec 601 weights',()=>{expect(lumOf(255,255,255)).toBe(255);expect(lumOf(255,0,0)).toBe(76)});
it('calibrate decodes the reference through the colormap and masks off-disk pixels',()=>{
const n=40000,w=200,h=200,src=new Uint8ClampedArray(n*4),ref=new Uint8ClampedArray(n*4),rgb=Uint8Array.from([255,0,0,0,255,0,0,0,255]),btv=Float32Array.from([-70,-30,10]);
for(let i=0;i<n;i++){const k=i%3,c=[[255,0,0],[0,255,0],[0,0,255]][k],l=[76,150,29][k];ref.set([...c,255],i*4);src.set([l,l,l,255],i*4)}
const f=calibrate({w,h,src,ref,rgb,btv,mask:{row:new Float32Array(h).fill(1),col:new Float32Array(w).fill(1)}});
expect(f.n).toBe(n);expect(f.ok).toBe(false)});
});
describe('product modes',()=>{
it('picks a decoder per product',()=>{expect(modeOf(L({decode:true,provider:'gibs',kind:'ir'}))).toBe('cmap');expect(modeOf(L({id:'B13/TBB'}))).toBe('lum');expect(modeOf(L({id:'globalir',provider:'realearth'}))).toBe('lum');expect(modeOf(L({kind:'vis',provider:'gibs'}))).toBe('vis');expect(modeOf(L({id:'REP/ETC'}))).toBe('vis');expect(modeOf(L({id:'B08/TBB'}))).toBeNull();expect(modeOf(null)).toBeNull()});
it('limits calibration to the IR products',()=>{expect(lumCapable({provider:'jma',id:'B08/TBB'})).toBe(false);expect(visCapable({kind:'ir',id:'x'})).toBe(false)});
});
describe('local frame cache',()=>{
const sw=readFileSync('public/sw.js','utf8');
it('page and service worker agree on which hosts are cached',()=>{expect(sw).toContain(SAT_RE.source.replace(/^\^/,'^'));});
it('matches provider tiles and the JMA relay only',()=>{expect(isSatUrl('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/x.png','https://a.app')).toBe(true);expect(isSatUrl('https://a.app/p/jma/bosai/x.jpg','https://a.app')).toBe(true);expect(isSatUrl('https://realearth.ssec.wisc.edu/tiles/globalir/1/2/3/4.png','https://a.app')).toBe(true);expect(isSatUrl('https://a.app/api/grid','https://a.app')).toBe(false);expect(isSatUrl('https://evil.example/wmts/x','https://a.app')).toBe(false)});
it('service worker only handles GET and keeps small or opaque answers out',()=>{expect(sw).toContain("r.method!=='GET'");expect(sw).toContain("res.type!=='opaque'");expect(sw).toContain('b.size>=300')});
it('formats sizes',()=>{expect(fmtBytes(2048)).toBe('2 KB');expect(fmtBytes(5*1048576)).toBe('5 MB')});
});
