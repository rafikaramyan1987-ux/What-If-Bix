import React from 'react';
import { AbsoluteFill, CalculateMetadataFunction, useCurrentFrame, useVideoConfig } from 'remotion';
import { Captions, Chip, LONG_CAPTIONS, OnScreenText, SHORT_CAPTIONS } from '../scene/Hud';
import { SceneView, shortFraming } from '../scene/SceneView';
import { C, FONT, TITLE_FONT } from '../theme';
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

const HookBanner: React.FC<{ text: string; t: number }> = ({ text, t }) => {
  const k = easeInOut(t / 0.35);
  const size = Math.min(76, 1700 / Math.max(10, text.length));
  return (
    <g transform={`translate(540 ${-140 + 260 * k}) rotate(-2)`}>
      <rect x={-500} y={-70} width={1000} height={140} rx={34} fill={C.yellow} stroke={C.ink} strokeWidth={8} />
      <text y={size * 0.36} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={size} fill={C.ink}>{text}</text>
    </g>
  );
};

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  const k = easeInOut(t / 0.4);
  return (
    <g transform={`translate(540 ${2000 - 170 * k})`}>
      <rect x={-470} y={-70} width={940} height={140} rx={70} fill={C.purple} stroke={C.ink} strokeWidth={8} />
      <text y={20} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={54} fill="#fff">Full episode on the channel ▶</text>
    </g>
  );
};

const Hud: React.FC<{ m: Manifest; t: number; vertical: boolean }> = ({ m, t, vertical }) => (
  <g>
    {m.scenes.flatMap((s, si) =>
      s.texts
        .filter((tx) => t >= tx.at - 0.01 && t <= (tx.until ?? s.end) + 0.3)
        .map((tx, j) => (
          <OnScreenText key={`${si}-${j}`} spec={{ ...tx, until: tx.until ?? s.end, ...(vertical ? { x: 540, y: 470 + (tx.y ?? 260) * 0.42 } : {}) }} t={t}
            stageW={vertical ? 1080 : 1920} />
        )),
    )}
    {m.scenes.flatMap((s, si) => s.chips.map((c, j) => <Chip key={`${si}-${j}`} spec={c} t={t} x={vertical ? 60 : 70} y={vertical ? 300 : 70} scale={vertical ? 1.1 : 1} />))}
  </g>
);

/** Shorts framing at time t: crop centre + scale, blended across scene changes. */
export const reframeAt = (m: Manifest, t: number) => {
  const i = activeSceneIndex(m.scenes, t);
  const s = m.scenes[i];
  let f = shortFraming(s, t, i);
  const prev = m.scenes[i - 1];
  const k = clamp((t - s.start) / 0.5);
  if (prev && k < 1 && t - s.start < 0.5 && (m.timeOffset ?? 0) < s.start) {
    const p = shortFraming(prev, Math.min(t, prev.end), i - 1);
    const e = easeInOut(k);
    f = { x: lerp(p.x, f.x, e), scale: lerp(p.scale, f.scale, e) };
  }
  const half = 540 / f.scale;
  return { x: half >= 960 ? 960 : clamp(f.x, half, 1920 - half), scale: f.scale };
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
  const s = rf.scale;
  const cy = s >= 1.77 ? 960 : 900; // full-bleed crops are centred; zoomed-out cards sit a bit higher
  const end = m.duration + (m.timeOffset ?? 0);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920">
        {s < 1.77 && <Band t={t} />}
        {s < 1.77 && <rect x={0} y={cy - 540 * s - 8} width={1080} height={1080 * s + 16} fill={C.ink} />}
        <g transform={`translate(540 ${cy}) scale(${s}) translate(${-rf.x} -540)`}>
          <Stage m={m} t={t} />
        </g>
        <Hud m={m} t={t} vertical />
        <Captions pages={m.captions} t={t} layout={SHORT_CAPTIONS} />
        {m.hook && <HookBanner text={m.hook} t={t - (m.timeOffset ?? 0)} />}
        {end - t < 2.4 && <EndCard t={2.4 - (end - t)} />}
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
