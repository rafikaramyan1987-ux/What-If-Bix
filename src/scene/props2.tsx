import React from 'react';
import { Bix } from '../bix/Bix';
import { actionPose, BixAction } from '../bix/poses';
import { C, FONT, TITLE_FONT } from '../theme';
import { Spec } from '../types';
import { clamp, easeInOut, easeOut, formatNumber, num, popIn, rng, smooth, str, vec } from '../util';
import { Held } from '../props/Held';
import { GROUND_Y } from './backgrounds';
import { LangContext } from '../lang';

type PP = { spec: Spec; t: number };
const appearK = (spec: Spec, t: number, d = 0.35) => (spec.at === undefined ? 1 : popIn((t - num(spec.at, 0)) / d));
const started = (spec: Spec, t: number) => spec.at === undefined || t >= num(spec.at, 0);
const arr = <T,>(v: unknown, d: T[]): T[] => (Array.isArray(v) ? (v as T[]) : d);
const PAL_COLORS = ['#ffb3c7', '#bfe3ff', '#c8f7c5', '#ffe08a', '#d9c7ff', '#ffc89e', '#a8f0e8'];
const HAIRS = ['#6b4a2b', '#2b2b2b', '#e0a53a', '#b4402a', '#7a5cff', '#3b8c4a'];

/** Action at time t from a list of {at, action} cues. */
const actionAt = (cues: { at: number; action: BixAction }[], t: number, def: BixAction) => {
  let cur = { at: 0, action: def };
  for (const c of cues) if (c.at <= t) cur = c;
  return cur;
};

// ---------------------------------------------------------------- people

/** One generic extra character with timed actions and optional movement. */
export const Pal: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const cues = arr<{ at: number; action: BixAction }>(spec.actions, []);
  const cur = actionAt(cues, t, str(spec.action, 'idle') as BixAction);
  const o = actionPose(cur.action, t - cur.at, t + num(spec.seed, 0), { panic: num(spec.panic, 0) });
  let [x, y] = [num(spec.x, 960), num(spec.y, GROUND_Y)];
  if (spec.to) {
    const [x1, y1] = vec(spec.from, [x, y]);
    const [x2, y2] = vec(spec.to, [x, y]);
    const k = clamp((t - num(spec.moveAt, num(spec.at, 0))) / num(spec.dur, 1));
    x = x1 + (x2 - x1) * k;
    y = y1 + (y2 - y1) * k;
  }
  return (
    <Bix variant="pal" x={x} y={y} scale={num(spec.s, 0.8) * appearK(spec, t)} facing={num(spec.facing, -1) as 1 | -1} pose={o.pose} face={o.face}
      emote={spec.emote === false ? 'none' : o.emote} t={t} color={str(spec.color, PAL_COLORS[num(spec.seed, 1) % PAL_COLORS.length])}
      hair={str(spec.hair, HAIRS[num(spec.seed, 1) % HAIRS.length])} hold={spec.hold as string | undefined} airborne={o.pose.bob} seed={num(spec.seed, 0)} />
  );
};

/** A crowd of small generic people. jumpAt makes everyone jump (sync: true = all at once). */
export const Crowd: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const r = rng(num(spec.seed, 5));
  const n = num(spec.count, 24);
  const rows = num(spec.rows, 3);
  const x0 = num(spec.x, 960);
  const y0 = num(spec.y, GROUND_Y);
  const w = num(spec.w, 1600);
  const s = num(spec.s, 0.42);
  const jumpAt = typeof spec.jumpAt === 'number' ? spec.jumpAt : undefined;
  const cheerAt = typeof spec.cheerAt === 'number' ? spec.cheerAt : undefined;
  const panicAt = typeof spec.panicAt === 'number' ? spec.panicAt : undefined;
  const people = Array.from({ length: n }, (_, i) => ({
    row: i % rows, x: x0 - w / 2 + r() * w, jitter: r() * 0.35, c: PAL_COLORS[i % PAL_COLORS.length], h: HAIRS[i % HAIRS.length], f: r() > 0.5 ? 1 : -1,
  })).sort((a, b) => a.row - b.row);
  return (
    <g>
      {people.map((p, i) => {
        const off = spec.sync === true ? 0 : p.jitter;
        let action: BixAction = 'idle';
        let lt = t;
        if (jumpAt !== undefined && t >= jumpAt + off) { action = 'jump'; lt = t - jumpAt - off; }
        if (cheerAt !== undefined && t >= cheerAt + off) { action = 'cheer'; lt = t - cheerAt; }
        if (panicAt !== undefined && t >= panicAt + off) { action = 'shock'; lt = t - panicAt - off; }
        const o = actionPose(action, lt, t + i * 0.37);
        const rs = s * (0.82 + 0.09 * p.row);
        return (
          <Bix key={i} variant="pal" x={p.x} y={y0 - 34 * (rows - 1 - p.row)} scale={rs} facing={p.f as 1 | -1} pose={o.pose} face={o.face} emote="none"
            t={t + i} color={p.c} hair={p.h} airborne={o.pose.bob} seed={i} />
        );
      })}
    </g>
  );
};

// ---------------------------------------------------------------- charts & diagrams

/** Animated bar chart. values/labels arrays; bars grow from `at`. */
export const Bars: React.FC<PP> = ({ spec, t }) => {
  const lang = React.useContext(LangContext);
  if (!started(spec, t)) return null;
  const values = arr<number>(spec.values, [1, 2, 3]);
  const labels = arr<string>(spec.labels, []);
  const colors = arr<string>(spec.colors, [C.teal, C.yellow, C.pink, C.purple, C.orange, C.green]);
  const x = num(spec.x, 960);
  const y = num(spec.y, 760);
  const w = num(spec.w, 900);
  const h = num(spec.h, 420);
  const max = num(spec.max, Math.max(...values));
  const bw = (w / values.length) * 0.62;
  const unit = str(spec.unit, '');
  const display = arr<string>(spec.display, []); // optional text per bar, e.g. "6 trillion trillion kg"
  return (
    <g transform={`translate(${x - w / 2} ${y})`}>
      <line x1={-20} y1={0} x2={w + 20} y2={0} stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
      {values.map((v, i) => {
        const k = easeOut((t - num(spec.at, 0) - i * 0.15) / 0.8);
        const bh = (v / max) * h * k;
        const cx = (i + 0.5) * (w / values.length);
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={-bh} width={bw} height={bh} rx={10} fill={colors[i % colors.length]} stroke={C.ink} strokeWidth={6} />
            {k > 0.2 && (
              <text x={cx} y={-bh - 18} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={42} fill={C.white} stroke={C.ink} strokeWidth={8}
                paintOrder="stroke">{display[i] !== undefined && k > 0.95 ? display[i] : `${formatNumber(v * k, num(spec.decimals, 0), lang)}${unit}`}</text>
            )}
            {labels[i] && (
              <text x={cx} y={56} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={36} fill={C.white} stroke={C.ink} strokeWidth={7}
                paintOrder="stroke">{labels[i]}</text>
            )}
          </g>
        );
      })}
    </g>
  );
};

/** Analog clock; time "hh:mm", speed = hours per second. */
export const Clock: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [hh, mm] = str(spec.time, '12:00').split(':').map(Number);
  const speed = num(spec.speed, 0);
  const lt = Math.max(0, t - num(spec.at, 0));
  const minutes = hh * 60 + (mm || 0) + speed * lt * 60;
  const R = num(spec.r, 110);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${appearK(spec, t)})`}>
      <circle r={R} fill="#ffffff" stroke={C.ink} strokeWidth={R * 0.09} />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1={0} y1={-R * 0.82} x2={0} y2={-R * 0.7} stroke={C.ink} strokeWidth={R * 0.05} transform={`rotate(${i * 30})`} strokeLinecap="round" />
      ))}
      <line x1={0} y1={0} x2={0} y2={-R * 0.5} stroke={C.ink} strokeWidth={R * 0.1} strokeLinecap="round" transform={`rotate(${(minutes / 720) * 360})`} />
      <line x1={0} y1={0} x2={0} y2={-R * 0.75} stroke={C.red} strokeWidth={R * 0.06} strokeLinecap="round" transform={`rotate(${(minutes % 60) * 6})`} />
      <circle r={R * 0.08} fill={C.ink} />
    </g>
  );
};

/** Tear-off calendar counting from `from` to `to` over `dur` seconds. */
export const Calendar: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const from = num(spec.from, 1);
  const to = num(spec.to, from);
  const k = easeInOut((t - num(spec.at, 0)) / num(spec.dur, 1));
  const day = Math.round(from + (to - from) * k);
  const label = str(spec.label, 'DAY');
  const flip = ((from + (to - from) * k) % 1);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${num(spec.s, 1) * appearK(spec, t)}) rotate(${num(spec.rot, -4)})`}>
      <rect x={-130} y={-140} width={260} height={280} rx={22} fill="#ffffff" stroke={C.ink} strokeWidth={9} />
      <rect x={-130} y={-140} width={260} height={84} rx={22} fill={str(spec.color, C.red)} stroke={C.ink} strokeWidth={9} />
      <text x={0} y={-82} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={52} fill="#fff">{label}</text>
      <text x={0} y={100} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={150} fill={C.ink}>{day}</text>
      {flip > 0.05 && flip < 0.6 && <path d={`M -126 -52 L 126 -52 L 126 ${-52 + 180 * (1 - flip)} Q 0 ${-20 + 150 * (1 - flip)} -126 ${-52 + 180 * (1 - flip)} Z`} fill="#f2f2f2" stroke={C.ink} strokeWidth={5} />}
    </g>
  );
};

