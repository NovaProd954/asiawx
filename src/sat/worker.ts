import {run,calibrate,type DecodeIn,type CalibIn} from './decode';
import {histV2} from './real';
const post=(m:unknown,t:Transferable[]=[])=>(self as unknown as Worker).postMessage(m,t);
const canEnc=typeof OffscreenCanvas!=='undefined';
async function blobOf(px:Uint8ClampedArray,w:number,h:number):Promise<Blob|null>{
if(!canEnc)return null;
try{
const cv=new OffscreenCanvas(w,h),ctx=cv.getContext('2d');
if(!ctx)return null;
ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>,w,h),0,0);
return await cv.convertToBlob({type:'image/png'})}catch{return null}}
self.onmessage=async(e:MessageEvent<{id:number;kind:'decode'|'calib'|'ldec'|'hist';job:DecodeIn|CalibIn}>)=>{
const {id,kind,job}=e.data;
try{
if(kind==='calib'){post({id,ok:true,res:calibrate(job as CalibIn)});return}
if(kind==='hist'){post({id,ok:true,res:histV2(job as DecodeIn)});return}
const r=run(job as DecodeIn);
if(kind==='ldec'){
const blob=await blobOf(r.out,r.ow,r.oh);
if(blob){post({id,ok:true,res:{blob,ow:r.ow,oh:r.oh,stats:r.stats}});return}
post({id,ok:true,res:{out:r.out,ow:r.ow,oh:r.oh,stats:r.stats}},[r.out.buffer]);return}
post({id,ok:true,res:r},[r.out.buffer,r.bt.buffer])
}catch(err){post({id,ok:false,error:err instanceof Error?err.message:String(err)})}};
