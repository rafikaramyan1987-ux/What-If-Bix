import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkShortFraming, punchZoom, TIKTOK } from '../src/scene/shortLayout';
import { TIKTOK_CAPTIONS } from '../src/scene/Hud';
// @ts-expect-error plain ES module
import { loadEpisode } from '../pipeline/lib/script.mjs';
// @ts-expect-error plain ES module
import { buildTimeline, planNarration } from '../pipeline/lib/timeline.mjs';
import {
  longestGap, loadTiktokSpec, MAX_GAP, pacingBeats, sidecarText, specProblems, tightenPlan, tiktokEpisode, toTiktokManifest,
  // @ts-expect-error plain ES module
} from '../pipeline/lib/tiktok.mjs';

const ROOT = path.join(__dirname, '..');
const TT = path.join(ROOT, 'shorts-tiktok');
const specs = fs.readdirSync(TT).filter((d) => fs.existsSync(path.join(TT, d, 'shorts.yaml'))).sort();

const fakeTts = (plan: { segments: { id: string; units: unknown[] }[] }[]) => {
  const tts: Record<string, unknown> = {};
  for (const p of plan) for (const sg of p.segments) {
    tts[sg.id] = { file: `${sg.id}.wav`, duration: sg.units.length * 0.3, units: sg.units.map((_, i) => ({ start: i * 0.3, end: i * 0.3 + 0.26 })) };
  }
  return tts;
};

describe('TikTok-optimised Shorts', () => {
  it('has three Shorts for each of episodes 1–5', () => {
    expect(specs).toEqual(['ep01-earth-stops-spinning', 'ep02-you-could-fly', 'ep03-sleep-like-a-dolphin', 'ep04-penguin-dads', 'ep05-octopus-hearts']);
    for (const id of specs) expect(loadTiktokSpec(path.join(TT, id, 'shorts.yaml')).shorts).toHaveLength(3);
  });

  it('rejects hooks over 6 words, long captions/titles, bad hashtags and open loops', () => {
    const ep = { scenes: [{ id: 'a' }, { id: 'b' }] };
    const bad = specProblems({ shorts: [{
      n: 1, slug: 'x', hook: 'one two three four five six seven', question: 'no question mark',
      tiktokCaption: `${'x'.repeat(151)} #a #b`, youtubeTitle: 'y'.repeat(61), scenes: [{ like: 'a' }, { like: 'b' }],
    }] }, ep).join('\n');
    expect(bad).toMatch(/hook must be 1–6 words/);
    expect(bad).toMatch(/question must be a question/);
    expect(bad).toMatch(/1–150 characters/);
    expect(bad).toMatch(/3–5 hashtags/);
    expect(bad).toMatch(/1–60 characters/);
    expect(bad).toMatch(/must reuse the first scene/);
  });

  it('burns captions in at full opacity from frame 0 (no fade-in, no dimmed words)', () => {
    expect(TIKTOK_CAPTIONS.fadeIn).toBe(false);
    expect(TIKTOK_CAPTIONS.dim).toBe(1);
  });

  it('snap zooms toggle on beats and return to 1 at the end (seamless loop)', () => {
    const p = { beats: [1, 2], end: 5 };
    expect(punchZoom(0.5, p)).toBe(1);
    expect(punchZoom(1.5, p)).toBeCloseTo(1.1);
    expect(punchZoom(2.5, p)).toBeCloseTo(1);
    expect(punchZoom(4.99, { beats: [1], end: 5 })).toBeCloseTo(1, 2);
  });

  it('fills long static stretches with beats', () => {
    const m = { duration: 10, scenes: [{ start: 0, texts: [], bix: [] }], captions: [{ start: 0 }, { start: 6 }] };
    const { events } = pacingBeats(m, []);
    expect(longestGap(events, 10)).toBeLessThanOrEqual(1.2);
  });

  for (const id of specs) {
    it(`${id}: specs are valid, Shorts loop, pace and frame correctly`, () => {
      const ep = loadEpisode(path.join(ROOT, 'episodes', `${id}.yaml`));
      const spec = loadTiktokSpec(path.join(TT, id, 'shorts.yaml'));
      expect(specProblems(spec, ep)).toEqual([]);
      for (const sh of spec.shorts) {
        const epLike = tiktokEpisode(ep, sh);
        expect(epLike.scenes.every((s: { transition: string }) => s.transition === 'cut')).toBe(true);
        const plan = planNarration(epLike);
        tightenPlan(plan);
        const t = buildTimeline(epLike, plan, fakeTts(plan));
        const { manifest, events } = toTiktokManifest(t.manifest, sh, t.audio.narration);
        expect(manifest.scenes.some((s: { kind?: string }) => s.kind === 'cta')).toBe(false);
        expect(longestGap(events, manifest.duration)).toBeLessThanOrEqual(MAX_GAP);
        expect(manifest.captions[0].words[0].start).toBeLessThanOrEqual(0.3);
        // the first caption page is already on screen at frame 0 (Captions shows a page from start - 0.05 s)
        expect(manifest.captions[0].start).toBeLessThanOrEqual(0.05);
        const pacing = { beats: manifest.tiktok.beats, end: manifest.duration, hardCuts: true, profile: TIKTOK };
        expect(checkShortFraming(manifest.scenes, { seconds: manifest.duration, pacing }), `${id} #${sh.n}`).toEqual([]);
        expect(sidecarText(sh, manifest.duration)).toMatch(/On-screen hook: .*\nTikTok caption: .*\nYouTube Shorts title: .*\nEnd question: /);
      }
    });
  }
});
