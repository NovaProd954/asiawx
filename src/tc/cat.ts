import type {Storm} from '../../api/_tc';
export interface CatInfo{label:string;color:string;kt1:number|null;n:number|null;basis:string}
export const ssCat=(kt1:number)=>kt1>=137?5:kt1>=113?4:kt1>=96?3:kt1>=83?2:kt1>=64?1:0;
const COL=['#5aa9ff','#3ed6a5','#ffe45c','#ffb347','#ff8a4d','#ff5a5a','#e24fd8'];
const LETTER:Record<string,string>={TD:'TD',TS:'TS',STS:'TS',TY:'TY',EX:'EX',L:'L',LOW:'L'};
export function catInfo(s:Storm):CatInfo{
const j=s.jt?.fixes[0]?.windKt??null,m=s.now?.windKt??null;
if(s.cat==='EX')return{label:'EX',color:'#9a8cf0',kt1:null,n:null,basis:'JMA classes this system as extratropical'};
let kt1:number|null=null,basis='';
if(j!=null){kt1=j;basis=`JTWC 1-minute wind of ${j} kt`}
else if(m!=null){kt1=Math.round(m*1.14);basis=`JMA 10-minute wind of ${m} kt scaled by 1.14 to roughly ${kt1} kt as a 1-minute value`}
if(kt1==null){const l=LETTER[s.cat]??'?';return{label:l,color:l==='TD'?COL[0]:l==='TS'?COL[1]:l==='TY'?COL[4]:'#8fa3b3',kt1:null,n:null,basis:`No wind value in the feed, so only the JMA class ${s.cat} is shown`}}
const td=j!=null?kt1<34:s.cat==='TD';
if(kt1<64&&td)return{label:'TD',color:COL[0],kt1,n:null,basis};
if(kt1<64)return{label:'TS',color:COL[1],kt1,n:null,basis};
const n=ssCat(kt1);
return{label:String(n),color:COL[1+n],kt1,n,basis}}
