// Procedural pose library for Bix.
// Angles are degrees measured from "straight down"; positive rotates toward the
// direction Bix faces. Knees bend backward with positive values, elbows bend
// forward/up with positive values.

export type Pose = {
  lean: number; // torso lean
  head: number; // head tilt
  sN: number; eN: number; // near arm: shoulder, elbow
  sF: number; eF: number; // far arm
  hN: number; kN: number; // near leg: hip, knee
  hF: number; kF: number; // far leg
  bob: number; // vertical body offset in px (+ = up)
  rot: number; // whole-body rotation around the hips
  dx: number; // horizontal offset (px, facing-relative)
  squash: number; // 1 = normal, <1 squashed
  beanie: number; // beanie tilt (secondary motion)
};

export type Eyes = 'open' | 'wide' | 'happy' | 'closed' | 'squint' | 'up' | 'side';
export type Mouth = 'smile' | 'grin' | 'o' | 'shout' | 'flat' | 'wavy' | 'laugh' | 'smirk' | 'frown';

export type Face = {
  eyes: Eyes;
  mouth: Mouth;
  brow: number; // -1 angry/focused ... 0 neutral ... 1 raised/surprised
  browTilt: number; // asymmetry, + raises the far brow
  look: [number, number]; // pupil offset -1..1
  blush: boolean;
};

export type Emote = 'none' | 'exclaim' | 'question' | 'haha' | 'sweat' | 'idea' | 'zzz';

export type ActionOutput = { pose: Pose; face: Face; emote: Emote };

export const ACTIONS = [
  'idle', 'walk', 'run', 'jump', 'fly', 'point', 'shock', 'laugh', 'think',
  'shrug', 'wave', 'tumble', 'facepalm', 'sleepy', 'cheer', 'float', 'sit', 'present',
] as const;
export type BixAction = (typeof ACTIONS)[number];

const base: Pose = {
  lean: 0, head: 0, sN: 8, eN: 10, sF: -8, eF: 10, hN: 3, kN: 2, hF: -3, kF: 2,
  bob: 0, rot: 0, dx: 0, squash: 1, beanie: 0,
};
const neutralFace: Face = { eyes: 'open', mouth: 'smile', brow: 0, browTilt: 0, look: [0.3, 0], blush: false };

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};

/** Deterministic blink: eyes closed ~0.12 s every few seconds. */
export const isBlinking = (t: number, seed = 0) => {
  const period = 3.3 + (seed % 3) * 0.4;
  const ph = (t + seed * 0.77) % period;
  return ph > period - 0.12;
};

type Fn = (lt: number, t: number, p: Record<string, number>) => ActionOutput;

const idle: Fn = (_lt, t) => {
  const b = Math.sin(t * TAU * 0.35);
  return {
    pose: { ...base, bob: 1.5 * b, sN: 8 + 2 * b, sF: -8 - 2 * b, head: 1.5 * Math.sin(t * 1.1) },
    face: { ...neutralFace },
    emote: 'none',
  };
};

const walkCycle = (t: number, rate: number, amp: number, knee: number, arm: number, elbow: number) => {
  const ph = t * TAU * rate;
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  return {
    hN: amp * s, hF: -amp * s,
    kN: 6 + knee * Math.max(0, -c), kF: 6 + knee * Math.max(0, c),
    sN: -arm * s, sF: arm * s, eN: elbow, eF: elbow,
    bob: (amp / 5) * (1 - Math.abs(s)) - 2,
    ph,
  };
};

const walk: Fn = (_lt, t) => {
  const w = walkCycle(t, 1.05, 26, 38, 24, 22);
  return {
    pose: { ...base, ...w, lean: 4, head: -2 + 2 * Math.sin(w.ph * 2), beanie: 2 * Math.sin(w.ph * 2) },
    face: { ...neutralFace, look: [0.6, 0] },
    emote: 'none',
  };
};

const run: Fn = (_lt, t) => {
  const w = walkCycle(t, 1.7, 42, 85, 55, 85);
  return {
    pose: { ...base, ...w, lean: 16, head: -10, beanie: -8 + 4 * Math.sin(w.ph * 2) },
    face: { ...neutralFace, mouth: 'grin', brow: -0.3, look: [1, 0] },
    emote: 'none',
  };
};

