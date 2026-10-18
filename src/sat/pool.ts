type Rep={ok:boolean;res?:unknown;error?:string};
export class Pool{
private ws:Worker[]=[];private load:number[]=[];private pend=new Map<number,{w:number;f:(r:Rep)=>void}>();private id=0;
constructor(n:number){
if(typeof Worker==='undefined')return;
for(let i=0;i<n;i++){
try{
const w=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'}),k=i;
w.onmessage=e=>{const p=this.pend.get(e.data.id);if(p){this.pend.delete(e.data.id);this.load[k]--;p.f(e.data)}};
w.onerror=()=>{for(const [id,p] of this.pend)if(p.w===k){this.pend.delete(id);this.load[k]--;p.f({ok:false,error:'worker failed'})}};
this.ws.push(w);this.load.push(0)}catch{break}}}
get size(){return this.ws.length}
call<T>(kind:string,job:unknown,tr:Transferable[]=[]):Promise<T>{
if(!this.ws.length)return Promise.reject(new Error('no workers'));
let k=0;
for(let i=1;i<this.ws.length;i++)if(this.load[i]<this.load[k])k=i;
const id=++this.id;
return new Promise<T>((res,rej)=>{
this.pend.set(id,{w:k,f:r=>r.ok?res(r.res as T):rej(new Error(r.error))});
this.load[k]++;
this.ws[k].postMessage({id,kind,job},tr)})}
close(){for(const w of this.ws)w.terminate();this.ws=[];this.load=[];this.pend.clear()}}
