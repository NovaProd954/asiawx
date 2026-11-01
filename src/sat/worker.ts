import {calibrate,type DecodeIn,type CalibIn} from './decode';
import {runAny as run} from './fuse';
import type {Tiles,TileRef} from './pool';
import {histV2} from './real';
import {fusedBT,type BTJob} from '../wind/bt';
import {track,vectors,analyse,type TrackOpt,type Trk,type Win,type Levels} from '../wind/amv';
const post=(m:unknown,t:Transferable[]=[])=>(self as unknown as Worker).postMessage(m,t);
const canEnc=typeof OffscreenCanvas!=='undefined';
async function blobOf(px:Uint8ClampedArray,w:number,h:number):Promise<Blob|null>{
if(!canEnc)return null;
try{
const cv=new OffscreenCanvas(w,h),ctx=cv.getContext('2d');
if(!ctx)return null;
ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>,w,h),0,0);
return await cv.convertToBlob({type:'image/png'})}catch{return null}}
async function mosaicW(list:TileRef[],w:number,h:number):Promise<Uint8ClampedArray>{
if(!canEnc)throw new Error('no OffscreenCanvas');
const cv=new OffscreenCanvas(w,h),ctx=cv.getContext('2d',{willReadFrequently:true}) as OffscreenCanvasRenderingContext2D|null;
if(!ctx)throw new Error('no 2d context');
ctx.imageSmoothingEnabled=false;
let next=0;
const lane=async()=>{
while(next<list.length){
const t=list[next++],r=await fetch(t.u);
if(r.status===404)continue;
if(!r.ok)throw new Error(`HTTP ${r.status}`);
const bm=await createImageBitmap(await r.blob(),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
ctx.drawImage(bm,t.x*256,t.y*256);bm.close()}};
await Promise.all(Array.from({length:8},lane));
return ctx.getImageData(0,0,w,h).data}
async function fill(job:DecodeIn,t?:Tiles){
if(!t)return;
const [a,b,c]=await Promise.all([mosaicW(t.cur,t.w,t.h),t.cur2?mosaicW(t.cur2,t.w,t.h):null,t.prev?mosaicW(t.prev,t.w,t.h):null]);
job.cur=a;job.cur2=b;job.prev=c}
self.onmessage=async(e:MessageEvent<{id:number;kind:'decode'|'calib'|'ldec'|'hist'|'wbt'|'amv'|'wan';job:any;tiles?:Tiles}>)=>{
const {id,kind,job,tiles}=e.data;
try{
if(tiles)await fill(job as DecodeIn,tiles);
if(kind==='wbt'){const r=fusedBT(job as BTJob);post({id,ok:true,res:r},[r.bt.buffer]);return}
if(kind==='amv'){const j=job as {b0:Float32Array;b1:Float32Array;w:number;h:number;o:TrackOpt};post({id,ok:true,res:track(j.b0,j.b1,j.w,j.h,j.o)});return}
if(kind==='wan'){const j=job as {trk:Trk[];win:Win;dt:number;L:Levels};const vs=vectors(j.trk,j.win,j.dt,j.L),a=analyse(vs,j.L);post({id,ok:true,res:a},a.bands.flatMap(b=>[b.u.buffer,b.v.buffer,b.conf.buffer]));return}
if(kind==='calib'){post({id,ok:true,res:calibrate(job as CalibIn)});return}
if(kind==='hist'){post({id,ok:true,res:histV2(job as DecodeIn)});return}
const r=run(job as DecodeIn);
if(kind==='ldec'){
const blob=await blobOf(r.out,r.ow,r.oh);
if(blob){post({id,ok:true,res:{blob,ow:r.ow,oh:r.oh,stats:r.stats}});return}
post({id,ok:true,res:{out:r.out,ow:r.ow,oh:r.oh,stats:r.stats}},[r.out.buffer]);return}
post({id,ok:true,res:r},[r.out.buffer,r.bt.buffer])
}catch(err){post({id,ok:false,error:err instanceof Error?err.message:String(err)})}};