export const JUMP_DURATION = 0.95;
const jump: Fn = (lt) => {
  const d = JUMP_DURATION;
  let bob = 0, k = 10, armS = 10, armE = 10, squash = 1, beanie = 0;
  if (lt < 0.16) { // anticipation crouch
    const a = smooth(lt / 0.16);
    bob = -22 * a; k = 10 + 55 * a; armS = 10 - 45 * a; squash = 1 - 0.08 * a;
  } else if (lt < 0.78) { // airborne
    const a = (lt - 0.16) / 0.62;
    bob = 170 * 4 * a * (1 - a);
    k = 15 + 45 * Math.sin(Math.PI * a);
    armS = 165 - 20 * a; armE = 15;
    squash = 1 + 0.06 * Math.cos(Math.PI * a);
    beanie = -14 * Math.cos(Math.PI * a);
  } else if (lt < d) { // landing
    const a = smooth((lt - 0.78) / (d - 0.78));
    bob = -16 * (1 - a); k = 50 * (1 - a) + 6; armS = 40 * (1 - a) + 10; squash = 0.9 + 0.1 * a;
  }
  return {
    pose: { ...base, bob, kN: k, kF: k, hN: k * 0.55, hF: k * 0.45, sN: armS, sF: -armS, eN: armE, eF: armE, squash, beanie },
    face: { ...neutralFace, mouth: lt > 0.16 && lt < 0.78 ? 'grin' : 'smile', eyes: lt > 0.16 && lt < 0.78 ? 'happy' : 'open', brow: 0.4 },
    emote: 'none',
  };
};

const fly: Fn = (_lt, t, p) => {
  const panic = p.panic ?? 0;
  const f = Math.sin(t * TAU * 3);
  const flail = Math.sin(t * TAU * 4.2);
  return {
    pose: {
      ...base,
      rot: 78,
      lean: 0,
      head: -62 + 3 * f,
      sN: 172 + 6 * f + panic * 40 * flail, eN: 4 + panic * 60 * Math.max(0, flail),
      sF: 15 + panic * 120 * Math.max(0, -flail), eF: 10 + panic * 50,
      hN: 8 + 6 * f + panic * 25 * flail, kN: 14 + 10 * Math.max(0, f) + panic * 40,
      hF: -6 - 6 * f - panic * 25 * flail, kF: 24 + 10 * Math.max(0, -f) + panic * 30,
      bob: 6 * Math.sin(t * TAU * 0.8),
      beanie: -20 + 4 * f,
    },
    face: panic > 0.5
      ? { ...neutralFace, eyes: 'wide', mouth: 'shout', brow: 1, look: [0.2, 0] }
      : { ...neutralFace, mouth: 'grin', brow: -0.2, look: [1, 0] },
    emote: panic > 0.5 ? 'sweat' : 'none',
  };
};

const point: Fn = (lt, t) => {
  const pop = smooth(lt / 0.2);
  const wag = 3 * Math.sin(t * TAU * 1.5);
  return {
    pose: {
      ...base, lean: 3, head: 4, sN: 18 + 82 * pop + wag, eN: 4, sF: -45, eF: 85,
      hN: 8, kN: 4, hF: -6, kF: 4, bob: 2 * Math.sin(t * 3),
    },
    face: { ...neutralFace, mouth: 'grin', brow: 0.4, look: [1, -0.3] },
    emote: 'none',
  };
};

const shock: Fn = (lt, t) => {
  const hop = lt < 0.3 ? Math.sin((lt / 0.3) * Math.PI) : 0;
  const tremble = lt > 0.25 ? 2.2 * Math.sin(t * 70) : 0;
  const up = smooth(lt / 0.15);
  return {
    pose: {
      ...base, lean: -10 * up, head: -6 * up, bob: 26 * hop, dx: -28 * smooth(lt / 0.25) + tremble,
      sN: 10 + 140 * up, eN: 30, sF: -10 - 140 * up, eF: 30,
      hN: 14 * up, kN: 6, hF: -14 * up, kF: 6, squash: 1 + 0.06 * hop, beanie: -10 * hop + 3 * Math.sin(t * 50),
    },
    face: { ...neutralFace, eyes: 'wide', mouth: 'shout', brow: 1, look: [0, 0] },
    emote: 'exclaim',
  };
};

const laugh: Fn = (_lt, t) => {
  const b = Math.abs(Math.sin(t * TAU * 3.2));
  return {
    pose: {
      ...base, lean: -12 + 4 * b, head: -14 + 5 * b, bob: 5 * b,
      sN: -37, eN: 116, sF: 37, eF: -116, hN: 10, kN: 8, hF: -10, kF: 8, beanie: 4 * b,
    },
    face: { ...neutralFace, eyes: 'happy', mouth: 'laugh', brow: 0.6, blush: true },
    emote: 'haha',
  };
};

const think: Fn = (_lt, t) => {
  const sway = Math.sin(t * TAU * 0.4);
  return {
    pose: {
      ...base, lean: -2, head: 9 + 2 * sway, sN: 40, eN: 140, sF: -45, eF: 85,
      hN: 5, kN: 3, hF: -4, kF: 3, bob: 1.5 * sway,
    },
    face: { ...neutralFace, eyes: 'up', mouth: 'smirk', brow: 0.5, browTilt: 0.6, look: [0.6, -1] },
    emote: 'question',
  };
};

