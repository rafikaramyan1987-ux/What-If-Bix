import React from 'react';
import { C } from '../theme';
import { EmoteFx, Head } from './Bix';
import { Emote, Face, Pose, isBlinking } from './poses';
import { Held } from '../props/Held';

// Bix 2.0: same skeleton + pose library as Bix 1, but a chunky, phone-readable body:
// big head, filled torso, thick limbs, shoes. Three candidate styles.
export type Bix2Variant = 'A' | 'B' | 'C';

type Style = {
  name: string;
  thigh: number; shin: number; torso: number; upper: number; fore: number;
  head: number; // head scale (Bix 1 head radius 46 * head)
  eye: number; mouth: number;
  limbOut: number; limbIn: number;
  arm: string; armFar: string; leg: string; legFar: string; shoe: string; hand: string;
  torsoW: number;
};

export const STYLES: Record<Bix2Variant, Style> = {
  // A — hoodie: blue hoodie, navy trousers, white sneakers with orange soles
  A: {
    name: 'Hoodie', thigh: 40, shin: 38, torso: 100, upper: 42, fore: 40, head: 1.55, eye: 1.25, mouth: 1.25,
    limbOut: 30, limbIn: 21, arm: '#3b82f6', armFar: '#2f6fd8', leg: '#27325c', legFar: '#1e2749', shoe: '#ffffff', hand: '#ffffff', torsoW: 92,
  },
  // B — lab coat: white coat over a teal shirt, grey trousers
  B: {
    name: 'Lab coat', thigh: 44, shin: 42, torso: 108, upper: 44, fore: 42, head: 1.45, eye: 1.2, mouth: 1.2,
    limbOut: 28, limbIn: 19, arm: '#ffffff', armFar: '#e3e8f3', leg: '#4b5470', legFar: '#3d4560', shoe: '#7a4a2b', hand: '#ffffff', torsoW: 90,
  },
  // C — chibi: huge head, purple "?" sweater, stubby white legs, orange shoes
  C: {
    name: 'Chibi', thigh: 30, shin: 28, torso: 82, upper: 34, fore: 32, head: 1.8, eye: 1.4, mouth: 1.35,
    limbOut: 32, limbIn: 23, arm: '#8a5cff', armFar: '#7346e6', leg: '#ffffff', legFar: '#e3e8f3', shoe: '#ff7a1a', hand: '#ffffff', torsoW: 100,
  },
};

type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const dir = (a: number): P => [Math.sin(rad(a)), Math.cos(rad(a))];
const add = (p: P, d: P, l: number): P => [p[0] + d[0] * l, p[1] + d[1] * l];
const pts = (...p: P[]) => p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

/** Total standing height (feet to beanie top) at scale 1. */
export const bix2Height = (v: Bix2Variant) => {
  const s = STYLES[v];
  return s.thigh + s.shin + s.torso + 46 * s.head * 2 + 40 * s.head;
};

/** Raised arms splay outward so the hands go beside the (big) head instead of over the face. */
const splay = (a: number) => (a > 100 ? 100 + (a - 100) * 0.4 : a < -100 ? -100 + (a + 100) * 0.4 : a);
export const adaptPose = (pose: Pose): Pose => ({ ...pose, sN: splay(pose.sN), sF: splay(pose.sF) });

const rig2 = (s: Style, pose: Pose) => {
  const hip: P = [pose.dx, -(s.thigh + s.shin) - pose.bob];
  const up: P = [Math.sin(rad(pose.lean)), -Math.cos(rad(pose.lean))];
  const right: P = [Math.cos(rad(pose.lean)), Math.sin(rad(pose.lean))];
  const neck = add(hip, up, s.torso);
  const shoulderC = add(hip, up, s.torso * 0.8);
  // 3/4 view: arms hang at the sides of the torso, legs at the hips (clear silhouette, face stays visible)
  const shoulderN = add(shoulderC, right, s.torsoW * 0.42);
  const shoulderF = add(shoulderC, right, -s.torsoW * 0.42);
  const arm = (sh: number, e: number, from: P) => {
    const a = sh + pose.lean;
    const elbow = add(from, dir(a), s.upper);
    const hand = add(elbow, dir(a + e), s.fore);
    return { shoulder: from, elbow, hand };
  };
  const leg = (h: number, k: number, side: number) => {
    const root = add(hip, right, side * s.torsoW * 0.2);
    const knee = add(root, dir(h), s.thigh);
    const ankle = add(knee, dir(h - k), s.shin);
    const toe = add(ankle, dir(h - k + 90), 16);
    return { root, knee, ankle, toe };
  };
  const headAngle = pose.lean + pose.head;
  const hr = 46 * s.head;
  const head = add(neck, [Math.sin(rad(headAngle)), -Math.cos(rad(headAngle))], hr * 0.92);
  return {
    hip, neck, head, headAngle,
    near: arm(pose.sN, pose.eN, shoulderN), far: arm(pose.sF, pose.eF, shoulderF),
    legN: leg(pose.hN, pose.kN, 1), legF: leg(pose.hF, pose.kF, -1),
  };
};

