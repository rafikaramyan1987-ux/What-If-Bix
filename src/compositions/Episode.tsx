import React from 'react';
import { AbsoluteFill, CalculateMetadataFunction, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions, Chip, LONG_CAPTIONS, OnScreenText, SHORT_CAPTIONS } from '../scene/Hud';
import { SceneView } from '../scene/SceneView';
import { C } from '../theme';
import { Manifest, Scene } from '../types';
import { clamp, easeInOut, lerp } from '../util';

const TRANSITION = 0.4;

export const activeSceneIndex = (scenes: Scene[], t: number) => {
  let idx = 0;
  scenes.forEach((s, i) => {
    if (s.start <= t) idx = i;
  });
  return idx;
};

const Stage: React.FC<{ m: Manifest; t: number }> = ({ m, t }) => {
  const i = activeSceneIndex(m.scenes, t);
  const scene = m.scenes[i];
  const prev = i > 0 ? m.scenes[i - 1] : undefined;
  const kind = scene.transition ?? 'cut';
  const k = clamp((t - scene.start) / TRANSITION);
  if (!prev || kind === 'cut' || k >= 1) return <SceneView scene={scene} t={t} index={i} />;
  const e = easeInOut(k);
  if (kind === 'whip') {
    const blur = Math.sin(Math.PI * k) * 14;
    return (
      <g style={{ filter: `blur(${blur.toFixed(1)}px)` }}>
        <g transform={`translate(${-1920 * e} 0)`}>
          <SceneView scene={prev} t={t} index={i - 1} />
        </g>
        <g transform={`translate(${1920 * (1 - e)} 0)`}>
          <SceneView scene={scene} t={t} index={i} />
        </g>
      </g>
    );
  }
  if (kind === 'iris' || kind === 'pop') {
    const r = kind === 'iris' ? e * 1150 : e * 1150;
    return (
      <g>
        <SceneView scene={prev} t={t} index={i - 1} />
        <defs>
          <clipPath id={`iris${i}`}>
            <circle cx={960} cy={540} r={r} />
          </clipPath>
        </defs>
        <circle cx={960} cy={540} r={r + 14} fill={C.ink} />
        <g clipPath={`url(#iris${i})`}>
          <SceneView scene={scene} t={t} index={i} />
        </g>
      </g>
    );
  }
  // fade
  return (
    <g>
      <SceneView scene={prev} t={t} index={i - 1} />
      <g opacity={e}>
        <SceneView scene={scene} t={t} index={i} />
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
          <OnScreenText key={`${si}-${j}`} spec={{ ...tx, until: tx.until ?? s.end, ...(vertical ? { x: 540, y: (tx.y ?? 260) * 0.9 + 140 } : {}) }} t={t}
            stageW={vertical ? 1080 : 1920} />
        )),
    )}
    {m.scenes.flatMap((s, si) => s.chips.map((c, j) => <Chip key={`${si}-${j}`} spec={c} t={t} x={vertical ? 60 : 70} y={vertical ? 230 : 70} scale={vertical ? 1.1 : 1} />))}
  </g>
);

export const reframeAt = (m: Manifest, t: number) => {
  const r = m.reframe ?? [];
  if (!r.length) return { x: 960, zoom: 1 };
  let cur = r[0];
  let prev = r[0];
  for (const p of r) {
    if (p.at <= t) {
      prev = cur;
      cur = p;
    }
  }
  const k = easeInOut((t - cur.at) / 0.5);
  return { x: lerp(prev.x, cur.x, k), zoom: lerp(prev.zoom ?? 1, cur.zoom ?? 1, k) };
};

export const Episode: React.FC<Manifest> = (m) => {
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
  const rf = reframeAt(m, t);
  const s = (1920 / 1080) * rf.zoom;
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        <g transform={`translate(540 960) scale(${s}) translate(${-rf.x} -540)`}>
          <Stage m={m} t={t} />
        </g>
        <Hud m={m} t={t} vertical />
        <Captions pages={m.captions} t={t} layout={SHORT_CAPTIONS} />
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
