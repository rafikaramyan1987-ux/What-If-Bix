import React from 'react';
import { C } from '../theme';
import { Spec } from '../types';
import { num, rng, str } from '../util';

const W = 1920;
const H = 1080;

type BgProps = { spec: Spec; t: number };

const Stars: React.FC<{ t: number; seed: number; count: number; drift: number }> = ({ t, seed, count, drift }) => {
  const r = rng(seed);
  const stars = Array.from({ length: count }, (_, i) => ({
    x: r() * W, y: r() * H, s: 0.8 + r() * 2.6, ph: r() * 6.28, sp: 0.6 + r() * 2.2, layer: 0.3 + r() * 0.7, spark: i % 17 === 0,
  }));
  return (
    <g>
      {stars.map((s, i) => {
        const x = (((s.x - drift * t * s.layer) % W) + W) % W;
        const op = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        if (s.spark) {
          const k = s.s * 4 * (0.7 + 0.3 * Math.sin(t * 2 + s.ph));
          return (
            <path key={i} d={`M ${x} ${s.y - k} Q ${x} ${s.y} ${x + k} ${s.y} Q ${x} ${s.y} ${x} ${s.y + k} Q ${x} ${s.y} ${x - k} ${s.y} Q ${x} ${s.y} ${x} ${s.y - k} Z`}
              fill={C.star} opacity={op} />
          );
        }
        return <circle key={i} cx={x} cy={s.y} r={s.s} fill={C.star} opacity={op} />;
      })}
    </g>
  );
};

export const Space: React.FC<BgProps> = ({ spec, t }) => {
  const drift = num(spec.drift, 6);
  const tint = str(spec.tint, 'purple');
  const top = tint === 'blue' ? '#07122e' : C.space1;
  const bottom = tint === 'blue' ? '#123a6b' : C.space2;
  return (
    <g>
      <defs>
        <linearGradient id="spaceG" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id="neb1">
          <stop offset="0" stopColor={C.pink} stopOpacity={0.22} />
          <stop offset="1" stopColor={C.pink} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="neb2">
          <stop offset="0" stopColor={C.teal} stopOpacity={0.16} />
          <stop offset="1" stopColor={C.teal} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#spaceG)" />
      <ellipse cx={1500 - t * 2} cy={250} rx={620} ry={360} fill="url(#neb1)" />
      <ellipse cx={300 + t * 1.5} cy={820} rx={700} ry={380} fill="url(#neb2)" />
      <Stars t={t} seed={num(spec.seed, 11)} count={num(spec.stars, 170)} drift={drift} />
      {spec.planet === true && (
        <g transform={`translate(${1680 - t * 1.2} 190)`}>
          <circle r={46} fill={C.purple} stroke={C.ink} strokeWidth={5} />
          <path d="M -44 -6 Q 0 8 44 -6" stroke="#b49bff" strokeWidth={7} fill="none" />
          <ellipse rx={78} ry={16} fill="none" stroke={C.yellow} strokeWidth={6} transform="rotate(-18)" />
        </g>
      )}
    </g>
  );
};

export const cloudPath = (w: number, h: number) => {
  // flat-bottomed puffy cloud built from arcs
  const b = h;
  return `M 0 ${b} Q ${-w * 0.08} ${b * 0.45} ${w * 0.18} ${b * 0.5} Q ${w * 0.22} ${b * 0.02} ${w * 0.48} ${b * 0.18}
    Q ${w * 0.68} ${-b * 0.25} ${w * 0.8} ${b * 0.4} Q ${w * 1.08} ${b * 0.4} ${w} ${b} Z`;
};

export const Cloud: React.FC<{ x: number; y: number; w: number; stretch?: number; fill?: string }> = ({ x, y, w, stretch = 1, fill = C.cloud }) => (
  <g transform={`translate(${x} ${y}) scale(${stretch} 1)`}>
    <path d={cloudPath(w, w * 0.42)} fill={fill} stroke={C.ink} strokeWidth={5 / stretch} strokeLinejoin="round" />
  </g>
);

