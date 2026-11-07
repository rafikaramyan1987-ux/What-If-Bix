import React from 'react';
import { C, FONT } from '../theme';
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

const Floor: React.FC<{ color: string; line?: string }> = ({ color, line = C.ink }) => (
  <g>
    <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} fill={color} />
    <line x1={0} y1={GROUND_Y} x2={W} y2={GROUND_Y} stroke={line} strokeWidth={6} />
  </g>
);

/** Science lab: tiled wall, shelves with flasks, whiteboard area, bench. */
export const Lab: React.FC<BgProps> = ({ spec, t }) => {
  const wall = str(spec.wall, '#dff3ff');
  return (
    <g>
      <rect width={W} height={H} fill={wall} />
      {Array.from({ length: 13 }, (_, i) => (
        <line key={`v${i}`} x1={i * 160} y1={0} x2={i * 160} y2={GROUND_Y} stroke="#c3e3f5" strokeWidth={4} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 160} x2={W} y2={i * 160} stroke="#c3e3f5" strokeWidth={4} />
      ))}
      {spec.board !== false && (
        <g transform="translate(560 120)">
          <rect width={800} height={430} rx={14} fill="#ffffff" stroke={C.ink} strokeWidth={8} />
          <rect x={-20} y={430} width={840} height={18} rx={6} fill={C.grey} stroke={C.ink} strokeWidth={5} />
          <path d="M 60 340 Q 200 120 360 260 T 720 110" fill="none" stroke="#bcd3e6" strokeWidth={8} strokeLinecap="round" />
          <text x={70} y={90} fontFamily={FONT} fontWeight={700} fontSize={54} fill="#9fb6c9">E = ?</text>
        </g>
      )}
      {[0, 1].map((side) => (
        <g key={side} transform={`translate(${side ? 1500 : 60} 210)`}>
          <rect x={0} y={150} width={360} height={18} rx={4} fill="#b06a3b" stroke={C.ink} strokeWidth={5} />
          {[30, 120, 210, 290].map((x, i) => {
            const col = [C.pink, C.teal, C.yellow, C.purple][(i + side) % 4];
            const bub = (t * 1.4 + i * 0.3) % 1;
            return (
              <g key={x} transform={`translate(${x} 150)`}>
                <path d="M -14 -90 L 14 -90 L 14 -60 L 34 -8 Q 36 0 28 0 L -28 0 Q -36 0 -34 -8 L -14 -60 Z" fill="#ffffff" stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
                <path d="M -24 -24 L 24 -24 L 32 -6 Q 32 0 26 0 L -26 0 Q -32 0 -32 -6 Z" fill={col} />
                <circle cx={(i % 2 ? 6 : -6)} cy={-30 - bub * 80} r={6 * (1 - bub)} fill={col} opacity={1 - bub} />
              </g>
            );
          })}
        </g>
      ))}
      <Floor color="#9aa7c7" />
      <rect x={0} y={GROUND_Y} width={W} height={16} fill="#7c88aa" />
    </g>
  );
};

/** City skyline with a street. mood: day | sunset | night (windows light up). */
export const City: React.FC<BgProps> = ({ spec, t }) => {
  const mood = spec.type === 'night-city' ? 'night' : str(spec.mood, 'day');
  const night = mood === 'night';
  const r = rng(num(spec.seed, 21));
  const blocks = Array.from({ length: 14 }, (_, i) => ({ x: i * 140 - 20 + r() * 30, w: 110 + r() * 60, h: 220 + r() * 380, c: r() }));
  const palette = night ? ['#2b2f6b', '#363b82', '#24285a'] : ['#8fb8ff', '#a7c4ff', '#7aa6f2'];
  const lightsOff = typeof spec.lightsOffAt === 'number' && t >= spec.lightsOffAt;
  return (
    <g>
      <Sky spec={{ ...spec, type: 'sky', mood, clouds: night ? 0 : 5, cloudBand: 280, sunY: 140 }} t={t} />
      {night && <Stars t={t} seed={4} count={60} drift={0} />}
      {blocks.map((b, i) => {
        const top = GROUND_Y - b.h;
        const fill = palette[Math.floor(b.c * 3)];
        return (
          <g key={i}>
            <rect x={b.x} y={top} width={b.w} height={b.h} fill={fill} stroke={C.ink} strokeWidth={5} />
            {Array.from({ length: Math.floor(b.h / 60) }, (_, row) =>
              Array.from({ length: Math.floor(b.w / 40) }, (_, col) => {
                const lit = night ? !lightsOff && ((row * 7 + col * 3 + i) % 5 !== 0) : false;
                return (
                  <rect key={`${row}-${col}`} x={b.x + 14 + col * 40} y={top + 20 + row * 60} width={22} height={30} rx={3}
                    fill={lit ? '#ffe28a' : night ? '#1b1e40' : '#d6ecff'} />
                );
              }),
            )}
          </g>
        );
      })}
      <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} fill={night ? '#3a3f5c' : '#5b6178'} />
      <line x1={0} y1={GROUND_Y} x2={W} y2={GROUND_Y} stroke={C.ink} strokeWidth={6} />
      <rect x={0} y={GROUND_Y} width={W} height={26} fill={night ? '#5a607e' : '#a2a8bd'} stroke={C.ink} strokeWidth={5} />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 210 + 40} y={GROUND_Y + 128} width={110} height={14} rx={7} fill="#ffe28a" />
      ))}
    </g>
  );
};