const shrug: Fn = (lt) => {
  const up = Math.sin(clamp(lt / 0.6) * Math.PI);
  const a = smooth(lt / 0.2);
  return {
    pose: {
      ...base, bob: 6 * up, head: -6 * up, sN: 22 * a, eN: 85 * a, sF: -22 * a, eF: -85 * a, beanie: 3 * up,
    },
    face: { ...neutralFace, mouth: 'flat', brow: 0.9, browTilt: -0.4, look: [0, 0] },
    emote: 'none',
  };
};

const wave: Fn = (_lt, t) => ({
  pose: { ...base, sN: 150 + 18 * Math.sin(t * TAU * 2.2), eN: 30 + 20 * Math.sin(t * TAU * 2.2), head: 5 },
  face: { ...neutralFace, mouth: 'grin', eyes: 'happy', brow: 0.4 },
  emote: 'none',
});

const tumble: Fn = (lt, t) => {
  const f = Math.sin(t * TAU * 5);
  return {
    pose: {
      ...base, rot: lt * 540, sN: 140 + 40 * f, eN: 40, sF: -140 - 40 * f, eF: 40,
      hN: 30 * f, kN: 40, hF: -30 * f, kF: 40, beanie: 20 * f,
    },
    face: { ...neutralFace, eyes: 'wide', mouth: 'shout', brow: 1 },
    emote: 'sweat',
  };
};

const facepalm: Fn = (lt) => {
  const a = smooth(lt / 0.25);
  return {
    pose: { ...base, lean: 8 * a, head: 18 * a, sN: 20 + 15 * a, eN: 150 * a, sF: -10, eF: 10 },
    face: { ...neutralFace, eyes: 'closed', mouth: 'frown', brow: -0.5 },
    emote: 'none',
  };
};

const sleepy: Fn = (_lt, t) => {
  const nod = Math.max(0, Math.sin(t * TAU * 0.5));
  return {
    pose: { ...base, lean: 6, head: 10 + 22 * nod * nod, sN: 4, sF: -4, eN: 4, eF: 4, bob: -3 * nod },
    face: { ...neutralFace, eyes: nod > 0.6 ? 'closed' : 'squint', mouth: 'wavy', brow: -0.2 },
    emote: 'zzz',
  };
};

const cheer: Fn = (_lt, t) => {
  const b = Math.abs(Math.sin(t * TAU * 1.6));
  return {
    pose: { ...base, bob: 30 * b, sN: 165, eN: 10, sF: -165, eF: 10, kN: 20 * b, kF: 20 * b, beanie: -10 * b },
    face: { ...neutralFace, eyes: 'happy', mouth: 'laugh', brow: 0.8 },
    emote: 'none',
  };
};

const float_: Fn = (_lt, t) => {
  const s = Math.sin(t * TAU * 0.45);
  return {
    pose: {
      ...base, rot: 10 * s, bob: 10 * s, sN: 70 + 10 * s, eN: 30, sF: -70 - 10 * s, eF: 30,
      hN: 20, kN: 35, hF: -12, kF: 25, beanie: 5 * s,
    },
    face: { ...neutralFace, mouth: 'smile', look: [0.3, -0.3] },
    emote: 'none',
  };
};

const sit: Fn = (_lt, t) => ({
  pose: { ...base, bob: -58, hN: 88, kN: 88, hF: 82, kF: 85, sN: 30, eN: 40, sF: 25, eF: 40, head: 2 * Math.sin(t) },
  face: { ...neutralFace },
  emote: 'none',
});

const present: Fn = (lt, t) => {
  const a = smooth(lt / 0.25);
  return {
    pose: { ...base, lean: -3, sN: 20 + 50 * a, eN: 35 * a, sF: -12, eF: -20, head: 3 + Math.sin(t * 2) },
    face: { ...neutralFace, mouth: 'grin', brow: 0.3, look: [1, 0] },
    emote: 'none',
  };
};

const TABLE: Record<BixAction, Fn> = {
  idle, walk, run, jump, fly, point, shock, laugh, think, shrug, wave, tumble, facepalm, sleepy, cheer,
  float: float_, sit, present,
};

export const actionPose = (action: BixAction, lt: number, t: number, params: Record<string, number> = {}): ActionOutput => {
  const fn = TABLE[action] ?? idle;
  return fn(Math.max(0, lt), t, params);
};

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const blendPose = (a: Pose, b: Pose, k: number): Pose => {
  const out = { ...b };
  (Object.keys(b) as (keyof Pose)[]).forEach((key) => {
    out[key] = lerp(a[key], b[key], k);
  });
  return out;
};