const Clouds: React.FC<{ t: number; speed: number; seed: number; count: number; yMax: number }> = ({ t, speed, seed, count, yMax }) => {
  const r = rng(seed);
  const clouds = Array.from({ length: count }, () => ({ x: r() * (W + 600), y: 60 + r() * yMax, w: 160 + r() * 220, layer: 0.4 + r() * 0.6 }));
  const stretch = 1 + Math.min(2.2, speed / 700);
  return (
    <g>
      {clouds.sort((a, b) => a.layer - b.layer).map((c, i) => {
        const span = W + 900;
        const x = ((((c.x - speed * t * c.layer) % span) + span) % span) - 500;
        return <Cloud key={i} x={x} y={c.y} w={c.w * (0.7 + 0.5 * c.layer)} stretch={stretch} fill={c.layer > 0.7 ? C.cloud : '#e3f4ff'} />;
      })}
    </g>
  );
};

export const Sky: React.FC<BgProps> = ({ spec, t }) => {
  const speed = num(spec.speed, 20);
  const mood = str(spec.mood, 'day');
  const g1 = mood === 'sunset' ? '#ff8a5c' : mood === 'night' ? '#0f1640' : C.sky1;
  const g2 = mood === 'sunset' ? '#ffd27a' : mood === 'night' ? '#2b2f7a' : C.sky2;
  return (
    <g>
      <defs>
        <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={g1} />
          <stop offset="1" stopColor={g2} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#skyG)" />
      {spec.sun !== false && mood !== 'night' && (
        <g transform={`translate(${num(spec.sunX, 1650)} ${num(spec.sunY, 170)})`}>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={-7} y={-128} width={14} height={34} rx={7} fill={C.sun} opacity={0.75} transform={`rotate(${i * 30 + t * 12})`} />
          ))}
          <circle r={78} fill={C.sun} stroke={C.ink} strokeWidth={6} />
        </g>
      )}
      <Clouds t={t} speed={speed} seed={num(spec.seed, 5)} count={num(spec.clouds, 9)} yMax={num(spec.cloudBand, 620)} />
    </g>
  );
};

export const GROUND_Y = 820;

export const Land: React.FC<BgProps> = ({ spec, t }) => {
  const seaEnd = num(spec.seaEnd, 0);
  return (
    <g>
      <Sky spec={{ ...spec, type: 'sky', cloudBand: 420, clouds: 6 }} t={t} />
      {/* far hills */}
      <path d={`M 0 ${GROUND_Y - 60} Q 300 ${GROUND_Y - 190} 640 ${GROUND_Y - 70} Q 980 ${GROUND_Y - 220} 1340 ${GROUND_Y - 80} Q 1660 ${GROUND_Y - 170} 1920 ${GROUND_Y - 90} L 1920 ${H} L 0 ${H} Z`}
        fill="#8fe39c" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
      {/* ground */}
      <path d={`M ${seaEnd} ${GROUND_Y} Q ${seaEnd + 30} ${GROUND_Y - 22} ${seaEnd + 90} ${GROUND_Y - 22} L 1920 ${GROUND_Y - 22} L 1920 ${H} L ${seaEnd} ${H} Z`}
        fill={C.land} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
      <rect x={seaEnd} y={GROUND_Y + 40} width={W - seaEnd} height={H} fill={C.landDark} />
      <path d={`M ${seaEnd} ${GROUND_Y + 40} L ${W} ${GROUND_Y + 40}`} stroke={C.ink} strokeWidth={5} />
      {seaEnd > 0 && (
        <g>
          <rect x={0} y={GROUND_Y - 10} width={seaEnd + 40} height={H} fill={C.ocean} />
          {Array.from({ length: Math.ceil(seaEnd / 80) + 1 }, (_, i) => {
            const x = i * 80 + ((t * 30) % 80) - 80;
            return <path key={i} d={`M ${x} ${GROUND_Y - 10} q 20 -14 40 0 t 40 0`} fill="none" stroke={C.ink} strokeWidth={5} />;
          })}
          <path d={`M 0 ${GROUND_Y + 60} L ${seaEnd} ${GROUND_Y + 60}`} stroke={C.oceanDark} strokeWidth={10} strokeDasharray="30 40" />
        </g>
      )}
    </g>
  );
};

export const Plain: React.FC<BgProps> = ({ spec }) => <rect width={W} height={H} fill={str(spec.color, C.night)} />;

export const BACKGROUNDS: Record<string, React.FC<BgProps>> = {
  space: Space,
  sky: Sky,
  land: Land,
  plain: Plain,
};

export const Background: React.FC<BgProps> = ({ spec, t }) => {
  const B = BACKGROUNDS[spec.type] ?? Plain;
  return <B spec={spec} t={t} />;
};