/** Needle gauge (0..max) animating from -> to. */
export const Gauge: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const max = num(spec.max, 100);
  const v = num(spec.from, 0) + (num(spec.to, 50) - num(spec.from, 0)) * easeOut((t - num(spec.at, 0)) / num(spec.dur, 1.2));
  const R = num(spec.r, 160);
  const ang = -120 + (clamp(v / max) * 240);
  const wob = v / max > 0.95 ? 4 * Math.sin(t * 40) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 500)}) scale(${appearK(spec, t)})`}>
      <path d={`M ${-R * 0.87} ${R * 0.5} A ${R} ${R} 0 1 1 ${R * 0.87} ${R * 0.5}`} fill="#ffffff" stroke={C.ink} strokeWidth={10} />
      <path d={`M ${R * 0.43} ${-R * 0.75} A ${R * 0.86} ${R * 0.86} 0 0 1 ${R * 0.75} ${R * 0.43}`} fill="none" stroke={C.red} strokeWidth={R * 0.12} />
      <path d={`M ${-R * 0.75} ${R * 0.43} A ${R * 0.86} ${R * 0.86} 0 0 1 ${-R * 0.43} ${-R * 0.75}`} fill="none" stroke={C.green} strokeWidth={R * 0.12} />
      <line x1={0} y1={0} x2={0} y2={-R * 0.78} stroke={C.ink} strokeWidth={10} strokeLinecap="round" transform={`rotate(${ang + wob})`} />
      <circle r={16} fill={C.ink} />
      <text y={R * 0.95} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={R * 0.26} fill={C.white} stroke={C.ink} strokeWidth={8} paintOrder="stroke">{str(spec.label, '')}</text>
    </g>
  );
};

/** Whiteboard / poster with lines revealed one after another. */
export const Board: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const lines = arr<string>(spec.lines, []);
  const w = num(spec.w, 760);
  const size = num(spec.size, 48);
  const h = num(spec.h, 120 + lines.length * size * 1.35);
  const step = num(spec.step, 0.6);
  const at = num(spec.at, 0);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 420)}) scale(${appearK(spec, t)}) rotate(${num(spec.rot, -1.5)})`}>
      <rect x={-w / 2 + 10} y={-h / 2 + 12} width={w} height={h} rx={20} fill={C.ink} opacity={0.3} />
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={20} fill={str(spec.color, '#ffffff')} stroke={C.ink} strokeWidth={8} />
      {spec.title !== undefined && (
        <text x={0} y={-h / 2 + 70} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={size * 1.15} fill={C.purple}>{str(spec.title, '')}</text>
      )}
      {lines.map((l, i) => {
        const k = clamp((t - at - 0.3 - i * step) / 0.25);
        return (
          <text key={i} x={-w / 2 + 50} y={-h / 2 + (spec.title !== undefined ? 150 : 80) + i * size * 1.35} fontFamily={FONT} fontWeight={600} fontSize={size}
            fill={C.ink} opacity={k} transform={`translate(${(1 - k) * -20} 0)`}>{l}</text>
        );
      })}
    </g>
  );
};

/** Horizontal timeline with labelled marks; progress dot travels across. */
export const Timeline: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const marks = arr<{ pos: number; label: string }>(spec.marks, []);
  const x = num(spec.x, 960);
  const y = num(spec.y, 300);
  const w = num(spec.w, 1400);
  const p = clamp((t - num(spec.at, 0)) / num(spec.dur, 3));
  return (
    <g transform={`translate(${x - w / 2} ${y})`}>
      <line x1={0} y1={0} x2={w} y2={0} stroke={C.ink} strokeWidth={22} strokeLinecap="round" />
      <line x1={0} y1={0} x2={w} y2={0} stroke="#ffffff" strokeWidth={12} strokeLinecap="round" />
      <line x1={0} y1={0} x2={w * p} y2={0} stroke={C.yellow} strokeWidth={12} strokeLinecap="round" />
      {marks.map((m, i) => (
        <g key={i} transform={`translate(${m.pos * w} 0)`} opacity={p >= m.pos - 0.02 ? 1 : 0.45}>
          <circle r={20} fill={p >= m.pos ? C.yellow : '#fff'} stroke={C.ink} strokeWidth={6} />
          <text y={i % 2 ? 76 : -40} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={38} fill="#fff" stroke={C.ink} strokeWidth={8} paintOrder="stroke">{m.label}</text>
        </g>
      ))}
    </g>
  );
};

/** Seismograph trace with a spike at spikeAt. */
export const Seismo: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const w = num(spec.w, 700);
  const h = num(spec.h, 220);
  const spike = typeof spec.spikeAt === 'number' ? spec.spikeAt : 1e9;
  const amp = num(spec.amp, 1);
  const n = 140;
  const d = Array.from({ length: n }, (_, i) => {
    const tt = t - (n - i) * 0.02;
    const big = tt > spike ? Math.exp(-(tt - spike) * 1.5) * amp : 0;
    const v = Math.sin(tt * 37) * 0.04 + Math.sin(tt * 91) * 0.03 + big * Math.sin(tt * 60) * 0.9;
    return `${i ? 'L' : 'M'} ${(i / (n - 1)) * w} ${h / 2 - v * h * 0.5}`;
  }).join(' ');
  return (
    <g transform={`translate(${num(spec.x, 960) - w / 2} ${num(spec.y, 300) - h / 2}) scale(1)`}>
      <rect width={w} height={h} rx={16} fill="#fffdf2" stroke={C.ink} strokeWidth={7} />
      {Array.from({ length: 6 }, (_, i) => <line key={i} x1={0} y1={(i + 1) * h / 7} x2={w} y2={(i + 1) * h / 7} stroke="#e6dcc0" strokeWidth={3} />)}
      <path d={d} fill="none" stroke={C.red} strokeWidth={5} strokeLinejoin="round" />
    </g>
  );
};

// ---------------------------------------------------------------- tech

const Screen: React.FC<{ kind: string; t: number }> = ({ kind, t }) => {
  switch (kind) {
    case 'wifi':
      return <WifiIcon bars={3} s={0.9} />;
    case 'nosignal':
      return (
        <g>
          <WifiIcon bars={0} s={0.9} />
          <line x1={-50} y1={-60} x2={50} y2={40} stroke={C.red} strokeWidth={12} strokeLinecap="round" />
        </g>
      );
    case 'loading':
      return (
        <g transform={`rotate(${t * 300})`}>
          {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={0} cy={-44} r={9} fill={C.ink} opacity={(i + 1) / 8} transform={`rotate(${i * 45})`} />)}
        </g>
      );
    case 'chat':
      return (
        <g>
          <rect x={-70} y={-110} width={110} height={44} rx={18} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
          <rect x={-40} y={-50} width={110} height={44} rx={18} fill={C.teal} stroke={C.ink} strokeWidth={4} />
          <rect x={-70} y={10} width={90} height={44} rx={18} fill="#ffffff" stroke={C.ink} strokeWidth={4} />
        </g>
      );
    case 'map':
      return (
        <g>
          <rect x={-80} y={-130} width={160} height={260} fill="#c8f7c5" />
          <path d="M -80 -40 L 80 20 M -20 -130 L 10 130" stroke="#ffffff" strokeWidth={16} />
          <path d="M 0 -30 q -26 -2 -26 -28 a 26 26 0 1 1 52 0 q 0 26 -26 28 Z" fill={C.red} stroke={C.ink} strokeWidth={4} />
        </g>
      );
    case 'error':
      return (
        <g>
          <path d="M 0 -70 L 64 44 L -64 44 Z" fill={C.yellow} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <text y={30} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={80} fill={C.ink}>!</text>
        </g>
      );
    case 'video':
      return (
        <g>
          <rect x={-80} y={-60} width={160} height={110} rx={10} fill={C.ink} />
          <path d="M -18 -26 L 26 -3 L -18 20 Z" fill="#fff" />
        </g>
      );
    default:
      return null;
  }
};

export const WifiIcon: React.FC<{ bars: number; s?: number; color?: string }> = ({ bars, s = 1, color = C.ink }) => (
  <g transform={`scale(${s})`}>
    {[0, 1, 2].map((i) => (
      <path key={i} d={`M ${-30 - i * 26} ${-i * 26 - 10} A ${42 + i * 37} ${42 + i * 37} 0 0 1 ${30 + i * 26} ${-i * 26 - 10}`} fill="none"
        stroke={color} strokeWidth={14} strokeLinecap="round" opacity={bars > i ? 1 : 0.18} />
    ))}
    <circle cx={0} cy={20} r={13} fill={color} />
  </g>
);

