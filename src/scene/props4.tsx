import React from 'react';
import { C, FONT, TITLE_FONT } from '../theme';
import { Spec } from '../types';
import { clamp, easeInOut, num, popIn, rng, str, vec } from '../util';
import { GROUND_Y } from './backgrounds';

// Props for What If Bix episodes 6–9: vacuum chamber, black hole, bathyscaphe, deep-sea
// snailfish and amphipod, bee, flower, dung beetle.

type PP = { spec: Spec; t: number };
const appearK = (spec: Spec, t: number, d = 0.35) => (spec.at === undefined ? 1 : popIn((t - num(spec.at, 0)) / d));
const started = (spec: Spec, t: number) => spec.at === undefined || t >= num(spec.at, 0);
const moveXY = (spec: Spec, t: number, def: [number, number]): [number, number] => {
  let [x, y] = [num(spec.x, def[0]), num(spec.y, def[1])];
  if (spec.to) {
    const [x1, y1] = vec(spec.from, [x, y]);
    const [x2, y2] = vec(spec.to, [x, y]);
    const k = easeInOut(clamp((t - num(spec.moveAt, num(spec.at, 0))) / num(spec.dur, 1)));
    x = x1 + (x2 - x1) * k;
    y = y1 + (y2 - y1) * k;
  }
  return [x, y];
};

/** Vacuum test chamber: a big steel cylinder with a round window; leakAt makes the air rush out (gauge needle drops). */
export const Chamber: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const s = num(spec.s, 1) * appearK(spec, t);
  const leakAt = typeof spec.leakAt === 'number' ? spec.leakAt : undefined;
  const leak = leakAt !== undefined && t >= leakAt ? clamp((t - leakAt) / 1.2) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) scale(${s})`}>
      <rect x={-230} y={-560} width={460} height={560} rx={60} fill="#9aa3bf" stroke={C.ink} strokeWidth={9} />
      {[-470, -300, -130].map((y) => <rect key={y} x={-236} y={y} width={472} height={22} rx={8} fill="#7c85a3" stroke={C.ink} strokeWidth={5} />)}
      <circle cx={0} cy={-330} r={110} fill="#1d2448" stroke={C.ink} strokeWidth={9} />
      <circle cx={0} cy={-330} r={92} fill={leak > 0 ? '#2a1a35' : '#9fd8ff'} opacity={0.85} />
      <path d="M -50 -380 q 30 -20 60 -10" stroke="#fff" strokeWidth={8} fill="none" opacity={0.6} strokeLinecap="round" />
      <g transform="translate(160 -180)">
        <circle r={46} fill="#fff" stroke={C.ink} strokeWidth={6} />
        <line x1={0} y1={0} x2={0} y2={-34} stroke={C.red} strokeWidth={6} strokeLinecap="round" transform={`rotate(${60 - 140 * leak})`} />
      </g>
      {leak > 0 && leak < 1 && Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={`M 230 ${-420 + i * 40} q 60 -10 ${120 + 80 * leak} 0`} stroke="#ffffff" strokeWidth={6} fill="none" opacity={1 - leak} strokeLinecap="round" />
      ))}
      {spec.label !== undefined && (
        <text y={-600} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={52} fill="#fff" stroke={C.ink} strokeWidth={8} paintOrder="stroke">{str(spec.label, '')}</text>
      )}
    </g>
  );
};

/** Black hole: dark shadow, glowing accretion ring, swirling disk; grow: [r0, r1] animates the size. */
export const BlackHole: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const grow = Array.isArray(spec.grow) ? (spec.grow as number[]) : [];
  const k = grow.length === 2 ? easeInOut((t - num(spec.at, 0)) / num(spec.dur, 2)) : 1;
  const R = grow.length === 2 ? grow[0] + (grow[1] - grow[0]) * k : num(spec.r, 160);
  const a = appearK(spec, t);
  const spin = t * num(spec.spin, 40);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 480)}) scale(${grow.length === 2 ? 1 : a})`}>
      <ellipse rx={R * 2.6} ry={R * 0.55} fill="none" stroke="#ff8a3a" strokeWidth={R * 0.28} opacity={0.35} />
      <ellipse rx={R * 2.1} ry={R * 0.42} fill="none" stroke="#ffd447" strokeWidth={R * 0.16} opacity={0.75}
        strokeDasharray={`${R * 0.9} ${R * 0.35}`} strokeDashoffset={-spin * 4} />
      <circle r={R * 1.18} fill="#ffb02e" opacity={0.85} />
      <circle r={R * 1.08} fill="#fff2c4" opacity={0.6} />
      <circle r={R} fill="#000" />
      <path d={`M ${-R * 2.1} 0 A ${R * 2.1} ${R * 0.42} 0 0 0 ${R * 2.1} 0`} fill="none" stroke="#ffd447" strokeWidth={R * 0.16} opacity={0.9} />
      {spec.label !== undefined && (
        <text y={R * 1.9} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={Math.max(30, R * 0.24)} fill="#fff" stroke={C.ink}
          strokeWidth={8} paintOrder="stroke">{str(spec.label, '')}</text>
      )}
    </g>
  );
};

