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
import { shortEpisode, SHORT_MAX, SHORT_MIN } from './lib/shorts.mjs';
import { langOf } from './lib/lang.mjs';
import { specProblems, tightenPlan, tiktokEpisode, TT_MAX, TT_MIN } from './lib/tiktok.mjs';
import { planNarration } from './lib/timeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Calibrated on the episode 1 render (Piper LibriTTS speaker 92, lengthScale 1.05, pause model in script.mjs).
export const WORDS_PER_SEC = 3.5;
// MarMila: Piper fr_FR siwis medium at lengthScale 1.0. French words vary a lot in length, so the
// estimate counts letters per sentence (a digit the voice reads out counts as ~6 letters) (fitted on 109 synthesized sentences: rmse 0.31 s per sentence).
export const FR_SEC_PER_LETTER = 0.0636;
export const FR_SEC_PER_SENTENCE = 0.11;
// a number the voice reads out ("10,935" -> "ten thousand nine hundred thirty-five") counts as several words
const tokenWords = (tok) => (/\d/.test(tok) ? 0.5 + 0.6 * (tok.match(/\d/g) ?? []).length : 1);
const spokenWords = (units) => units.reduce((n, u) => n + Math.max(1, u.spoken.split(/\s+/).filter(Boolean).reduce((k, t) => k + tokenWords(t), 0)), 0);
/** Seconds of speech (no pauses) for a list of TTS segments. */
export const speechSeconds = (segs, lang = 'en') =>
  lang === 'fr'
    ? segs.reduce((n, g) => n + FR_SEC_PER_SENTENCE + FR_SEC_PER_LETTER * ((g.units.map((u) => u.spoken).join(' ').match(/\p{L}/gu) ?? []).length + 6 * (g.units.map((u) => u.spoken).join(' ').match(/\d/g) ?? []).length), 0)
    : segs.reduce((n, g) => n + spokenWords(g.units), 0) / WORDS_PER_SEC;
export const SCENE_OVERHEAD = 1.0; // scene lead + tail (SCENE_LEAD + SCENE_TAIL in timeline.mjs)
export const INTRO_SEC = 2;
export const ENDSCREEN_SEC = 20;

export const estimateScene = (s, lang = 'en') => {
  const units = parseNarration(s.narration, lang);
  const segs = segmentUnits(units);
  const pauses = segs.slice(0, -1).reduce((n, g) => n + g.pause, 0) + (segs.length ? segs[segs.length - 1].extra : 0);
  return speechSeconds(segs, lang) + pauses + SCENE_OVERHEAD + (s.hold ?? 0);
};

/** Estimated length of a TikTok-rule Short (tight pauses, scene leads/tails from tiktokEpisode). */
export const estimateTiktok = (ep, sh) => {
  const lang = langOf(ep);
  const epLike = tiktokEpisode(ep, sh);
  const plan = planNarration(epLike);
  tightenPlan(plan);
  let total = 0;
  plan.forEach((p, i) => {
    const sc = epLike.scenes[i];
    const pauses = p.segments.slice(0, -1).reduce((n, g) => n + g.pause, 0) + (p.segments.length ? p.segments[p.segments.length - 1].extra ?? 0 : 0);
    total += speechSeconds(p.segments, lang) + pauses + (sc.lead ?? 0) + (sc.tail ?? 0) + (sc.hold ?? 0);
  });
  return total;
};

const trigrams = (text, lang = 'en') => {
  const w = parseNarration(text, lang).map((u) => normWord(u.display, lang)).filter(Boolean);
  const set = new Set();
  for (let i = 0; i + 2 < w.length; i++) set.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return set;
};
export const similarity = (a, b, lang = 'en', langB = lang) => {
  const A = trigrams(a, lang);
  const B = trigrams(b, langB);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(1, Math.min(A.size, B.size));
};

const checkRefs = (scenes, errors, prefix = '', lang = 'en') => {
  for (const s of scenes) {
    const words = parseNarration(s.narration, lang).map((u, i) => ({ key: normWord(u.display, lang), start: i, end: i + 0.5 }));
    const ctx = { id: s.id, start: 0, end: 999, words, lang };
    try {
      resolveDeep({ bg: s.background ?? {}, p: s.props ?? [], b: s.bix ?? [], t: s.texts ?? [], c: s.chips ?? [], f: s.sfx ?? [], cam: s.camera ?? {} }, ctx);
    } catch (e) {
      errors.push(prefix + e.message);
    }
  }
};

