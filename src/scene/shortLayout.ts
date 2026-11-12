// Vertical (9:16) layout for Shorts. Pure functions shared by the renderer and by the
// pipeline's framing check, so what gets checked is exactly what gets drawn.
//
// Layout of a 1080x1920 Short:
//   - hook banner at the top (inside the safe zone)
//   - SUBJECT zone under the hook: the scene's key objects (dolphin, brain, penguin,
//     charts…) are scaled to fill it and centred under the hook text
//   - PRESENTER spot at the lower left: Bix, always whole and inside the safe zone
//   - captions below, clear of the TikTok / YouTube bottom UI
// Scenes without key objects are framed on Bix himself ("follow").
import { bixStateAt, resolveCues } from '../bix/motion';
import { Scene } from '../types';

type Spec = Record<string, unknown>;
export type Box = { x0: number; y0: number; x1: number; y1: number };
/** frame = stage * s + (tx, ty) */
export type Framing = { s: number; tx: number; ty: number };

export const FRAME = { w: 1080, h: 1920 };
// TikTok / YouTube Shorts overlay buttons on the right (~180 px) and the caption /
// description / UI at the bottom (~470 px) and top (~140 px).
export const SAFE = { left: 60, right: 900, top: 140, bottom: 1450, centerX: 480 };
export const SUBJECT_ZONE: Box = { x0: 100, y0: 540, x1: 860, y1: 1000 };
/** Bix as presenter: feet position and on-screen height (px). */
export const PRESENTER = { x: 215, y: 1275, height: 300 };
/** A layout profile: where the subject goes and where Bix presents. */
export type Profile = { zone: Box; presenter: { x: number; y: number; height: number } };
export const CLASSIC: Profile = { zone: SUBJECT_ZONE, presenter: PRESENTER };
/** TikTok-optimised Shorts: a taller subject zone, a slightly smaller presenter above the captions. */
export const TIKTOK: Profile = { zone: { x0: 100, y0: 450, x1: 860, y1: 1030 }, presenter: { x: 205, y: 1232, height: 265 } };
/** Bix 2.0 standing height at scale 1 (feet to beanie top), plus room for emotes. */
export const BIX_H = 378;
const BIX_HALF_W = 0.4 * BIX_H;
const BIX_TOP_EXTRA = 50;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.4;
const BLEND = 0.6;

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v: unknown, d: [number, number]): [number, number] =>
  Array.isArray(v) && v.length >= 2 ? [num(v[0], d[0]), num(v[1], d[1])] : d;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (k: number) => {
  const x = clamp(k);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const union = (boxes: Box[]): Box | null =>
  boxes.length
    ? boxes.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }))
    : null;
export const mapBox = (b: Box, f: Framing): Box => ({ x0: b.x0 * f.s + f.tx, y0: b.y0 * f.s + f.ty, x1: b.x1 * f.s + f.tx, y1: b.y1 * f.s + f.ty });
export const inside = (b: Box, z: Box, tol = 0.5) => b.x0 >= z.x0 - tol && b.y0 >= z.y0 - tol && b.x1 <= z.x1 + tol && b.y1 <= z.y1 + tol;
export const SAFE_BOX: Box = { x0: SAFE.left, y0: SAFE.top, x1: SAFE.right, y1: SAFE.bottom };
export const FRAME_BOX: Box = { x0: 0, y0: 0, x1: FRAME.w, y1: FRAME.h };

/** The scene camera (zoom / pan / focus) as a stage->stage mapping, without shake. */
export const cameraParams = (scene: Scene, t: number) => {
  const cam = scene.camera ?? {};
  const k = ease((t - scene.start) / Math.max(0.01, scene.end - scene.start));
  const zoom = cam.zoom ? lerp(cam.zoom[0], cam.zoom[1], k) : 1;
  const raw = cam.pan ? [lerp(cam.pan[0][0], cam.pan[1][0], k), lerp(cam.pan[0][1], cam.pan[1][1], k)] : cam.focus ?? [960, 540];
  const hw = 960 / Math.max(1, zoom);
  const hh = 540 / Math.max(1, zoom);
  return { zoom, fx: clamp(raw[0], hw, 1920 - hw), fy: clamp(raw[1], hh, 1080 - hh) };
};
const camBox = (scene: Scene, t: number, b: Box): Box => {
  const { zoom, fx, fy } = cameraParams(scene, t);
  return { x0: (b.x0 - fx) * zoom + 960, y0: (b.y0 - fy) * zoom + 540, x1: (b.x1 - fx) * zoom + 960, y1: (b.y1 - fy) * zoom + 540 };
};

