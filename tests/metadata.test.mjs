import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildChapters, buildMetadata, buildShortManifests, buildSrt, fmtTime } from '../pipeline/lib/metadata.mjs';
import { loadEpisode } from '../pipeline/lib/script.mjs';
import { buildTimeline, expandScenes, planNarration } from '../pipeline/lib/timeline.mjs';
import { checkEpisode, similarity } from '../pipeline/validate.mjs';

const fakeTts = (plan) => {
  const tts = {};
  for (const p of plan) for (const s of p.segments) {
    tts[s.id] = { file: `${s.id}.wav`, duration: s.units.length * 0.28, units: s.units.map((_, i) => ({ start: i * 0.28, end: i * 0.28 + 0.24 })) };
  }
  return tts;
};
const ep1 = loadEpisode(path.join(__dirname, '..', 'episodes', 'ep01-earth-stops-spinning.yaml'));

describe('full episode timeline', () => {
  const plan = planNarration(ep1);
  const { manifest, audio } = buildTimeline(ep1, plan, fakeTts(plan));
  it('inserts the intro sting after introAfter and a 20 s end screen', () => {
    const ids = manifest.scenes.map((s) => s.id);
    expect(ids[ids.indexOf(ep1.introAfter) + 1]).toBe('_intro');
    const intro = manifest.scenes.find((s) => s.id === '_intro');
    expect(intro.end - intro.start).toBeCloseTo(2);
    const end = manifest.scenes[manifest.scenes.length - 1];
    expect(end.kind).toBe('endscreen');
    expect(end.end - end.start).toBeGreaterThanOrEqual(19.999);
    expect(audio.sfx.some((f) => f.name === 'sting')).toBe(true);
  });
  it('builds YouTube-valid chapters', () => {
    const ch = buildChapters(manifest);
    expect(ch[0].time).toBe(0);
    expect(ch.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ch.length; i++) expect(ch[i].time - ch[i - 1].time).toBeGreaterThanOrEqual(10);
  });
  it('slices shorts out of the long timeline', () => {
    const shorts = buildShortManifests(ep1, manifest);
    expect(shorts).toHaveLength(ep1.shorts.length);
    for (const s of shorts) {
      expect(s.manifest.width).toBe(1080);
      expect(s.manifest.height).toBe(1920);
      expect(s.manifest.scenes[0].transition).toBe('cut');
      expect(s.manifest.captions.every((p) => p.end > s.start && p.start < s.end)).toBe(true);
    }
  });
  it('writes metadata with chapters, sources and credits', () => {
    const meta = buildMetadata(ep1, manifest, buildShortManifests(ep1, manifest));
    expect(meta.description).toContain('0:00 ');
    expect(meta.description).toContain('Sources:');
    expect(meta.description).toContain('CC BY 4.0');
    expect(meta.madeForKids).toBe(false);
    expect(meta.tags.join(',').length).toBeLessThanOrEqual(500);
    expect(meta.shorts.every((s) => s.title.includes('#Shorts') && s.title.length <= 100)).toBe(true);
  });
  it('keeps descriptions under 5,000 characters', () => {
    const many = { ...ep1, sources: Array.from({ length: 60 }, (_, i) => `A very long explanation of source number ${i} that goes on and on and on: https://example.org/${i}`) };
    expect(buildMetadata(many, manifest, []).description.length).toBeLessThanOrEqual(5000);
  });
  it('produces SRT captions', () => {
    const srt = buildSrt(manifest.captions);
    expect(srt.startsWith('1\n00:00:0')).toBe(true);
    expect(srt).toContain(' --> ');
  });
});

describe('helpers', () => {
  it('formats times', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(75.6)).toBe('1:15');
    expect(fmtTime(3725)).toBe('1:02:05');
  });
  it('expandScenes leaves samples untouched', () => {
    const sample = loadEpisode(path.join(__dirname, '..', 'episodes', 'samples', 'ep01-style-test.yaml'));
    expect(expandScenes(sample)).toBe(sample.scenes);
  });
  it('similarity detects copied narration', () => {
    const a = 'the quick brown fox jumps over the lazy dog every single day';
    expect(similarity(a, a)).toBe(1);
    expect(similarity(a, 'completely different words about the moon and tides tonight')).toBe(0);
  });
  it('episode 1 passes the validator', () => {
    const r = checkEpisode(path.join(__dirname, '..', 'episodes', 'ep01-earth-stops-spinning.yaml'));
    expect(r.errors).toEqual([]);
  });
});
