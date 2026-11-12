// TikTok-optimised Shorts: 15–25 s, one idea, hook in the first second, a loop back to
// the opening line, an end question instead of a SUBSCRIBE screen, a visual change at
// least every 1.5 s. Specs live in shorts-tiktok/<episode-id>/shorts.yaml.
import fs from 'node:fs';
import YAML from 'yaml';
import { showFromFrameZero } from './shorts.mjs';

export const TT_MIN = 15;
export const TT_MAX = 25; // exclusive: every Short must be under 25 s
export const MAX_GAP = 1.5; // longest allowed stretch without a visual change (s)
export const FIRST_WORD_MAX = 0.3; // the first word must start within this (s)
export const QUESTION_SECONDS = 2;
export const TT_MUSIC = { gain: 0.12, duck: 0.45 }; // music lower than in the long episodes

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);
const hashtags = (s) => String(s).match(/#[\p{L}\p{N}_]+/gu) ?? [];

/** Spec problems (empty = OK): text limits for the hook, captions, titles and question. */
export const specProblems = (spec, ep) => {
  const out = [];
  const ids = new Set(ep.scenes.map((s) => s.id));
  const seen = new Set();
  for (const sh of spec.shorts ?? []) {
    const tag = `short ${sh.n ?? '?'}-${sh.slug ?? '?'}`;
    if (!Number.isInteger(sh.n) || seen.has(sh.n)) out.push(`${tag}: n must be a unique integer`);
    seen.add(sh.n);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(sh.slug ?? '')) out.push(`${tag}: slug must be kebab-case`);
    if (!sh.hook || words(sh.hook).length > 6) out.push(`${tag}: hook must be 1–6 words (got "${sh.hook ?? ''}")`);
    if (!sh.question || !/\?/.test(sh.question)) out.push(`${tag}: question must be a question`);
    if (sh.question && sh.question.length > 40) out.push(`${tag}: question longer than 40 characters`);
    if (!sh.tiktokCaption || [...sh.tiktokCaption].length > 150) out.push(`${tag}: TikTok caption must be 1–150 characters`);
    const n = hashtags(sh.tiktokCaption ?? '').length;
    if (n < 3 || n > 5) out.push(`${tag}: TikTok caption needs 3–5 hashtags (has ${n})`);
    if (!sh.youtubeTitle || [...sh.youtubeTitle].length > 60) out.push(`${tag}: YouTube title must be 1–60 characters`);
    if (!Array.isArray(sh.scenes) || sh.scenes.length < 2) out.push(`${tag}: needs at least 2 scenes`);
    for (const s of sh.scenes ?? []) if (!ids.has(s.like)) out.push(`${tag}: unknown scene "${s.like}"`);
    if (sh.scenes?.length && sh.scenes[0].like !== sh.scenes[sh.scenes.length - 1].like) {
      out.push(`${tag}: the last scene must reuse the first scene ("like: ${sh.scenes[0].like}") so the loop is seamless`);
    }
  }
  return out;
};

export const loadTiktokSpec = (file) => YAML.parse(fs.readFileSync(file, 'utf8'));

/**
 * One spec entry -> an episode-like object for buildTimeline(): scenes copied from the
 * episode (`like:`) with overrides, hard cuts, tight leads/tails, no CTA scene.
 */
export const tiktokEpisode = (ep, sh) => {
  const byId = Object.fromEntries(ep.scenes.map((s) => [s.id, s]));
  const scenes = sh.scenes.map((o, i) => {
    const { like, ...over } = o;
    const merged = { ...byId[like], ...over, id: `${like}--${i}`, transition: 'cut' };
    delete merged.chapter;
    delete merged.sfx; // keep the voice clear: no long ambience from the long version
    merged.lead = o.lead ?? (i === 0 ? 0.02 : 0.08);
    merged.tail = o.tail ?? (i === sh.scenes.length - 1 ? 0.25 : 0.1);
    merged.hold = o.hold ?? 0;
    return merged;
  });
  return {
    id: `${ep.id}-tt${sh.n}`,
    title: sh.youtubeTitle,
    voice: ep.voice,
    character: ep.character,
    ...(ep.language ? { language: ep.language } : {}),
    music: { ...(ep.music ?? { style: 'curious' }), ...TT_MUSIC, offset: sh.musicOffset ?? 19.2, fadeOut: 0 },
    scenes,
    short: sh,
  };
};

/** Tighter pauses than the long episodes (fast pacing). */
export const tightenPlan = (plan) => {
  for (const p of plan) for (const seg of p.segments) {
    seg.pause = Math.min(seg.pause * 0.55, 0.45);
    if (seg.extra) seg.extra *= 0.4;
  }
};