// ---------------------------------------------------------------------------------
// Key objects: local bounding box at scale 1 around the prop's anchor (x, y).
type Geo = {
  box: (p: Spec) => Box; s?: (p: Spec) => number; y?: number; move?: 'ease' | 'linear'; bob?: number; flip?: boolean;
  /** default travel time and start point when the prop has from/to but no x/y (e.g. birds) */
  dur?: number; from?: [number, number]; to?: [number, number]; flipDir?: boolean;
};
const sq = (r: number): Box => ({ x0: -r, y0: -r, x1: r, y1: r });
const GEO: Record<string, Geo> = {
  dolphin: { box: (p) => ({ x0: -212, y0: -122, x1: 214, y1: p.label !== undefined ? 112 : 72 }), s: (p) => num(p.s, 1), y: 600, move: 'ease', bob: 10, flip: true },
  halfbrain: { box: (p) => ({ x0: -182, y0: -165, x1: 182, y1: p.labels === false ? 150 : 252 }), s: (p) => num(p.s, 1), y: 450 },
  penguin: { box: () => ({ x0: -108, y0: -322, x1: 110, y1: 16 }), s: (p) => num(p.s, 1), y: 820, move: 'linear', flip: true },
  huddle: { box: (p) => ({ x0: -num(p.w, 900) / 2 - 48, y0: -num(p.h, 220) / 2 - 140, x1: num(p.w, 900) / 2 + 48, y1: num(p.h, 220) / 2 + 8 }), y: 820 },
  pal: { box: () => ({ x0: -150, y0: -400, x1: 150, y1: 10 }), s: (p) => num(p.s, 1), y: 820, move: 'linear' },
  cactus: { box: () => ({ x0: -64, y0: -150, x1: 62, y1: 66 }), s: (p) => num(p.s, 1), y: 360 },
  calendar: { box: () => ({ x0: -150, y0: -152, x1: 150, y1: 152 }), s: (p) => num(p.s, 1), y: 400 },
  item: { box: () => ({ x0: -40, y0: -62, x1: 40, y1: 12 }), s: (p) => num(p.s, 2), y: 500, bob: 10 },
  clock: { box: (p) => sq(num(p.r, 110) + 24) },
  gauge: { box: (p) => ({ x0: -num(p.r, 160) - 24, y0: -num(p.r, 160) - 24, x1: num(p.r, 160) + 24, y1: num(p.r, 160) * 0.35 + 80 }), y: 500 },
  badge: { box: (p) => sq(num(p.r, 110) * 1.12), y: 400 },
  icon: { box: () => sq(88), s: (p) => num(p.s, 1) },
  bars: { box: (p) => ({ x0: -num(p.w, 900) / 2 - 20, y0: -num(p.h, 420) - 70, x1: num(p.w, 900) / 2 + 20, y1: 80 }), y: 760 },
  board: { box: (p) => ({ x0: -num(p.w, 760) / 2, y0: -80, x1: num(p.w, 760) / 2, y1: 320 }) },
  timeline: { box: (p) => ({ x0: -num(p.w, 1400) / 2 - 60, y0: -90, x1: num(p.w, 1400) / 2 + 60, y1: 90 }) },
  crowd: { box: (p) => ({ x0: -num(p.w, 1600) / 2 - 40, y0: -320 * num(p.s, 1) - 60, x1: num(p.w, 1600) / 2 + 40, y1: 20 }), y: 820 },
  earth: { box: (p) => sq(num(p.r, 300)) },
  moon: { box: (p) => sq(num(p.r, 120)) },
  sun: { box: (p) => sq(num(p.r, 140) * 1.3) },
  building: { box: (p) => ({ x0: -num(p.w, 220) / 2, y0: -num(p.h, 400), x1: num(p.w, 220) / 2, y1: 10 }), y: 820 },
  house: { box: () => ({ x0: -140, y0: -260, x1: 140, y1: 10 }), s: (p) => num(p.s, 1), y: 820 },
  tree: { box: () => ({ x0: -100, y0: -300, x1: 100, y1: 10 }), s: (p) => num(p.s, 1), y: 820 },
  brain: { box: () => sq(150), s: (p) => num(p.s, 1) },
  server: { box: (p) => ({ x0: -num(p.count, 3) * 85, y0: -300, x1: num(p.count, 3) * 85, y1: 20 }), s: (p) => num(p.s, 1) },
  phone: { box: () => ({ x0: -110, y0: -200, x1: 110, y1: 200 }), s: (p) => num(p.s, 1) },
  hurricane: { box: (p) => sq(num(p.r, 200)) },
  bird: { box: () => ({ x0: -116, y0: -78, x1: 78, y1: 32 }), s: (p) => num(p.s, 1), move: 'linear', bob: 8, dur: 3, from: [-200, 300], to: [2200, 300], flipDir: true },
  octopus: { box: (p) => ({ x0: -235, y0: p.swim === true ? -265 : -245, x1: 235, y1: 285 }), s: (p) => num(p.s, 1), y: 560, move: 'ease', bob: 14 },
  vial: { box: (p) => ({ x0: -50, y0: -138, x1: 50, y1: p.label !== undefined ? 170 : 116 }), s: (p) => num(p.s, 1), y: 500 },
  earthcut: { box: (p) => ({ x0: -num(p.r, 380) - 20, y0: -num(p.r, 380) - 20, x1: num(p.r, 380) * (p.labels === true ? 1.75 : 1) + 20, y1: num(p.r, 380) + 20 }), y: 540 },
  prison: { box: () => ({ x0: -460, y0: -430, x1: 460, y1: 20 }), s: (p) => num(p.s, 1), y: 820 },
  dog: { box: () => ({ x0: -120, y0: -150, x1: 180, y1: 10 }), s: (p) => num(p.s, 1), y: 820, move: 'ease', flip: true },
  helicopter: { box: () => ({ x0: -230, y0: -90, x1: 230, y1: 70 }), s: (p) => num(p.s, 1), y: 260, move: 'ease', bob: 6 },
  coral: { box: (p) => ({ x0: -num(p.w, 700) / 2 - 20, y0: -230, x1: num(p.w, 700) / 2 + 20, y1: 24 }), s: (p) => num(p.s, 1), y: 820 },
  genius: { box: () => ({ x0: -160, y0: -470, x1: 160, y1: 10 }), s: (p) => num(p.s, 0.9), y: 820, move: 'ease' },
  chamber: { box: () => ({ x0: -250, y0: -580, x1: 250, y1: 10 }), s: (p) => num(p.s, 1), y: 820 },
  blackhole: { box: (p) => ({ x0: -num(p.r, 160) * 2.75, y0: -num(p.r, 160) * 1.25, x1: num(p.r, 160) * 2.75, y1: num(p.r, 160) * (p.label !== undefined ? 2.05 : 1.25) }), y: 480 },
  sub: { box: () => ({ x0: -220, y0: -150, x1: 220, y1: 190 }), s: (p) => num(p.s, 1), y: 420, move: 'ease', bob: 6, flip: true },
  snailfish: { box: () => ({ x0: -250, y0: -70, x1: 130, y1: 70 }), s: (p) => num(p.s, 1), y: 600, move: 'ease', bob: 8, flip: true },
  amphipod: { box: (p) => ({ x0: -num(p.spread, 260) - 100, y0: -num(p.spread, 260) / 2 - 60, x1: num(p.spread, 260) + 180, y1: num(p.spread, 260) / 2 + 50 }), s: (p) => num(p.s, 1), y: 600 },
  bee: { box: () => ({ x0: -100, y0: -110, x1: 120, y1: 50 }), s: (p) => num(p.s, 1), y: 400, move: 'ease', bob: 10, flip: true },
  flower: { box: (p) => ({ x0: -((num(p.count, 1) - 1) / 2) * num(p.gap, 170) - 70, y0: -290, x1: ((num(p.count, 1) - 1) / 2) * num(p.gap, 170) + 70, y1: 10 }), s: (p) => num(p.s, 1), y: 820 },
  beetle: { box: () => ({ x0: -110, y0: -145, x1: 195, y1: 10 }), s: (p) => num(p.s, 1), y: 820, move: 'ease', flip: true },
  horseshoe: { box: (p) => ({ x0: -156, y0: -118, x1: p.blood === true ? 240 : 156, y1: 206 }), s: (p) => num(p.s, 1), y: 700 },
};
/** Prop types that count as key objects (framed, and checked for edge cuts). */
export const KEY_TYPES = Object.keys(GEO);
/** Key objects that are characters (must stay inside the safe zone, like Bix). */
export const CHARACTER_TYPES = ['pal', 'penguin', 'dolphin', 'octopus', 'dog', 'genius'];

