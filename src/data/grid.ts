import {fetchJson} from '../lib/http';
import {toUV,type Geom} from '../lib/wind';
export interface GridSet{model:string;run:number|null;times:number[];g:Geom;u:Float32Array[];v:Float32Array[];fetched:number;missing:number}
export interface RawGrid{model:string;run:number|null;lon0:number;lat0:number;d:number;nx:number;ny:number;times:number[];speed:(number|null)[][];dir:(number|null)[][];missing:number;fetched:number}
export function parseGrid(r:RawGrid):GridSet{
const n=r.nx*r.ny;
if(!(n>0)||!r.times?.length||r.speed?.length!==r.times.length||r.dir?.length!==r.times.length)throw new Error('Malformed wind grid');
const u:Float32Array[]=[],v:Float32Array[]=[];
for(let h=0;h<r.times.length;h++){
if(r.speed[h].length!==n||r.dir[h].length!==n)throw new Error('Malformed wind grid');
const a=new Float32Array(n),b=new Float32Array(n);
for(let k=0;k<n;k++){const s=r.speed[h][k],d=r.dir[h][k];if(s==null||d==null||!Number.isFinite(s)||!Number.isFinite(d)){a[k]=NaN;b[k]=NaN}else{const p=toUV(s,d);a[k]=p[0];b[k]=p[1]}}
u.push(a);v.push(b)}
return{model:r.model,run:r.run,times:r.times,g:{lon0:r.lon0,lat0:r.lat0,d:r.d,nx:r.nx,ny:r.ny},u,v,fetched:r.fetched,missing:r.missing}}
export const loadGrid=(model:string,signal:AbortSignal)=>fetchJson<RawGrid>('grid',`/api/grid?model=${encodeURIComponent(model)}`,{signal,timeout:45000,retries:1}).then(parseGrid);