export const TT_EST_MARGIN = 1.0; // estimates must sit 1 s inside 15–25 s (TTS timing varies a little)
export const SHORTS_PER_EPISODE_FR = 6;
const SHOWN_SPACE_BEFORE = /[^\S\u00a0\u202f][?!;:»]|«[^\S\u00a0\u202f]/; // a normal (breakable) space where French needs a no-break one

/** French typography problems in a shown string (empty = OK). */
export const frenchTypoProblems = (s) => {
  const str = String(s).replace(/https?:\/\/\S+/g, '');
  const out = [];
  if (SHOWN_SPACE_BEFORE.test(str)) out.push(`normal space before ? ! ; : » or after « in "${str.slice(0, 60)}"`);
  if (/[\p{L}\d][?!;](?![?!;])/u.test(str)) out.push(`missing espace insécable before ? ! ; in "${str.slice(0, 60)}"`);
  if (/[\p{L}\d]:(\s|$)/u.test(str)) out.push(`missing espace insécable before : in "${str.slice(0, 60)}"`);
  return out;
};

/**
 * Episodes with inline `tiktokShorts:` (MarMila, and What If Bix from episode 6): 6 TikTok-rule Shorts (cut +
 * standalone, all different, 15–25 s), long-video metadata (end question, hashtags) and, in French, typography.
 */