/** Key objects the camera frames at time t: visible now, or popping in within the next BLEND seconds. */
const framed = (p: Spec, t: number) =>
  (p.at === undefined || t >= num(p.at, 0) - BLEND - 1e-6) && (p.until === undefined || t <= num(p.until, 1e9));
const active = (p: Spec, t: number) =>
  (p.at === undefined || t >= num(p.at, 0) - 1e-6) && (p.until === undefined || t <= num(p.until, 1e9));

/** Stage-space box of a key prop at time t (before the scene camera), or null. */
export const propBox = (p: Spec, t: number): Box | null => {
  const g = GEO[String(p.type)];
  if (!g) return null;
  let x = num(p.x, 960);
  let y = num(p.y, g.y ?? 400);
  let dir = 1;
  if (g.move && (p.to || g.to)) {
    const [x1, y1] = vec(p.from, g.from ?? [x, y]);
    const [x2, y2] = vec(p.to, g.to ?? [x, y]);
    dir = x2 >= x1 ? 1 : -1;
    const raw = (t - num(p.moveAt, num(p.at, 0))) / num(p.dur, g.dur ?? (g.move === 'ease' ? 3 : 1));
    const k = g.move === 'ease' ? ease(raw) : clamp(raw);
    x = lerp(x1, x2, k);
    y = lerp(y1, y2, k);
  }
  const s = g.s ? g.s(p) : 1;
  const b = g.box(p);
  const flip = (g.flip && num(p.facing, 1) < 0) || (g.flipDir && dir < 0);
  const lx0 = flip ? -b.x1 : b.x0;
  const lx1 = flip ? -b.x0 : b.x1;
  const bob = g.bob ?? 0;
  return { x0: x + lx0 * s, x1: x + lx1 * s, y0: y + b.y0 * s - bob, y1: y + b.y1 * s + bob };
};

