import React from 'react';
import { C } from '../theme';

/** Small props drawn at the origin, sized for Bix's hand (≈ 60 px). */
export const Sandwich: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <g transform={`scale(${s}) translate(-4 -30)`} strokeLinejoin="round">
    <path d="M -34 18 Q -36 6 -22 4 L 26 4 Q 40 6 36 18 Z" fill="#f2b45a" stroke={C.ink} strokeWidth={4.5} />
    <path d="M -36 4 q 8 -8 16 0 t 16 0 t 16 0 t 16 0 t 8 0 L 34 10 L -34 10 Z" fill="#5ed36a" stroke={C.ink} strokeWidth={4} />
    <rect x={-30} y={-6} width={60} height={9} rx={3} fill={C.red} stroke={C.ink} strokeWidth={4} />
    <rect x={-32} y={-13} width={64} height={8} rx={2} fill="#ffd447" stroke={C.ink} strokeWidth={4} />
    <path d="M -34 -12 Q -36 -34 0 -36 Q 36 -34 34 -12 Z" fill="#f7c46d" stroke={C.ink} strokeWidth={4.5} />
    <ellipse cx={-10} cy={-26} rx={2.5} ry={1.5} fill="#fff1c9" />
    <ellipse cx={6} cy={-29} rx={2.5} ry={1.5} fill="#fff1c9" />
    <ellipse cx={18} cy={-24} rx={2.5} ry={1.5} fill="#fff1c9" />
  </g>
);

export const Mug: React.FC = () => (
  <g transform="translate(-6 -26)" strokeLinejoin="round">
    <rect x={-16} y={-10} width={32} height={38} rx={6} fill={C.teal} stroke={C.ink} strokeWidth={4.5} />
    <path d="M 16 0 q 14 0 14 10 q 0 10 -14 10" fill="none" stroke={C.ink} strokeWidth={4.5} />
    <path d="M -6 -16 q -4 -8 2 -14 M 6 -16 q -4 -8 2 -14" stroke="#ffffff" strokeWidth={3} fill="none" opacity={0.8} />
  </g>
);

export const Phone: React.FC = () => (
  <g transform="translate(0 -18) rotate(-10)">
    <rect x={-14} y={-26} width={28} height={50} rx={6} fill={C.ink} />
    <rect x={-10} y={-21} width={20} height={38} rx={3} fill="#7fd3ff" />
  </g>
);

export const Clipboard: React.FC = () => (
  <g transform="translate(6 -30) rotate(8)">
    <rect x={-22} y={-28} width={44} height={58} rx={5} fill="#c98a4b" stroke={C.ink} strokeWidth={4.5} />
    <rect x={-16} y={-20} width={32} height={44} rx={2} fill="#ffffff" />
    <rect x={-8} y={-32} width={16} height={9} rx={3} fill={C.grey} stroke={C.ink} strokeWidth={3} />
    {[-12, -4, 4, 12].map((y) => <line key={y} x1={-11} y1={y} x2={11} y2={y} stroke={C.grey} strokeWidth={3} />)}
  </g>
);

export const Pillow: React.FC = () => (
  <g transform="translate(0 -24)">
    <path d="M -44 -22 Q 0 -34 44 -22 Q 52 0 44 22 Q 0 34 -44 22 Q -52 0 -44 -22 Z" fill="#ffffff" stroke={C.ink} strokeWidth={4.5} />
    <path d="M -30 -6 q 30 10 60 0" stroke="#d9deec" strokeWidth={4} fill="none" />
  </g>
);

export const Laptop: React.FC = () => (
  <g transform="translate(0 -24)">
    <rect x={-36} y={-34} width={72} height={46} rx={5} fill={C.ink} />
    <rect x={-30} y={-29} width={60} height={36} rx={3} fill="#7fd3ff" />
    <path d="M -46 12 L 46 12 L 40 22 L -40 22 Z" fill={C.grey} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
  </g>
);

export const Book: React.FC = () => (
  <g transform="translate(0 -26) rotate(-8)">
    <rect x={-30} y={-36} width={60} height={72} rx={5} fill={C.purple} stroke={C.ink} strokeWidth={4.5} />
    <rect x={-22} y={-24} width={44} height={14} rx={3} fill="#fff" />
  </g>
);

export const Coin: React.FC = () => (
  <g transform="translate(0 -22)">
    <circle r={24} fill={C.yellow} stroke={C.ink} strokeWidth={4.5} />
    <circle r={15} fill="none" stroke={C.orange} strokeWidth={4} />
  </g>
);

export const Held: React.FC<{ kind: string }> = ({ kind }) => {
  switch (kind) {
    case 'sandwich':
      return <Sandwich s={0.85} />;
    case 'mug':
      return <Mug />;
    case 'phone':
      return <Phone />;
    case 'clipboard':
      return <Clipboard />;
    case 'pillow':
      return <Pillow />;
    case 'laptop':
      return <Laptop />;
    case 'book':
      return <Book />;
    case 'coin':
      return <Coin />;
    default:
      return null;
  }
};
