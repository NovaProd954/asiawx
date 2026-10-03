import {run,calibrate,type DecodeIn,type CalibIn} from './decode';
const post=(m:unknown,t:Transferable[]=[])=>(self as unknown as Worker).postMessage(m,t);
self.onmessage=(e:MessageEvent<{id:number;kind:'decode'|'calib';job:DecodeIn|CalibIn}>)=>{
const {id,kind,job}=e.data;
try{
if(kind==='calib'){post({id,ok:true,res:calibrate(job as CalibIn)});return}
const r=run(job as DecodeIn);
post({id,ok:true,res:r},[r.out.buffer,r.bt.buffer])
}catch(err){post({id,ok:false,error:err instanceof Error?err.message:String(err)})}};