/** Key objects of a scene visible at time t, as boxes in stage space (after the camera). */
export const keyObjects = (scene: Scene, t: number) =>
  scene.props
    .filter((p) => GEO[String(p.type)] && active(p, t))
    .map((p) => ({ type: String(p.type), box: camBox(scene, t, propBox(p, t) as Box) }));

const resolvedCache = new WeakMap<Scene, ReturnType<typeof resolveCues>>();
const resolved = (scene: Scene) => {
  let r = resolvedCache.get(scene);
  if (!r) {
    r = resolveCues(scene.bix, scene.bixDefaults ?? { pos: [960, 820], scale: 1, facing: 1 });
    resolvedCache.set(scene, r);
  }
  return r;
};

export const bixState = (scene: Scene, t: number, index: number) => bixStateAt(resolved(scene), t, index);

/** Bix's box in stage space (after the camera), or null when hidden / absent. */
export const bixBox = (scene: Scene, t: number, index: number): Box | null => {
  const st = bixState(scene, t, index);
  if (!st || st.hidden) return null;
  const h = BIX_H * st.scale;
  const w = BIX_HALF_W * st.scale;
  return camBox(scene, t, { x0: st.x - w, x1: st.x + w, y0: st.y - h - BIX_TOP_EXTRA * st.scale, y1: st.y + 8 * st.scale });
};

export type ShortMode = 'presenter' | 'follow';
/** presenter: the scene has key objects, Bix moves to the presenter spot; follow: frame Bix. */
export const shortMode = (scene: Scene): ShortMode => {
  const o = scene.shortLayout?.mode;
  if (o === 'presenter' || o === 'follow') return o;
  return scene.props.some((p) => GEO[String(p.type)]) ? 'presenter' : 'follow';
};