const checkTiktokPack = (ep, errors, warnings, lang) => {
  const fr = lang === 'fr';
  const shorts = ep.tiktokShorts ?? [];
  if (shorts.length !== SHORTS_PER_EPISODE_FR) errors.push(`${SHORTS_PER_EPISODE_FR} tiktokShorts are required (has ${shorts.length})`);
  if (ep.shorts?.length) errors.push('episodes with tiktokShorts (TikTok rules) must not also have classic shorts');
  errors.push(...specProblems({ shorts }, ep));
  const kinds = shorts.map((s) => s.kind ?? 'cut');
  if (kinds.filter((k) => k === 'cut').length < 2) errors.push('at least 2 Shorts must be cut from the episode (kind: cut)');
  if (kinds.filter((k) => k === 'standalone').length < 2) errors.push('at least 2 Shorts must be standalone mini-stories (kind: standalone)');
  for (const k of kinds) if (!['cut', 'standalone'].includes(k)) errors.push(`unknown Short kind "${k}" (cut | standalone)`);
  const seen = new Map();
  for (const sh of shorts) {
    const tag = `short ${sh.n}-${sh.slug}`;
    for (const key of ['hook', 'youtubeTitle', 'question']) {
      const v = String(sh[key] ?? '').toLowerCase();
      if (seen.has(`${key}:${v}`)) errors.push(`${tag}: same ${key} as short ${seen.get(`${key}:${v}`)}`);
      seen.set(`${key}:${v}`, sh.n);
    }
    let est = 0;
    try {
      const epLike = tiktokEpisode(ep, sh);
      checkRefs(epLike.scenes, errors, `${tag}: `, lang);
      est = estimateTiktok(ep, sh);
    } catch (e) {
      errors.push(`${tag}: ${e.message}`);
    }
    if (est < TT_MIN + TT_EST_MARGIN || est > TT_MAX - TT_EST_MARGIN) errors.push(`${tag}: estimated ${est.toFixed(1)} s is outside ${TT_MIN + TT_EST_MARGIN}–${TT_MAX - TT_EST_MARGIN} s`);
    const tags = String(sh.tiktokCaption ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? [];
    if (new Set(['#Shorts', ...tags]).size > 5) errors.push(`${tag}: more than 5 hashtags once #Shorts is added`);
    if (fr) for (const key of ['hook', 'question', 'youtubeTitle', 'tiktokCaption']) for (const p of frenchTypoProblems(sh[key] ?? '')) errors.push(`${tag} ${key}: ${p}`);
    if (!fr && !/\?\s*\S*$/.test(sh.question ?? '')) errors.push(`${tag}: the end question must end with "?"`);
  }
  // the 6 Shorts must all be different: no two share more than 35% of their narration
  const narr = shorts.map((sh) => sh.scenes.map((s) => s.narration ?? ep.scenes.find((x) => x.id === s.like)?.narration ?? '').join(' '));
  for (let i = 0; i < narr.length; i++) for (let j = i + 1; j < narr.length; j++) {
    const sim = similarity(narr[i], narr[j], lang);
    if (sim > 0.35) errors.push(`shorts ${shorts[i].n} and ${shorts[j].n} are too similar (${(sim * 100).toFixed(0)}% shared narration)`);
  }
  if (!ep.pinnedQuestion || !/\?/.test(ep.pinnedQuestion)) errors.push('pinnedQuestion (a question for the pinned comment) is required');
  const h = ep.hashtags ?? [];
  if (h.length < 3 || h.length > 5) errors.push('3–5 hashtags are required for the long video');
  if ([...ep.title].length > 70) (fr ? warnings : errors).push('title longer than 70 characters');
  if (!fr) return;
  for (const p of [ep.title, ep.pinnedQuestion ?? '', ...(ep.scenes.flatMap((s) => (s.texts ?? []).map((t) => t.text)))].flatMap(frenchTypoProblems)) errors.push(p);
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
  const lang = langOf(ep);
  // references
  checkRefs(ep.scenes, errors, '', lang);
  const sceneSec = ep.scenes.map((s) => estimateScene(s, lang));
  const total = sceneSec.reduce((a, b) => a + b, 0);
  let videoSec = total;
  if (!isSample) {
    videoSec += INTRO_SEC + ENDSCREEN_SEC;
    if (!ep.outro?.narration) errors.push('outro.narration (spoken over the end screen) is required');
    // `lengthRange: [min, max]` (seconds) overrides the default 4–6 min (What If Bix episodes 6+: 3:45–4:30)
    const [lo, hi] = Array.isArray(ep.lengthRange) ? ep.lengthRange : [240, 360];
    if (videoSec < lo || videoSec > hi) errors.push(`estimated length ${(videoSec / 60).toFixed(2)} min is outside ${(lo / 60).toFixed(2)}–${(hi / 60).toFixed(2)} min`);
    const chapters = ep.scenes.filter((s) => s.chapter);
    if (!ep.scenes[0].chapter) errors.push('the first scene must have a chapter (YouTube chapters start at 0:00)');
    if (chapters.length < 3) errors.push('at least 3 chapters are required');
    const shorts = ep.shorts ?? [];
    if (ep.tiktokShorts || lang === 'fr') checkTiktokPack(ep, errors, warnings, lang);
    else if (shorts.length < 2 || shorts.length > 3) errors.push('2–3 shorts are required');
    for (const sh of shorts) {
      let sep;
      try {
        sep = shortEpisode(ep, sh);
      } catch (e) {
        errors.push(e.message);
        continue;
      }
      checkRefs(sep.scenes, errors, `short ${sh.id}: `);
      // first scene's lead + every scene + the CTA
      const d = sep.scenes.reduce((x, sc, i) => x + estimateScene(sc) - (i === 0 ? SCENE_OVERHEAD / 2 - (sc.lead ?? 0) : 0), 0);
      if (d < SHORT_MIN || d > SHORT_MAX) errors.push(`short ${sh.id}: estimated ${d.toFixed(1)} s is outside ${SHORT_MIN}–${SHORT_MAX} s`);
      const firstSeg = segmentUnits(parseNarration(sep.scenes[0].narration))[0];
      const words = firstSeg.units.reduce((n, u) => n + Math.max(1, u.spoken.split(/\s+/).filter(Boolean).length), 0);
      if (words / WORDS_PER_SEC > 3.5) warnings.push(`short ${sh.id}: hook line "${firstSeg.units.map((u) => u.display).join(' ')}" takes ~${(words / WORDS_PER_SEC).toFixed(1)} s to say; open with a short standalone hook`);
      if (sh.title.length > 100) errors.push(`short ${sh.id}: title longer than 100 characters`);
      if (!sh.hook) warnings.push(`short ${sh.id}: no hook banner text`);
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
      const sim = similarity(a.scenes.map((s) => s.narration).join(' '), b.scenes.map((s) => s.narration).join(' '), langOf(a), langOf(b));
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
