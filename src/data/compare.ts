import {fetchJson} from '../lib/http';
export interface CmpModel{id:string;name:string;org?:string;ok:boolean;err?:string;ms?:number;run?:number|null;vars:Record<string,(number|null)[]>}
export interface CmpData{lat:number;lon:number;times:number[];models:CmpModel[];fetched:number}
export function validateCmp(d:CmpData):CmpData{
if(!d?.times?.length||!Array.isArray(d.models))throw new Error('Malformed comparison');
for(const m of d.models)if(m.ok)for(const k of Object.keys(m.vars))if(m.vars[k].length!==d.times.length)throw new Error('Malformed comparison');
return d}
export const loadCmp=(lat:number,lon:number,signal:AbortSignal)=>fetchJson<CmpData>('cmp',`/api/compare?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`,{signal,timeout:30000,retries:1}).then(validateCmp);
export interface BandD{p10:(number|null)[];p25:(number|null)[];p50:(number|null)[];p75:(number|null)[];p90:(number|null)[];min:(number|null)[];max:(number|null)[];mean:(number|null)[]}
export interface DayD{day:number;n:number;p10:number;p50:number;p90:number;ge1:number;ge10:number;ge25:number}
export interface EnsOne{id:string;name:string;org:string;ok:boolean;err?:string;ms?:number;members?:number;times?:number[];vars?:Record<string,BandD>;rain?:DayD[]}
export interface EnsData{lat:number;lon:number;ens:EnsOne[];fetched:number}
export function validateEns(d:EnsData):EnsData{
if(!Array.isArray(d?.ens))throw new Error('Malformed ensemble');
for(const e of d.ens)if(e.ok){if(!e.times||!e.vars)throw new Error('Malformed ensemble');for(const k of Object.keys(e.vars))if(e.vars[k].p50.length!==e.times.length)throw new Error('Malformed ensemble')}
return d}
export const loadEns=(lat:number,lon:number,signal:AbortSignal)=>fetchJson<EnsData>('ens',`/api/ens?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`,{signal,timeout:45000,retries:1}).then(validateEns);