export const Phone: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  let screen = str(spec.screen, 'wifi');
  if (typeof spec.switchAt === 'number' && t >= spec.switchAt) screen = str(spec.screen2, 'nosignal');
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 450)}) scale(${num(spec.s, 1) * appearK(spec, t)}) rotate(${num(spec.rot, 6)})`}>
      <rect x={-110} y={-200} width={220} height={400} rx={36} fill={C.ink} />
      <rect x={-94} y={-170} width={188} height={340} rx={18} fill="#e8f6ff" />
      <rect x={-30} y={-190} width={60} height={10} rx={5} fill="#444" />
      <Screen kind={screen} t={t} />
    </g>
  );
};

export const Wifi: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const crossed = typeof spec.crossAt === 'number' && t >= spec.crossAt;
  const k = crossed ? popIn((t - num(spec.crossAt, 0)) / 0.3) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${num(spec.s, 1.6) * appearK(spec, t)})`}>
      <circle r={110} fill="#ffffff" stroke={C.ink} strokeWidth={8} />
      <g transform="translate(0 20)">
        <WifiIcon bars={crossed ? 0 : num(spec.bars, 3)} color={crossed ? C.grey : C.teal} />
      </g>
      {crossed && <line x1={-80 * k} y1={-80 * k} x2={80 * k} y2={80 * k} stroke={C.red} strokeWidth={18} strokeLinecap="round" />}
    </g>
  );
};

/** Data-center racks with blinking LEDs; after failAt the LEDs go red. */
export const Server: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const n = num(spec.count, 3);
  const failed = typeof spec.failAt === 'number' && t >= spec.failAt;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${(i - (n - 1) / 2) * 170} 0)`}>
          <rect x={-70} y={-420} width={140} height={420} rx={12} fill="#2b2f4a" stroke={C.ink} strokeWidth={7} />
          {Array.from({ length: 8 }, (_, j) => {
            const on = failed ? Math.sin(t * 6 + j) > 0 : Math.sin(t * (9 + j) + i * 3 + j) > -0.2;
            return (
              <g key={j}>
                <rect x={-54} y={-400 + j * 50} width={108} height={36} rx={6} fill="#3d4266" />
                <circle cx={38} cy={-382 + j * 50} r={6} fill={failed ? C.red : C.green} opacity={on ? 1 : 0.25} />
                <circle cx={20} cy={-382 + j * 50} r={6} fill={failed ? C.red : C.teal} opacity={on ? 0.3 : 1} />
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
};

/** Cable along points (e.g. undersea). Grows from at; cutAt shows a spark and a gap. */
export const Cable: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const pts = arr<[number, number]>(spec.points, [[100, 600], [1800, 600]]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');
  const k = easeOut((t - num(spec.at, 0)) / num(spec.grow, 1));
  const cut = typeof spec.cutAt === 'number' && t >= spec.cutAt;
  const mid = pts[Math.floor(pts.length / 2)];
  const pulse = (t * 0.6) % 1;
  return (
    <g>
      <path d={d} fill="none" stroke={C.ink} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${k} 1`} />
      <path d={d} fill="none" stroke={str(spec.color, C.yellow)} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" pathLength={1}
        strokeDasharray={`${k} 1`} />
      {!cut && k >= 1 && <path d={d} fill="none" stroke="#ffffff" strokeWidth={9} pathLength={1} strokeDasharray="0.03 1" strokeDashoffset={-pulse} strokeLinecap="round" />}
      {cut && (
        <g transform={`translate(${mid[0]} ${mid[1]})`}>
          <rect x={-40} y={-30} width={80} height={60} fill={str(spec.gapColor, C.ocean)} />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={0} y1={0} x2={0} y2={-30 - 20 * Math.sin(t * 20 + i)} stroke={C.yellow} strokeWidth={6} strokeLinecap="round" transform={`rotate(${i * 45})`} />
          ))}
        </g>
      )}
    </g>
  );
};

/** Satellite or space station. kind: satellite | station. */
export const Satellite: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const station = spec.kind === 'station';
  let [x, y] = [num(spec.x, 960), num(spec.y, 300)];
  if (spec.to) {
    const [x1, y1] = vec(spec.from, [x, y]);
    const [x2, y2] = vec(spec.to, [x, y]);
    const k = clamp((t - num(spec.at, 0)) / num(spec.dur, 4));
    x = x1 + (x2 - x1) * k;
    y = y1 + (y2 - y1) * k;
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${num(spec.s, 1) * appearK(spec, t)}) rotate(${num(spec.rot, -12) + num(spec.spin, 0) * t})`}>
      {station ? (
        <>
          <rect x={-220} y={-8} width={440} height={16} fill={C.grey} stroke={C.ink} strokeWidth={5} />
          {[-190, -120, 120, 190].map((px) => <rect key={px} x={px - 28} y={-90} width={56} height={180} fill="#3a5bd9" stroke={C.ink} strokeWidth={5} />)}
          <rect x={-60} y={-36} width={120} height={72} rx={18} fill="#ffffff" stroke={C.ink} strokeWidth={6} />
        </>
      ) : (
        <>
          <rect x={-150} y={-30} width={100} height={60} fill="#3a5bd9" stroke={C.ink} strokeWidth={5} />
          <rect x={50} y={-30} width={100} height={60} fill="#3a5bd9" stroke={C.ink} strokeWidth={5} />
          <rect x={-50} y={-40} width={100} height={80} rx={12} fill={C.yellow} stroke={C.ink} strokeWidth={6} />
          <path d="M 0 -40 L 0 -70 M -20 -88 Q 0 -60 20 -88" stroke={C.ink} strokeWidth={6} fill="none" />
        </>
      )}
    </g>
  );
};

// ---------------------------------------------------------------- moon, sun, water

export const Moon: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const grow = arr<number>(spec.grow, []);
  const k = grow.length === 2 ? easeInOut((t - num(spec.at, 0)) / num(spec.dur, 2)) : 0;
  const R = grow.length === 2 ? grow[0] + (grow[1] - grow[0]) * k : num(spec.r, 120);
  const face = str(spec.face, 'none');
  return (
    <g transform={`translate(${num(spec.x, 1500)} ${num(spec.y, 260)}) scale(${grow.length === 2 ? 1 : appearK(spec, t)})`}>
      <circle r={R * 1.15} fill="#ffffff" opacity={0.08} />
      <circle r={R} fill="#e3e4ee" stroke={C.ink} strokeWidth={Math.max(5, R * 0.04)} />
      {[[-0.35, -0.3, 0.22], [0.3, 0.1, 0.16], [-0.1, 0.45, 0.12], [0.45, -0.45, 0.1], [-0.55, 0.2, 0.09]].map(([x, y, r], i) => (
        <circle key={i} cx={x * R} cy={y * R} r={r * R} fill="#c4c6d6" stroke="#a9abbd" strokeWidth={R * 0.02} />
      ))}
      {face !== 'none' && (
        <g transform={`scale(${R / 150})`}>
          <circle cx={-45} cy={-10} r={face === 'shock' ? 16 : 9} fill={face === 'shock' ? '#fff' : C.ink} stroke={C.ink} strokeWidth={5} />
          <circle cx={45} cy={-10} r={face === 'shock' ? 16 : 9} fill={face === 'shock' ? '#fff' : C.ink} stroke={C.ink} strokeWidth={5} />
          {face === 'shock' ? <ellipse cx={0} cy={45} rx={16} ry={20} fill={C.mouth} stroke={C.ink} strokeWidth={5} /> :
            <path d="M -30 35 Q 0 60 30 35" stroke={C.ink} strokeWidth={8} fill="none" strokeLinecap="round" />}
        </g>
      )}
    </g>
  );
};

export const Sun: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const R = num(spec.r, 140);
  return (
    <g transform={`translate(${num(spec.x, 300)} ${num(spec.y, 300)}) scale(${appearK(spec, t)})`}>
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M -${R * 0.12} ${-R * 1.12} L 0 ${-R * 1.45} L ${R * 0.12} ${-R * 1.12} Z`} fill={C.orange} transform={`rotate(${i * (360 / 14) + t * 10})`} />
      ))}
      <circle r={R} fill={C.sun} stroke={C.ink} strokeWidth={8} />
      {spec.face !== false && (
        <g transform={`scale(${R / 140})`}>
          <path d="M -60 -10 q 20 -20 40 0 M 20 -10 q 20 -20 40 0" stroke={C.ink} strokeWidth={9} fill="none" strokeLinecap="round" />
          <path d="M -40 40 q 40 30 80 0" stroke={C.ink} strokeWidth={9} fill="none" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
};

/** Dashed orbit ellipse with a body circling it. */
export const Orbit: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const x = num(spec.x, 960);
  const y = num(spec.y, 540);
  const rx = num(spec.rx, 500);
  const ry = num(spec.ry, 180);
  const a = ((t - num(spec.at, 0)) / num(spec.period, 6)) * Math.PI * 2 + num(spec.phase, 0);
  const bx = x + Math.cos(a) * rx;
  const by = y + Math.sin(a) * ry;
  const body = str(spec.body, 'moon');
  return (
    <g opacity={clamp((t - num(spec.at, 0)) / 0.4)}>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="none" stroke={str(spec.color, '#ffffff')} strokeWidth={5} strokeDasharray="18 16" opacity={0.7} />
      {body === 'moon' && <Moon spec={{ type: 'moon', x: bx, y: by, r: num(spec.r, 40) }} t={t} />}
      {body === 'dot' && <circle cx={bx} cy={by} r={num(spec.r, 14)} fill={C.yellow} stroke={C.ink} strokeWidth={4} />}
      {body === 'satellite' && <Satellite spec={{ type: 'satellite', x: bx, y: by, s: num(spec.r, 40) / 120 }} t={t} />}
    </g>
  );
};

