import React from 'react';
import { C, FONT, TITLE_FONT } from '../theme';
import { Spec } from '../types';
import { clamp, easeInOut, num, popIn, rng, str, vec } from '../util';
import { GROUND_Y } from './backgrounds';
import { Pal } from './props2';

// Props added for the MarMila (French) season: Earth cross-section with a tunnel, a
// high-security prison, a sniffer dog, a search helicopter, a coral reef, and the
// fictional evil genius (a generic extra with a cape; never a real person).

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

/** Earth cut in half: crust, mantle, outer and inner core; optional tunnel and a falling Bix marker. */
export const EarthCut: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const R = num(spec.r, 380);
  const k = appearK(spec, t);
  const tunnel = spec.tunnel !== false;
  const fallAt = typeof spec.fallAt === 'number' ? spec.fallAt : undefined;
  const period = num(spec.period, 6);
  const damp = num(spec.damp, 0); // 0 = no air (falls through and back), 1 = strong air drag (stops in the middle)
  let fy: number | undefined;
  if (fallAt !== undefined && t >= fallAt) {
    const lt = t - fallAt;
    const amp = Math.exp(-damp * lt * 0.9);
    fy = -R * 0.97 * Math.cos((2 * Math.PI * lt) / period) * amp;
  }
  const glow = 0.5 + 0.5 * Math.sin(t * 3);
  const layers = [
    { r: 1, fill: '#9c6b3c', label: str(spec.crustLabel, 'croûte') },
    { r: 0.97, fill: '#e3642b', label: str(spec.mantleLabel, 'manteau') },
    { r: 0.55, fill: '#ffb02e', label: str(spec.outerLabel, 'noyau externe') },
    { r: 0.19, fill: '#fff2a8', label: str(spec.innerLabel, 'noyau interne') },
  ];
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, 540)}) scale(${k})`}>
      {layers.map((l, i) => (
        <circle key={i} r={R * l.r} fill={l.fill} stroke={C.ink} strokeWidth={i === 0 ? 10 : 5} />
      ))}
      <circle r={R * 0.19} fill="#ffffff" opacity={0.25 + 0.25 * glow} />
      {/* land and ocean on the surface */}
      <path d={`M ${-R * 0.3} ${-R * 0.99} q ${R * 0.3} ${-R * 0.06} ${R * 0.6} 0`} stroke={C.land} strokeWidth={14} fill="none" strokeLinecap="round" />
      <path d={`M ${-R * 0.25} ${R * 0.99} q ${R * 0.25} ${R * 0.05} ${R * 0.5} 0`} stroke={C.ocean} strokeWidth={14} fill="none" strokeLinecap="round" />
      {tunnel && <rect x={-R * 0.045} y={-R * 1.02} width={R * 0.09} height={R * 2.04} fill="#2a1a35" stroke={C.ink} strokeWidth={4} opacity={0.92} />}
      {spec.labels === true &&
        layers.map((l, i) => (
          <text key={i} x={R * 1.08} y={-R * (i === 0 ? 0.92 : i === 1 ? 0.7 : i === 2 ? 0.35 : 0.02)} fontFamily={FONT} fontWeight={700} fontSize={R * 0.11}
            fill="#fff" stroke={C.ink} strokeWidth={R * 0.022} paintOrder="stroke">{l.label}</text>
        ))}
      {fy !== undefined && (
        <g transform={`translate(0 ${fy})`}>
          <circle r={R * 0.075} fill="#ffd9b8" stroke={C.ink} strokeWidth={4} />
          <path d={`M ${-R * 0.08} ${-R * 0.02} Q 0 ${-R * 0.16} ${R * 0.08} ${-R * 0.02} Z`} fill={C.beanie} stroke={C.ink} strokeWidth={4} />
          <circle cx={-R * 0.025} cy={R * 0.01} r={R * 0.012} fill={C.ink} />
          <circle cx={R * 0.025} cy={R * 0.01} r={R * 0.012} fill={C.ink} />
        </g>
      )}
    </g>
  );
};

/** High-security prison: walls, corner towers, fence rings, sweeping searchlights; alarmAt flashes red. */
export const Prison: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const s = num(spec.s, 1) * appearK(spec, t);
  const alarmAt = typeof spec.alarmAt === 'number' ? spec.alarmAt : undefined;
  const alarm = alarmAt !== undefined && t >= alarmAt;
  const flash = alarm && Math.sin((t - (alarmAt ?? 0)) * 12) > 0;
  const fences = num(spec.fences, 2);
  const sweep = Math.sin(t * 1.3) * 28;
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) scale(${s})`}>
      {[-1, 1].map((d) => (
        <path key={d} d={`M ${d * 330} -330 L ${d * 330 + d * 90 + sweep * 6} -40 L ${d * 330 - d * 60 + sweep * 6} -40 Z`} fill="#fff6c0" opacity={0.28} />
      ))}
      {Array.from({ length: fences }, (_, i) => {
        const w = 400 + i * 50;
        return (
          <g key={i}>
            <line x1={-w} y1={-60 + i * 18} x2={w} y2={-60 + i * 18} stroke="#b9c0d6" strokeWidth={4} />
            {Array.from({ length: 13 }, (_, j) => (
              <line key={j} x1={-w + (j * 2 * w) / 12} y1={-60 + i * 18} x2={-w + (j * 2 * w) / 12} y2={-110 + i * 18} stroke="#b9c0d6" strokeWidth={4} />
            ))}
            <path d={Array.from({ length: 24 }, (_, j) => `M ${-w + (j * 2 * w) / 24} ${-112 + i * 18} l 10 -10 l 10 10`).join(' ')} stroke="#d9deec" strokeWidth={3} fill="none" />
          </g>
        );
      })}
      <rect x={-300} y={-300} width={600} height={240} fill="#8b93ad" stroke={C.ink} strokeWidth={8} />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={-260 + i * 90} y={-250} width={40} height={60} fill="#2a2f4a" stroke={C.ink} strokeWidth={4} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>{[0, 1, 2].map((b) => <line key={b} x1={-250 + i * 90 + b * 10} y1={-250} x2={-250 + i * 90 + b * 10} y2={-190} stroke="#d9deec" strokeWidth={3} />)}</g>
      ))}
      <rect x={-60} y={-160} width={120} height={100} fill="#4a4f6e" stroke={C.ink} strokeWidth={6} />
      {[-1, 1].map((d) => (
        <g key={d} transform={`translate(${d * 330} 0)`}>
          <rect x={-34} y={-380} width={68} height={320} fill="#6c7391" stroke={C.ink} strokeWidth={7} />
          <rect x={-56} y={-420} width={112} height={50} rx={8} fill="#4a4f6e" stroke={C.ink} strokeWidth={7} />
          <circle cy={-395} r={14} fill={flash ? C.red : C.yellow} stroke={C.ink} strokeWidth={4} />
        </g>
      ))}
      {alarm && <rect x={-300} y={-300} width={600} height={240} fill={C.red} opacity={flash ? 0.18 : 0.05} />}
      {spec.label !== undefined && (
        <text y={-320} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={56} fill="#fff" stroke={C.ink} strokeWidth={9} paintOrder="stroke">{str(spec.label, '')}</text>
      )}
    </g>
  );
};

