import React from 'react';
import { C, FONT } from '../theme';
import { Face, Pose, Emote, isBlinking } from './poses';
import { Held } from '../props/Held';

// Rig dimensions (px at scale 1). Bix stands ~330 px tall including beanie.
const THIGH = 60;
const SHIN = 58;
const TORSO = 95;
const UPPER = 50;
const FORE = 48;
const R = 46;
const STROKE_OUT = 17;
const STROKE_IN = 10.5;

type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number): P => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p: P, d: P, l: number): P => [p[0] + d[0] * l, p[1] + d[1] * l];
const rotAround = (p: P, c: P, a: number): P => {
  const s = Math.sin(rad(a));
  const co = Math.cos(rad(a));
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * co - y * s, c[1] + x * s + y * co];
};
const pts = (...p: P[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

export const rig = (pose: Pose) => {
  const hip: P = [pose.dx, -(THIGH + SHIN) - pose.bob];
  const up: P = [Math.sin(rad(pose.lean)), -Math.cos(rad(pose.lean))];
  const neck = add(hip, up, TORSO);
  const shoulder = add(hip, up, TORSO * 0.84);
  const arm = (s: number, e: number) => {
    const a = s + pose.lean;
    const elbow = add(shoulder, dir(a), UPPER);
    const hand = add(elbow, dir(a + e), FORE);
    return { elbow, hand };
  };
  const leg = (h: number, k: number) => {
    const knee = add(hip, dir(h), THIGH);
    const ankle = add(knee, dir(h - k), SHIN);
    const toe = add(ankle, dir(h - k + 90), 13);
    return { knee, ankle, toe };
  };
  const headAngle = pose.lean + pose.head;
  const head = add(neck, [Math.sin(rad(headAngle)), -Math.cos(rad(headAngle))], R + 2);
  return {
    hip, neck, shoulder, head, headAngle,
    near: arm(pose.sN, pose.eN), far: arm(pose.sF, pose.eF),
    legN: leg(pose.hN, pose.kN), legF: leg(pose.hF, pose.kF),
  };
};

const Limb: React.FC<{ points: string; fill?: string }> = ({ points, fill = C.white }) => (
  <>
    <polyline points={points} fill="none" stroke={C.ink} strokeWidth={STROKE_OUT} strokeLinecap="round" strokeLinejoin="round" />
    <polyline points={points} fill="none" stroke={fill} strokeWidth={STROKE_IN} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

const Foot: React.FC<{ ankle: P; toe: P; fill: string }> = ({ ankle, toe, fill }) => {
  const a = (Math.atan2(toe[1] - ankle[1], toe[0] - ankle[0]) * 180) / Math.PI;
  const cx = (ankle[0] + toe[0]) / 2;
  const cy = (ankle[1] + toe[1]) / 2;
  return <ellipse cx={cx} cy={cy} rx={13} ry={7.5} fill={fill} stroke={C.ink} strokeWidth={4.5} transform={`rotate(${a} ${cx} ${cy})`} />;
};

const Hand: React.FC<{ p: P; fill: string }> = ({ p, fill }) => (
  <circle cx={p[0]} cy={p[1]} r={8.5} fill={fill} stroke={C.ink} strokeWidth={4.5} />
);

const GLASS_Y = 6;
const GLASS_X = 17;
const GLASS_R = 14.5;

const Eye: React.FC<{ cx: number; face: Face; blink: boolean; k?: number }> = ({ cx, face, blink, k = 1 }) => {
  const kind = blink && (face.eyes === 'open' || face.eyes === 'up' || face.eyes === 'side') ? 'closed' : face.eyes;
  const r = (kind === 'wide' ? GLASS_R + 2.5 : GLASS_R) * k;
  const lx = face.look[0] * 5.5 * k;
  const ly = (kind === 'up' ? -1 : face.look[1]) * 5 * k;
  let inner: React.ReactNode = null;
  if (kind === 'open' || kind === 'up' || kind === 'side') {
    inner = (
      <>
        <circle cx={cx + lx} cy={GLASS_Y + ly} r={5.6 * k} fill={C.ink} />
        <circle cx={cx + lx + 1.8 * k} cy={GLASS_Y + ly - 1.9 * k} r={1.6 * k} fill={C.white} />
      </>
    );
  } else if (kind === 'wide') {
    inner = <circle cx={cx + lx * 0.4} cy={GLASS_Y} r={3.4 * k} fill={C.ink} />;
  } else if (kind === 'happy') {
    inner = <path d={`M ${cx - 7 * k} ${GLASS_Y + 4 * k} Q ${cx} ${GLASS_Y - 7 * k} ${cx + 7 * k} ${GLASS_Y + 4 * k}`} fill="none" stroke={C.ink} strokeWidth={4 * k} strokeLinecap="round" />;
  } else if (kind === 'closed') {
    inner = <path d={`M ${cx - 7 * k} ${GLASS_Y + 1} Q ${cx} ${GLASS_Y + 5 * k} ${cx + 7 * k} ${GLASS_Y + 1}`} fill="none" stroke={C.ink} strokeWidth={4 * k} strokeLinecap="round" />;
  } else if (kind === 'squint') {
    inner = (
      <>
        <circle cx={cx + lx} cy={GLASS_Y + 3 * k} r={4.5 * k} fill={C.ink} />
        <path d={`M ${cx - 12 * k} ${GLASS_Y - 1} L ${cx + 12 * k} ${GLASS_Y - 1}`} stroke={C.ink} strokeWidth={4 * k} strokeLinecap="round" />
      </>
    );
  }
  return (
    <g>
      <circle cx={cx} cy={GLASS_Y} r={r} fill={C.lens} stroke="#0d0f1c" strokeWidth={6} />
      <clipPath id={`lens${cx}_${k}`}>
        <circle cx={cx} cy={GLASS_Y} r={r - 3} />
      </clipPath>
      <g clipPath={`url(#lens${cx}_${k})`}>{inner}</g>
      <path d={`M ${cx - r * 0.55} ${GLASS_Y - r * 0.45} q ${r * 0.2} ${-r * 0.2} ${r * 0.45} ${-r * 0.22}`} stroke="#dbe9ff" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </g>
  );
};

const Mouth: React.FC<{ kind: Face['mouth'] }> = ({ kind }) => {
  const st = { stroke: C.ink, strokeWidth: 4.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'smile':
      return <path d="M -11 28 Q 0 37 11 28" fill="none" {...st} />;
    case 'grin':
      return (
        <g>
          <path d="M -14 26 Q 0 27 14 26 Q 12 41 0 41 Q -12 41 -14 26 Z" fill={C.mouth} {...st} />
          <path d="M -11 28.5 Q 0 29.5 11 28.5 L 10 32 Q 0 33 -10 32 Z" fill={C.white} />
        </g>
      );
    case 'o':
      return <ellipse cx={0} cy={32} rx={6} ry={7} fill={C.mouth} {...st} />;
    case 'shout':
      return (
        <g>
          <ellipse cx={0} cy={33} rx={10} ry={12.5} fill={C.mouth} {...st} />
          <ellipse cx={0} cy={39} rx={6} ry={4} fill={C.tongue} />
        </g>
      );
    case 'flat':
      return <path d="M -9 31 L 9 31" {...st} />;
    case 'wavy':
      return <path d="M -12 31 q 3 -4 6 0 t 6 0 t 6 0 t 6 0" fill="none" {...st} />;
    case 'laugh':
      return (
        <g>
          <path d="M -17 24 Q 0 25 17 24 Q 15 47 0 47 Q -15 47 -17 24 Z" fill={C.mouth} {...st} />
          <ellipse cx={0} cy={41} rx={8} ry={4.5} fill={C.tongue} />
          <path d="M -13 26.5 Q 0 27.5 13 26.5 L 12 30 Q 0 31 -12 30 Z" fill={C.white} />
        </g>
      );
    case 'smirk':
      return <path d="M -9 32 Q 3 34 12 25" fill="none" {...st} />;
    case 'frown':
      return <path d="M -10 34 Q 0 26 10 34" fill="none" {...st} />;
  }
  return null;
};

const Brow: React.FC<{ side: -1 | 1; face: Face }> = ({ side, face }) => {
  const base = -15 - 6 * face.brow + (side === -1 ? -face.browTilt * 4 : face.browTilt * 2);
  const innerDrop = face.brow < 0 ? -face.brow * 7 : -face.brow * 2;
  const xi = side * 6;
  const xo = side * 27;
  return <path d={`M ${xi} ${base + innerDrop} Q ${(xi + xo) / 2} ${base - 3} ${xo} ${base + 1}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />;
};

const PalEyes: React.FC<{ face: Face; blink: boolean }> = ({ face, blink }) => {
  const closed = blink || face.eyes === 'closed';
  return (
    <g>
      {[-16, 18].map((x) =>
        closed || face.eyes === 'happy' ? (
          <path key={x} d={`M ${x - 7} 6 Q ${x} ${face.eyes === 'happy' ? -3 : 10} ${x + 7} 6`} fill="none" stroke={C.ink} strokeWidth={4.5} strokeLinecap="round" />
        ) : (
          <circle key={x} cx={x + face.look[0] * 3} cy={4 + face.look[1] * 3} r={face.eyes === 'wide' ? 8 : 5.5} fill={face.eyes === 'wide' ? '#fff' : C.ink}
            stroke={C.ink} strokeWidth={face.eyes === 'wide' ? 4 : 0} />
        ),
      )}
    </g>
  );
};

/** Generic supporting character head: no beanie, no glasses, a coloured hair tuft. */
export const PalHead: React.FC<{ face: Face; blink: boolean; hair: string }> = ({ face, blink, hair }) => (
  <g>
    <circle cx={0} cy={0} r={R} fill={C.white} stroke={C.ink} strokeWidth={5} />
    <path d="M -40 -22 Q -36 -54 0 -52 Q 34 -54 42 -20 Q 20 -38 -4 -30 Q -22 -40 -40 -22 Z" fill={hair} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
    <PalEyes face={face} blink={blink} />
    <g transform="translate(3 -2)">
      <Mouth kind={face.mouth} />
    </g>
  </g>
);

/** Bix's head. eyeScale / mouthScale enlarge the glasses, eyes and mouth (Bix 2.0 variants). */
export const Head: React.FC<{ face: Face; beanie: number; blink: boolean; eyeScale?: number; mouthScale?: number }> = ({
  face, beanie, blink, eyeScale = 1, mouthScale = 1,
}) => {
  const gx = GLASS_X + (eyeScale - 1) * 9;
  const gr = GLASS_R * eyeScale;
  return (
  <g>
    <circle cx={0} cy={0} r={R} fill={C.white} stroke={C.ink} strokeWidth={5} />
    {face.blush && (
      <>
        <ellipse cx={-27} cy={24} rx={8} ry={5} fill={C.blush} opacity={0.8} />
        <ellipse cx={31} cy={24} rx={8} ry={5} fill={C.blush} opacity={0.8} />
      </>
    )}
    <g transform="translate(3 0)">
      {/* glasses temples + bridge */}
      {gx + gr < R - 2 && <path d={`M ${-gx - gr} ${GLASS_Y - 2} L ${-R + 2} ${GLASS_Y - 5}`} stroke="#0d0f1c" strokeWidth={5} strokeLinecap="round" />}
      {gx + gr < R - 2 && <path d={`M ${gx + gr} ${GLASS_Y - 2} L ${R - 2} ${GLASS_Y - 5}`} stroke="#0d0f1c" strokeWidth={5} strokeLinecap="round" />}
      <path d={`M ${-gx + gr - 2} ${GLASS_Y - 2} Q 0 ${GLASS_Y - 8} ${gx - gr + 2} ${GLASS_Y - 2}`} stroke="#0d0f1c" strokeWidth={5} fill="none" strokeLinecap="round" />
      <Eye cx={-gx} face={face} blink={blink} k={eyeScale} />
      <Eye cx={gx} face={face} blink={blink} k={eyeScale} />
    </g>
    <g transform={`translate(4 ${(mouthScale - 1) * 6}) translate(0 30) scale(${mouthScale}) translate(0 -30)`}>
      <Mouth kind={face.mouth} />
    </g>
    {/* beanie */}
    <g transform={`rotate(${-7 + beanie * 0.5} 0 -30)`}>
      <path d="M -45 -30 C -47 -80, 47 -82, 45 -30 Z" fill={C.beanie} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <path d="M -24 -62 Q -8 -73 12 -70" stroke={C.beanieLight} strokeWidth={6} fill="none" strokeLinecap="round" />
      <rect x={-6} y={-86} width={13} height={12} rx={4} fill={C.beanieDark} stroke={C.ink} strokeWidth={4.5} transform="rotate(14 0 -80)" />
      <rect x={-51} y={-40} width={102} height={22} rx={10} fill={C.beanieDark} stroke={C.ink} strokeWidth={5} />
      {[-38, -27, -16, -5, 6, 17, 28, 39].map((x) => (
        <line key={x} x1={x} y1={-36} x2={x} y2={-22} stroke={C.beanie} strokeWidth={3.5} strokeLinecap="round" />
      ))}
    </g>
    <g transform={`translate(0 ${-(eyeScale - 1) * 10})`}>
      <Brow side={-1} face={face} />
      <Brow side={1} face={face} />
    </g>
  </g>
  );
};

export const EmoteFx: React.FC<{ kind: Emote; t: number }> = ({ kind, t }) => {
  const txt = (s: string, x: number, y: number, size: number, fill: string, rot = 0, op = 1) => (
    <text x={x} y={y} fontFamily={FONT} fontWeight={700} fontSize={size} fill={fill} stroke={C.ink} strokeWidth={6}
      paintOrder="stroke" textAnchor="middle" transform={`rotate(${rot} ${x} ${y})`} opacity={op}>{s}</text>
  );
  switch (kind) {
    case 'exclaim': {
      const s = 1 + 0.08 * Math.sin(t * 30);
      return (
        <g transform={`translate(0 -112) scale(${s})`}>
          {[-50, -20, 20, 50].map((a) => (
            <line key={a} x1={0} y1={0} x2={0} y2={-26} transform={`rotate(${a}) translate(0 -46)`} stroke={C.yellow} strokeWidth={8} strokeLinecap="round" />
          ))}
          {txt('!', 0, -40, 74, C.yellow)}
        </g>
      );
    }
    case 'question':
      return txt('?', 70, -120 - 6 * Math.sin(t * 3), 78, C.teal, 12);
    case 'haha': {
      const k = (t * 1.2) % 1;
      return (
        <g>
          {txt('HA', 70, -100 - 60 * k, 46, C.yellow, 12, 1 - k)}
          {txt('HA', -70, -70 - 60 * ((k + 0.5) % 1), 40, C.yellow, -10, 1 - ((k + 0.5) % 1))}
        </g>
      );
    }
    case 'sweat':
      return <path d="M -62 -40 q -10 16 0 22 q 10 -6 0 -22 Z" fill="#7fd3ff" stroke={C.ink} strokeWidth={4} />;
    case 'zzz': {
      const k = (t * 0.6) % 1;
      return txt('Z', 60 + 30 * k, -110 - 50 * k, 30 + 20 * k, C.white, 10, 1 - k);
    }
    case 'idea':
      return (
        <g transform="translate(0 -150)">
          <circle r={22} fill={C.yellow} stroke={C.ink} strokeWidth={5} />
          <rect x={-10} y={18} width={20} height={14} rx={3} fill={C.grey} stroke={C.ink} strokeWidth={4} />
        </g>
      );
  }
  return null;
};

export type BixProps = {
  x: number;
  y: number;
  scale?: number;
  facing?: 1 | -1;
  pose: Pose;
  face: Face;
  emote?: Emote;
  t: number;
  hold?: string;
  shadow?: boolean;
  airborne?: number;
  seed?: number;
  /** 'pal' draws a generic extra (no beanie/glasses) with coloured limbs. */
  variant?: 'bix' | 'pal';
  color?: string;
  hair?: string;
};

export const Bix: React.FC<BixProps> = ({ x, y, scale = 1, facing = 1, pose, face, emote = 'none', t, hold, shadow = true, airborne = 0, seed = 0, variant = 'bix', color, hair = '#6b4a2b' }) => {
  const nearC = variant === 'pal' ? color ?? '#bfe3ff' : C.white;
  const farC = variant === 'pal' ? color ?? '#bfe3ff' : C.far;
  const r = rig(pose);
  const blink = isBlinking(t, seed);
  const rotC = r.hip;
  // world position of the head for un-mirrored emotes
  const hw = rotAround(r.head, rotC, pose.rot);
  const shadowK = Math.max(0.25, 1 - airborne / 380);
  const sq = pose.squash;
  return (
    <g>
      {shadow && (
        <ellipse cx={x} cy={y + 4 * scale} rx={62 * scale * shadowK} ry={11 * scale * shadowK} fill="#000" opacity={0.18 * shadowK} />
      )}
      <g transform={`translate(${x} ${y}) scale(${scale * facing} ${scale}) scale(${1 / Math.sqrt(sq)} ${sq})`}>
        <g transform={`rotate(${pose.rot} ${rotC[0]} ${rotC[1]})`}>
          <g opacity={variant === 'pal' ? 0.85 : 1}>
            <Limb points={pts(r.hip, r.legF.knee, r.legF.ankle)} fill={farC} />
            <Foot ankle={r.legF.ankle} toe={r.legF.toe} fill={farC} />
            <Limb points={pts(r.shoulder, r.far.elbow, r.far.hand)} fill={farC} />
            <Hand p={r.far.hand} fill={farC} />
          </g>
          <Limb points={pts(r.legN.ankle, r.legN.knee, r.hip, r.neck)} fill={nearC} />
          <Foot ankle={r.legN.ankle} toe={r.legN.toe} fill={nearC} />
          <g transform={`translate(${r.head[0]} ${r.head[1]}) rotate(${r.headAngle}) scale(1.12) translate(0 -5)`}>
            {variant === 'pal' ? <PalHead face={face} blink={blink} hair={hair} /> : <Head face={face} beanie={pose.beanie} blink={blink} />}
          </g>
          <Limb points={pts(r.shoulder, r.near.elbow, r.near.hand)} fill={nearC} />
          {hold && (
            <g transform={`translate(${r.near.hand[0]} ${r.near.hand[1]})`}>
              <Held kind={hold} />
            </g>
          )}
          <Hand p={r.near.hand} fill={nearC} />
        </g>
      </g>
      {emote !== 'none' && (
        <g transform={`translate(${x + facing * scale * hw[0]} ${y + scale * hw[1]}) scale(${scale})`}>
          <EmoteFx kind={emote} t={t} />
        </g>
      )}
    </g>
  );
};
