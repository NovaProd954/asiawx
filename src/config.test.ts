import {describe,it,expect} from 'vitest';
import {BASES,atlasStyle,isDark,rampFor,RAMP_DARK,BOUNDS} from './config';
describe('asia atlas base map',()=>{
it('is the first base map and the rest are kept',()=>{expect(BASES[0].v).toBe('atlas');expect(BASES.map(b=>b.v)).toEqual(['atlas','dark','light','standard'])});
it('style serves versioned tiles inside the app bounds',()=>{const s=atlasStyle('https://x.test'),a=s.sources.atlas as {tiles:string[];bounds:number[];maxzoom:number};expect(a.tiles[0]).toBe('https://x.test/atlas/v1/{z}/{x}/{y}.webp');expect(a.bounds[0]).toBeLessThanOrEqual(BOUNDS[0][0]);expect(a.bounds[2]).toBeGreaterThanOrEqual(BOUNDS[1][0]);expect(a.maxzoom).toBe(5)});
it('keeps a vector source for satellite borders and glyphs for labels',()=>{const s=atlasStyle('');expect((s.sources.ofm as {type:string}).type).toBe('vector');expect(s.glyphs).toContain('{fontstack}')});
it('uses the dark ramp and dark glass on the atlas',()=>{expect(isDark('atlas')).toBe(true);expect(isDark('light')).toBe(false);expect(rampFor('atlas')).toBe(RAMP_DARK)});
});
