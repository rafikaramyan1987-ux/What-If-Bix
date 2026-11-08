import React from 'react';
import { C, FONT } from '../theme';
import { Spec } from '../types';
import { clamp, easeOut, num, popIn, rng, smooth, str, vec } from '../util';
import { Held } from '../props/Held';
import { GROUND_Y } from './backgrounds';
import { PROPS2 } from './props2';

export type PropProps = { spec: Spec; t: number };

/** Common show/hide window with a pop-in scale. */
const visible = (spec: Spec, t: number) => {
  const at = num(spec.at, -1e9);
  const until = num(spec.until, 1e9);
  return t >= at && t <= until;
};
const appear = (spec: Spec, t: number, d = 0.35) => (spec.at === undefined ? 1 : popIn((t - num(spec.at, 0)) / d));

// ---------------------------------------------------------------- Earth

/** Rotation angle (deg of texture scroll) with an optional sudden stop. */
export const earthSpin = (t: number, speed: number, stopAt?: number, brake = 0.12) => {
  if (stopAt === undefined || t <= stopAt) return t * speed;
  const dt = Math.min(t - stopAt, brake);
  // decelerate linearly to 0 within `brake` seconds
  return stopAt * speed + speed * (dt - (dt * dt) / (2 * brake));
};

const CONTINENTS = (() => {
  const r = rng(42);
  return Array.from({ length: 7 }, (_, i) => {
    const cx = i * 0.5 + r() * 0.2; // in "radians" of longitude
    const cy = (r() - 0.5) * 1.3;
    const pts = Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2;
      const rr = 0.18 + r() * 0.17;
      return [Math.cos(a) * rr * 1.2, Math.sin(a) * rr];
    });
    return { cx, cy, pts };
  });
})();

export const Earth: React.FC<PropProps> = ({ spec, t }) => {
  const x = num(spec.x, 960);
  const y = num(spec.y, 540);
  const R = num(spec.r, 300);
  const speed = num(spec.spin, 0.25); // texture revolutions per second (visual)
  const stopAt = typeof spec.stopAt === 'number' ? spec.stopAt : undefined;
  const rot = earthSpin(t, speed, stopAt) * Math.PI * 2;
  const id = `earth${Math.round(x)}${Math.round(y)}${Math.round(R)}`;
  const tilt = num(spec.tilt, -12);
  const face = str(spec.face, 'none');
  const band = num(spec.band, 0); // shift continents toward a pole (-1..1)
  const caps = spec.caps !== false;
  const k = appear(spec, t);
  const blobs: React.ReactNode[] = [];
  CONTINENTS.forEach((c, i) => {
    for (let wrap = -1; wrap <= 1; wrap++) {
      const lon = c.cx + rot / 1 + wrap * 3.5;
      const px = ((lon % 3.5) + 3.5) % 3.5 - 1.75; // -1.75..1.75
      if (Math.abs(px) > 1.25) continue;
      const sx = Math.sin(px * 1.2) * R;
      const squeeze = Math.cos(px * 1.2);
      const d = c.pts
        .map((p, j) => `${j ? 'L' : 'M'} ${(sx + p[0] * R * 0.75 * squeeze).toFixed(1)} ${((c.cy * (1 - Math.abs(band) * 0.5) + band + p[1]) * R * 0.75).toFixed(1)}`)
        .join(' ');
      blobs.push(<path key={`${i}-${wrap}`} d={`${d} Z`} fill={C.land} stroke={C.landDark} strokeWidth={R * 0.02} strokeLinejoin="round" />);
    }
  });
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <defs>
        <clipPath id={`${id}c`}>
          <circle r={R} />
        </clipPath>
        <radialGradient id={`${id}g`}>
          <stop offset="0.82" stopColor="#7fd3ff" stopOpacity={0.5} />
          <stop offset="1" stopColor="#7fd3ff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={R * 1.12} fill={`url(#${id}g)`} />
      <g clipPath={`url(#${id}c)`} transform={`rotate(${tilt})`}>
        <circle r={R} fill={C.ocean} />
        {blobs}
        {caps && <ellipse cx={0} cy={-R * 0.95} rx={R * 0.42} ry={R * 0.12} fill="#f4fbff" />}
        {caps && <ellipse cx={0} cy={R * 0.96} rx={R * 0.38} ry={R * 0.1} fill="#f4fbff" />}
        {spec.equator === true && (
          <line x1={-R} y1={0} x2={R} y2={0} stroke={C.yellow} strokeWidth={R * 0.025} strokeDasharray={`${R * 0.06} ${R * 0.04}`} />
        )}
        {/* night side */}
        <path d={`M ${R * 0.25} ${-R} A ${R} ${R} 0 0 1 ${R * 0.25} ${R} A ${R * 0.75} ${R} 0 0 0 ${R * 0.25} ${-R} Z`} fill="#0b1030" opacity={0.28} />
        <circle cx={-R * 0.35} cy={-R * 0.4} r={R * 0.28} fill="#ffffff" opacity={0.12} />
      </g>
      <circle r={R} fill="none" stroke={C.ink} strokeWidth={Math.max(5, R * 0.022)} />
      {face !== 'none' && (
        <g transform={`scale(${R / 300})`}>
          {face === 'shock' ? (
            <>
              <circle cx={-80} cy={-30} r={34} fill="#fff" stroke={C.ink} strokeWidth={8} />
              <circle cx={80} cy={-30} r={34} fill="#fff" stroke={C.ink} strokeWidth={8} />
              <circle cx={-80} cy={-30} r={9} fill={C.ink} />
              <circle cx={80} cy={-30} r={9} fill={C.ink} />
              <ellipse cx={0} cy={80} rx={34} ry={44} fill={C.mouth} stroke={C.ink} strokeWidth={8} />
            </>
          ) : (
            <>
              <path d="M -110 -30 q 30 -30 60 0" stroke={C.ink} strokeWidth={12} fill="none" strokeLinecap="round" />
              <path d="M 50 -30 q 30 -30 60 0" stroke={C.ink} strokeWidth={12} fill="none" strokeLinecap="round" />
              <path d="M -60 60 q 60 50 120 0" stroke={C.ink} strokeWidth={12} fill="none" strokeLinecap="round" />
            </>
          )}
        </g>
      )}
    </g>
  );
};

