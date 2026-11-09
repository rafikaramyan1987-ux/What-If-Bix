import React from 'react';
import { AbsoluteFill, CalculateMetadataFunction, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions, Chip, LONG_CAPTIONS, OnScreenText, SHORT_CAPTIONS } from '../scene/Hud';
import { SceneView } from '../scene/SceneView';
import { CtaArt, HookBanner, SAFE } from './ShortsUI';
import { Character, CharacterContext } from '../bix/Character';
import { bixState, keyObjects, mapBox, presenter, SAFE_BOX, shortFramingAt, shortMode } from '../scene/shortLayout';
import { C, FONT, TITLE_FONT } from '../theme';
import { Manifest, Scene } from '../types';
import { clamp, easeInOut } from '../util';

const TRANSITION = 0.4;
/** Shorts: on-screen texts sit in one band between the hook banner and the subject zone. */
const TEXT_FIT = { width: 800, cy: 478 };

export const activeSceneIndex = (scenes: Scene[], t: number) => {
  let idx = 0;
  scenes.forEach((s, i) => {
    if (s.start <= t) idx = i;
  });
  return idx;
};

const Stage: React.FC<{ m: Manifest; t: number; vertical?: boolean }> = ({ m, t, vertical }) => {
  const i = activeSceneIndex(m.scenes, t);
  const scene = m.scenes[i];
  const prev = i > 0 ? m.scenes[i - 1] : undefined;
  const kind = scene.transition ?? 'cut';
  const k = clamp((t - scene.start) / TRANSITION);
  const hide = (sc: Scene) => !!vertical && shortMode(sc) === 'presenter';
  if (!prev || kind === 'cut' || k >= 1) return <SceneView scene={scene} t={t} index={i} hideBix={hide(scene)} />;
  const e = easeInOut(k);
  if (kind === 'whip') {
    const blur = Math.sin(Math.PI * k) * 14;
    return (
      <g style={{ filter: `blur(${blur.toFixed(1)}px)` }}>
        <g transform={`translate(${-1920 * e} 0)`}>
          <SceneView scene={prev} t={t} index={i - 1} hideBix={hide(prev)} />
        </g>
        <g transform={`translate(${1920 * (1 - e)} 0)`}>
          <SceneView scene={scene} t={t} index={i} hideBix={hide(scene)} />
        </g>
      </g>
    );
  }
  if (kind === 'iris' || kind === 'pop') {
    const r = kind === 'iris' ? e * 1150 : e * 1150;
    return (
      <g>
        <SceneView scene={prev} t={t} index={i - 1} hideBix={hide(prev)} />
        <defs>
          <clipPath id={`iris${i}`}>
            <circle cx={960} cy={540} r={r} />
          </clipPath>
        </defs>
        <circle cx={960} cy={540} r={r + 14} fill={C.ink} />
        <g clipPath={`url(#iris${i})`}>
          <SceneView scene={scene} t={t} index={i} hideBix={hide(scene)} />
        </g>
      </g>
    );
  }
  // fade
  return (
    <g>
      <SceneView scene={prev} t={t} index={i - 1} hideBix={hide(prev)} />
      <g opacity={e}>
        <SceneView scene={scene} t={t} index={i} hideBix={hide(scene)} />
      </g>
    </g>
  );
};

const Hud: React.FC<{ m: Manifest; t: number; vertical: boolean }> = ({ m, t, vertical }) => (
  <g>
    {m.scenes.flatMap((s, si) =>
      s.texts
        .filter((tx) => t >= tx.at - 0.01 && t <= (tx.until ?? s.end) + 0.3)
        .map((tx, j) => (
          <OnScreenText key={`${si}-${j}`} spec={{ ...tx, until: tx.until ?? s.end, ...(vertical ? { x: SAFE.centerX } : {}) }} t={t}
            stageW={vertical ? 1080 : 1920} fit={vertical ? TEXT_FIT : undefined} />
        )),
    )}
    {m.scenes.flatMap((s, si) => s.chips.map((c, j) => <Chip key={`${si}-${j}`} spec={c} t={t} x={vertical ? SAFE.left : 70} y={vertical ? 430 : 70} scale={vertical ? 1.1 : 1} />))}
  </g>
);