/**
 * Visual events (cuts, caption pages, on-screen texts, Bix action changes) and the snap-zoom
 * beats added so that no stretch is longer than `maxGap` without a visual change. New
 * sentences also get a snap zoom.
 */
export const pacingBeats = (manifest, narration, { maxGap = 1.2 } = {}) => {
  const end = manifest.duration;
  const events = new Set();
  for (const s of manifest.scenes) if (s.start > 0.01) events.add(s.start);
  for (const p of manifest.captions) events.add(p.start);
  for (const s of manifest.scenes) {
    for (const tx of s.texts ?? []) events.add(tx.at);
    for (const c of s.bix ?? []) if (c.at > s.start + 0.05) events.add(c.at);
  }
  const cuts = new Set(manifest.scenes.map((s) => s.start));
  const beats = [];
  // a snap zoom on every new sentence that doesn't start on a cut
  for (const n of narration) if (n.at > 0.3 && n.at < end - 0.6 && ![...cuts].some((c) => Math.abs(c - n.at) < 0.35)) beats.push(n.at);
  // fill long stretches
  const all = () => [0, ...events, ...beats, end].filter((x) => x >= 0 && x <= end).sort((a, b) => a - b);
  for (let guard = 0; guard < 100; guard++) {
    const a = all();
    let worst = -1;
    for (let i = 1; i < a.length; i++) if (a[i] - a[i - 1] > maxGap && (worst < 0 || a[i] - a[i - 1] > a[worst] - a[worst - 1])) worst = i;
    if (worst < 0) break;
    beats.push((a[worst] + a[worst - 1]) / 2);
  }
  const sorted = [...new Set(beats.map((b) => Math.round(b * 100) / 100))].sort((a, b) => a - b);
  return { beats: sorted, events: [...events, ...sorted].sort((a, b) => a - b) };
};

/** Longest stretch (s) without a visual change, start to end. */
export const longestGap = (events, end) => {
  const a = [0, ...events.filter((x) => x >= 0 && x <= end), end].sort((x, y) => x - y);
  let g = 0;
  for (let i = 1; i < a.length; i++) g = Math.max(g, a[i] - a[i - 1]);
  return g;
};

/** Finish a TikTok Short manifest. */
export const toTiktokManifest = (manifest, sh, narration) => {
  const m = { ...manifest, format: 'short', width: 1080, height: 1920, timeOffset: 0, hook: sh.hook.toUpperCase(), scenes: showFromFrameZero(manifest.scenes) };
  // MarMila: the first caption page is on screen from frame 0 (no blank first frames)
  if (manifest.lang === 'fr' && m.captions.length) m.captions = [{ ...m.captions[0], start: 0 }, ...m.captions.slice(1)];
  const { beats, events } = pacingBeats(m, narration);
  m.tiktok = { beats, question: sh.question, questionAt: Math.max(0, m.duration - QUESTION_SECONDS) };
  return { manifest: m, events };
};

/** Production checks on a finished manifest (empty = OK). */
export const tiktokProblems = (manifest, events) => {
  const out = [];
  if (manifest.lang === 'fr' && !(manifest.captions[0]?.start <= 0)) out.push('captions must be visible from frame 0');
  const d = manifest.duration;
  if (d < TT_MIN || d >= TT_MAX) out.push(`length ${d.toFixed(1)} s is outside ${TT_MIN}–${TT_MAX} s`);
  const first = manifest.captions[0]?.words[0]?.start ?? Infinity;
  if (first > FIRST_WORD_MAX) out.push(`first word starts at ${first.toFixed(2)} s (max ${FIRST_WORD_MAX} s)`);
  const gap = longestGap(events, d);
  if (gap > MAX_GAP) out.push(`${gap.toFixed(2)} s without a visual change (max ${MAX_GAP} s)`);
  if (manifest.scenes.some((s) => s.kind === 'cta')) out.push('has a CTA/subscribe scene');
  return out;
};

/** The .txt sidecar: hook, TikTok caption, YouTube Shorts title, end question. */
export const sidecarText = (sh, duration) => [
  `On-screen hook: ${sh.hook.toUpperCase()}`,
  `TikTok caption: ${sh.tiktokCaption}`,
  `YouTube Shorts title: ${sh.youtubeTitle}`,
  `End question: ${sh.question}`,
  `Length: ${duration.toFixed(1)} s`,
  '',
].join('\n');

/** The TikTok-rule Shorts spec of an episode: inline `tiktokShorts:` (MarMila) or shorts-tiktok/<id>/shorts.yaml. */
export const tiktokSpecOf = (ep, file) => (ep.tiktokShorts ? { episode: ep.id, shorts: ep.tiktokShorts } : file && fs.existsSync(file) ? loadTiktokSpec(file) : null);
