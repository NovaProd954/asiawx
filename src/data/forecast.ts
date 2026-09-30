import {fetchJson} from '../lib/http';
export interface Point{model:string;run:number|null;lat:number;lon:number;elev:number|null;times:number[];vars:Record<string,(number|null)[]>;sunrise:number[];sunset:number[];fetched:number}
export function validatePoint(p:Point):Point{
if(!p?.times?.length||!p.vars)throw new Error('Malformed forecast');
for(const k of Object.keys(p.vars))if(p.vars[k].length!==p.times.length)throw new Error('Malformed forecast');
return p}
export const loadPoint=(model:string,lat:number,lon:number,signal:AbortSignal)=>fetchJson<Point>('point',`/api/point?model=${encodeURIComponent(model)}&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`,{signal,retries:1}).then(validatePoint);
export function valueAt(p:Point,k:string,t:number):number|null{const i=Math.round((t-p.times[0])/3600);return i>=0&&i<p.times.length&&p.times[i]===t?p.vars[k]?.[i]??null:null}