/** Bix at the presenter spot of a vertical Short (always whole, inside the safe zone). */
const PresenterBix: React.FC<{ m: Manifest; t: number }> = ({ m, t }) => {
  const i = activeSceneIndex(m.scenes, t);
  const scene = m.scenes[i];
  if (scene.kind || shortMode(scene) !== 'presenter') return null;
  const st = bixState(scene, t, i);
  if (!st || st.hidden) return null;
  const p = presenter();
  return (
    <Character x={p.x} y={p.y} scale={p.scale} facing={1} pose={st.pose} face={st.face} emote={st.emote} t={t} hold={st.hold}
      airborne={st.airborne} shadow={st.action !== 'fly' && st.action !== 'float' && st.action !== 'tumble'} seed={i} />
  );
};

/** Debug overlay (manifest.debugBoxes): key-object boxes, presenter box and the safe zone. */
const DebugBoxes: React.FC<{ m: Manifest; t: number }> = ({ m, t }) => {
  const i = activeSceneIndex(m.scenes, t);
  const scene = m.scenes[i];
  if (scene.kind) return null;
  const f = shortFramingAt(m.scenes, t, m.timeOffset ?? 0);
  const r = (b: { x0: number; y0: number; x1: number; y1: number }, c: string, k: number) => (
    <rect key={k} x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} fill="none" stroke={c} strokeWidth={4} strokeDasharray="14 8" />
  );
  return (
    <g>
      {r(SAFE_BOX, '#00ff88', -1)}
      {shortMode(scene) === 'presenter' && r(presenter().box, '#ff00ff', -2)}
      {keyObjects(scene, t).map((o, j) => r(mapBox(o.box, f), '#ff3030', j))}
    </g>
  );
};

const Band: React.FC<{ t: number }> = ({ t }) => (
  <g>
    <rect width={1080} height={1920} fill={C.space1} />
    {Array.from({ length: 26 }, (_, i) => {
      const x = (i * 397) % 1080;
      const y = (i * 733) % 1920;
      return <circle key={i} cx={x} cy={y} r={2 + (i % 3)} fill={C.star} opacity={0.3 + 0.3 * Math.sin(t * 1.5 + i)} />;
    })}
  </g>
);

export const Episode: React.FC<Manifest> = (m) => (
  <CharacterContext.Provider value={m.character ?? 'bix2'}>
    <EpisodeInner {...m} />
  </CharacterContext.Provider>
);

const EpisodeInner: React.FC<Manifest> = (m) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps + (m.timeOffset ?? 0);
  const vertical = m.format === 'short';
  if (!vertical) {
    return (
      <AbsoluteFill style={{ background: C.night }}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080">
          <Stage m={m} t={t} />
          <Hud m={m} t={t} vertical={false} />
          <Captions pages={m.captions} t={t} layout={LONG_CAPTIONS} />
        </svg>
      </AbsoluteFill>
    );
  }
  const f = shortFramingAt(m.scenes, t, m.timeOffset ?? 0);
  const active = m.scenes[activeSceneIndex(m.scenes, t)];
  if (active.kind === 'cta') {
    return (
      <AbsoluteFill style={{ background: C.night }}>
        <svg width={1080} height={1920} viewBox="0 0 1080 1920">
          <Band t={t} />
          <CtaArt t={t - active.start} dur={active.end - active.start} />
          <Captions pages={m.captions} t={t} layout={SHORT_CAPTIONS} />
        </svg>
      </AbsoluteFill>
    );
  }
  const covers = f.ty <= 0 && f.ty + 1080 * f.s >= 1920 && f.tx <= 0 && f.tx + 1920 * f.s >= 1080;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {!covers && <Band t={t} />}
        {!covers && <rect x={f.tx - 8} y={f.ty - 8} width={1920 * f.s + 16} height={1080 * f.s + 16} fill={C.ink} />}
        <g transform={`translate(${f.tx} ${f.ty}) scale(${f.s})`}>
          <Stage m={m} t={t} vertical />
        </g>
        <PresenterBix m={m} t={t} />
        <Hud m={m} t={t} vertical />
        <Captions pages={m.captions} t={t} layout={SHORT_CAPTIONS} />
        {m.hook && <HookBanner text={m.hook} t={t - (m.timeOffset ?? 0)} />}
        {m.debugBoxes && <DebugBoxes m={m} t={t} />}
      </svg>
    </AbsoluteFill>
  );
};

export const calculateEpisodeMetadata: CalculateMetadataFunction<Manifest> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.round(props.duration * props.fps)),
  fps: props.fps,
  width: props.width,
  height: props.height,
});
