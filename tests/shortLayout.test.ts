import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  checkShortFraming, FRAME_BOX, inside, mapBox, presenter, propBox, SAFE_BOX, sceneFraming, shortMode, SUBJECT_ZONE,
} from '../src/scene/shortLayout';
import { Scene } from '../src/types';
// @ts-expect-error plain ES module
import { loadEpisode } from '../pipeline/lib/script.mjs';
// @ts-expect-error plain ES module
import { buildTimeline, planNarration } from '../pipeline/lib/timeline.mjs';
// @ts-expect-error plain ES module
import { shortEpisode, toShortManifest } from '../pipeline/lib/shorts.mjs';

const scene = (over: Partial<Scene>): Scene => ({
  id: 's', start: 0, end: 10, background: { type: 'lab' }, props: [], bix: [{ at: 0, action: 'idle' }],
  bixDefaults: { pos: [300, 820], scale: 1, facing: 1 }, texts: [], chips: [], ...over,
});

describe('Shorts layout', () => {
  it('frames key objects large and centred under the hook, Bix at the presenter spot', () => {
    const s = scene({ props: [{ type: 'dolphin', x: 1500, y: 600, s: 0.8 }] });
    expect(shortMode(s)).toBe('presenter');
    const f = sceneFraming(s, 0, 0);
    const box = mapBox(propBox(s.props[0], 0)!, f);
    expect(inside(box, SAFE_BOX)).toBe(true);
    expect(box.x1 - box.x0).toBeGreaterThan(600); // fills the subject zone width
    expect(Math.abs((box.x0 + box.x1) / 2 - (SUBJECT_ZONE.x0 + SUBJECT_ZONE.x1) / 2)).toBeLessThan(5);
    expect(inside(presenter().box, SAFE_BOX)).toBe(true);
    expect(checkShortFraming([s])).toEqual([]);
  });

  it('frames Bix himself when a scene has no key objects, even while he walks', () => {
    const s = scene({ bix: [{ at: 0, action: 'walk', from: [100, 820], to: [1800, 820], dur: 2 }] });
    expect(shortMode(s)).toBe('follow');
    expect(checkShortFraming([s])).toEqual([]);
  });

  it('fails when Bix or a key object is cut by the frame edge', () => {
    // forced subject on the far right: Bix (left) and the cactus (far left) fall outside
    const s = scene({ shortLayout: { mode: 'follow', subject: [1500, 300, 1900, 800] }, props: [{ type: 'cactus', x: 60, y: 700 }] });
    const issues = checkShortFraming([s]);
    expect(issues.some((i) => i.what === 'Bix' && i.zone === 'safe')).toBe(true);
    expect(issues.some((i) => i.what === 'cactus' && i.zone === 'frame')).toBe(true);
    expect(issues.every((i) => !inside(i.box, i.zone === 'safe' ? SAFE_BOX : FRAME_BOX))).toBe(true);
  });

  const fakeTts = (plan: { segments: { id: string; units: unknown[] }[] }[]) => {
    const tts: Record<string, unknown> = {};
    for (const p of plan) for (const sg of p.segments) {
      tts[sg.id] = { file: `${sg.id}.wav`, duration: sg.units.length * 0.28, units: sg.units.map((_, i) => ({ start: i * 0.28, end: i * 0.28 + 0.24 })) };
    }
    return tts;
  };
  for (const file of ['ep03-sleep-like-a-dolphin.yaml', 'ep04-penguin-dads.yaml', 'ep05-octopus-hearts.yaml']) {
    it(`${file}: every Short passes the first-3-seconds framing check`, () => {
      const ep = loadEpisode(path.join(__dirname, '..', 'episodes', file));
      for (const sh of ep.shorts) {
        const sep = shortEpisode(ep, sh);
        const plan = planNarration(sep);
        const m = toShortManifest(buildTimeline(sep, plan, fakeTts(plan)).manifest, sh, ep);
        expect(checkShortFraming(m.scenes), `${sh.id}`).toEqual([]);
        // the subject is visible from frame 0: nothing pops in at t = 0 in the first scene
        expect(m.scenes[0].props.every((p: Record<string, unknown>) => typeof p.at !== 'number' || p.at > m.scenes[0].start + 0.05)).toBe(true);
      }
    });
  }
});