/** Sniffer dog (side view): sniff: true bobs the nose with scent lines; from/to/moveAt/dur to run. */
export const Dog: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x, y] = moveXY(spec, t, [960, GROUND_Y]);
  const moving = spec.to !== undefined && t >= num(spec.moveAt, num(spec.at, 0)) && t <= num(spec.moveAt, num(spec.at, 0)) + num(spec.dur, 1);
  const leg = moving ? Math.sin(t * 18) * 16 : 0;
  const sniff = spec.sniff === true ? Math.sin(t * 9) * 5 : 0;
  const f = num(spec.facing, 1);
  return (
    <g transform={`translate(${x} ${y}) scale(${num(spec.s, 1) * appearK(spec, t) * f} ${num(spec.s, 1) * appearK(spec, t)})`}>
      {[-60, -30, 40, 70].map((lx, i) => (
        <line key={i} x1={lx} y1={-50} x2={lx + (i % 2 ? leg : -leg)} y2={0} stroke={C.ink} strokeWidth={16} strokeLinecap="round" />
      ))}
      {[-60, -30, 40, 70].map((lx, i) => (
        <line key={`c${i}`} x1={lx} y1={-50} x2={lx + (i % 2 ? leg : -leg)} y2={-4} stroke="#b07a3a" strokeWidth={9} strokeLinecap="round" />
      ))}
      <path d={`M -90 -70 q -40 -30 -30 -60`} stroke={C.ink} strokeWidth={14} fill="none" strokeLinecap="round" transform={`rotate(${Math.sin(t * 10) * 12} -90 -70)`} />
      <ellipse cx={0} cy={-75} rx={95} ry={40} fill="#c98a45" stroke={C.ink} strokeWidth={7} />
      <ellipse cx={-10} cy={-80} rx={40} ry={24} fill="#5a3a1e" opacity={0.6} />
      <g transform={`translate(95 ${-105 + sniff})`}>
        <ellipse rx={42} ry={34} fill="#c98a45" stroke={C.ink} strokeWidth={7} />
        <path d="M 22 -4 L 68 6 Q 74 22 58 26 L 22 22 Z" fill="#c98a45" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
        <circle cx={68} cy={10} r={9} fill={C.ink} />
        <circle cx={10} cy={-8} r={6} fill={C.ink} />
        <path d="M -20 -26 Q -46 -10 -34 26 Q -16 10 -10 -20 Z" fill="#7a4c22" stroke={C.ink} strokeWidth={5} />
        {spec.sniff === true && [0, 1, 2].map((i) => (
          <path key={i} d={`M ${86 + i * 18} ${4 - i * 6} q 10 -10 0 -20 q -10 -10 0 -20`} stroke="#ffffff" strokeWidth={5} fill="none" strokeLinecap="round"
            opacity={0.3 + 0.5 * Math.max(0, Math.sin(t * 4 - i))} />
        ))}
      </g>
    </g>
  );
};