/** Bathyscaphe (Trieste-style): float on top, crew sphere below; from/to/moveAt/dur to dive; light: true = headlight. */
export const Sub: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x, y] = moveXY(spec, t, [960, 420]);
  const f = num(spec.facing, 1);
  return (
    <g transform={`translate(${x} ${y + 5 * Math.sin(t * 1.5)}) scale(${num(spec.s, 1) * appearK(spec, t) * f} ${num(spec.s, 1) * appearK(spec, t)})`}>
      {spec.light === true && <path d="M 90 120 L 600 40 L 600 300 Z" fill="#fff6c0" opacity={0.22} />}
      <rect x={-210} y={-90} width={420} height={120} rx={60} fill="#e8eef8" stroke={C.ink} strokeWidth={8} />
      <rect x={-40} y={-140} width={90} height={60} rx={12} fill="#ffd447" stroke={C.ink} strokeWidth={7} />
      <rect x={-12} y={30} width={24} height={40} fill="#9aa3bf" stroke={C.ink} strokeWidth={6} />
      <circle cx={0} cy={120} r={62} fill="#9aa3bf" stroke={C.ink} strokeWidth={8} />
      <circle cx={38} cy={120} r={16} fill="#9fd8ff" stroke={C.ink} strokeWidth={5} />
      {spec.label !== undefined && (
        <text x={0} y={-12} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={44} fill={C.ink} transform={`scale(${f} 1)`}>{str(spec.label, '')}</text>
      )}
    </g>
  );
};

/** Hadal snailfish: pale, tadpole-shaped; swims gently; from/to to cross the screen. */
export const Snailfish: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x, y] = moveXY(spec, t, [960, 600]);
  const f = num(spec.facing, 1);
  const w = Math.sin(t * 5) * 10;
  return (
    <g transform={`translate(${x} ${y + 8 * Math.sin(t * 2)}) scale(${num(spec.s, 1) * appearK(spec, t) * f} ${num(spec.s, 1) * appearK(spec, t)})`}>
      <path d={`M -40 0 Q -150 ${-30 + w} -240 ${w} Q -150 ${30 + w} -40 0 Z`} fill="#f4d9e6" stroke={C.ink} strokeWidth={6} opacity={0.95} />
      <ellipse cx={30} cy={0} rx={95} ry={62} fill="#f8e4ee" stroke={C.ink} strokeWidth={7} />
      <circle cx={80} cy={-14} r={11} fill={C.ink} />
      <path d="M 20 30 q 30 30 60 0" stroke="#e0a9c4" strokeWidth={6} fill="none" />
    </g>
  );
};

/** Hadal amphipod (shrimp-like scavenger); count > 1 draws a small swarm. */
export const Amphipod: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const r = rng(num(spec.seed, 3));
  const n = num(spec.count, 1);
  const spread = num(spec.spread, 260);
  const items = Array.from({ length: n }, (_, i) => ({ dx: i === 0 ? 0 : (r() - 0.5) * spread * 2, dy: i === 0 ? 0 : (r() - 0.5) * spread, s: i === 0 ? 1 : 0.4 + r() * 0.4, p: r() * 6 }));
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 600)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      {items.map((it, i) => (
        <g key={i} transform={`translate(${it.dx + 8 * Math.sin(t * 2 + it.p)} ${it.dy}) scale(${it.s})`}>
          <path d="M -90 10 Q -60 -50 20 -46 Q 90 -40 100 6 Q 40 30 -90 10 Z" fill="#f2c9a0" stroke={C.ink} strokeWidth={6} />
          {[-60, -30, 0, 30, 60].map((sx) => <path key={sx} d={`M ${sx} -42 Q ${sx + 6} -10 ${sx} 18`} stroke="#d39c6c" strokeWidth={4} fill="none" />)}
          {[-50, -20, 10, 40].map((lx, j) => <line key={lx} x1={lx} y1={14} x2={lx - 10 + 6 * Math.sin(t * 9 + j)} y2={44} stroke={C.ink} strokeWidth={5} strokeLinecap="round" />)}
          <path d="M 96 -6 q 40 -40 70 -30 M 96 0 q 50 -10 76 6" stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
          <circle cx={78} cy={-14} r={7} fill={C.ink} />
        </g>
      ))}
    </g>
  );
};