/** Presenter Bix: position, scale and box in frame space. */
export const presenter = (profile: Profile = CLASSIC) => {
  const P = profile.presenter;
  const scale = P.height / BIX_H;
  const w = BIX_HALF_W * scale;
  return {
    x: P.x,
    y: P.y,
    scale,
    box: { x0: P.x - w, x1: P.x + w, y0: P.y - P.height - BIX_TOP_EXTRA * scale, y1: P.y + 8 * scale } as Box,
  };
};

/** Fit a stage-space box into the subject zone, keeping the stage covering the frame horizontally. */
export const fitBox = (b: Box, zone: Box = SUBJECT_ZONE): Framing => {
  const bw = Math.max(40, b.x1 - b.x0);
  const bh = Math.max(40, b.y1 - b.y0);
  const zw = zone.x1 - zone.x0;
  const zh = zone.y1 - zone.y0;
  let s = clamp(Math.min(zw / bw, zh / bh), MIN_SCALE, MAX_SCALE);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const zcx = (zone.x0 + zone.x1) / 2;
  const zcy = (zone.y0 + zone.y1) / 2;
  const s0 = s;
  for (let i = 0; i < 40; i++) {
    // prefer the stage covering the frame horizontally (no side gaps)…
    const tx = Math.min(0, Math.max(FRAME.w - 1920 * s, zcx - cx * s));
    const mapped = mapBox(b, { s, tx, ty: 0 });
    if (mapped.x0 >= SAFE.left && mapped.x1 <= SAFE.right) return { s, tx, ty: zcy - cy * s };
    if (s <= MIN_SCALE) break;
    s = Math.max(MIN_SCALE, s * 0.95);
  }
  // …but never at the cost of cutting the subject: centre it and let the band show at the side
  return { s: s0, tx: zcx - cx * s0, ty: zcy - cy * s0 };
};

const eventTimes = (scene: Scene) => {
  const ts = new Set<number>();
  for (const p of scene.props) {
    if (!GEO[String(p.type)]) continue;
    // appearances are anticipated (the camera makes room before the object pops in); exits blend after
    if (typeof p.at === 'number' && p.at - BLEND > scene.start) ts.add(p.at - BLEND);
    if (typeof p.until === 'number' && p.until > scene.start) ts.add(p.until);
  }
  return [...ts].sort((a, b) => a - b);
};

/** Raw framing: the key-object set chosen at `setT`, positions at `t`. */
const rawFraming = (scene: Scene, t: number, index: number, setT: number, zone: Box): Framing => {
  const o = scene.shortLayout?.subject;
  if (Array.isArray(o) && o.length === 4) return fitBox({ x0: o[0], y0: o[1], x1: o[2], y1: o[3] }, zone);
  if (shortMode(scene) === 'presenter') {
    const ids = scene.props.filter((p) => GEO[String(p.type)] && framed(p, setT));
    const set = ids.length ? ids : scene.props.filter((p) => GEO[String(p.type)]);
    const tt = ids.length ? t : Math.max(t, Math.min(...set.map((p) => num(p.at, scene.start))));
    const b = union(set.map((p) => camBox(scene, tt, propBox(p, tt) as Box)));
    if (b) return fitBox(b, zone);
  }
  // follow Bix: union of his box over ±0.5 s so a walk or jump never leaves the frame
  const boxes: Box[] = [];
  for (let k = -2; k <= 2; k++) {
    const b = bixBox(scene, clamp(t + k * 0.25, scene.start, scene.end), index);
    if (b) boxes.push(b);
  }
  const b = union(boxes);
  return b ? fitBox(b, zone) : fitBox({ x0: 660, y0: 240, x1: 1260, y1: 840 }, zone);
};

/** Framing of one scene at time t, blending smoothly when key objects appear or leave. */
export const sceneFraming = (scene: Scene, t: number, index: number, profile: Profile = CLASSIC): Framing => {
  const cur = rawFraming(scene, t, index, t, profile.zone);
  const e = eventTimes(scene).filter((x) => x <= t).pop();
  if (e === undefined || t - e >= BLEND) return cur;
  const before = rawFraming(scene, t, index, e - 1e-3, profile.zone);
  const k = ease((t - e) / BLEND);
  return { s: lerp(before.s, cur.s, k), tx: lerp(before.tx, cur.tx, k), ty: lerp(before.ty, cur.ty, k) };
};

