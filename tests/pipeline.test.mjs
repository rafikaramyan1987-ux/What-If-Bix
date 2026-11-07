import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { loadEpisode, normWord, parseNarration, segmentUnits } from '../pipeline/lib/script.mjs';
import { buildCaptionPages, buildTimeline, planNarration, resolveTime } from '../pipeline/lib/timeline.mjs';

describe('narration parsing', () => {
  it('handles spoken overrides and emphasis', () => {
    const u = parseNarration('about {1,670|sixteen hundred and seventy} km, *really*.');
    expect(u.map((x) => x.display)).toEqual(['about', '1,670', 'km,', 'really.']);
    expect(u[1].spoken).toBe('sixteen hundred and seventy');
    expect(u[3].emphasis).toBe(true);
  });
  it('splits sentences and ellipses into segments', () => {
    const segs = segmentUnits(parseNarration('What if... it stopped? Yes. No'));
    expect(segs.map((s) => s.units.length)).toEqual([2, 2, 1, 1]);
    expect(segs[0].pause).toBeGreaterThan(segs[2].pause);
  });
  it('normalises words for @refs', () => {
    expect(normWord('*Don’t*.')).toBe("don't");
    expect(normWord('1,670')).toBe('1,670');
  });
});

describe('timeline', () => {
  const ctx = { id: 's', start: 10, end: 20, words: [{ key: 'brakes', start: 12, end: 12.5 }, { key: 'brakes', start: 15, end: 15.4 }] };
  it('resolves word references with offsets', () => {
    expect(resolveTime('@brakes', ctx)).toBe(12);
    expect(resolveTime('@brakes#2.end', ctx)).toBeCloseTo(15.4);
    expect(resolveTime('@brakes+0.5', ctx)).toBe(12.5);
    expect(resolveTime('@end-1', ctx)).toBe(19);
    expect(resolveTime(2, ctx)).toBe(12);
    expect(() => resolveTime('@nope', ctx)).toThrow(/no word/);
  });
  it('converts every *At time field, including in the background', async () => {
    const { resolveDeep } = await import('../pipeline/lib/timeline.mjs');
    const out = resolveDeep({ bg: { lightsOffAt: 1 }, p: [{ failAt: 2, cutAt: '@brakes', x: 5 }] }, ctx);
    expect(out.bg.lightsOffAt).toBe(11);
    expect(out.p[0].failAt).toBe(12);
    expect(out.p[0].cutAt).toBe(12);
    expect(out.p[0].x).toBe(5);
  });
  it('builds caption pages that never cross sentences', () => {
    const w = (text, s, segEnd = false) => ({ text, start: s, end: s + 0.2, segEnd });
    const pages = buildCaptionPages([w('One', 0), w('two.', 0.3, true), w('Three', 1), w('four', 1.3), w('five', 1.6), w('six', 1.9), w('seven', 2.2), w('eight', 2.5)]);
    expect(pages[0].words.map((x) => x.text)).toEqual(['One', 'two.']);
    expect(pages.every((p) => p.words.length <= 5)).toBe(true);
  });
  it('lays out the sample episode with fake TTS', () => {
    const ep = loadEpisode(path.join(__dirname, '..', 'episodes', 'samples', 'ep01-style-test.yaml'));
    const plan = planNarration(ep);
    const tts = {};
    for (const p of plan) for (const s of p.segments) tts[s.id] = { file: `${s.id}.wav`, duration: s.units.length * 0.3, units: s.units.map((_, i) => ({ start: i * 0.3, end: i * 0.3 + 0.25 })) };
    const { manifest, audio } = buildTimeline(ep, plan, tts);
    expect(manifest.duration).toBeGreaterThanOrEqual(30);
    expect(manifest.scenes.map((s) => s.id)).toContain('brakes');
    const brakes = manifest.scenes.find((s) => s.id === 'brakes');
    expect(brakes.bix.every((c) => c.at >= brakes.start && c.at <= brakes.end)).toBe(true);
    expect(audio.sfx.some((f) => f.name === 'screech')).toBe(true);
    for (let i = 1; i < manifest.scenes.length; i++) expect(manifest.scenes[i].start).toBeCloseTo(manifest.scenes[i - 1].end);
  });
});
