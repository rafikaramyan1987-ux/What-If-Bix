import React from 'react';
import { C, FONT, TITLE_FONT } from '../theme';
import { CaptionPage, ChipSpec, TextSpec } from '../types';
import { clamp, easeOut, formatNumber, popIn } from '../util';

// ---------------------------------------------------------------- on-screen text

const STYLE: Record<NonNullable<TextSpec['style']>, { size: number; font: string; fill: string; stroke: number; y: number }> = {
  title: { size: 96, font: TITLE_FONT, fill: C.yellow, stroke: 14, y: 170 },
  big: { size: 190, font: TITLE_FONT, fill: C.white, stroke: 18, y: 300 },
  label: { size: 58, font: FONT, fill: C.white, stroke: 0, y: 260 },
  note: { size: 44, font: FONT, fill: C.white, stroke: 9, y: 360 },
  shout: { size: 130, font: TITLE_FONT, fill: C.red, stroke: 16, y: 260 },
};

/** fit (Shorts): shrink to `width` px (and to `maxSize` px font) and centre the text vertically on `cy`. */
export const OnScreenText: React.FC<{ spec: TextSpec; t: number; stageW?: number; fit?: { width: number; cy: number; maxSize?: number } }> = ({ spec, t, stageW = 1920, fit }) => {
  const st = STYLE[spec.style ?? 'label'];
  const lt = t - spec.at;
  const until = spec.until ?? 1e9;
  if (lt < 0 || t > until + 0.25) return null;
  const k = popIn(lt / 0.32);
  const out = t > until ? 1 - clamp((t - until) / 0.25) : 1;
  let text = spec.text;
  if (spec.count) {
    const c = spec.count;
    const v = c.from + (c.to - c.from) * easeOut(lt / (c.dur ?? 1.2));
    text = `${c.prefix ?? ''}${formatNumber(v, c.decimals ?? 0)}${c.suffix ?? ''}`;
  }
  const lines = text.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  const estW = longest * st.size * (spec.style === 'label' ? 0.56 : 0.62) + (spec.style === 'label' ? 70 : 0);
  // never wider than the stage (or the Shorts text band), and never past its edges
  const f = Math.min(1, (fit ? fit.width : stageW - 120) / estW, fit?.maxSize ? fit.maxSize / st.size : 1);
  const half = (estW * f) / 2;
  const x = clamp(spec.x ?? stageW / 2, Math.min(stageW / 2, half + 60), Math.max(stageW / 2, stageW - half - 60));
  const y = fit ? (spec.style === 'label' ? fit.cy : fit.cy + 0.36 * st.size * f) : spec.y ?? st.y;
  const fill = spec.color ?? st.fill;
  if (spec.style === 'label') {
    const w = Math.max(...lines.map((l) => l.length)) * st.size * 0.56 + 70;
    const h = lines.length * st.size * 1.15 + 34;
    return (
      <g transform={`translate(${x} ${y}) rotate(${spec.rotate ?? -2}) scale(${k * out * f})`}>
        <rect x={-w / 2 + 8} y={-h / 2 + 10} width={w} height={h} rx={26} fill={C.ink} opacity={0.35} />
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={26} fill={spec.color ?? C.purple} stroke={C.ink} strokeWidth={6} />
        {lines.map((l, i) => (
          <text key={i} x={0} y={-h / 2 + 17 + st.size * 0.92 + i * st.size * 1.15} textAnchor="middle" fontFamily={st.font} fontWeight={700}
            fontSize={st.size} fill={C.white}>{l}</text>
        ))}
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${spec.rotate ?? 0}) scale(${k * out * f})`}>
      {lines.map((l, i) => (
        <text key={i} x={0} y={i * st.size * 1.05} textAnchor="middle" fontFamily={st.font} fontWeight={700} fontSize={st.size}
          fill={fill} stroke={C.ink} strokeWidth={st.stroke} paintOrder="stroke" strokeLinejoin="round" letterSpacing={1}>{l}</text>
      ))}
    </g>
  );
};

// ---------------------------------------------------------------- timeline chip

const Icon: React.FC<{ kind: ChipSpec['icon']; t: number }> = ({ kind, t }) => {
  if (kind === 'bolt') return <path d="M 4 -22 L -12 4 L 0 4 L -4 22 L 12 -4 L 0 -4 Z" fill={C.yellow} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />;
  if (kind === 'globe') {
    return (
      <g>
        <circle r={20} fill={C.ocean} stroke={C.ink} strokeWidth={4} />
        <path d="M -8 -14 q 10 4 6 12 q -8 4 -10 -4 Z M 6 4 q 8 0 6 10 q -6 2 -8 -4 Z" fill={C.land} />
      </g>
    );
  }
  if (kind === 'calendar') {
    return (
      <g>
        <rect x={-19} y={-17} width={38} height={36} rx={6} fill="#fff" stroke={C.ink} strokeWidth={4} />
        <rect x={-19} y={-17} width={38} height={11} rx={4} fill={C.red} stroke={C.ink} strokeWidth={4} />
      </g>
    );
  }
  const a = t * 360;
  return (
    <g>
      <circle r={20} fill="#fff" stroke={C.ink} strokeWidth={4} />
      <line x1={0} y1={0} x2={0} y2={-13} stroke={C.ink} strokeWidth={4} strokeLinecap="round" transform={`rotate(${a})`} />
      <line x1={0} y1={0} x2={9} y2={0} stroke={C.ink} strokeWidth={4} strokeLinecap="round" transform={`rotate(${a / 12})`} />
    </g>
  );
};

export const Chip: React.FC<{ spec: ChipSpec; t: number; x?: number; y?: number; scale?: number }> = ({ spec, t, x = 70, y = 70, scale = 1 }) => {
  const lt = t - spec.at;
  const until = spec.until ?? spec.at + 2.8;
  if (lt < 0 || t > until + 0.3) return null;
  const inK = easeOut(lt / 0.35);
  const outK = t > until ? clamp((t - until) / 0.3) : 0;
  const label = spec.label.toUpperCase();
  const w = label.length * 30 + 120;
  return (
    <g transform={`translate(${x - (1 - inK) * (w + 100) - outK * (w + 100)} ${y}) scale(${scale})`}>
      <rect x={6} y={10} width={w} height={84} rx={42} fill={C.ink} opacity={0.35} />
      <rect x={0} y={0} width={w} height={84} rx={42} fill={C.yellow} stroke={C.ink} strokeWidth={6} />
      <g transform="translate(48 42)">
        <Icon kind={spec.icon ?? 'clock'} t={lt} />
      </g>
      <text x={84} y={56} fontFamily={FONT} fontWeight={700} fontSize={46} fill={C.ink} letterSpacing={1.5}>{label}</text>
    </g>
  );
};

// ---------------------------------------------------------------- captions

/** y: baseline of the last line (or of the first line when top = true); maxLines: shrink the text to fit. */
/** fadeIn: false shows each caption page at full opacity from its first frame; dim: opacity of words not yet spoken. */
export type CaptionLayout = {
  y: number; size: number; maxWidth: number; centerX: number; maxLines?: number; top?: boolean; pill?: boolean; dim?: number; fadeIn?: boolean;
};

export const LONG_CAPTIONS: CaptionLayout = { y: 985, size: 62, maxWidth: 1500, centerX: 960 };
// Shorts: inside the safe zone (clear of the right-hand buttons and bottom UI of TikTok / Shorts)
// and below the presenter spot (Bix's feet at y 1275): at most two lines, growing downward.
export const SHORT_CAPTIONS: CaptionLayout = { y: 1345, size: 76, maxWidth: 800, centerX: 480, maxLines: 2, top: true };
// TikTok-optimised Shorts: bigger captions, same safe position.
// TikTok Shorts: fully visible from frame 0 (no fade-in, no dimmed words); the spoken word still turns yellow.
export const TIKTOK_CAPTIONS: CaptionLayout = { y: 1325, size: 84, maxWidth: 800, centerX: 480, maxLines: 2, top: true, pill: true, dim: 1, fadeIn: false };

/** Word-by-word captions: the current page is shown, the spoken word pops in yellow. */
export const Captions: React.FC<{ pages: CaptionPage[]; t: number; layout: CaptionLayout }> = ({ pages, t, layout }) => {
  const page = pages.find((p) => t >= p.start - 0.05 && t <= p.end + 0.15);
  if (!page) return null;
  const { centerX, maxWidth } = layout;
  const wrap = (size: number) => {
    const space = size * 0.3;
    const widths = page.words.map((w) => w.text.length * size * 0.56 + 6);
    const lines: number[][] = [[]];
    let lw = 0;
    page.words.forEach((_, i) => {
      const w = widths[i] + space;
      if (lw + w > maxWidth && lines[lines.length - 1].length) {
        lines.push([]);
        lw = 0;
      }
      lines[lines.length - 1].push(i);
      lw += w;
    });
    return { size, space, widths, lines };
  };
  let fit = wrap(layout.size);
  while (layout.maxLines && fit.lines.length > layout.maxLines && fit.size > layout.size * 0.6) fit = wrap(fit.size * 0.92);
  const { size, space, widths, lines } = fit;
  const lineH = size * 1.2;
  const y0 = layout.top ? layout.y : layout.y - (lines.length - 1) * lineH;
  const pageIn = layout.fadeIn === false ? 1 : easeOut((t - page.start + 0.05) / 0.12);
  const lineW = lines.map((ln) => ln.reduce((sum, i) => sum + widths[i], 0) + space * (ln.length - 1));
  const pillW = Math.max(...lineW) + size * 0.9;
  return (
    <g opacity={pageIn}>
      {layout.pill && (
        <rect x={centerX - pillW / 2} y={y0 - size * 0.95} width={pillW} height={lines.length * lineH + size * 0.22} rx={size * 0.4}
          fill={C.ink} opacity={0.62} />
      )}
      {lines.map((ln, li) => {
        const total = ln.reduce((s, i) => s + widths[i], 0) + space * (ln.length - 1);
        let x = centerX - total / 2;
        return ln.map((i) => {
          const w = page.words[i];
          const active = t >= w.start && t < w.end + 0.04;
          const spoken = t >= w.start;
          const pop = active ? popIn((t - w.start) / 0.14) : 1;
          const cx = x + widths[i] / 2;
          x += widths[i] + space;
          const fill = active ? C.yellow : w.emphasis && spoken ? '#7ff0e4' : C.white;
          return (
            <text key={i} x={cx} y={y0 + li * lineH} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={size}
              fill={fill} stroke={C.ink} strokeWidth={size * 0.2} paintOrder="stroke" strokeLinejoin="round"
              opacity={spoken ? 1 : layout.dim ?? 0.55} transform={`translate(${cx} ${y0 + li * lineH}) scale(${active ? 1 + 0.12 * pop : 1}) translate(${-cx} ${-(y0 + li * lineH)})`}>
              {w.text}
            </text>
          );
        });
      })}
    </g>
  );
};
