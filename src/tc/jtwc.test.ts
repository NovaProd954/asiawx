import {describe,it,expect} from 'vitest';
import {parseJtwc,matchJtwc,jtwcLinks} from '../../api/_jtwc';
import {envelope,quadRing,hull,radiiFor} from './radii';
import {catInfo,ssCat} from './cat';
import {hav,type Storm,type Jt} from '../../api/_tc';
const REF=Date.UTC(2026,9,7,14,0)/1000;
const TXT=`WTPN31 PGTW 071500
1. TYPHOON 17W (TESTSTORM) WARNING NR 009
   02 ACTIVE TROPICAL CYCLONES IN NORTHWESTPAC
   MAX SUSTAINED WINDS BASED ON ONE-MINUTE AVERAGE
   WIND RADII VALID OVER OPEN WATER ONLY
---
WARNING POSITION:
071200Z --- NEAR 17.2N 125.1E
  MOVEMENT PAST SIX HOURS - 330 DEGREES AT 12 KTS
  POSITION ACCURATE TO WITHIN 030 NM
PRESENT WIND DISTRIBUTION:
MAX SUSTAINED WINDS - 090 KT, GUSTS 110 KT
RADIUS OF 064 KT WINDS - 020 NM NORTHEAST QUADRANT
                         020 NM SOUTHEAST QUADRANT
                         015 NM SOUTHWEST QUADRANT
                         015 NM NORTHWEST QUADRANT
RADIUS OF 050 KT WINDS - 040 NM NORTHEAST QUADRANT
                         040 NM SOUTHEAST QUADRANT
                         030 NM SOUTHWEST QUADRANT
                         030 NM NORTHWEST QUADRANT
RADIUS OF 034 KT WINDS - 085 NM NORTHEAST QUADRANT
                         080 NM SOUTHEAST QUADRANT
                         070 NM SOUTHWEST QUADRANT
                         075 NM NORTHWEST QUADRANT
REPEAT POSIT: 17.1N 125.2E
---
FORECASTS:
12 HRS, VALID AT:
080000Z --- 18.4N 123.9E
MAX SUSTAINED WINDS - 100 KT, GUSTS 125 KT
RADIUS OF 064 KT WINDS - 025 NM NORTHEAST QUADRANT
                         025 NM SOUTHEAST QUADRANT
                         020 NM SOUTHWEST QUADRANT
                         020 NM NORTHWEST QUADRANT
RADIUS OF 034 KT WINDS - 095 NM NORTHEAST QUADRANT
                         090 NM SOUTHEAST QUADRANT
                         080 NM SOUTHWEST QUADRANT
                         085 NM NORTHWEST QUADRANT
VECTOR TO 24 HR POSIT: 330 DEG/ 11 KTS
---
24 HRS, VALID AT:
081200Z --- 19.9N 122.6E
MAX SUSTAINED WINDS - 105 KT, GUSTS 130 KT
RADIUS OF 034 KT WINDS - 100 NM NORTHEAST QUADRANT
                         095 NM SOUTHEAST QUADRANT
                         085 NM SOUTHWEST QUADRANT
                         090 NM NORTHWEST QUADRANT
---
REMARKS:
071500Z POSITION NEAR 17.5N 124.8E.
NEXT WARNINGS AT 072100Z.`;
describe('JTWC warning text',()=>{
const j=parseJtwc(TXT,REF) as Jt;
it('reads the header and issue time',()=>{expect(j.id).toBe('17W');expect(j.name).toBe('TESTSTORM');expect(j.nr).toBe(9);expect(j.issue).toBe(Date.UTC(2026,9,7,15,0)/1000)});
it('reads the warning position and forecast positions with lead times',()=>{expect(j.fixes.map(f=>f.h)).toEqual([0,12,24]);expect(j.fixes[0]).toMatchObject({lat:17.2,lon:125.1,windKt:90,gustKt:110});expect(j.fixes[1].t).toBe(Date.UTC(2026,9,8,0,0)/1000)});
it('reads quadrant radii in NE, SE, SW, NW order',()=>{expect(j.fixes[0].r34).toEqual([85,80,70,75]);expect(j.fixes[0].r50).toEqual([40,40,30,30]);expect(j.fixes[0].r64).toEqual([20,20,15,15]);expect(j.fixes[1].r50).toBeNull();expect(j.fixes[2].r64).toBeNull()});
it('stops at the remarks section',()=>{expect(j.fixes.length).toBe(3)});
it('crosses a month boundary',()=>{const t=TXT.replace('WTPN31 PGTW 071500','WTPN31 PGTW 010300').replace('071200Z','302100Z').replace('080000Z','010000Z');const k=parseJtwc(t,Date.UTC(2026,9,1,3,0)/1000) as Jt;expect(k.fixes[0].t).toBe(Date.UTC(2026,8,30,21,0)/1000)});
it('rejects text that is not a warning',()=>{expect(parseJtwc('nothing here',REF)).toBeNull()});
it('treats all-zero radii as absent',()=>{const z=TXT.replace(/ 034 KT WINDS - 100 NM/,' 034 KT WINDS - 000 NM').replace('095 NM SOUTHEAST QUADRANT\n                         085 NM SOUTHWEST QUADRANT\n                         090 NM NORTHWEST','000 NM SOUTHEAST QUADRANT\n                         000 NM SOUTHWEST QUADRANT\n                         000 NM NORTHWEST');const k=parseJtwc(z,REF) as Jt;expect(k.fixes[2].r34).toBeNull()});
it('finds warning links in a feed',()=>{const l=jtwcLinks('<item><link>http://www.metoc.navy.mil/jtwc/products/wp1726web.txt</link></item><a href="https://www.metoc.navy.mil/jtwc/products/wp1726web.txt">x</a><a href="https://x/products/sh0126web.txt">y</a>');expect(l).toEqual(['https://www.metoc.navy.mil/jtwc/products/wp1726web.txt'])});
it('matches a warning to the nearest JMA system',()=>{const s={nameEn:'',now:{lat:17.4,lon:125.0}} as unknown as Storm;const left=matchJtwc([s],[j]);expect(s.jt).toBe(j);expect(left).toEqual([])});
it('does not match a distant system',()=>{const s={nameEn:'OTHER',now:{lat:30,lon:140}} as unknown as Storm;matchJtwc([s],[j]);expect(s.jt).toBeUndefined()})});
describe('radii geometry',()=>{
const j=parseJtwc(TXT,REF) as Jt;
it('builds a closed ring whose points sit at the quadrant radii',()=>{const r=quadRing(17.2,125.1,[85,80,70,75]);expect(r[0]).toEqual(r[r.length-1]);for(const p of r){const d=hav(17.2,125.1,p[1],p[0])/1.852;expect(d).toBeGreaterThan(69);expect(d).toBeLessThan(86)}});
it('returns nothing for a missing radius',()=>{expect(radiiFor(j.fixes[1],'r50')).toBeNull()});
it('hull is convex and closed',()=>{const h=hull([[0,0],[1,0],[1,1],[0,1],[0.5,0.5]]);expect(h.length).toBe(5);expect(h[0]).toEqual(h[4])});
it('envelope covers every forecast ring and is a single polygon along a straight track',()=>{const e=envelope(j.fixes,'r34');expect(e).not.toBeNull();expect((e as unknown[]).length).toBe(1)});
it('envelope is null with no radii',()=>{expect(envelope(j.fixes,'r64')).not.toBeNull();expect(envelope([{...j.fixes[1]}],'r50')).toBeNull()})});
describe('category marker',()=>{
it('maps 1-minute winds to Saffir-Simpson',()=>{expect([63,64,82,83,95,96,112,113,136,137].map(ssCat)).toEqual([0,1,1,2,2,3,3,4,4,5])});
it('uses JTWC wind when matched',()=>{const j=parseJtwc(TXT,REF) as Jt;const c=catInfo({cat:'TY',now:{windKt:80},jt:j} as unknown as Storm);expect(c.label).toBe('2');expect(c.basis).toContain('JTWC')});
it('scales JMA 10-minute wind otherwise',()=>{const c=catInfo({cat:'TY',now:{windKt:85},jt:null} as unknown as Storm);expect(c.kt1).toBe(97);expect(c.label).toBe('3');expect(c.basis).toContain('1.14')});
it('shows TS and TD letters below hurricane strength',()=>{expect(catInfo({cat:'STS',now:{windKt:50}} as unknown as Storm).label).toBe('TS');expect(catInfo({cat:'TD',now:{windKt:30}} as unknown as Storm).label).toBe('TD')});
it('falls back to the JMA class without wind',()=>{expect(catInfo({cat:'TY',now:null} as unknown as Storm).label).toBe('TY')})});