/** Water level rising/falling between y levels (tides, floods). */
export const Tide: React.FC<PP> = ({ spec, t }) => {
  const x0 = num(spec.x0, 0);
  const x1 = num(spec.x1, 1920);
  const k = easeInOut((t - num(spec.at, 0)) / num(spec.dur, 2));
  const level = num(spec.from, 900) + (num(spec.to, 700) - num(spec.from, 900)) * (spec.at === undefined ? 1 : k);
  const waves = Array.from({ length: Math.ceil((x1 - x0) / 80) + 2 }, (_, i) => {
    const x = x0 + i * 80 - 80 + ((t * 40) % 80);
    return `q 20 -14 40 0 t 40 0`;
  }).join(' ');
  return (
    <g>
      <clipPath id={`tide${x0}${x1}`}>
        <rect x={x0} y={0} width={x1 - x0} height={1200} />
      </clipPath>
      <g clipPath={`url(#tide${x0}${x1})`}>
        <path d={`M ${x0 - 80 + ((t * 40) % 80)} ${level} ${waves} L ${x1 + 200} 1200 L ${x0 - 200} 1200 Z`} fill={C.ocean} stroke={C.ink} strokeWidth={6} opacity={0.92} />
      </g>
      {spec.marker === true && (
        <g>
          <line x1={x1 - 120} y1={num(spec.from, 900)} x2={x1 - 40} y2={num(spec.from, 900)} stroke={C.ink} strokeWidth={6} strokeDasharray="12 8" />
        </g>
      )}
    </g>
  );
};

/** Spinning storm swirl. */
export const Hurricane: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const R = num(spec.r, 200);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${appearK(spec, t, 0.6)}) rotate(${-t * num(spec.speed, 120)})`}>
      {[0, 1, 2, 3].map((i) => (
        <path key={i} d={`M 0 0 Q ${R * 0.6} ${-R * 0.1} ${R} ${R * 0.5}`} fill="none" stroke="#ffffff" strokeWidth={R * 0.14} strokeLinecap="round" opacity={0.92}
          transform={`rotate(${i * 90})`} />
      ))}
      <circle r={R * 0.14} fill={C.sky1} stroke="#ffffff" strokeWidth={8} />
    </g>
  );
};

// ---------------------------------------------------------------- misc

/** Brain icon with a state: ok | tired | fried. */
export const Brain: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  let state = str(spec.state, 'ok');
  if (typeof spec.stateAt === 'number' && t >= spec.stateAt) state = str(spec.state2, 'tired');
  const fill = state === 'fried' ? '#ffb07a' : state === 'tired' ? '#e8b4d0' : '#ffb3c7';
  const shake = state === 'fried' ? 3 * Math.sin(t * 40) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960) + shake} ${num(spec.y, 400)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      <path d="M -120 20 C -170 -10 -150 -110 -80 -110 C -60 -160 20 -160 40 -120 C 110 -140 160 -70 130 -20 C 170 30 120 100 60 80 C 20 120 -60 120 -80 80 C -140 90 -160 50 -120 20 Z"
        fill={fill} stroke={C.ink} strokeWidth={9} strokeLinejoin="round" />
      <path d="M -60 -80 q 20 30 0 60 M 10 -110 q -20 40 10 70 M 70 -60 q -30 20 -10 60 M -100 10 q 40 0 50 40" fill="none" stroke={C.ink} strokeWidth={6} strokeLinecap="round" opacity={0.6} />
      {state === 'tired' && <path d="M -40 30 l 25 0 M 25 30 l 25 0" stroke={C.ink} strokeWidth={7} strokeLinecap="round" />}
      {state === 'ok' && <><circle cx={-28} cy={30} r={8} fill={C.ink} /><circle cx={36} cy={30} r={8} fill={C.ink} /></>}
      {state === 'fried' && (
        <>
          <path d="M -45 20 l 20 20 m 0 -20 l -20 20 M 25 20 l 20 20 m 0 -20 l -20 20" stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
          {[0, 1, 2].map((i) => {
            const k = (t * 0.8 + i / 3) % 1;
            return <circle key={i} cx={-60 + i * 60} cy={-150 - k * 120} r={22 + k * 20} fill="#9aa0b5" opacity={0.7 * (1 - k)} />;
          })}
        </>
      )}
    </g>
  );
};

/** Static item (sandwich, mug, phone, clipboard, pillow, laptop, book, coin). */
export const Item: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const bob = spec.float === true ? 10 * Math.sin(t * 2.5) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 500) + bob}) rotate(${num(spec.rot, 0)}) scale(${num(spec.s, 2) * appearK(spec, t)})`}>
      <Held kind={str(spec.item, 'sandwich')} />
    </g>
  );
};

/** Comic starburst with text. */
export const Burst: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  if (typeof spec.until === 'number' && t > spec.until) return null;
  const R = num(spec.r, 160);
  const n = 14;
  const d = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? R * 0.68 : R;
    return `${i ? 'L' : 'M'} ${Math.cos(a) * rr} ${Math.sin(a) * rr}`;
  }).join(' ');
  const text = str(spec.text, 'POW!');
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${num(spec.s, 1) * appearK(spec, t, 0.25)}) rotate(${num(spec.rot, -8) + Math.sin(t * 8) * 2})`}>
      <path d={`${d} Z`} fill={str(spec.color, C.yellow)} stroke={C.ink} strokeWidth={9} strokeLinejoin="round" />
      <text y={R * 0.16} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={Math.min(R * 0.55, (R * 2.4) / Math.max(3, text.length))} fill={C.ink}>{text}</text>
    </g>
  );
};

/** Generic icon: warning, check, cross, heart, bulb, coin, globe, question. */
export const Icon: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const kind = str(spec.icon, 'warning');
  let body: React.ReactNode = null;
  switch (kind) {
    case 'warning':
      body = (<><path d="M 0 -90 L 85 60 L -85 60 Z" fill={C.yellow} stroke={C.ink} strokeWidth={9} strokeLinejoin="round" /><text y={45} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={110} fill={C.ink}>!</text></>);
      break;
    case 'check':
      body = (<><circle r={80} fill={C.green} stroke={C.ink} strokeWidth={9} /><path d="M -38 0 L -10 30 L 42 -28" fill="none" stroke="#fff" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" /></>);
      break;
    case 'cross':
      body = (<><circle r={80} fill={C.red} stroke={C.ink} strokeWidth={9} /><path d="M -32 -32 L 32 32 M 32 -32 L -32 32" stroke="#fff" strokeWidth={18} strokeLinecap="round" /></>);
      break;
    case 'heart':
      body = <path d="M 0 70 C -120 -10 -70 -110 0 -50 C 70 -110 120 -10 0 70 Z" fill={C.red} stroke={C.ink} strokeWidth={9} strokeLinejoin="round" />;
      break;
    case 'bulb':
      body = (<><circle cy={-20} r={62} fill={C.yellow} stroke={C.ink} strokeWidth={9} /><rect x={-30} y={38} width={60} height={42} rx={8} fill={C.grey} stroke={C.ink} strokeWidth={7} /></>);
      break;
    case 'coin':
      body = (<><circle r={75} fill={C.yellow} stroke={C.ink} strokeWidth={9} /><text y={32} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={90} fill={C.orange}>$</text></>);
      break;
    case 'globe':
      body = (<><circle r={75} fill={C.ocean} stroke={C.ink} strokeWidth={9} /><path d="M -30 -50 q 30 10 20 40 q -30 10 -40 -20 Z M 20 10 q 30 0 25 40 q -25 5 -35 -20 Z" fill={C.land} /></>);
      break;
    case 'question':
      body = (<><circle r={75} fill={C.purple} stroke={C.ink} strokeWidth={9} /><text y={35} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={100} fill="#fff">?</text></>);
      break;
  }
  return <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>{body}</g>;
};

/** Simple car or plane moving from -> to. kind: car | plane | bus. */
export const Vehicle: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x1, y1] = vec(spec.from, [-300, GROUND_Y]);
  const [x2, y2] = vec(spec.to, [2200, GROUND_Y]);
  const k = clamp((t - num(spec.at, 0)) / num(spec.dur, 3));
  const x = x1 + (x2 - x1) * k;
  const y = y1 + (y2 - y1) * k;
  const dir = x2 >= x1 ? 1 : -1;
  const color = str(spec.color, C.red);
  const kind = str(spec.kind, 'car');
  return (
    <g transform={`translate(${x} ${y}) scale(${num(spec.s, 1) * dir} ${num(spec.s, 1)})`}>
      {kind === 'plane' ? (
        <>
          <path d="M -150 -10 Q -150 -40 -110 -40 L 120 -40 Q 170 -30 170 0 Q 160 20 120 20 L -120 20 Q -150 20 -150 -10 Z" fill="#ffffff" stroke={C.ink} strokeWidth={6} />
          <path d="M -20 -10 L -80 -110 L -40 -110 L 50 -10 Z M -20 10 L -70 80 L -35 80 L 40 10 Z M -150 -30 L -170 -90 L -130 -90 L -110 -35 Z" fill={color} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={20 + i * 26} cy={-14} r={7} fill="#9fe1ff" stroke={C.ink} strokeWidth={3} />)}
        </>
      ) : (
        <>
          <path d={kind === 'bus' ? 'M -170 -150 L 150 -150 Q 175 -150 175 -120 L 175 -30 L -170 -30 Z' : 'M -140 -50 L -90 -110 L 60 -110 L 110 -50 L 150 -50 Q 165 -48 165 -30 L -150 -30 Q -150 -50 -140 -50 Z'}
            fill={color} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <path d={kind === 'bus' ? 'M -150 -130 L 150 -130 L 150 -80 L -150 -80 Z' : 'M -75 -95 L 50 -95 L 85 -55 L -105 -55 Z'} fill="#9fe1ff" stroke={C.ink} strokeWidth={5} />
          {[-90, 100].map((wx) => <g key={wx} transform={`translate(${wx} -30) rotate(${t * 720})`}><circle r={30} fill={C.ink} /><circle r={11} fill={C.grey} /><rect x={-3} y={-24} width={6} height={14} fill="#fff" /></g>)}
        </>
      )}
    </g>
  );
};

/** Confetti shower. */
export const Confetti: React.FC<PP> = ({ spec, t }) => {
  const at = num(spec.at, 0);
  const dur = num(spec.dur, 3);
  if (t < at || t > at + dur) return null;
  const r = rng(num(spec.seed, 31));
  const cols = [C.yellow, C.pink, C.teal, C.purple, C.orange, C.green];
  return (
    <g>
      {Array.from({ length: num(spec.count, 80) }, (_, i) => {
        const x = r() * 1920;
        const sp = 300 + r() * 400;
        const y = -40 + (t - at) * sp + r() * -300;
        return <rect key={i} x={x + 30 * Math.sin(t * 3 + i)} y={y} width={16} height={26} rx={3} fill={cols[i % cols.length]} transform={`rotate(${t * 300 + i * 40} ${x} ${y})`} />;
      })}
    </g>
  );
};

/** Ground crack spreading from x. */
export const Crack: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const k = easeOut((t - num(spec.at, 0)) / 0.5);
  const x = num(spec.x, 960);
  const y = num(spec.y, GROUND_Y + 30);
  const w = num(spec.w, 600) * k;
  return (
    <path d={`M ${x - w / 2} ${y} L ${x - w / 4} ${y + 18} L ${x - w / 8} ${y - 6} L ${x} ${y + 26} L ${x + w / 8} ${y} L ${x + w / 4} ${y + 22} L ${x + w / 2} ${y + 4}`}
      fill="none" stroke={C.ink} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
  );
};

/** Tall building (optional sway / shake at shakeAt). */
export const Building: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const w = num(spec.w, 220);
  const h = num(spec.h, 600);
  const shakeAt = typeof spec.shakeAt === 'number' ? spec.shakeAt : undefined;
  const shake = shakeAt !== undefined && t >= shakeAt ? Math.exp(-(t - shakeAt) * 1.2) * 6 * Math.sin((t - shakeAt) * 22) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) skewX(${shake})`}>
      <rect x={-w / 2} y={-h} width={w} height={h} fill={str(spec.color, '#8fb8ff')} stroke={C.ink} strokeWidth={7} />
      {Array.from({ length: Math.floor(h / 70) }, (_, row) =>
        Array.from({ length: Math.floor(w / 55) }, (_, col) => (
          <rect key={`${row}-${col}`} x={-w / 2 + 18 + col * 55} y={-h + 24 + row * 70} width={30} height={38} rx={4} fill="#d6ecff" stroke={C.ink} strokeWidth={3} />
        )),
      )}
    </g>
  );
};