export const activeIndex = (scenes: Scene[], t: number) => {
  let idx = 0;
  scenes.forEach((s, i) => {
    if (s.start <= t) idx = i;
  });
  return idx;
};

/** Framing of a Short at time t, blended across scene changes. */
/** TikTok pacing options: snap zooms on `beats`, hard cuts between scenes, zoom back to 1 at `end` (loop). */
export type Pacing = { beats?: number[]; end?: number; hardCuts?: boolean; profile?: Profile };
/** Zoom factor of a snap ("punch") zoom: each beat toggles between 1 and PUNCH in 0.12 s. */
export const PUNCH = 1.1;
export const punchZoom = (t: number, p: Pacing = {}) => {
  const beats = p.beats ?? [];
  let i = -1;
  for (let k = 0; k < beats.length; k++) if (beats[k] <= t) i = k;
  let z = 1;
  if (i >= 0) {
    const from = i % 2 === 0 ? 1 : PUNCH;
    const to = i % 2 === 0 ? PUNCH : 1;
    z = lerp(from, to, ease((t - beats[i]) / 0.12));
  }
  // loop: the last frame matches the first one (zoom 1)
  if (p.end !== undefined && t > p.end - 0.45) z = lerp(z, 1, ease((t - (p.end - 0.45)) / 0.3));
  return z;
};
/** Zoom a framing about the centre of the subject zone. */
export const zoomFraming = (f: Framing, z: number, zone: Box = SUBJECT_ZONE): Framing => {
  const cx = (zone.x0 + zone.x1) / 2;
  const cy = (zone.y0 + zone.y1) / 2;
  return { s: f.s * z, tx: cx - (cx - f.tx) * z, ty: cy - (cy - f.ty) * z };
};

export const shortFramingAt = (scenes: Scene[], t: number, timeOffset = 0, pacing?: Pacing): Framing => {
  const i = activeIndex(scenes, t);
  const s = scenes[i];
  const profile = pacing?.profile ?? CLASSIC;
  let f = sceneFraming(s, t, i, profile);
  const prev = scenes[i - 1];
  const k = clamp((t - s.start) / 0.5);
  if (prev && !prev.kind && k < 1 && timeOffset < s.start && !pacing?.hardCuts) {
    const p = sceneFraming(prev, Math.min(t, prev.end), i - 1, profile);
    const e = ease(k);
    f = { s: lerp(p.s, f.s, e), tx: lerp(p.tx, f.tx, e), ty: lerp(p.ty, f.ty, e) };
  }
  return pacing?.beats ? zoomFraming(f, punchZoom(t, pacing), profile.zone) : f;
};

export type FramingIssue = { t: number; scene: string; what: string; box: Box; zone: 'safe' | 'frame' };

/**
 * Check the first seconds of a Short: Bix (and character props) must be whole and inside
 * the safe zone, and every key object must be whole inside the frame (not cut by an edge).
 */
export const checkShortFraming = (scenes: Scene[], opts: { from?: number; seconds?: number; step?: number; pacing?: Pacing } = {}): FramingIssue[] => {
  const issues: FramingIssue[] = [];
  const from = opts.from ?? 0;
  const until = from + (opts.seconds ?? 3);
  const step = opts.step ?? 0.1;
  for (let t = from; t <= until + 1e-9; t += step) {
    const i = activeIndex(scenes, t);
    const scene = scenes[i];
    if (scene.kind) continue;
    const f = shortFramingAt(scenes, t, 0, opts.pacing);
    const st = bixState(scene, t, i);
    if (st && !st.hidden) {
      const box = shortMode(scene) === 'presenter' ? presenter(opts.pacing?.profile).box : mapBox(bixBox(scene, t, i) as Box, f);
      if (!inside(box, SAFE_BOX)) issues.push({ t, scene: scene.id, what: 'Bix', box, zone: 'safe' });
    }
    for (const k of keyObjects(scene, t)) {
      const box = mapBox(k.box, f);
      const isChar = CHARACTER_TYPES.includes(k.type);
      if (!inside(box, isChar ? SAFE_BOX : FRAME_BOX)) issues.push({ t, scene: scene.id, what: k.type, box, zone: isChar ? 'safe' : 'frame' });
    }
  }
  return issues;
};
