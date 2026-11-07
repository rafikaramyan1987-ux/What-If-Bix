import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Bix } from '../bix/Bix';
import { actionPose, BixAction } from '../bix/poses';
import { Background } from '../scene/backgrounds';
import { Prop } from '../scene/props';
import { C, FONT, TITLE_FONT } from '../theme';
import { ThumbnailProps } from '../types';

/** Thumbnail drawn on the 1920x1080 stage and scaled into 1280x720. */
export const Thumbnail: React.FC<ThumbnailProps> = (p) => {
  const t = p.bix.t ?? 0.4;
  const o = actionPose(p.bix.action as BixAction, t, t, { panic: 1 });
  const longest = Math.max(...p.title.map((l) => l.length));
  const size = Math.min(250, 1000 / (longest * 0.56));
  const lineH = size * 0.98;
  const top = 540 - ((p.title.length - 1) * lineH) / 2 + size * 0.3 - (p.subtitle ? 60 : 0);
  return (
    <AbsoluteFill style={{ background: C.night }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080">
        <Background spec={p.background} t={2} />
        {p.props.map((s, i) => (
          <Prop key={i} spec={s} t={2} />
        ))}
        {/* readability vignette behind the title */}
        <defs>
          <linearGradient id="vig" x1="0" x2="1">
            <stop offset="0" stopColor="#000" stopOpacity={0.55} />
            <stop offset="0.6" stopColor="#000" stopOpacity={0} />
          </linearGradient>
        </defs>
        <rect width={1920} height={1080} fill="url(#vig)" />
        <g>
          {p.title.map((line, i) => (
            <text key={i} x={90} y={top + i * lineH} fontFamily={TITLE_FONT} fontSize={size} fill={i === (p.accent ?? 0) ? C.yellow : C.white}
              stroke={C.ink} strokeWidth={size * 0.13} paintOrder="stroke" strokeLinejoin="round" transform={`rotate(-4 90 ${top + i * lineH})`}>
              {line}
            </text>
          ))}
          {p.subtitle && (
            <g transform={`translate(96 ${top + (p.title.length - 1) * lineH + 70}) rotate(-4)`}>
              <rect x={0} y={0} width={p.subtitle.length * 44 + 70} height={110} rx={55} fill={C.red} stroke={C.ink} strokeWidth={9} />
              <text x={35} y={78} fontFamily={FONT} fontWeight={700} fontSize={76} fill={C.white}>{p.subtitle.toUpperCase()}</text>
            </g>
          )}
        </g>
        <Bix x={p.bix.x ?? 1500} y={p.bix.y ?? 1000} scale={p.bix.scale ?? 2.1} facing={p.bix.facing ?? -1} pose={o.pose} face={o.face}
          emote={o.emote} t={t} hold={p.bix.hold} shadow={false} />
        {p.badge && (
          <g transform="translate(1790 120) rotate(12)">
            <circle r={92} fill={C.yellow} stroke={C.ink} strokeWidth={9} />
            <text y={26} textAnchor="middle" fontFamily={TITLE_FONT} fontSize={80} fill={C.ink}>{p.badge}</text>
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};