/** Honeybee; from/to/moveAt/dur to fly; vanishAt fades it out (for "insects disappear"). */
export const Bee: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const vanishAt = typeof spec.vanishAt === 'number' ? spec.vanishAt : undefined;
  const fade = vanishAt !== undefined ? 1 - clamp((t - vanishAt) / 0.6) : 1;
  if (fade <= 0) return null;
  const [x, y] = moveXY(spec, t, [960, 400]);
  const f = num(spec.facing, 1);
  const wing = Math.abs(Math.sin(t * 40));
  return (
    <g opacity={fade} transform={`translate(${x} ${y + 10 * Math.sin(t * 6 + num(spec.seed, 0))}) scale(${num(spec.s, 1) * appearK(spec, t) * f} ${num(spec.s, 1) * appearK(spec, t)})`}>
      <ellipse cx={-10} cy={-58} rx={34} ry={50 * (0.4 + 0.6 * wing)} fill="#e8f6ff" stroke={C.ink} strokeWidth={5} opacity={0.85} transform="rotate(-25 -10 -40)" />
      <ellipse cx={0} cy={0} rx={70} ry={46} fill={C.yellow} stroke={C.ink} strokeWidth={7} />
      {[-30, 0, 30].map((sx) => <rect key={sx} x={sx - 8} y={-44} width={16} height={88} fill={C.ink} />)}
      <circle cx={74} cy={-4} r={30} fill={C.ink} />
      <circle cx={84} cy={-12} r={8} fill="#fff" />
      <path d="M -70 0 L -96 0" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
      <path d="M 86 -30 q 10 -30 30 -36 M 74 -32 q 0 -34 14 -44" stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
    </g>
  );
};

/** Flower (or a row of flowers with count); wiltAt makes them droop and fade. */
export const Flower: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const n = num(spec.count, 1);
  const gap = num(spec.gap, 170);
  const wiltAt = typeof spec.wiltAt === 'number' ? spec.wiltAt : undefined;
  const wilt = wiltAt !== undefined ? clamp((t - wiltAt) / 1.5) : 0;
  const colors = ['#ff6fb5', '#ffd447', '#8a5cff', '#ff7a1a', '#22d3c5'];
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      {Array.from({ length: n }, (_, i) => {
        const fx = (i - (n - 1) / 2) * gap;
        const col = str(spec.color, colors[i % colors.length]);
        return (
          <g key={i} transform={`translate(${fx} 0)`}>
            <path d={`M 0 0 Q ${10 + 40 * wilt} -120 ${40 * wilt} ${-220 + 90 * wilt}`} stroke="#25a352" strokeWidth={12} fill="none" />
            <path d="M 0 -80 q -60 -20 -70 -60 q 50 0 70 40" fill={C.land} stroke={C.ink} strokeWidth={4} />
            <g transform={`translate(${40 * wilt} ${-220 + 90 * wilt}) rotate(${70 * wilt})`} opacity={1 - 0.45 * wilt}>
              {Array.from({ length: 6 }, (_, j) => (
                <ellipse key={j} cx={0} cy={-38} rx={24} ry={40} fill={wilt > 0.5 ? '#b9a48a' : col} stroke={C.ink} strokeWidth={4} transform={`rotate(${j * 60})`} />
              ))}
              <circle r={24} fill={C.yellow} stroke={C.ink} strokeWidth={5} />
            </g>
          </g>
        );
      })}
    </g>
  );
};

/** Dung beetle rolling a ball; from/to/moveAt/dur to roll. */
export const Beetle: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x, y] = moveXY(spec, t, [960, GROUND_Y]);
  const f = num(spec.facing, 1);
  const roll = t * 160;
  return (
    <g transform={`translate(${x} ${y}) scale(${num(spec.s, 1) * appearK(spec, t) * f} ${num(spec.s, 1) * appearK(spec, t)})`}>
      <g transform={`translate(120 -70) rotate(${roll})`}>
        <circle r={70} fill="#8a5a2b" stroke={C.ink} strokeWidth={7} />
        <path d="M -30 -20 q 20 10 40 -10 M -20 30 q 20 -10 30 10" stroke="#5a3a1e" strokeWidth={6} fill="none" />
      </g>
      {[-40, -10, 20].map((lx, i) => <line key={lx} x1={lx} y1={-40} x2={lx + 12 * Math.sin(t * 12 + i)} y2={0} stroke={C.ink} strokeWidth={8} strokeLinecap="round" />)}
      <ellipse cx={-10} cy={-60} rx={70} ry={42} fill="#2c3a5a" stroke={C.ink} strokeWidth={7} />
      <line x1={-10} y1={-100} x2={-10} y2={-20} stroke="#4a5a80" strokeWidth={5} />
      <circle cx={-80} cy={-58} r={24} fill="#2c3a5a" stroke={C.ink} strokeWidth={6} />
      <circle cx={-90} cy={-64} r={5} fill="#fff" />
    </g>
  );
};

export const PROPS4: Record<string, React.FC<PP>> = {
  chamber: Chamber, blackhole: BlackHole, sub: Sub, snailfish: Snailfish, amphipod: Amphipod, bee: Bee, flower: Flower, beetle: Beetle,
};
