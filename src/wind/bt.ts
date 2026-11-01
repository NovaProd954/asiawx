import {btLut} from '../sat/pal';
import {lumOf,shiftRGBA} from '../sat/calib';
import {decodeBT,applyMask,type Mask} from '../sat/decode';
import {fuseBT} from './amv';
export interface BTJob{w:number;h:number;cur:Uint8ClampedArray;cur2:Uint8ClampedArray|null;rgb:Uint8Array;btv:Float32Array;lum:Float32Array;mask:Mask;sx?:number;sy?:number}
export function fusedBT(j:BTJob):{bt:Float32Array;valid:number}{
const n=j.w*j.h,g=j.rgb.length&&j.cur.length?decodeBT(j.cur,btLut(j.rgb,j.btv),{unmatched:0}):new Float32Array(n).fill(NaN),L=j.lum,b=j.cur2&&j.cur2.length?decodeBT(shiftRGBA(j.cur2,j.w,j.h,j.sx??0,j.sy??0),(r,gg,bb)=>L[lumOf(r,gg,bb)],{unmatched:0}):new Float32Array(n).fill(NaN);
applyMask(g,j.w,j.h,j.mask);applyMask(b,j.w,j.h,j.mask);
const bt=fuseBT(g,b);
let valid=0;for(let i=0;i<n;i++)if(bt[i]===bt[i])valid++;
return{bt,valid}}