// ---------------------------------------------------------------- arrows & labels

export const Arrow: React.FC<PropProps> = ({ spec, t }) => {
  if (!visible(spec, t)) return null;
  const [x1, y1] = vec(spec.from, [0, 0]);
  const [x2, y2] = vec(spec.to, [100, 0]);
  const color = str(spec.color, C.yellow);
  const grow = easeOut((t - num(spec.at, 0)) / num(spec.grow, 0.45));
  const bend = num(spec.bend, 0);
  const ex = x1 + (x2 - x1) * grow;
  const ey = y1 + (y2 - y1) * grow;
  const mx = (x1 + ex) / 2;
  const my = (y1 + ey) / 2 - bend * grow;
  const ang = (Math.atan2(ey - my, ex - mx) * 180) / Math.PI;
  const w = num(spec.width, 16);
  const label = str(spec.label, '');
  return (
    <g>
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${ex} ${ey}`} fill="none" stroke={C.ink} strokeWidth={w + 10} strokeLinecap="round" />
      <path d={`M ${x1} ${y1} Q ${mx} ${my} ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />
      <g transform={`translate(${ex} ${ey}) rotate(${ang})`}>
        <path d={`M ${w * 2.4} 0 L ${-w * 0.6} ${-w * 1.9} L ${-w * 0.6} ${w * 1.9} Z`} fill={color} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      </g>
      {label && grow > 0.6 && (
        <text x={num(spec.labelX, mx)} y={num(spec.labelY, my - 30)} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={num(spec.labelSize, 44)}
          fill={color} stroke={C.ink} strokeWidth={8} paintOrder="stroke" opacity={clamp((grow - 0.6) / 0.3)}>{label}</text>
      )}
    </g>
  );
};

// ---------------------------------------------------------------- nature