/** Big emphasised number/label inside a circle badge. */
export const Badge: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const R = num(spec.r, 110);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 400)}) scale(${appearK(spec, t)}) rotate(${num(spec.rot, 10)})`}>
      <circle r={R} fill={str(spec.color, C.yellow)} stroke={C.ink} strokeWidth={9} />
      <text y={R * 0.12} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={R * 0.62} fill={C.ink}>{str(spec.text, '?!')}</text>
      {spec.sub !== undefined && <text y={R * 0.5} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={R * 0.22} fill={C.ink}>{str(spec.sub, '')}</text>}
    </g>
  );
};

/** Newton, Bix's lab cactus (recurring character). mood: happy | shock | sleepy | wink; float: true bobs in the air. */
export const Cactus: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const mood = str(spec.mood, 'happy');
  const floatK = typeof spec.floatAt === 'number' ? smooth((t - spec.floatAt) / 1.2) : spec.float === true ? 1 : 0;
  const lift = floatK * (90 + 12 * Math.sin(t * 2.4));
  const wob = floatK * 6 * Math.sin(t * 1.7);
  return (
    <g transform={`translate(${num(spec.x, 300)} ${num(spec.y, 360) - lift}) scale(${num(spec.s, 1) * appearK(spec, t)}) rotate(${wob})`}>
      <path d="M -44 0 L 44 0 L 36 62 L -36 62 Z" fill="#d9774a" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <rect x={-50} y={-10} width={100} height={20} rx={6} fill="#c4643a" stroke={C.ink} strokeWidth={6} />
      <path d="M -26 -10 L -26 -96 Q -26 -124 0 -124 Q 26 -124 26 -96 L 26 -10 Z" fill="#4cc25c" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <path d="M -26 -54 L -46 -54 Q -58 -54 -58 -68 L -58 -88 Q -58 -98 -48 -98 Q -38 -98 -38 -88 L -38 -72 L -26 -72" fill="#4cc25c" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <path d="M 26 -40 L 46 -40 Q 56 -40 56 -52 L 56 -70 Q 56 -80 46 -80 Q 36 -80 36 -70 L 36 -58 L 26 -58" fill="#4cc25c" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      {[[-12, -110], [10, -100], [-14, -40], [14, -30], [0, -70]].map(([x, y], i) => (
        <line key={i} x1={x} y1={y} x2={x + (i % 2 ? 6 : -6)} y2={y - 6} stroke="#2a7a37" strokeWidth={3} strokeLinecap="round" />
      ))}
      <circle cx={6} cy={-130} r={9} fill={C.pink} stroke={C.ink} strokeWidth={4} />
      {mood === 'shock' ? (
        <>
          <circle cx={-9} cy={-90} r={6} fill="#fff" stroke={C.ink} strokeWidth={3} />
          <circle cx={9} cy={-90} r={6} fill="#fff" stroke={C.ink} strokeWidth={3} />
          <ellipse cx={0} cy={-74} rx={5} ry={7} fill={C.mouth} />
        </>
      ) : mood === 'sleepy' ? (
        <>
          <path d="M -14 -90 l 9 0 M 5 -90 l 9 0" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
          <path d="M -6 -76 q 6 4 12 0" stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={-9} cy={-90} r={4.5} fill={C.ink} />
          {mood === 'wink' ? <path d="M 5 -90 l 9 0" stroke={C.ink} strokeWidth={4} strokeLinecap="round" /> : <circle cx={9} cy={-90} r={4.5} fill={C.ink} />}
          <path d="M -8 -78 q 8 8 16 0" stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
        </>
      )}
      {spec.label !== false && floatK === 0 && (
        <text y={44} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={20} fill="#fff">NEWTON</text>
      )}
    </g>
  );
};

/** A flapping bird (falcon, vulture or pigeon) flying from -> to. */
export const Bird: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x1, y1] = vec(spec.from, [-200, 300]);
  const [x2, y2] = vec(spec.to, [2200, 300]);
  const k = clamp((t - num(spec.at, 0)) / num(spec.dur, 3));
  const x = x1 + (x2 - x1) * k;
  const y = y1 + (y2 - y1) * k + 8 * Math.sin(t * 6);
  const dirX = x2 >= x1 ? 1 : -1;
  const kind = str(spec.kind, 'falcon');
  const flap = Math.sin(t * (kind === 'vulture' ? 5 : 14));
  const body = kind === 'vulture' ? '#6b4a2b' : kind === 'pigeon' ? '#8b93ad' : kind === 'duck' ? '#a0784a' : kind === 'frigate' ? '#2b2f45' : '#5b6178';
  return (
    <g transform={`translate(${x} ${y}) scale(${num(spec.s, 1) * dirX} ${num(spec.s, 1)})`}>
      <path d={`M -20 0 Q -60 ${-50 * flap} -110 ${-20 - 40 * flap} Q -60 ${10 - 10 * flap} -10 12 Z`} fill={body} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <ellipse cx={0} cy={6} rx={46} ry={20} fill={body} stroke={C.ink} strokeWidth={5} />
      <path d={`M -40 6 L -72 -6 L -70 22 Z`} fill={body} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <circle cx={40} cy={-6} r={17} fill={kind === 'vulture' ? '#e8b4a0' : body} stroke={C.ink} strokeWidth={5} />
      <path d="M 54 -8 L 72 0 L 54 4 Z" fill={C.yellow} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
      <circle cx={45} cy={-10} r={4} fill={C.ink} />
      {kind === 'falcon' && <path d="M 36 -18 q 6 10 -2 18" stroke={C.ink} strokeWidth={4} fill="none" />}
      {kind === 'duck' && <circle cx={40} cy={-6} r={17} fill="#2f9e5a" stroke={C.ink} strokeWidth={5} />}
      {kind === 'duck' && <circle cx={45} cy={-10} r={4} fill={C.ink} />}
      {kind === 'frigate' && <ellipse cx={34} cy={14} rx={14} ry={11} fill={C.red} stroke={C.ink} strokeWidth={4} />}
      {spec.sleepy === true && <path d="M 40 -10 l 9 0" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" />}
      <path d={`M 10 0 Q 40 ${-60 * flap} 90 ${-30 - 40 * flap} Q 50 ${0 - 10 * flap} 20 10 Z`} fill={body} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" opacity={0.95} />
    </g>
  );
};

/** Frost: ice crystals drifting around a point (cold scenes). */
export const Frost: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const r = rng(num(spec.seed, 17));
  const x0 = num(spec.x, 960);
  const y0 = num(spec.y, 400);
  const k = clamp((t - num(spec.at, 0)) / 0.6);
  return (
    <g opacity={k}>
      {Array.from({ length: num(spec.count, 14) }, (_, i) => {
        const a = r() * Math.PI * 2;
        const d = 80 + r() * num(spec.r, 260);
        const x = x0 + Math.cos(a + t * 0.3) * d;
        const y = y0 + Math.sin(a + t * 0.3) * d * 0.7;
        const sz = 10 + r() * 14;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${t * 40 + i * 20})`}>
            {[0, 60, 120].map((ang) => <line key={ang} x1={-sz} y1={0} x2={sz} y2={0} stroke="#dff6ff" strokeWidth={4} strokeLinecap="round" transform={`rotate(${ang})`} />)}
          </g>
        );
      })}
    </g>
  );
};

