#!/usr/bin/env node
// Validate episode scripts without rendering (no TTS needed).
//   node pipeline/validate.mjs episodes/ep01-*.yaml [more files]   # or: --all
// Checks: schema, "@word" references, chapters, sources, estimated video and
// Shorts lengths, and that episodes are not too similar to each other.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEpisode, normWord, parseNarration, segmentUnits } from './lib/script.mjs';
import { resolveDeep } from './lib/timeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Calibrated on the episode 1 render (Piper LibriTTS speaker 92, lengthScale 1.05, pause model in script.mjs).
export const WORDS_PER_SEC = 3.5;
export const SCENE_OVERHEAD = 1.0; // scene lead + tail (SCENE_LEAD + SCENE_TAIL in timeline.mjs)
export const INTRO_SEC = 2;
export const ENDSCREEN_SEC = 20;

export const estimateScene = (s) => {
  const units = parseNarration(s.narration);
  const segs = segmentUnits(units);
  const pauses = segs.slice(0, -1).reduce((n, g) => n + g.pause, 0) + (segs.length ? segs[segs.length - 1].extra : 0);
  const spoken = units.reduce((n, u) => n + Math.max(1, u.spoken.split(/\s+/).filter(Boolean).length), 0);
  return spoken / WORDS_PER_SEC + pauses + SCENE_OVERHEAD + (s.hold ?? 0);
};

const trigrams = (text) => {
  const w = parseNarration(text).map((u) => normWord(u.display)).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + 2 < w.length; i++) set.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return set;
};
export const similarity = (a, b) => {
  const A = trigrams(a);
  const B = trigrams(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(1, Math.min(A.size, B.size));
};

export const checkEpisode = (file) => {
  const errors = [];
  const warnings = [];
  let ep;
  try {
    ep = loadEpisode(file);
  } catch (e) {
    return { file, errors: [e.message], warnings, ep: null };
  }
  const isSample = file.includes(`${path.sep}samples${path.sep}`) || file.includes('/samples/');
  // references
  for (const s of ep.scenes) {
    const words = parseNarration(s.narration).map((u, i) => ({ key: normWord(u.display), start: i, end: i + 0.5 }));
    const ctx = { id: s.id, start: 0, end: 999, words };
    try {
      resolveDeep({ bg: s.background ?? {}, p: s.props ?? [], b: s.bix ?? [], t: s.texts ?? [], c: s.chips ?? [], f: s.sfx ?? [], cam: s.camera ?? {} }, ctx);
    } catch (e) {
      errors.push(e.message);
    }
  }
  const sceneSec = ep.scenes.map(estimateScene);
  const total = sceneSec.reduce((a, b) => a + b, 0);
  let videoSec = total;
  if (!isSample) {
    videoSec += INTRO_SEC + ENDSCREEN_SEC;
    if (!ep.outro?.narration) errors.push('outro.narration (spoken over the end screen) is required');
    if (videoSec < 240 || videoSec > 360) errors.push(`estimated length ${(videoSec / 60).toFixed(2)} min is outside 4–6 min`);
    const chapters = ep.scenes.filter((s) => s.chapter);
    if (!ep.scenes[0].chapter) errors.push('the first scene must have a chapter (YouTube chapters start at 0:00)');
    if (chapters.length < 3) errors.push('at least 3 chapters are required');
    const shorts = ep.shorts ?? [];
    if (shorts.length < 2 || shorts.length > 3) errors.push('2–3 shorts are required');
    for (const sh of shorts) {
      const a = ep.scenes.findIndex((s) => s.id === sh.from);
      const b = ep.scenes.findIndex((s) => s.id === sh.to);
      if (a < 0 || b < 0) continue;
      const d = sceneSec.slice(a, b + 1).reduce((x, y) => x + y, 0);
      if (d < 30 || d > 55) errors.push(`short ${sh.id}: estimated ${d.toFixed(1)} s is outside 30–55 s`);
      if (sh.title.length > 100) errors.push(`short ${sh.id}: title longer than 100 characters`);
    }
    if (!ep.thumbnail) errors.push('thumbnail block is required');
    if (!ep.description) errors.push('description is required');
    if (!Array.isArray(ep.tags) || ep.tags.length < 5) errors.push('at least 5 tags are required');
    if (ep.title.length > 100) errors.push('title longer than 100 characters');
    const srcs = ep.sources ?? [];
    if (srcs.length < 3) errors.push('at least 3 sources are required');
    for (const s of srcs) if (!/https?:\/\//.test(String(s))) warnings.push(`source without URL: ${String(s).slice(0, 60)}`);
  }
  return { file, ep, errors, warnings, videoSec, sceneSec };
};

const main = () => {
  const args = process.argv.slice(2);
  let files = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--all') || !files.length) {
    const dir = path.join(ROOT, 'episodes');
    files = fs.readdirSync(dir).filter((f) => /\.(ya?ml|md)$/.test(f)).map((f) => path.join(dir, f));
    files.push(...fs.readdirSync(path.join(dir, 'samples')).map((f) => path.join(dir, 'samples', f)));
  }
  let bad = 0;
  const results = files.map(checkEpisode);
  for (const r of results) {
    const head = r.ep ? `${r.ep.id} (~${(r.videoSec / 60).toFixed(2)} min)` : path.basename(r.file);
    console.log(`${r.errors.length ? '✗' : '✓'} ${head}`);
    for (const e of r.errors) console.log(`    error: ${e}`);
    for (const w of r.warnings) console.log(`    warn:  ${w}`);
    bad += r.errors.length;
  }
  // cross-episode uniqueness (YouTube "repetitive content" guard)
  const eps = results.filter((r) => r.ep && !r.file.includes('samples'));
  for (let i = 0; i < eps.length; i++) {
    for (let j = i + 1; j < eps.length; j++) {
      const a = eps[i].ep;
      const b = eps[j].ep;
      const sim = similarity(a.scenes.map((s) => s.narration).join(' '), b.scenes.map((s) => s.narration).join(' '));
      if (sim > 0.08) {
        console.log(`✗ ${a.id} vs ${b.id}: narration overlap ${(sim * 100).toFixed(1)}% (max 8%)`);
        bad++;
      }
      const seqA = a.scenes.map((s) => s.background.type).join(',');
      const seqB = b.scenes.map((s) => s.background.type).join(',');
      if (seqA === seqB) {
        console.log(`✗ ${a.id} vs ${b.id}: identical background sequence`);
        bad++;
      }
      if (a.outro?.narration && a.outro.narration === b.outro?.narration) {
        console.log(`✗ ${a.id} vs ${b.id}: identical outro narration`);
        bad++;
      }
    }
  }
  if (bad) {
    console.log(`\n${bad} problem(s)`);
    process.exit(1);
  }
  console.log('\nall scripts valid');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
