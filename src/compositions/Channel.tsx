import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Bix, Head } from '../bix/Bix';
import { actionPose, BixAction, Face } from '../bix/poses';
import { Background } from '../scene/backgrounds';
import { C, FONT, TITLE_FONT } from '../theme';
import { Spec } from '../types';
import { clamp, easeInOut, easeOut, popIn, rng } from '../util';

const happy: Face = { eyes: 'happy', mouth: 'laugh', brow: 0.6, browTilt: 0, look: [0, 0], blush: true };
const grin: Face = { eyes: 'open', mouth: 'grin', brow: 0.4, browTilt: 0.2, look: [0.2, -0.1], blush: false };

const Doodles: React.FC<{ t: number; seed?: number; w?: number; h?: number; count?: number }> = ({ t, seed = 3, w = 1920, h = 1080, count = 18 }) => {
  const r = rng(seed);
  const kinds = ['?', '!', '★', '+', '○'];
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = r() * w;
        const y = r() * h;
        const k = kinds[i % kinds.length];
        const s = 40 + r() * 50;
        return (
          <text key={i} x={x} y={y + 8 * Math.sin(t * 2 + i)} fontFamily={TITLE_FONT} fontSize={s} fill={[C.yellow, C.teal, C.pink, C.orange][i % 4]}
            opacity={0.35} textAnchor="middle" transform={`rotate(${(r() - 0.5) * 40} ${x} ${y})`}>{k}</text>
        );
      })}
    </g>
  );
};

/** 2-second channel intro sting (drawn on the 1920x1080 stage, t in seconds from start). */
export const IntroArt: React.FC<{ t: number }> = ({ t }) => {
  const headIn = popIn((t - 0.08) / 0.35);
  const beanieDrop = easeOut((t - 0.0) / 0.3);
  const w1 = popIn((t - 0.45) / 0.3);
  const w2 = popIn((t - 0.62) / 0.3);
  const out = easeInOut((t - 1.62) / 0.38);
  const burst = clamp((t - 0.6) / 0.6);
  return (
    <g>
      <rect width={1920} height={1080} fill={C.space2} />
      <g opacity={1 - out}>
        <Doodles t={t} />
        {burst > 0 && burst < 1 && Array.from({ length: 16 }, (_, i) => (
          <line key={i} x1={0} y1={-200 - 300 * burst} x2={0} y2={-260 - 380 * burst} stroke={C.yellow} strokeWidth={14} strokeLinecap="round"
            transform={`translate(560 540) rotate(${i * 22.5})`} opacity={1 - burst} />
        ))}
        <g transform={`translate(560 ${560 - (1 - beanieDrop) * 500}) scale(${3.4 * headIn}) rotate(${-8 + 8 * headIn})`}>
          <Head face={t > 0.9 && t < 1.1 ? { ...happy, eyes: 'closed' } : t > 0.5 ? happy : grin} beanie={Math.sin(t * 20) * 6 * (1 - clamp(t / 0.8))} blink={false} />
        </g>
        <text x={1310} y={470} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={210 * w1} fill={C.yellow} stroke={C.ink} strokeWidth={22}
          paintOrder="stroke" transform="rotate(-5 1310 470)">WHAT IF</text>
        <text x={1310} y={700} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={260 * w2} fill={C.white} stroke={C.ink} strokeWidth={24}
          paintOrder="stroke" transform="rotate(-5 1310 700)">BIX</text>
      </g>
      {out > 0 && <circle cx={960} cy={540} r={1200 * out} fill={C.night} opacity={out} />}
    </g>
  );
};