const Limb: React.FC<{ points: string; fill: string; out: number; inn: number }> = ({ points, fill, out, inn }) => (
  <>
    <polyline points={points} fill="none" stroke={C.ink} strokeWidth={out} strokeLinecap="round" strokeLinejoin="round" />
    <polyline points={points} fill="none" stroke={fill} strokeWidth={inn} strokeLinecap="round" strokeLinejoin="round" />
  </>
);

const Shoe: React.FC<{ ankle: P; toe: P; fill: string; variant: Bix2Variant }> = ({ ankle, toe, fill, variant }) => {
  const a = (Math.atan2(toe[1] - ankle[1], toe[0] - ankle[0]) * 180) / Math.PI;
  const cx = (ankle[0] * 0.4 + toe[0] * 0.6);
  const cy = (ankle[1] * 0.4 + toe[1] * 0.6) + 4;
  return (
    <g transform={`rotate(${a} ${cx} ${cy})`}>
      <path d={`M ${cx - 18} ${cy + 8} Q ${cx - 20} ${cy - 10} ${cx - 2} ${cy - 11} Q ${cx + 20} ${cy - 9} ${cx + 22} ${cy + 8} Z`} fill={fill} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      {variant === 'A' && <rect x={cx - 19} y={cy + 4} width={41} height={6} rx={3} fill={C.orange} />}
    </g>
  );
};

/** Torso in torso-local space: origin at the hip, y up the spine (negative), length T. */
const Torso: React.FC<{ s: Style; v: Bix2Variant }> = ({ s, v }) => {
  const T = s.torso;
  const w = s.torsoW;
  if (v === 'A') {
    return (
      <g>
        <path d={`M ${-w / 2} 10 Q ${-w / 2 - 6} ${-T * 0.5} ${-w * 0.42} ${-T + 6} Q 0 ${-T - 14} ${w * 0.42} ${-T + 6} Q ${w / 2 + 6} ${-T * 0.5} ${w / 2} 10 Q 0 22 ${-w / 2} 10 Z`}
          fill={s.arm} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        {/* hood roll + drawstrings */}
        <path d={`M ${-w * 0.36} ${-T + 4} Q 0 ${-T + 26} ${w * 0.36} ${-T + 4}`} fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
        <line x1={-10} y1={-T + 16} x2={-12} y2={-T + 44} stroke="#ffffff" strokeWidth={4} strokeLinecap="round" />
        <line x1={10} y1={-T + 16} x2={12} y2={-T + 44} stroke="#ffffff" strokeWidth={4} strokeLinecap="round" />
        {/* kangaroo pocket */}
        <path d={`M ${-w * 0.32} -6 L ${-w * 0.22} ${-T * 0.36} L ${w * 0.22} ${-T * 0.36} L ${w * 0.32} -6`} fill="none" stroke="#1e4fa8" strokeWidth={4} strokeLinejoin="round" />
        {/* small beaker logo */}
        <path d={`M -6 ${-T * 0.62} l 0 8 l -7 12 l 26 0 l -7 -12 l 0 -8 Z`} fill="#ffffff" stroke={C.ink} strokeWidth={3} strokeLinejoin="round" />
        <path d={`M -10 ${-T * 0.62 + 16} l 18 0 l 3 4 l -24 0 Z`} fill={C.orange} />
      </g>
    );
  }
  if (v === 'B') {
    return (
      <g>
        {/* teal shirt */}
        <path d={`M ${-w * 0.36} 4 L ${-w * 0.38} ${-T + 8} Q 0 ${-T - 8} ${w * 0.38} ${-T + 8} L ${w * 0.36} 4 Z`} fill={C.teal} stroke={C.ink} strokeWidth={5} />
        {/* coat panels (open), reaching below the hips */}
        <path d={`M ${-w / 2 - 4} 38 Q ${-w / 2 - 8} ${-T * 0.5} ${-w * 0.44} ${-T + 4} Q ${-w * 0.2} ${-T - 8} ${-8} ${-T + 4} L ${-14} ${-T * 0.45} L ${-10} 36 Z`}
          fill="#ffffff" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        <path d={`M ${w / 2 + 4} 38 Q ${w / 2 + 8} ${-T * 0.5} ${w * 0.44} ${-T + 4} Q ${w * 0.2} ${-T - 8} ${8} ${-T + 4} L ${14} ${-T * 0.45} L ${10} 36 Z`}
          fill="#f2f5fb" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        {/* lapels */}
        <path d={`M -8 ${-T + 4} L -24 ${-T + 36} L -14 ${-T * 0.45}`} fill="none" stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
        <path d={`M 8 ${-T + 4} L 24 ${-T + 36} L 14 ${-T * 0.45}`} fill="none" stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
        {/* pocket with pens */}
        <rect x={w * 0.14} y={-T * 0.62} width={22} height={18} rx={3} fill="#ffffff" stroke={C.ink} strokeWidth={3.5} />
        <line x1={w * 0.14 + 7} y1={-T * 0.62 - 8} x2={w * 0.14 + 7} y2={-T * 0.62 + 4} stroke={C.red} strokeWidth={4} strokeLinecap="round" />
        <line x1={w * 0.14 + 15} y1={-T * 0.62 - 6} x2={w * 0.14 + 15} y2={-T * 0.62 + 4} stroke={C.ocean} strokeWidth={4} strokeLinecap="round" />
      </g>
    );
  }
  // C — bean-shaped sweater with a "?" badge
  return (
    <g>
      <path d={`M ${-w / 2} 0 Q ${-w / 2 - 4} ${-T * 0.9} 0 ${-T - 6} Q ${w / 2 + 4} ${-T * 0.9} ${w / 2} 0 Q ${w / 2} 18 0 18 Q ${-w / 2} 18 ${-w / 2} 0 Z`}
        fill={s.arm} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <path d={`M ${-w * 0.42} 2 Q 0 14 ${w * 0.42} 2`} fill="none" stroke="#5f39c9" strokeWidth={6} strokeLinecap="round" />
      <circle cx={0} cy={-T * 0.5} r={19} fill={C.yellow} stroke={C.ink} strokeWidth={4} />
      <text x={0} y={-T * 0.5 + 9} textAnchor="middle" fontFamily="'Lilita One', sans-serif" fontSize={26} fill={C.ink}>?</text>
    </g>
  );
};