/** Search helicopter: rotor spins; light: true = white searchlight cone, thermal: true = orange heat-camera cone. */
export const Helicopter: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const [x, y] = moveXY(spec, t, [960, 260]);
  const f = num(spec.facing, 1);
  const rot = Math.sin(t * 40);
  const cone = spec.light === true || spec.thermal === true;
  return (
    <g transform={`translate(${x} ${y + 6 * Math.sin(t * 2)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      {cone && <path d="M -20 40 L -170 560 L 170 560 L 20 40 Z" fill={spec.thermal === true ? '#ff8a3a' : '#fff6c0'} opacity={0.22} />}
      <g transform={`scale(${f} 1)`}>
        <rect x={60} y={-14} width={150} height={22} rx={10} fill="#e9eef8" stroke={C.ink} strokeWidth={6} />
        <path d="M 200 -36 L 222 -36 L 222 16 L 200 16 Z" fill={C.red} stroke={C.ink} strokeWidth={5} />
        <ellipse cx={0} cy={0} rx={110} ry={56} fill="#e9eef8" stroke={C.ink} strokeWidth={7} />
        <path d="M -96 -10 Q -80 -46 -20 -46 L -20 0 L -100 4 Z" fill="#9fd8ff" stroke={C.ink} strokeWidth={5} />
        <line x1={-70} y1={62} x2={70} y2={62} stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
        <line x1={-40} y1={50} x2={-40} y2={62} stroke={C.ink} strokeWidth={6} />
        <line x1={40} y1={50} x2={40} y2={62} stroke={C.ink} strokeWidth={6} />
        <rect x={-8} y={-74} width={16} height={22} fill={C.ink} />
        <ellipse cx={0} cy={-76} rx={190 * Math.abs(rot) + 20} ry={8} fill={C.ink} opacity={0.75} />
      </g>
    </g>
  );
};

/** Coral reef; spawnAt releases thousands of little egg bundles that float up. */
export const Coral: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const r = rng(num(spec.seed, 4));
  const spawnAt = typeof spec.spawnAt === 'number' ? spec.spawnAt : undefined;
  const w = num(spec.w, 700);
  const eggs = Array.from({ length: num(spec.count, 70) }, () => ({ x: (r() - 0.5) * w, d: r() * 1.5, sp: 70 + r() * 90, sw: r() * 6 }));
  const colors = ['#ff6fb5', '#ffb02e', '#a77bff', '#22d3c5', '#ff7a1a'];
  return (
    <g transform={`translate(${num(spec.x, 960)} ${num(spec.y, GROUND_Y)}) scale(${num(spec.s, 1) * appearK(spec, t)})`}>
      {Array.from({ length: 9 }, (_, i) => {
        const cx = -w / 2 + 40 + (i * (w - 80)) / 8;
        const h = 110 + ((i * 53) % 90);
        const col = colors[i % colors.length];
        return (
          <g key={i} transform={`translate(${cx} 0) rotate(${Math.sin(t * 1.2 + i) * 3})`}>
            <path d={`M 0 0 L 0 ${-h} M 0 ${-h * 0.5} L -36 ${-h * 0.8} M 0 ${-h * 0.65} L 34 ${-h * 0.95}`} stroke={C.ink} strokeWidth={26} strokeLinecap="round" />
            <path d={`M 0 0 L 0 ${-h} M 0 ${-h * 0.5} L -36 ${-h * 0.8} M 0 ${-h * 0.65} L 34 ${-h * 0.95}`} stroke={col} strokeWidth={16} strokeLinecap="round" />
          </g>
        );
      })}
      <rect x={-w / 2} y={-6} width={w} height={26} rx={12} fill={C.sand} stroke={C.ink} strokeWidth={6} />
      {spawnAt !== undefined && t >= spawnAt && eggs.map((e, i) => {
        const lt = t - spawnAt - e.d;
        if (lt < 0) return null;
        return <circle key={i} cx={e.x + Math.sin(lt * 2 + e.sw) * 14} cy={-150 - lt * e.sp} r={7} fill="#ffd6e8" stroke="#ff6fb5" strokeWidth={2} opacity={clamp(1.4 - lt * 0.12)} />;
      })}
    </g>
  );
};

/** The fictional evil genius (never a real person): a generic extra with a cape and a glowing big-brain aura. */
export const Genius: React.FC<PP> = ({ spec, t }) => {
  if (!started(spec, t)) return null;
  const s = num(spec.s, 0.9) * appearK(spec, t);
  const [x, y] = moveXY(spec, t, [960, GROUND_Y]);
  const evil = spec.evil !== false;
  const cape = Math.sin(t * 3) * 10;
  return (
    <g>
      {evil && (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          {/* narrow cape behind the shoulders; the figure stays readable in front of it */}
          <path d={`M -34 -265 Q -80 -130 ${-78 + cape * 0.6} -30 L ${-30} -50 L 30 -50 L ${78 - cape * 0.6} -30 Q 80 -130 34 -265 Z`} fill="#3a1b5c" stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
          <path d={`M -26 -255 Q -60 -130 ${-60 + cape * 0.6} -42 L 60 -42 Q 60 -130 26 -255 Z`} fill={C.red} opacity={0.55} />
        </g>
      )}
      <Pal spec={{ ...spec, type: 'pal', color: str(spec.color, evil ? '#5b3a8c' : '#e9eef8'), hair: str(spec.hair, '#f2f2f7'), s: num(spec.s, 0.9), x, y, from: undefined, to: undefined }} t={t} />
      {spec.aura !== false && (
        <g transform={`translate(${x} ${y - 400 * s})`}>
          {[0, 1, 2].map((i) => (
            <circle key={i} r={(60 + i * 28 + 8 * Math.sin(t * 4 + i)) * s} fill="none" stroke={evil ? C.pink : C.teal} strokeWidth={5} opacity={0.5 - i * 0.12} />
          ))}
        </g>
      )}
    </g>
  );
};

export const PROPS3: Record<string, React.FC<PP>> = {
  earthcut: EarthCut, prison: Prison, dog: Dog, helicopter: Helicopter, coral: Coral, genius: Genius,
};
