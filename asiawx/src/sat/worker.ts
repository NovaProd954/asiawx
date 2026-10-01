import {run,type DecodeIn} from './decode';
self.onmessage=(e:MessageEvent<{id:number;job:DecodeIn}>)=>{
const {id,job}=e.data;
try{const r=run(job);(self as unknown as Worker).postMessage({id,ok:true,out:r.out,bt:r.bt,stats:r.stats},[r.out.buffer,r.bt.buffer])}
catch(err){(self as unknown as Worker).postMessage({id,ok:false,error:err instanceof Error?err.message:String(err)})}};