export type Bix2Props = {
  variant: Bix2Variant;
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
};

export const Bix2: React.FC<Bix2Props> = ({ variant, x, y, scale = 1, facing = 1, pose, face, emote = 'none', t, hold, shadow = true, airborne = 0, seed = 0 }) => {
  const s = STYLES[variant];
  const r = rig2(s, adaptPose(pose));
  const blink = isBlinking(t, seed);
  const shadowK = Math.max(0.25, 1 - airborne / 380);
  const sq = pose.squash;
  return (
    <g>
      {shadow && <ellipse cx={x} cy={y + 4 * scale} rx={78 * scale * shadowK} ry={13 * scale * shadowK} fill="#000" opacity={0.2 * shadowK} />}
      <g transform={`translate(${x} ${y}) scale(${scale * facing} ${scale}) scale(${1 / Math.sqrt(sq)} ${sq})`}>
        <g transform={`rotate(${pose.rot} ${r.hip[0]} ${r.hip[1]})`}>
          <Limb points={pts(r.legF.root, r.legF.knee, r.legF.ankle)} fill={s.legFar} out={s.limbOut} inn={s.limbIn} />
          <Shoe ankle={r.legF.ankle} toe={r.legF.toe} fill={s.shoe} variant={variant} />
          <Limb points={pts(r.far.shoulder, r.far.elbow, r.far.hand)} fill={s.armFar} out={s.limbOut} inn={s.limbIn} />
          <circle cx={r.far.hand[0]} cy={r.far.hand[1]} r={12} fill={s.hand} stroke={C.ink} strokeWidth={5} />
          <Limb points={pts(r.legN.root, r.legN.knee, r.legN.ankle)} fill={s.leg} out={s.limbOut} inn={s.limbIn} />
          <Shoe ankle={r.legN.ankle} toe={r.legN.toe} fill={s.shoe} variant={variant} />
          <g transform={`translate(${r.hip[0]} ${r.hip[1]}) rotate(${pose.lean})`}>
            <Torso s={s} v={variant} />
          </g>
          <g transform={`translate(${r.head[0]} ${r.head[1]}) rotate(${r.headAngle}) scale(${s.head})`}>
            <Head face={face} beanie={pose.beanie} blink={blink} eyeScale={s.eye} mouthScale={s.mouth} />
          </g>
          <Limb points={pts(r.near.shoulder, r.near.elbow, r.near.hand)} fill={s.arm} out={s.limbOut} inn={s.limbIn} />
          {hold && (
            <g transform={`translate(${r.near.hand[0]} ${r.near.hand[1]}) scale(1.3)`}>
              <Held kind={hold} />
            </g>
          )}
          <circle cx={r.near.hand[0]} cy={r.near.hand[1]} r={13} fill={s.hand} stroke={C.ink} strokeWidth={5} />
        </g>
      </g>
      {emote !== 'none' && (() => {
        // head position after the whole-body rotation (flying, tumbling)
        const a = rad(pose.rot);
        const dx = r.head[0] - r.hip[0];
        const dy = r.head[1] - r.hip[1];
        const hx = r.hip[0] + dx * Math.cos(a) - dy * Math.sin(a);
        const hy = r.hip[1] + dx * Math.sin(a) + dy * Math.cos(a);
        return (
        <g transform={`translate(${x + facing * scale * hx} ${y + scale * hy}) scale(${scale * s.head * 0.85})`}>
          <EmoteFx kind={emote} t={t} />
        </g>
        );
      })()}
    </g>
  );
};
