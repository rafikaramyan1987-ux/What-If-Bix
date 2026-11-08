import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Bix } from '../bix/Bix';
import { actionPose, BixAction } from '../bix/poses';
import { C, FONT } from '../theme';

const SHEET: BixAction[] = ['idle', 'walk', 'run', 'jump', 'fly', 'point', 'shock', 'laugh', 'think', 'shrug'];

/** All core actions side by side: used for style review and visual tests. */
export const CharacterSheet: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  const cols = 5;
  const cw = width / cols;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${C.space1}, ${C.space2})` }}>
      <svg width={1920} height={1080}>
        {SHEET.map((a, i) => {
          const x = cw * (i % cols) + cw / 2;
          const y = i < cols ? 470 : 990;
          const lt = a === 'jump' ? (t % 1.4) : t;
          const o = actionPose(a, lt, t, a === 'fly' ? { panic: 0 } : {});
          return (
            <g key={a}>
              <rect x={x - cw / 2 + 14} y={y - 430} width={cw - 28} height={500} rx={28} fill="#ffffff10" />
              <Bix x={x + (a === 'fly' ? -40 : 0)} y={y - (a === 'fly' ? 140 : 0)} scale={0.95} pose={o.pose} face={o.face} emote={o.emote} t={t} airborne={o.pose.bob} hold={a === 'idle' ? 'sandwich' : undefined} />
              <text x={x} y={y + 52} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={34} fill="#fff">{a}</text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