/** Bedroom: wall, window (day/night), bed, lamp and a wall clock. */
export const Bedroom: React.FC<BgProps> = ({ spec, t }) => {
  const night = str(spec.mood, 'night') === 'night';
  const clock = str(spec.clock, '3:00').split(':').map(Number);
  const spin = num(spec.clockSpeed, 0);
  const minutes = clock[0] * 60 + (clock[1] || 0) + spin * t * 60;
  return (
    <g>
      <rect width={W} height={H} fill={night ? '#3b3477' : '#ffe9c9'} />
      <rect x={0} y={GROUND_Y - 90} width={W} height={12} fill={night ? '#2c2660' : '#f1cf9f'} />
      <g transform="translate(260 170)">
        <rect width={380} height={300} rx={12} fill={night ? '#121640' : C.sky1} stroke={C.ink} strokeWidth={8} />
        {night ? (
          <>
            <circle cx={270} cy={90} r={46} fill={C.star} />
            <circle cx={292} cy={78} r={40} fill="#121640" />
            {[[60, 70], [140, 200], [90, 240], [320, 230], [200, 50]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={4} fill={C.star} opacity={0.5 + 0.5 * Math.sin(t * 2 + i)} />
            ))}
          </>
        ) : (
          <circle cx={290} cy={80} r={44} fill={C.sun} stroke={C.ink} strokeWidth={5} />
        )}
        <line x1={190} y1={0} x2={190} y2={300} stroke={C.ink} strokeWidth={8} />
        <line x1={0} y1={150} x2={380} y2={150} stroke={C.ink} strokeWidth={8} />
      </g>
      <g transform="translate(1500 210)">
        <circle r={86} fill="#ffffff" stroke={C.ink} strokeWidth={8} />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={0} y1={-70} x2={0} y2={-60} stroke={C.ink} strokeWidth={5} transform={`rotate(${i * 30})`} />
        ))}
        <line x1={0} y1={0} x2={0} y2={-44} stroke={C.ink} strokeWidth={9} strokeLinecap="round" transform={`rotate(${(minutes / 720) * 360})`} />
        <line x1={0} y1={0} x2={0} y2={-64} stroke={C.red} strokeWidth={6} strokeLinecap="round" transform={`rotate(${(minutes % 60) * 6})`} />
      </g>
      <Floor color={night ? '#5b4a8a' : '#d9a066'} />
      {spec.bed !== false && (
        <g transform="translate(1180 820)">
          <rect x={-260} y={-150} width={40} height={150} rx={8} fill="#b06a3b" stroke={C.ink} strokeWidth={6} />
          <rect x={-240} y={-90} width={500} height={70} rx={14} fill="#ffffff" stroke={C.ink} strokeWidth={6} />
          <rect x={-60} y={-104} width={320} height={84} rx={18} fill={C.teal} stroke={C.ink} strokeWidth={6} />
          <ellipse cx={-160} cy={-102} rx={60} ry={26} fill="#ffffff" stroke={C.ink} strokeWidth={6} />
          <rect x={-240} y={-20} width={500} height={20} fill="#b06a3b" stroke={C.ink} strokeWidth={6} />
        </g>
      )}
    </g>
  );
};

/** Open ocean: sky above, water from the horizon down, optional beach. */
export const OceanBg: React.FC<BgProps> = ({ spec, t }) => {
  const horizon = num(spec.horizon, 560);
  return (
    <g>
      <Sky spec={{ ...spec, type: 'sky', cloudBand: horizon - 260, clouds: 5 }} t={t} />
      <rect x={0} y={horizon} width={W} height={H - horizon} fill={C.ocean} />
      <line x1={0} y1={horizon} x2={W} y2={horizon} stroke={C.ink} strokeWidth={6} />
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 9 }, (_, i) => {
          const x = ((i * 240 + row * 110 + t * (20 + row * 8)) % 2160) - 120;
          const y = horizon + 60 + row * 90;
          return <path key={`${row}-${i}`} d={`M ${x} ${y} q 25 -16 50 0 t 50 0`} fill="none" stroke="#9fd8ff" strokeWidth={6} strokeLinecap="round" />;
        }),
      )}
      {spec.beach === true && (
        <path d={`M 0 ${H} L 0 ${H - 170} Q 500 ${H - 230} 900 ${H - 120} Q 1300 ${H - 40} ${W} ${H - 90} L ${W} ${H} Z`} fill={C.sand} stroke={C.ink} strokeWidth={6} />
      )}
    </g>
  );
};

/** Lunar surface with a black sky; Earth hangs above unless earth: false. */
export const MoonBg: React.FC<BgProps> = ({ spec, t }) => {
  const r = rng(77);
  const craters = Array.from({ length: 9 }, () => ({ x: r() * W, y: GROUND_Y + 30 + r() * 200, w: 60 + r() * 140 }));
  return (
    <g>
      <rect width={W} height={H} fill="#05061a" />
      <Stars t={t} seed={8} count={150} drift={0} />
      <path d={`M 0 ${GROUND_Y} Q 480 ${GROUND_Y - 70} 960 ${GROUND_Y - 20} Q 1440 ${GROUND_Y + 30} ${W} ${GROUND_Y - 40} L ${W} ${H} L 0 ${H} Z`}
        fill="#c9cbd6" stroke={C.ink} strokeWidth={6} />
      {craters.map((c, i) => (
        <ellipse key={i} cx={c.x} cy={c.y} rx={c.w} ry={c.w * 0.28} fill="#a9abba" stroke={C.ink} strokeWidth={4} />
      ))}
    </g>
  );
};

export const BACKGROUNDS: Record<string, React.FC<BgProps>> = {
  space: Space,
  sky: Sky,
  land: Land,
  plain: Plain,
  lab: Lab,
  city: City,
  'night-city': City,
  bedroom: Bedroom,
  ocean: OceanBg,
  moon: MoonBg,
};

export const Background: React.FC<BgProps> = ({ spec, t }) => {
  const B = BACKGROUNDS[spec.type] ?? Plain;
  return <B spec={spec} t={t} />;
};
