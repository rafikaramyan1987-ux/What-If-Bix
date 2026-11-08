import React from 'react';
import { Bix } from '../bix/Bix';
import { actionPose } from '../bix/poses';
import { C, FONT, TITLE_FONT } from '../theme';
import { clamp, popIn } from '../util';

// Vertical safe zone (1080x1920): TikTok / YouTube Shorts overlay buttons on the right
// (~180 px) and the caption/description/UI at the bottom (~470 px) and top (~140 px).
export const SAFE = { left: 60, right: 900, top: 140, bottom: 1450, centerX: 480 };

const splitTwo = (text: string) => {
  if (text.length <= 14) return [text];
  const words = text.split(' ');
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
};

/** Big hook title: fully visible from frame 0 (no slide or fade), gentle pulse for motion. */
export const HookBanner: React.FC<{ text: string; t: number }> = ({ text, t }) => {
  const lines = splitTwo(text);
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(100, 760 / (longest * 0.56));
  const h = lines.length * size * 1.02 + 54;
  const w = SAFE.right - SAFE.left;
  const pulse = 1 + 0.025 * Math.sin(t * 7) * Math.exp(-t * 0.6);
  return (
    <g transform={`translate(${SAFE.centerX} ${SAFE.top + 20 + h / 2}) rotate(-2) scale(${pulse})`}>
      <rect x={-w / 2 + 8} y={-h / 2 + 12} width={w} height={h} rx={36} fill={C.ink} opacity={0.4} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={36} fill={C.yellow} stroke={C.ink} strokeWidth={9} />
      {lines.map((l, i) => (
        <text key={i} y={-h / 2 + 27 + size * 0.86 + i * size * 1.02} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={size} fill={C.ink}>{l}</text>
      ))}
    </g>
  );
};

const Bell: React.FC<{ t: number }> = ({ t }) => {
  const ring = t > 0.35 ? 24 * Math.sin((t - 0.35) * 22) * Math.exp(-(t - 0.35) * 1.8) : 0;
  return (
    <g transform={`rotate(${ring} 0 -70)`}>
      <path d="M -62 40 Q -62 -60 0 -66 Q 62 -60 62 40 L 78 58 L -78 58 Z" fill={C.yellow} stroke={C.ink} strokeWidth={9} strokeLinejoin="round" />
      <circle cy={74} r={16} fill={C.yellow} stroke={C.ink} strokeWidth={8} />
      <rect x={-10} y={-90} width={20} height={26} rx={8} fill={C.yellow} stroke={C.ink} strokeWidth={7} />
      {t > 0.35 && t < 1.4 && [-1, 1].map((sd) => (
        <path key={sd} d={`M ${sd * 95} -30 q ${sd * 22} 30 0 60 M ${sd * 120} -48 q ${sd * 34} 48 0 96`} fill="none" stroke={C.yellow} strokeWidth={8}
          strokeLinecap="round" opacity={1 - (t - 0.35)} />
      ))}
    </g>
  );
};

/** End-of-Short call to action: SUBSCRIBE button pops in, bell rings, Bix points and the button gets pressed. */
export const CtaArt: React.FC<{ t: number; dur: number }> = ({ t, dur }) => {
  const press = dur * 0.55;
  const pressed = t >= press;
  const dip = pressed ? 1 - 0.12 * Math.sin(clamp((t - press) / 0.2) * Math.PI) : 1;
  const k = popIn(t / 0.22);
  const action = pressed ? 'cheer' : 'point';
  const o = actionPose(action, pressed ? t - press : t, t);
  const pose = pressed ? o.pose : { ...o.pose, sN: 128, eN: 0, lean: 6 };
  const bx = 500;
  const by = 830;
  return (
    <g>
      <g transform={`translate(${bx} 560) scale(${popIn((t - 0.1) / 0.3)})`}>
        <Bell t={t} />
      </g>
      <g transform={`translate(${bx} ${by}) scale(${k * dip})`}>
        <rect x={-322} y={-88} width={660} height={190} rx={95} fill={C.ink} opacity={0.4} />
        <rect x={-330} y={-100} width={660} height={190} rx={95} fill={pressed ? '#4a4f6e' : C.red} stroke={C.ink} strokeWidth={10} />
        <text y={32} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={pressed ? 84 : 104} fill="#fff">{pressed ? 'SUBSCRIBED ✓' : 'SUBSCRIBE'}</text>
      </g>
      {pressed && Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r = 220 + 260 * clamp((t - press) / 0.6);
        return (
          <text key={i} x={bx + Math.cos(a) * r * 1.3} y={by + Math.sin(a) * r * 0.7} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={46}
            fill={[C.yellow, C.teal, C.pink][i % 3]} opacity={1 - clamp((t - press) / 0.7)}>★</text>
        );
      })}
      <Bix x={175} y={1290} scale={1.1} facing={1} pose={pose} face={o.face} emote="none" t={t} airborne={pose.bob} />
      <text x={SAFE.centerX} y={1150} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={50} fill="#fff" opacity={clamp((t - 0.3) / 0.3)}
        stroke={C.ink} strokeWidth={8} paintOrder="stroke">more what ifs every week</text>
    </g>
  );
};
