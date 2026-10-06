export interface Tick{i:number;t:number;major:boolean}
const STEPS=[600,1800,3600,10800,21600,43200,86400];
const md=(x:number,s:number)=>((x%s)+s)%s;
export function pickTicks(times:number[],max:number,off=0):Tick[]{
if(times.length<2)return[];
let prev:Tick[]=[];
for(const s of STEPS){
const r:Tick[]=[];
for(let i=0;i<times.length;i++){const l=times[i]+off;if(md(l,s)===0)r.push({i,t:times[i],major:md(l,86400)===0})}
if(r.length>max){prev=r;continue}
if(r.length>=2)return r;
break}
const src=prev.length?prev:times.map((t,i)=>({i,t,major:false}));
const k=Math.ceil(src.length/max);
return src.filter((_,j)=>j%k===0)}
