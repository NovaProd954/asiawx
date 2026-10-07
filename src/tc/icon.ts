import {ARM,ARM_CX,ARM_CY} from './arm';
import type {CatInfo} from './cat';
export function tcIcon(c:CatInfo,size=56,spin=true):string{
const dur=c.kt1==null?8:Math.max(2.2,9-c.kt1/22),fs=c.label.length>1?470:640;
return`<svg class="tci" width="${size}" height="${size}" viewBox="-1500 -1500 3000 3000" aria-hidden="true" focusable="false"><g class="${spin?'tci-spin':''}" style="animation-duration:${dur.toFixed(1)}s"><path d="${ARM}" transform="translate(${-ARM_CX} ${-ARM_CY})" fill="${c.color}" stroke="#fff" stroke-width="90" stroke-linejoin="round" paint-order="stroke"/></g><circle r="440" fill="#0c1620" stroke="#fff" stroke-width="70"/><text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="'JetBrains Mono',ui-monospace,monospace" font-weight="700" font-size="${fs}">${c.label}</text></svg>`}