/** End screen art: two video slots + subscribe slot (YouTube end-screen elements go on top). */
export const EndScreenArt: React.FC<{ t: number; background?: Spec; dur?: number }> = ({ t, background, dur = 20 }) => {
  const actions: { at: number; action: BixAction; facing: 1 | -1 }[] = [
    { at: 0, action: 'wave', facing: 1 },
    { at: 3, action: 'point', facing: -1 },
    { at: 6.5, action: 'point', facing: 1 },
    { at: 10, action: 'laugh', facing: 1 },
    { at: 13, action: 'wave', facing: -1 },
    { at: 16.5, action: 'cheer', facing: 1 },
  ];
  let cur = actions[0];
  for (const a of actions) if (a.at <= t) cur = a;
  const o = actionPose(cur.action, t - cur.at, t);
  const slot = (x: number, label: string, k: number) => (
    <g transform={`translate(${x} 440) scale(${popIn(k)})`}>
      <rect x={-320} y={-180} width={640} height={360} rx={28} fill="#00000033" stroke="#ffffff" strokeWidth={8} strokeDasharray="26 18" />
      <circle r={56} fill={C.yellow} stroke={C.ink} strokeWidth={7} />
      <path d="M -16 -26 L 30 0 L -16 26 Z" fill={C.ink} />
      <text y={150} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={40} fill="#fff" opacity={0.9}>{label}</text>
    </g>
  );
  return (
    <g>
      <Background spec={background ?? { type: 'space', tint: 'purple' }} t={t} />
      <rect width={1920} height={1080} fill={C.space1} opacity={0.55} />
      <text x={960} y={150} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={110 * popIn(t / 0.4)} fill={C.yellow} stroke={C.ink} strokeWidth={14}
        paintOrder="stroke">MORE WHAT IFS?</text>
      {slot(480, 'WATCH NEXT', (t - 0.3) / 0.4)}
      {slot(1440, 'BIX RECOMMENDS', (t - 0.5) / 0.4)}
      <g transform={`translate(960 ${845}) scale(${popIn((t - 0.7) / 0.4)})`}>
        <circle r={118} fill="#00000033" stroke="#ffffff" strokeWidth={8} strokeDasharray="22 14" />
        <text y={14} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={34} fill="#fff">SUBSCRIBE</text>
      </g>
      <Bix x={960} y={705} scale={0.62} facing={cur.facing} pose={o.pose} face={o.face} emote="none" t={t} airborne={o.pose.bob} />
      {t > dur - 0.6 && <rect width={1920} height={1080} fill="#000" opacity={clamp((t - (dur - 0.6)) / 0.6)} />}
    </g>
  );
};

export const IntroSting: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <IntroArt t={f / fps} />
      </svg>
    </AbsoluteFill>
  );
};

export const EndScreenTemplate: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <EndScreenArt t={f / fps} />
      </svg>
    </AbsoluteFill>
  );
};

/** Channel avatar: Bix's face on an orange disc (safe inside YouTube's circular crop). */
export const Avatar: React.FC = () => (
  <AbsoluteFill style={{ background: C.space2 }}>
    <svg width="100%" height="100%" viewBox="0 0 800 800">
      <defs>
        <radialGradient id="avbg">
          <stop offset="0" stopColor="#4a2a8c" />
          <stop offset="1" stopColor={C.space1} />
        </radialGradient>
      </defs>
      <rect width={800} height={800} fill="url(#avbg)" />
      <circle cx={400} cy={400} r={330} fill={C.yellow} stroke={C.ink} strokeWidth={16} />
      <g transform="translate(400 455) scale(4.6) rotate(-6)">
        <Head face={grin} beanie={0} blink={false} />
      </g>
    </svg>
  </AbsoluteFill>
);

/** Channel banner 2560x1440; everything important sits inside the 1546x423 safe area. */
export const Banner: React.FC = () => {
  const o = actionPose('point', 1, 1);
  return (
    <AbsoluteFill style={{ background: C.space1 }}>
      <svg width="100%" height="100%" viewBox="0 0 2560 1440">
        <defs>
          <linearGradient id="bnbg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.space1} />
            <stop offset="0.6" stopColor={C.space2} />
            <stop offset="1" stopColor="#5b1f6b" />
          </linearGradient>
        </defs>
        <rect width={2560} height={1440} fill="url(#bnbg)" />
        <Doodles t={0} seed={9} w={2560} h={1440} count={40} />
        {/* Earth, Moon, a satellite: the channel's recurring cast of objects */}
        <g transform="translate(2170 720)">
          <circle r={210} fill={C.ocean} stroke={C.ink} strokeWidth={10} />
          <path d="M -120 -90 q 80 -30 120 30 q -20 80 -110 50 Z M 40 40 q 90 -10 110 60 q -60 60 -120 10 Z" fill={C.land} stroke={C.landDark} strokeWidth={6} />
        </g>
        <g transform="translate(2400 500)">
          <circle r={70} fill="#e3e4ee" stroke={C.ink} strokeWidth={8} />
          <circle cx={-20} cy={-14} r={16} fill="#c4c6d6" />
        </g>
        <text x={1350} y={700} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={176} fill={C.yellow} stroke={C.ink} strokeWidth={22} paintOrder="stroke"
          transform="rotate(-3 1350 700)">WHAT IF BIX</text>
        <text x={1350} y={810} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={64} fill={C.white} stroke={C.ink} strokeWidth={10}
          paintOrder="stroke">Absurd questions. Real science.</text>
        <Bix x={560} y={900} scale={1.15} facing={1} pose={o.pose} face={o.face} t={1} shadow={false} />
      </svg>
    </AbsoluteFill>
  );
};
