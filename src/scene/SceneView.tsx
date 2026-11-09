import React, { useMemo } from 'react';
import { Character } from '../bix/Character';
import { bixStateAt, resolveCues } from '../bix/motion';
import { Scene } from '../types';
import { clamp, easeInOut, lerp } from '../util';
import { Background } from './backgrounds';
import { Prop } from './props';
import { EndScreenArt, IntroArt } from '../compositions/Channel';

export const cameraTransform = (scene: Scene, t: number) => {
  const cam = scene.camera ?? {};
  const k = easeInOut((t - scene.start) / Math.max(0.01, scene.end - scene.start));
  const zoom = cam.zoom ? lerp(cam.zoom[0], cam.zoom[1], k) : 1;
  const raw = cam.pan ? [lerp(cam.pan[0][0], cam.pan[1][0], k), lerp(cam.pan[0][1], cam.pan[1][1], k)] : cam.focus ?? [960, 540];
  // never show past the stage edges
  const hw = 960 / Math.max(1, zoom);
  const hh = 540 / Math.max(1, zoom);
  const focus = [clamp(raw[0], hw, 1920 - hw), clamp(raw[1], hh, 1080 - hh)];
  let sx = 0;
  let sy = 0;
  for (const s of cam.shake ?? []) {
    const d = t - s;
    if (d >= 0 && d < 0.6) {
      const a = (cam.shakeAmp ?? 22) * (1 - d / 0.6);
      sx += a * Math.sin(d * 83);
      sy += a * Math.cos(d * 71);
    }
  }
  return `translate(${960 + sx} ${540 + sy}) scale(${zoom}) translate(${-focus[0]} ${-focus[1]})`;
};

/** Draws one scene on the 1920x1080 stage (background, props, Bix) with its camera. */
export const SceneView: React.FC<{ scene: Scene; t: number; index: number }> = ({ scene, t, index }) => {
  const resolved = useMemo(
    () => resolveCues(scene.bix, scene.bixDefaults ?? { pos: [960, 820], scale: 1, facing: 1 }),
    [scene],
  );
  if (scene.kind === 'intro') return <IntroArt t={t - scene.start} />;
  if (scene.kind === 'cta') return <Background spec={scene.background} t={t} />;
  if (scene.kind === 'endscreen') return <EndScreenArt t={t - scene.start} background={scene.background} dur={scene.end - scene.start} />;
  const st = bixStateAt(resolved, t, index);
  const back = scene.props.filter((p) => p.layer !== 'front');
  const front = scene.props.filter((p) => p.layer === 'front');
  const bgFixed = scene.background.fixed === true;
  return (
    <g>
      {bgFixed && <Background spec={scene.background} t={t} />}
      <g transform={cameraTransform(scene, t)}>
        {!bgFixed && <Background spec={scene.background} t={t} />}
        {back.map((p, i) => (
          <Prop key={i} spec={p} t={t} />
        ))}
        {st && !st.hidden && (
          <Character x={st.x} y={st.y} scale={st.scale} facing={st.facing} pose={st.pose} face={st.face} emote={st.emote} t={t}
            hold={st.hold} airborne={st.airborne} shadow={st.action !== 'fly' && st.action !== 'float' && st.action !== 'tumble'} seed={index} />
        )}
        {front.map((p, i) => (
          <Prop key={i} spec={p} t={t} />
        ))}
      </g>
    </g>
  );
};

