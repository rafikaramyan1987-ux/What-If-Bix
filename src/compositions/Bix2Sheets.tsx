import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Bix } from '../bix/Bix';
import { Bix2, bix2Height, Bix2Variant, STYLES } from '../bix/Bix2';
import { actionPose, BixAction } from '../bix/poses';
import { Background } from '../scene/backgrounds';
import { C, FONT, TITLE_FONT } from '../theme';

const VARIANTS: Bix2Variant[] = ['A', 'B', 'C'];
export const EMOTIONS: { label: string; action: BixAction; lt: number }[] = [
  { label: 'shocked', action: 'shock', lt: 0.5 },
  { label: 'happy', action: 'cheer', lt: 0 },
  { label: 'scared', action: 'scared', lt: 0.6 },
  { label: 'thinking', action: 'think', lt: 0.8 },
];

const Label: React.FC<{ x: number; y: number; text: string; size?: number; color?: string }> = ({ x, y, text, size = 48, color = '#fff' }) => (
  <text x={x} y={y} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={size} fill={color} stroke={C.ink} strokeWidth={size / 6} paintOrder="stroke">{text}</text>
);

const Fig: React.FC<{ v: Bix2Variant; action: BixAction; lt: number; x: number; y: number; h: number; facing?: 1 | -1 }> = ({ v, action, lt, x, y, h, facing = 1 }) => {
  const o = actionPose(action, lt, 1.3);
  const scale = h / bix2Height(v);
  return <Bix2 variant={v} x={x} y={y} scale={scale} facing={facing} pose={o.pose} face={o.face} emote={o.emote} t={1.3} airborne={o.pose.bob} />;
};

/** The three candidates side by side, with Bix 1 for scale. */
export const Bix2Lineup: React.FC = () => {
  const old = actionPose('wave', 0.4, 0.4);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <Background spec={{ type: 'lab', board: false }} t={0} />
        <text x={960} y={110} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={86} fill={C.purple} stroke="#fff" strokeWidth={12} paintOrder="stroke">BIX 2.0 — PICK ONE</text>
        <g opacity={0.55}>
          <Bix x={150} y={900} scale={0.95} pose={old.pose} face={old.face} t={0.4} />
          <Label x={150} y={980} text="Bix 1 (now)" size={30} />
        </g>
        {VARIANTS.map((v, i) => {
          const x = 560 + i * 500;
          const o = actionPose(i === 1 ? 'present' : 'wave', 0.5, 0.5);
          return (
            <g key={v}>
              <rect x={x - 220} y={190} width={440} height={760} rx={36} fill="#ffffff" opacity={0.55} />
              <Bix2 variant={v} x={x} y={900} scale={620 / bix2Height(v)} pose={o.pose} face={o.face} t={0.5} />
              <Label x={x} y={1010} text={`${v} — ${STYLES[v].name}`} size={54} />
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** One variant in the four core emotions. */
export const Bix2Emotions: React.FC<{ variant: Bix2Variant }> = ({ variant }) => (
  <AbsoluteFill>
    <svg width={1920} height={1080} viewBox="0 0 1920 1080">
      <Background spec={{ type: 'space', tint: 'blue' }} t={0} />
      <text x={960} y={100} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={72} fill={C.yellow} stroke={C.ink} strokeWidth={12} paintOrder="stroke">
        {`VARIANT ${variant} — ${STYLES[variant].name.toUpperCase()}`}
      </text>
      {EMOTIONS.map((e, i) => {
        const x = 270 + i * 460;
        return (
          <g key={e.label}>
            <rect x={x - 205} y={170} width={410} height={800} rx={32} fill="#ffffff14" />
            <Fig v={variant} action={e.action} lt={e.lt} x={x} y={900} h={640} />
            <Label x={x} y={1030} text={e.label} size={52} />
          </g>
        );
      })}
    </svg>
  </AbsoluteFill>
);

/** Phone test: every variant x emotion at exactly 180 px tall, on light and dark backgrounds (view at 100%). */
export const Bix2Phone: React.FC = () => (
  <AbsoluteFill style={{ background: '#fff' }}>
    <svg width={1920} height={1080} viewBox="0 0 1920 1080">
      <g>
        <Background spec={{ type: 'sky', clouds: 4 }} t={0} />
        <rect y={540} width={1920} height={540} fill={C.space1} />
      </g>
      <Label x={960} y={60} text="Phone test — each Bix is 180 px tall (view this image at 100%)" size={40} />
      {[0, 1].map((row) => (
        <g key={row}>
          {VARIANTS.map((v, vi) =>
            EMOTIONS.map((e, ei) => {
              const x = 130 + vi * 600 + ei * 140;
              const y = row === 0 ? 400 : 940;
              return <Fig key={`${v}${e.label}`} v={v} action={e.action} lt={e.lt} x={x} y={y} h={180} />;
            }),
          )}
          {VARIANTS.map((v, vi) => (
            <Label key={v} x={340 + vi * 600} y={row === 0 ? 480 : 1030} text={`${v} — ${STYLES[v].name}`} size={34} />
          ))}
        </g>
      ))}
    </svg>
  </AbsoluteFill>
);