export const Tree: React.FC<PropProps> = ({ spec, t }) => {
  const x = num(spec.x, 1500);
  const y = num(spec.y, GROUND_Y - 20);
  const s = num(spec.s, 1);
  const windAt = typeof spec.windAt === 'number' ? spec.windAt : undefined;
  const w = windAt === undefined ? 0 : smooth((t - windAt) / 0.4);
  const sway = 3 * Math.sin(t * 1.3 + x) + w * (32 + 6 * Math.sin(t * 18));
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={`M -14 0 L -10 -150 Q 0 -160 10 -150 L 14 0 Z`} fill="#b06a3b" stroke={C.ink} strokeWidth={6} strokeLinejoin="round"
        transform={`skewX(${sway * 0.4})`} />
      <g transform={`rotate(${sway} 0 -40)`}>
        <circle cx={0} cy={-210} r={92} fill={C.landDark} stroke={C.ink} strokeWidth={6} />
        <circle cx={-60} cy={-170} r={60} fill={C.landDark} stroke={C.ink} strokeWidth={6} />
        <circle cx={62} cy={-175} r={62} fill={C.landDark} stroke={C.ink} strokeWidth={6} />
        <circle cx={-20} cy={-235} r={50} fill={C.land} />
      </g>
      {w > 0 && Array.from({ length: 6 }, (_, i) => {
        const k = ((t * 1.6 + i / 6) % 1);
        return <ellipse key={i} cx={20 + k * 700} cy={-200 + i * 22 - k * 60} rx={14} ry={8} fill={C.land} stroke={C.ink} strokeWidth={4}
          transform={`rotate(${k * 720} ${20 + k * 700} ${-200 + i * 22 - k * 60})`} opacity={w} />;
      })}
    </g>
  );
};

export const House: React.FC<PropProps> = ({ spec, t }) => {
  const x = num(spec.x, 1200);
  const y = num(spec.y, GROUND_Y - 20);
  const s = num(spec.s, 1);
  const roofAt = typeof spec.roofAt === 'number' ? spec.roofAt : undefined;
  const rk = roofAt === undefined ? 0 : clamp((t - roofAt) / 1.6);
  const roofDx = rk * rk * 1600;
  const roofDy = -rk * 380 + rk * rk * 120;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-110} y={-170} width={220} height={170} fill="#ffe2b8" stroke={C.ink} strokeWidth={6} />
      <rect x={-30} y={-90} width={60} height={90} rx={6} fill={C.purple} stroke={C.ink} strokeWidth={6} />
      <rect x={-90} y={-140} width={46} height={46} rx={4} fill="#9fe1ff" stroke={C.ink} strokeWidth={5} />
      <rect x={44} y={-140} width={46} height={46} rx={4} fill="#9fe1ff" stroke={C.ink} strokeWidth={5} />
      <g transform={`translate(${roofDx} ${roofDy}) rotate(${rk * 200} 0 -200)`}>
        <path d="M -140 -165 L 0 -270 L 140 -165 Z" fill={C.red} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      </g>
    </g>
  );
};

/** A wall of water surging across the screen (left -> right by default). */
export const Wave: React.FC<PropProps> = ({ spec, t }) => {
  const at = num(spec.at, 0);
  if (t < at) return null;
  const k = clamp((t - at) / num(spec.dur, 1.6));
  const h = num(spec.h, 330) * smooth(k * 2.2);
  const front = num(spec.x0, -200) + (num(spec.x1, 2600) - num(spec.x0, -200)) * k;
  const base = num(spec.y, GROUND_Y + 20);
  const crest = `M -400 ${base} L -400 ${base - h * 0.75} Q ${front - 260} ${base - h * 0.85} ${front - 90} ${base - h}
    Q ${front + 40} ${base - h - 30} ${front + 70} ${base - h + 60} Q ${front + 20} ${base - h + 40} ${front - 10} ${base - h + 90}
    Q ${front + 60} ${base - h * 0.3} ${front + 120} ${base} Z`;
  return (
    <g>
      <path d={crest} fill={C.ocean} stroke={C.ink} strokeWidth={7} strokeLinejoin="round" />
      <path d={`M -400 ${base - h * 0.55} Q ${front - 300} ${base - h * 0.62} ${front - 60} ${base - h * 0.62}`} fill="none" stroke="#9fd8ff" strokeWidth={10} strokeLinecap="round" />
      {Array.from({ length: 7 }, (_, i) => (
        <circle key={i} cx={front + 40 + i * 18} cy={base - h + 40 - ((i * 37) % 60)} r={9 - i} fill="#ffffff" stroke={C.ink} strokeWidth={3} opacity={h > 50 ? 1 : 0} />
      ))}
    </g>
  );
};

