import {fetchJson} from '../lib/http';
import {BOUNDS} from '../config';
export interface Place{name:string;sub:string;lat:number;lon:number}
const COORD=/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;
export const inAsia=(lat:number,lon:number)=>lat>=BOUNDS[0][1]&&lat<=BOUNDS[1][1]&&lon>=BOUNDS[0][0]&&lon<=BOUNDS[1][0];
export function parseCoord(q:string):Place|null{const m=COORD.exec(q);if(!m)return null;const lat=+m[1],lon=+m[2];return Math.abs(lat)<=90&&Math.abs(lon)<=180?{name:`${lat.toFixed(3)}, ${lon.toFixed(3)}`,sub:'Coordinates',lat,lon}:null}
export async function search(q:string,signal:AbortSignal):Promise<Place[]>{
const j=await fetchJson<{results?:{name:string;latitude:number;longitude:number;country?:string;admin1?:string}[]}>('geocode',`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=20&language=en&format=json`,{signal,retries:1});
return(j.results??[]).filter(r=>inAsia(r.latitude,r.longitude)).slice(0,8).map(r=>({name:r.name,sub:[r.admin1,r.country].filter(Boolean).join(', '),lat:r.latitude,lon:r.longitude}))}
