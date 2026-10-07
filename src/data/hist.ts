import {fetchJson} from '../lib/http';
export interface ClimStatD{mean:(number|null)[];sd:(number|null)[];p10:(number|null)[];p90:(number|null)[]}
export interface ClimD{tmean:ClimStatD;tmax:ClimStatD;tmin:ClimStatD;wmax:ClimStatD;prcp:{mean:(number|null)[];wet:(number|null)[]};years:number;window:number}
export interface ClimResp{source:string;period:string;model:string;lat:number;lon:number;elev:number|null;clim:ClimD;fetched:number}
export interface RecentResp{source:string;model:string;lat:number;lon:number;times:number[];tmean:(number|null)[];tmax:(number|null)[];tmin:(number|null)[];prcp:(number|null)[];wmax:(number|null)[];fetched:number}
const sn=(x:number)=>(Math.round(x*4)/4).toFixed(2);
export function validateClim(c:ClimResp):ClimResp{
if(!c?.clim||c.clim.tmean?.mean?.length!==365||c.clim.prcp?.mean?.length!==365)throw new Error('Malformed climatology');
return c}
export function validateRecent(r:RecentResp):RecentResp{
if(!r?.times?.length)throw new Error('Malformed history');
for(const k of ['tmean','tmax','tmin','prcp','wmax'] as const)if(r[k].length!==r.times.length)throw new Error('Malformed history');
return r}
export const loadClim=(lat:number,lon:number,signal:AbortSignal)=>fetchJson<ClimResp>('hist',`/api/hist?part=clim&lat=${sn(lat)}&lon=${sn(lon)}`,{signal,timeout:60000,retries:1}).then(validateClim);
export const loadRecent=(lat:number,lon:number,signal:AbortSignal)=>fetchJson<RecentResp>('hist',`/api/hist?part=recent&lat=${sn(lat)}&lon=${sn(lon)}`,{signal,timeout:60000,retries:1}).then(validateRecent);