/** Horizontal gust lines. */
export const Wind: React.FC<PropProps> = ({ spec, t }) => {
  if (!visible(spec, t)) return null;
  const at = num(spec.at, 0);
  const r = rng(num(spec.seed, 3));
  const n = num(spec.count, 12);
  const speed = num(spec.speed, 2400);
  const fadeIn = clamp((t - at) / 0.25);
  return (
    <g opacity={fadeIn}>
      {Array.from({ length: n }, (_, i) => {
        const y = 80 + r() * num(spec.band, 700);
        const len = 160 + r() * 260;
        const off = r() * 2400;
        const x = ((off + (t - at) * speed * (0.7 + r() * 0.6)) % 2600) - 400;
        return (
          <path key={i} d={`M ${x} ${y} L ${x + len} ${y} q 40 0 40 -30 q 0 -24 -22 -24`} fill="none" stroke="#ffffff" strokeWidth={9} strokeLinecap="round" opacity={0.85} />
        );
      })}
    </g>
  );
};

/** Streaks behind something moving fast. */
export const SpeedLines: React.FC<PropProps> = ({ spec, t }) => {
  if (!visible(spec, t)) return null;
  const r = rng(num(spec.seed, 9));
  const cy = num(spec.y, 540);
  const color = str(spec.color, '#ffffff');
  return (
    <g>
      {Array.from({ length: num(spec.count, 18) }, (_, i) => {
        const y = cy + (r() - 0.5) * num(spec.spread, 700);
        const len = 200 + r() * 500;
        const x = 2200 - (((t * 3800 * (0.6 + r() * 0.8)) + r() * 3000) % 3000);
        return <line key={i} x1={x} y1={y} x2={x + len} y2={y} stroke={color} strokeWidth={4 + r() * 8} strokeLinecap="round" opacity={0.7} />;
      })}
    </g>
  );
};

/** Expanding shock rings (sonic boom). */
export const Boom: React.FC<PropProps> = ({ spec, t }) => {
  const at = num(spec.at, 0);
  if (t < at || t > at + 1.2) return null;
  const k = (t - at) / 1.2;
  const x = num(spec.x, 960);
  const y = num(spec.y, 540);
  return (
    <g>
      {[0, 0.15, 0.3].map((d) => {
        const kk = clamp((k - d) / (1 - d));
        if (kk <= 0) return null;
        return <ellipse key={d} cx={x - kk * 160} cy={y} rx={60 + kk * 420} ry={40 + kk * 520} fill="none" stroke="#ffffff" strokeWidth={14 * (1 - kk) + 2} opacity={1 - kk} />;
      })}
      {k < 0.35 && (
        <text x={x - 60} y={y - 160} fontFamily={FONT} fontWeight={700} fontSize={140 * popIn(k / 0.2)} textAnchor="middle" fill={C.yellow}
          stroke={C.ink} strokeWidth={12} paintOrder="stroke" transform={`rotate(-10 ${x} ${y - 160})`}>BOOM!</text>
      )}
    </g>
  );
};

