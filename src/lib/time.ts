export type Tz='UTC'|'Local';
const P=(n:number)=>String(n).padStart(2,'0');
const MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export function parts(t:number,tz:Tz){const d=new Date(t*1000);return tz==='UTC'?{mo:d.getUTCMonth(),d:d.getUTCDate(),h:d.getUTCHours(),mi:d.getUTCMinutes()}:{mo:d.getMonth(),d:d.getDate(),h:d.getHours(),mi:d.getMinutes()}}
export function fmtTime(t:number,tz:Tz){const p=parts(t,tz);return`${P(p.d)} ${MO[p.mo]} ${P(p.h)}:${P(p.mi)} ${tz==='UTC'?'UTC':'local'}`}
export const fmtHM=(t:number,tz:Tz)=>{const p=parts(t,tz);return`${P(p.h)}:${P(p.mi)}`};
export const fmtDay=(t:number,tz:Tz)=>{const p=parts(t,tz);return`${P(p.d)} ${MO[p.mo]}`};
export const isMidnight=(t:number,tz:Tz)=>{const p=parts(t,tz);return p.h===0&&p.mi===0};
const C=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
export const compass=(d:number)=>C[Math.round(d/22.5)%16];