/**
 * Side-view dolphin. eye: open | closed (the visible eye); from/to/dur to swim; blowAt = spout at the surface;
 * label: optional text under it (e.g. "left brain asleep").
 */
export const Dolphin: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  let [x, y] = [num(spec.x, 960), num(spec.y, 600)];
  if (spec.to) {
    const [x1, y1] = vec(spec.from, [x, y]);
    const [x2, y2] = vec(spec.to, [x, y]);
    const k = easeInOut((t - num(spec.moveAt, num(spec.at, 0))) / num(spec.dur, 3));
    x = x1 + (x2 - x1) * k;
    y = y1 + (y2 - y1) * k;
  }
  let eye = str(spec.eye, 'open');
  if (typeof spec.eyeAt === 'number' && t >= spec.eyeAt) eye = str(spec.eye2, eye === 'open' ? 'closed' : 'open');
  const bob = 8 * Math.sin(t * 1.6 + x * 0.01);
  const tail = 10 * Math.sin(t * 3);
  const f = num(spec.facing, 1);
  const blow = typeof spec.blowAt === 'number' ? clamp((t - spec.blowAt) / 1.2) : 0;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${num(spec.s, 1) * f * appearK(spec, t)} ${num(spec.s, 1) * appearK(spec, t)})`}>
      {blow > 0 && blow < 1 && (
        <g opacity={1 - blow}>
          {[-14, 0, 14].map((dx, i) => <circle key={i} cx={92 + dx * (1 + blow)} cy={-90 - 120 * blow + Math.abs(dx)} r={12 + 10 * blow} fill="#dff6ff" stroke={C.ink} strokeWidth={3} />)}
        </g>
      )}
      <g transform={`rotate(${tail * 0.3})`}>
        <path d={`M -150 ${-6 + tail} L -200 ${-40 + tail} Q -185 ${-8 + tail} -205 ${24 + tail} Z`} fill="#6f8fb3" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      </g>
      {/* body: rounded melon (forehead) + short beak, so it reads as a dolphin, not a shark */}
      <path d="M -152 0 Q -100 -50 0 -54 Q 70 -57 104 -42 Q 140 -66 168 -32 Q 176 -20 202 -13 Q 210 -5 202 2 Q 172 8 150 12 Q 100 40 0 38 Q -100 32 -152 0 Z"
        fill="#8fb1d4" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <path d="M -118 8 Q -20 40 128 16 Q 70 38 0 37 Q -80 33 -118 8 Z" fill="#e6f0fa" />
      {/* curved (falcate) dorsal fin sweeping back */}
      <path d="M 26 -54 Q 18 -98 -28 -114 Q -6 -88 -16 -52 Z" fill="#7a9cc2" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <path d="M 30 20 Q 22 58 -12 66 Q -2 42 4 22 Z" fill="#7a9cc2" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <ellipse cx={92} cy={-49} rx={7} ry={4} fill="#4d6f94" />
      {eye === 'open' ? (
        <>
          <circle cx={134} cy={-24} r={10} fill="#fff" stroke={C.ink} strokeWidth={4} />
          <circle cx={137} cy={-24} r={5} fill={C.ink} />
        </>
      ) : (
        <path d="M 124 -22 q 10 6 20 0" stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />
      )}
      <path d="M 152 6 Q 176 8 198 -1" stroke={C.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
      {spec.label !== undefined && (
        <text y={92} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={34} fill="#fff" stroke={C.ink} strokeWidth={7} paintOrder="stroke"
          transform={`scale(${f} 1)`}>{str(spec.label, '')}</text>
      )}
    </g>
  );
};

/**
 * Brain seen from above, split into two halves: one asleep (dark, "Zzz"), one awake (pink, sparkles).
 * asleep: left | right | both | none; swapAt flips which half sleeps; labels: true shows LEFT/RIGHT.
 */
export const HalfBrain: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  let asleep = str(spec.asleep, 'left');
  const swaps = arr<number>(Array.isArray(spec.swaps) ? spec.swaps : typeof spec.swapAt === 'number' ? [spec.swapAt] : [], []);
  for (const sw of swaps) if (t >= sw) asleep = asleep === 'left' ? 'right' : asleep === 'right' ? 'left' : asleep;
  if (typeof spec.bothAt === 'number' && t >= spec.bothAt) asleep = 'both';
  const half = (side: -1 | 1) => {
    const sleeping = asleep === 'both' || (asleep === 'left' && side === -1) || (asleep === 'right' && side === 1);
    const d = side === -1
      ? 'M -6 -150 Q -120 -160 -150 -60 Q -175 40 -110 120 Q -60 160 -6 140 Z'
      : 'M 6 -150 Q 120 -160 150 -60 Q 175 40 110 120 Q 60 160 6 140 Z';
    const k = (t * 0.7) % 1;
    return (
      <g key={side}>
        <path d={d} fill={sleeping ? '#3b3f7a' : '#ffb3c7'} stroke={C.ink} strokeWidth={8} strokeLinejoin="round" />
        <path d={side === -1 ? 'M -40 -100 q -40 30 -20 70 M -100 -60 q 30 20 10 60 M -60 40 q -30 30 0 70' : 'M 40 -100 q 40 30 20 70 M 100 -60 q -30 20 -10 60 M 60 40 q 30 30 0 70'}
          fill="none" stroke={sleeping ? '#5a5fa3' : '#e88aa3'} strokeWidth={7} strokeLinecap="round" />
        {sleeping ? (
          <text x={side * 80 + 20 * k} y={-40 - 60 * k} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={56 + 20 * k} fill="#ffffff" opacity={1 - k}>Z</text>
        ) : (
          [0, 1, 2].map((i) => (
            <path key={i} d="M 0 -16 L 4 -4 L 16 0 L 4 4 L 0 16 L -4 4 L -16 0 L -4 -4 Z" fill={C.yellow}
              transform={`translate(${side * (60 + i * 30)} ${-60 + i * 50}) scale(${0.6 + 0.4 * Math.abs(Math.sin(t * 4 + i))})`} />
          ))
        )}
        {spec.labels !== false && (
          <g>
            <text x={side * 100} y={198} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={34} fill="#fff" stroke={C.ink} strokeWidth={7} paintOrder="stroke">
              {side === -1 ? 'LEFT' : 'RIGHT'}
            </text>
            <text x={side * 100} y={240} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={34} fill={sleeping ? '#9fb6ff' : C.yellow} stroke={C.ink} strokeWidth={7} paintOrder="stroke">
              {sleeping ? 'ASLEEP' : 'AWAKE'}
            </text>
          </g>
        )}
      </g>
    );
  };
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 450)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      {half(-1)}
      {half(1)}
    </g>
  );
};

/**
 * Emperor penguin (front 3/4 view). egg: true = egg on its feet under the brood pouch;
 * chick: true = chick on its feet; from/to/moveAt/dur = waddle; mood: calm|sleepy|proud.
 */
export const Penguin: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  let [x, y] = [num(spec.x, 960), num(spec.y, GROUND_Y)];
  let walking = false;
  if (spec.to) {
    const [x1, y1] = vec(spec.from, [x, y]);
    const [x2, y2] = vec(spec.to, [x, y]);
    const k = clamp((t - num(spec.moveAt, num(spec.at, 0))) / num(spec.dur, 3));
    walking = k > 0 && k < 1;
    x = x1 + (x2 - x1) * k;
    y = y1 + (y2 - y1) * k;
  }
  const f = num(spec.facing, 1);
  const waddle = walking ? 6 * Math.sin(t * 9) : 1.5 * Math.sin(t * 1.5 + x);
  const mood = str(spec.mood, 'calm');
  const egg = spec.egg === true;
  const chick = spec.chick === true;
  return (
    <g transform={`translate(${x} ${y}) scale(${num(spec.s, 1) * f * appearK(spec, t)} ${num(spec.s, 1) * appearK(spec, t)}) rotate(${waddle})`}>
      <ellipse cx={0} cy={4} rx={70} ry={12} fill="#000" opacity={0.15} />
      {/* body */}
      <path d="M 0 -300 Q 70 -300 82 -200 Q 100 -90 70 -20 Q 40 6 0 6 Q -40 6 -70 -20 Q -100 -90 -82 -200 Q -70 -300 0 -300 Z" fill="#1d2233" stroke={C.ink} strokeWidth={6} />
      <path d="M 10 -230 Q 62 -200 66 -110 Q 64 -30 30 -8 Q 0 2 -26 -8 Q -58 -40 -52 -120 Q -48 -200 10 -230 Z" fill="#fbfcff" />
      <path d="M 10 -230 Q 50 -214 58 -170 Q 30 -190 -40 -170 Q -30 -214 10 -230 Z" fill="#ffe08a" opacity={0.9} />
      {/* head */}
      <circle cx={8} cy={-268} r={44} fill="#1d2233" stroke={C.ink} strokeWidth={6} />
      <path d="M 34 -262 Q 54 -244 40 -222 Q 26 -234 26 -252 Z" fill={C.yellow} stroke={C.ink} strokeWidth={4} />
      <path d="M 40 -276 Q 96 -268 104 -256 Q 80 -252 44 -258 Z" fill="#2b2b2b" stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
      <path d="M 52 -262 Q 80 -258 96 -257" stroke={C.orange} strokeWidth={5} strokeLinecap="round" />
      {mood === 'sleepy' ? <path d="M 16 -280 q 9 5 18 0" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" />
        : <><circle cx={26} cy={-280} r={7} fill="#fff" /><circle cx={28} cy={-280} r={3.5} fill={C.ink} /></>}
      {/* flippers */}
      <path d="M 70 -200 Q 110 -140 96 -80 Q 80 -120 64 -150 Z" fill="#1d2233" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      <path d="M -72 -200 Q -112 -140 -98 -80 Q -82 -120 -66 -150 Z" fill="#141826" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      {/* feet */}
      <path d="M -40 2 q 20 -14 40 0 q -20 8 -40 0 Z M 6 2 q 20 -14 40 0 q -20 8 -40 0 Z" fill="#2b2b2b" stroke={C.ink} strokeWidth={4} />
      {egg && (
        <g>
          <ellipse cx={6} cy={-24} rx={27} ry={32} fill="#fffaf0" stroke={C.ink} strokeWidth={5} />
          <path d="M -6 -44 q 8 -8 16 -8" stroke="#ffffff" strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M -44 -48 Q 6 -74 56 -48 Q 40 -40 6 -40 Q -28 -40 -44 -48 Z" fill="#e9edf8" stroke={C.ink} strokeWidth={4} />
        </g>
      )}
      {chick && (
        <g transform="translate(8 -10)">
          <ellipse cx={0} cy={-34} rx={34} ry={36} fill="#b8bec9" stroke={C.ink} strokeWidth={4.5} />
          <circle cx={0} cy={-84} r={24} fill="#1d2233" stroke={C.ink} strokeWidth={4} />
          <ellipse cx={4} cy={-82} rx={16} ry={13} fill="#ffffff" />
          <circle cx={9} cy={-84} r={3} fill={C.ink} />
        </g>
      )}
    </g>
  );
};

/** A tight emperor-penguin huddle; heat: true shows the warm core; wave: shuffle ripple speed. */
export const Huddle: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const n = num(spec.count, 40);
  const w = num(spec.w, 900);
  const h = num(spec.h, 220);
  const r = rng(num(spec.seed, 8));
  const pts = Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    return { x: Math.cos(a) * d * w / 2, y: Math.sin(a) * d * h / 2, ph: r() * 6 };
  }).sort((a, b) => a.y - b.y);
  const wave = num(spec.wave, 0);
  const heat = spec.heat === true ? clamp((t - num(spec.heatAt, num(spec.at, 0))) / 1) : 0;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) scale(${appearK(spec, t)})`}>
      {heat > 0 && (
        <g opacity={heat}>
          <defs>
            <radialGradient id="huddleHeat">
              <stop offset="0" stopColor="#ff7a1a" stopOpacity={0.75} />
              <stop offset="1" stopColor="#ff7a1a" stopOpacity={0} />
            </radialGradient>
          </defs>
          <ellipse cx={0} cy={-120} rx={w * 0.55} ry={h + 120} fill="url(#huddleHeat)" />
        </g>
      )}
      {pts.map((p, i) => {
        const shuffle = wave ? 6 * Math.sin(t * wave - p.x * 0.02) : 0;
        const sc = 0.32 + 0.12 * ((p.y + h / 2) / h);
        return (
          <g key={i} transform={`translate(${p.x + shuffle} ${p.y}) scale(${sc})`}>
            <path d="M 0 -300 Q 70 -300 82 -200 Q 100 -90 70 -20 Q 40 6 0 6 Q -40 6 -70 -20 Q -100 -90 -82 -200 Q -70 -300 0 -300 Z" fill="#1d2233" stroke={C.ink} strokeWidth={10} />
            <circle cx={8} cy={-268} r={44} fill="#1d2233" stroke={C.ink} strokeWidth={10} />
            <path d="M 34 -262 Q 54 -244 40 -222 Q 26 -234 26 -252 Z" fill={C.yellow} />
            <path d="M 10 -230 Q 62 -200 66 -110 Q 64 -30 30 -8 Q 0 2 -26 -8 Q -58 -40 -52 -120 Q -48 -200 10 -230 Z" fill="#fbfcff" opacity={0.9} />
          </g>
        );
      })}
    </g>
  );
};