/** Any held item flying along a path with spin. */
export const Flyer: React.FC<PropProps> = ({ spec, t }) => {
  const at = num(spec.at, 0);
  const dur = num(spec.dur, 1);
  // optional cartoon "hang in the air" before flying off
  const go = num(spec.hoverUntil, at);
  if (t < at) return null;
  if (spec.persist !== true && t > go + dur) return null;
  const k = clamp((t - go) / dur);
  const [x1, y1] = vec(spec.from, [-200, 500]);
  const [x2, y2] = vec(spec.to, [2200, 500]);
  const arc = num(spec.arc, 0);
  const x = x1 + (x2 - x1) * k;
  const y = y1 + (y2 - y1) * k - arc * 4 * k * (1 - k);
  const wob = num(spec.wobble, 0) * Math.sin(t * 9);
  return (
    <g transform={`translate(${x} ${y + wob}) rotate(${num(spec.spin, 360) * k + num(spec.rot, 0)}) scale(${num(spec.s, 1.6)})`}>
      <Held kind={str(spec.item, 'sandwich')} />
    </g>
  );
};

/** Big emoji-free motion "puff" when something launches. */
export const Puff: React.FC<PropProps> = ({ spec, t }) => {
  const at = num(spec.at, 0);
  if (t < at || t > at + 0.7) return null;
  const k = (t - at) / 0.7;
  const x = num(spec.x, 960);
  const y = num(spec.y, 800);
  return (
    <g opacity={1 - k}>
      {[-1, -0.4, 0.3, 1].map((d, i) => (
        <circle key={i} cx={x + d * 70 * (0.5 + k) - k * 120} cy={y - 20 - i * 6 - k * 40} r={34 * (0.6 + k)} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
      ))}
    </g>
  );
};

/** Planet-curvature ground strip used under Bix in space scenes. */
export const Ring: React.FC<PropProps> = ({ spec, t }) => {
  const at = num(spec.at, 0);
  if (t < at) return null;
  const k = clamp((t - at) / 0.6);
  return (
    <circle cx={num(spec.x, 960)} cy={num(spec.y, 540)} r={num(spec.r, 100) * (0.6 + 0.4 * popIn(k))} fill="none" stroke={str(spec.color, C.yellow)}
      strokeWidth={8} strokeDasharray="22 16" opacity={k} transform={`rotate(${t * 20} ${num(spec.x, 960)} ${num(spec.y, 540)})`} />
  );
};

/** Motion arcs + skid puffs around a planet that just slammed the brakes. */
export const Skid: React.FC<PropProps> = ({ spec, t }) => {
  if (!visible(spec, t)) return null;
  const x = num(spec.x, 960);
  const y = num(spec.y, 540);
  const R = num(spec.r, 300);
  const k = appear(spec, t);
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      {[1.14, 1.26].map((f, i) => (
        <path key={i} d={`M ${-R * f * 0.2} ${-R * f} A ${R * f} ${R * f} 0 0 0 ${-R * f} ${R * f * 0.15}`} fill="none" stroke="#ffffff"
          strokeWidth={14 - i * 4} strokeLinecap="round" strokeDasharray={i ? '40 26' : 'none'} opacity={0.9 - i * 0.3} />
      ))}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={-R * 1.05 + i * 26} cy={R * 0.35 + i * 30} r={26 - i * 5} fill="#ffffff" stroke={C.ink} strokeWidth={5} />
      ))}
      <path d={`M ${R * 0.9} ${-R * 1.0} l 30 -50 M ${R * 1.02} ${-R * 0.86} l 52 -30 M ${R * 0.74} ${-R * 1.1} l 6 -56`} stroke={C.yellow} strokeWidth={12} strokeLinecap="round" />
    </g>
  );
};

export const PROPS: Record<string, React.FC<PropProps>> = {
  skid: Skid,
  earth: Earth,
  arrow: Arrow,
  tree: Tree,
  house: House,
  wave: Wave,
  wind: Wind,
  speedlines: SpeedLines,
  boom: Boom,
  flyer: Flyer,
  puff: Puff,
  ring: Ring,
  ...PROPS2,
};

export const Prop: React.FC<PropProps> = ({ spec, t }) => {
  const P = PROPS[spec.type];
  if (!P) return null;
  if (spec.until !== undefined && t > num(spec.until, 1e9) && spec.type !== 'flyer') return null;
  return <P spec={spec} t={t} />;
};