// Half-extent (px) of props that define what a Short must keep in frame.
const EXTENT: Record<string, (p: Record<string, unknown>) => number> = {
  earth: (p) => Number(p.r ?? 300), moon: (p) => Number(p.r ?? 120), sun: (p) => Number(p.r ?? 140) * 1.3,
  board: (p) => Number(p.w ?? 760) / 2, bars: (p) => Number(p.w ?? 900) / 2, gauge: (p) => Number(p.r ?? 160),
  timeline: (p) => Number(p.w ?? 1400) / 2, building: (p) => Number(p.w ?? 220) / 2, crowd: (p) => Number(p.w ?? 1600) / 2,
  server: (p) => Number(p.count ?? 3) * 85 * Number(p.s ?? 1), phone: (p) => 110 * Number(p.s ?? 1), wifi: (p) => 110 * Number(p.s ?? 1.6),
  calendar: (p) => 130 * Number(p.s ?? 1), clock: (p) => Number(p.r ?? 110), hurricane: (p) => Number(p.r ?? 200),
  house: (p) => 140 * Number(p.s ?? 1), tree: (p) => 100 * Number(p.s ?? 1), pal: () => 70, brain: (p) => 150 * Number(p.s ?? 1),
  icon: (p) => 85 * Number(p.s ?? 1), badge: (p) => Number(p.r ?? 110), burst: (p) => Number(p.r ?? 160),
  dolphin: (p) => 200 * Number(p.s ?? 1), halfbrain: (p) => 170 * Number(p.s ?? 1), penguin: (p) => 100 * Number(p.s ?? 1),
  huddle: (p) => Number(p.w ?? 900) / 2, cactus: (p) => 60 * Number(p.s ?? 1), item: (p) => 40 * Number(p.s ?? 2),
};
const WINDOW = 1080 / (1920 / 1080); // stage px visible in a full-bleed vertical crop (~608)

/**
 * Framing for vertical Shorts. Returns the crop centre and scale: when Bix and the key
 * props fit into the vertical window the crop follows Bix full-bleed; otherwise the
 * camera zooms out so the whole action stays visible.
 */
export const shortFraming = (scene: Scene, t: number, index: number): { x: number; scale: number } => {
  const full = 1920 / 1080;
  if (typeof scene.focus === 'number') return { x: scene.focus, scale: full };
  if (scene.kind) return { x: 960, scale: 1080 / 1920 };
  let lo = Infinity;
  let hi = -Infinity;
  const r = resolveCues(scene.bix, scene.bixDefaults ?? { pos: [960, 820], scale: 1, facing: 1 });
  for (let tt = scene.start; tt <= scene.end; tt += 0.5) {
    const st = bixStateAt(r, tt, index);
    if (st && !st.hidden && st.x > 0 && st.x < 1920) {
      lo = Math.min(lo, st.x - 130 * st.scale);
      hi = Math.max(hi, st.x + 130 * st.scale);
    }
  }
  for (const p of scene.props) {
    const ext = EXTENT[p.type];
    if (!ext || typeof p.x !== 'number') continue;
    lo = Math.min(lo, p.x - ext(p));
    hi = Math.max(hi, p.x + ext(p));
  }
  if (!Number.isFinite(lo)) return { x: 960, scale: full };
  lo = Math.max(0, lo);
  hi = Math.min(1920, hi);
  const width = hi - lo + 80;
  if (width <= WINDOW) return { x: focusX(scene, t, index), scale: full };
  return { x: (lo + hi) / 2, scale: Math.max(0.72, Math.min(full, 1080 / width)) };
};

/** Horizontal crop centre for vertical Shorts: follows Bix, smoothed over ±0.5 s. */
export const focusX = (scene: Scene, t: number, index: number) => {
  if (typeof scene.focus === 'number') return scene.focus;
  if (scene.kind) return 960;
  const r = resolveCues(scene.bix, scene.bixDefaults ?? { pos: [960, 820], scale: 1, facing: 1 });
  if (!r.length) return 960;
  let sum = 0;
  let n = 0;
  for (let k = -2; k <= 2; k++) {
    const tt = Math.min(scene.end, Math.max(scene.start, t + k * 0.25));
    const st = bixStateAt(r, tt, index);
    if (st && !st.hidden) {
      sum += st.x + st.facing * 60; // lead the action a little
      n++;
    }
  }
  return n ? sum / n : 960;
};

export const transitionProgress = (scene: Scene, t: number, dur = 0.4) => clamp((t - scene.start) / dur);