/**
 * Octopus (front view). xray: true shows the three hearts inside the mantle (two gill hearts,
 * one main "systemic" heart) beating, with blue blood vessels; pauseAt/pauseFor stops the main
 * heart (jet swimming). swim: true trails the arms; from/to/moveAt/dur to move; mood: calm|shock|happy;
 * color: skin colour; highlight: gill | main (pulse ring around those hearts).
 */
export const Octopus: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  let [x, y] = [num(spec.x, 960), num(spec.y, 560)];
  if (spec.to) {
    const [x1, y1] = vec(spec.from, [x, y]);
    const [x2, y2] = vec(spec.to, [x, y]);
    const k = easeInOut((t - num(spec.moveAt, num(spec.at, 0))) / num(spec.dur, 2));
    x = x1 + (x2 - x1) * k;
    y = y1 + (y2 - y1) * k;
  }
  const skin = str(spec.color, '#e8735a');
  const dark = str(spec.color2, '#c4523d');
  const swim = spec.swim === true;
  const xray = spec.xray === true;
  const mood = str(spec.mood, 'calm');
  const bob = (swim ? 14 : 8) * Math.sin(t * 1.8 + x * 0.01);
  const beat = (ph: number) => 1 + 0.16 * Math.max(0, Math.sin(t * 7.5 + ph)) ** 6;
  const pauseAt = typeof spec.pauseAt === 'number' ? spec.pauseAt : Infinity;
  const paused = t >= pauseAt && t < pauseAt + num(spec.pauseFor, 1e9);
  const hl = str(spec.highlight, '');
  const arms = Array.from({ length: 8 }, (_, i) => {
    const side = i < 4 ? -1 : 1;
    const j = i % 4;
    const base = side * (18 + j * 22);
    const len = 190 + (j === 1 || j === 2 ? 30 : 0);
    const w = swim ? 6 * Math.sin(t * 6 + i) : 26 * Math.sin(t * 2.2 + i * 0.9);
    const spread = swim ? side * (8 + j * 6) : side * (40 + j * 38);
    const ex = base + spread + w;
    const ey = 60 + len;
    const c1x = base + spread * 0.3 - w;
    const c2x = base + spread * 0.9 + w * 1.5;
    const curl = swim ? 0 : side * 34;
    return (
      <path key={i} d={`M ${base - side * 10} 50 C ${c1x} ${110 + len * 0.3}, ${c2x} ${ey - 70}, ${ex} ${ey} q ${curl} 10 ${curl * 0.6} -26`}
        fill="none" stroke={C.ink} strokeWidth={34 - j * 2} strokeLinecap="round" />
    );
  });
  const armsFill = Array.from({ length: 8 }, (_, i) => {
    const side = i < 4 ? -1 : 1;
    const j = i % 4;
    const base = side * (18 + j * 22);
    const len = 190 + (j === 1 || j === 2 ? 30 : 0);
    const w = swim ? 6 * Math.sin(t * 6 + i) : 26 * Math.sin(t * 2.2 + i * 0.9);
    const spread = swim ? side * (8 + j * 6) : side * (40 + j * 38);
    const ex = base + spread + w;
    const ey = 60 + len;
    const c1x = base + spread * 0.3 - w;
    const c2x = base + spread * 0.9 + w * 1.5;
    const curl = swim ? 0 : side * 34;
    return (
      <path key={i} d={`M ${base - side * 10} 50 C ${c1x} ${110 + len * 0.3}, ${c2x} ${ey - 70}, ${ex} ${ey} q ${curl} 10 ${curl * 0.6} -26`}
        fill="none" stroke={i % 2 ? skin : dark} strokeWidth={22 - j * 2} strokeLinecap="round" />
    );
  });
  const heart = (cx: number, cy: number, r: number, k: number, stopped = false, ring = false) => (
    <g transform={`translate(${cx} ${cy}) scale(${stopped ? 1 : k})`}>
      {ring && <circle r={r * 1.9} fill="none" stroke={C.yellow} strokeWidth={6} opacity={0.6 + 0.4 * Math.sin(t * 6)} />}
      <path d={`M 0 ${r * 0.9} C ${-r * 1.6} ${-r * 0.1}, ${-r * 0.7} ${-r * 1.2}, 0 ${-r * 0.45} C ${r * 0.7} ${-r * 1.2}, ${r * 1.6} ${-r * 0.1}, 0 ${r * 0.9} Z`}
        fill={stopped ? '#9a8f9e' : C.red} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${num(spec.s, 1) * num(spec.facing, 1) * appearK(spec, t)} ${num(spec.s, 1) * appearK(spec, t)})`}>
      {swim && <ellipse cx={0} cy={-230} rx={40} ry={18} fill="#dff6ff" opacity={0.5 + 0.3 * Math.sin(t * 8)} />}
      {arms}
      {armsFill}
      {/* mantle (head) */}
      <path d="M -112 40 Q -150 -110 -80 -190 Q 0 -260 80 -190 Q 150 -110 112 40 Q 60 72 0 70 Q -60 72 -112 40 Z"
        fill={xray ? '#f6b3a6' : skin} opacity={xray ? 0.92 : 1} stroke={C.ink} strokeWidth={7} strokeLinejoin="round" />
      {!xray && <circle cx={-40} cy={-150} r={14} fill={dark} opacity={0.6} />}
      {!xray && <circle cx={48} cy={-120} r={10} fill={dark} opacity={0.6} />}
      {xray && (
        <g>
          {/* gills + blue vessels */}
          <path d="M -84 -120 q -22 34 0 70 M 84 -120 q 22 34 0 70" stroke="#c97a8c" strokeWidth={16} fill="none" strokeLinecap="round" />
          <path d="M -66 -96 Q -30 -130 0 -100 Q 30 -130 66 -96 M 0 -100 L 0 -190 M 0 -80 Q -40 -20 -86 -6 M 0 -80 Q 40 -20 86 -6" stroke="#2f6dff" strokeWidth={8}
            fill="none" strokeLinecap="round" opacity={0.9} />
          {heart(-70, -96, 28, beat(0), false, hl === 'gill')}
          {heart(70, -96, 28, beat(0.4), false, hl === 'gill')}
          {heart(0, -110, 42, beat(1.2), paused, hl === 'main')}
          {paused && <text x={0} y={-172} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={34} fill={C.ink}>paused</text>}
        </g>
      )}
      {/* eyes */}
      {[-1, 1].map((sd) => (
        <g key={sd} transform={`translate(${sd * 52} 18)`}>
          <ellipse rx={26} ry={mood === 'shock' ? 30 : 24} fill="#fff" stroke={C.ink} strokeWidth={5} />
          <rect x={-12} y={-5} width={24} height={10} rx={5} fill={C.ink} />
        </g>
      ))}
      {mood === 'happy' && <path d="M -22 48 q 22 16 44 0" stroke={C.ink} strokeWidth={5} fill="none" strokeLinecap="round" />}
      {mood === 'shock' && <ellipse cx={0} cy={52} rx={10} ry={13} fill={C.mouth} />}
    </g>
  );
};

/** Test tube of blood. color: red | blue | any CSS colour; label under it; fill: 0..1 (animated from `at`). */
export const Vial: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const c = str(spec.color, 'red');
  const fill = c === 'red' ? '#d7263d' : c === 'blue' ? '#2f6dff' : c;
  const k = num(spec.fill, 0.75) * (spec.at === undefined ? 1 : easeOut((t - num(spec.at, 0)) / 0.8));
  const h = 220;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 500)}) scale(${num(spec.s, 1) * appearK(spec, t)}) rotate(${num(spec.rot, 0)})`}>
      <defs>
        <clipPath id={`vial-${num(spec.x, 0)}-${num(spec.y, 0)}`}>
          <path d={`M -34 ${-h / 2} L -34 ${h / 2 - 34} A 34 34 0 0 0 34 ${h / 2 - 34} L 34 ${-h / 2} Z`} />
        </clipPath>
      </defs>
      <path d={`M -34 ${-h / 2} L -34 ${h / 2 - 34} A 34 34 0 0 0 34 ${h / 2 - 34} L 34 ${-h / 2} Z`} fill="#eef6ff" />
      <g clipPath={`url(#vial-${num(spec.x, 0)}-${num(spec.y, 0)})`}>
        <rect x={-40} y={h / 2 - h * k} width={80} height={h} fill={fill} />
        <path d={`M -40 ${h / 2 - h * k} q 20 ${-8 * Math.sin(t * 3)} 40 0 t 40 0`} fill={fill} />
      </g>
      <path d={`M -34 ${-h / 2} L -34 ${h / 2 - 34} A 34 34 0 0 0 34 ${h / 2 - 34} L 34 ${-h / 2}`} fill="none" stroke={C.ink} strokeWidth={7} />
      <rect x={-46} y={-h / 2 - 22} width={92} height={26} rx={8} fill={C.ink} />
      <path d={`M -18 ${-h / 2 + 20} L -18 ${h / 2 - 50}`} stroke="#fff" strokeWidth={8} strokeLinecap="round" opacity={0.6} />
      {spec.label !== undefined && (
        <text y={h / 2 + 50} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={36} fill="#fff" stroke={C.ink} strokeWidth={7} paintOrder="stroke">
          {str(spec.label, '')}
        </text>
      )}
    </g>
  );
};

