import { describe, expect, it } from 'vitest';
import { bixStateAt, resolveCues } from '../src/bix/motion';
import { ACTIONS, actionPose } from '../src/bix/poses';
import { earthSpin } from '../src/scene/props';
import { cameraTransform } from '../src/scene/SceneView';

describe('Bix rig', () => {
  it('every action yields finite pose values', () => {
    for (const a of ACTIONS) for (const t of [0, 0.3, 1.7, 5]) {
      const o = actionPose(a, t, t, { panic: 1 });
      for (const v of Object.values(o.pose)) expect(Number.isFinite(v)).toBe(true);
    }
  });
  it('travels between cue positions and faces the direction of travel', () => {
    const r = resolveCues([{ at: 0, action: 'walk', from: [100, 800], to: [500, 800], dur: 2 }, { at: 3, action: 'point' }], { pos: [0, 0], scale: 1, facing: 1 });
    expect(bixStateAt(r, 1)!.x).toBeCloseTo(300);
    expect(bixStateAt(r, 2.5)!.action).toBe('idle');
    expect(bixStateAt(r, 4)!.x).toBe(500);
    const back = resolveCues([{ at: 0, action: 'run', from: [500, 0], to: [100, 0] }], { pos: [0, 0], scale: 1, facing: 1 });
    expect(back[0].facingV).toBe(-1);
  });
  it('earth spin stops after the brake', () => {
    const a = earthSpin(5, 1, 2);
    expect(earthSpin(9, 1, 2)).toBeCloseTo(a);
    expect(earthSpin(1, 1, 2)).toBe(1);
  });
});

describe('camera', () => {
  it('clamps focus so the stage edge never shows', () => {
    const scene = { id: 's', start: 0, end: 4, background: { type: 'space' }, props: [], bix: [], texts: [], chips: [], camera: { zoom: [1, 1] as [number, number], focus: [700, 560] as [number, number] } };
    expect(cameraTransform(scene, 1)).toContain('translate(-960 -540)');
  });
});