/** Horseshoe crab, seen from above (domed shell + spiky tail). blood: true shows a blue drop next to it. */
export const HorseshoeCrab: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const wig = 4 * Math.sin(t * 2);
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 700)}) scale(${num(spec.s, 1) * appearK(spec, t)}) rotate(${num(spec.rot, 0)})`}>
      <path d={`M 0 60 L ${wig} 200`} stroke={C.ink} strokeWidth={16} strokeLinecap="round" />
      <path d={`M 0 60 L ${wig} 200`} stroke="#8a6a3c" strokeWidth={8} strokeLinecap="round" />
      <path d="M -70 20 L -90 70 L 0 92 L 90 70 L 70 20 Z" fill="#7a5a30" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <path d="M -150 30 Q -150 -110 0 -112 Q 150 -110 150 30 Q 80 10 0 12 Q -80 10 -150 30 Z" fill="#9c7642" stroke={C.ink} strokeWidth={7} strokeLinejoin="round" />
      <path d="M -90 -30 Q 0 -70 90 -30" stroke="#6e5128" strokeWidth={6} fill="none" />
      <ellipse cx={-56} cy={-46} rx={10} ry={6} fill={C.ink} />
      <ellipse cx={56} cy={-46} rx={10} ry={6} fill={C.ink} />
      {spec.blood === true && (
        <g transform={`translate(190 -40) scale(${1 + 0.05 * Math.sin(t * 4)})`}>
          <path d="M 0 -50 C 30 -10 40 10 40 26 A 40 40 0 0 1 -40 26 C -40 10 -30 -10 0 -50 Z" fill="#2f6dff" stroke={C.ink} strokeWidth={6} />
          <path d="M -16 14 q 0 -14 10 -22" stroke="#fff" strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.7} />
        </g>
      )}
    </g>
  );
};

export const PROPS2: Record<string, React.FC<PP>> = {
  octopus: Octopus, vial: Vial, horseshoe: HorseshoeCrab,
  penguin: Penguin, huddle: Huddle,
  dolphin: Dolphin, halfbrain: HalfBrain,
  cactus: Cactus, bird: Bird, frost: Frost,
  pal: Pal, crowd: Crowd, bars: Bars, clock: Clock, calendar: Calendar, gauge: Gauge, board: Board, timeline: Timeline, seismo: Seismo,
  phone: Phone, wifi: Wifi, server: Server, cable: Cable, satellite: Satellite, moon: Moon, sun: Sun, orbit: Orbit, tide: Tide,
  hurricane: Hurricane, brain: Brain, item: Item, burst: Burst, icon: Icon, vehicle: Vehicle, confetti: Confetti, crack: Crack,
  building: Building, badge: Badge,
};

// keep the smooth import used (tree-shaking friendly re-export for tests)
export const _smooth = smooth;
