// Episode script loading, validation and narration parsing.
import fs from 'node:fs';
import YAML from 'yaml';

import { BACKGROUNDS, BIX_ACTIONS, CHIP_ICONS, ITEMS, MUSIC_STYLES, PROPS, SFX, TEXT_STYLES, TRANSITIONS } from './vocab.mjs';
import { frTypo, LANGUAGES, normWordFor, plainSpaces, unitSplitter } from './lang.mjs';

export { BACKGROUNDS, BIX_ACTIONS, PROPS, SFX };

const SENTENCE_END = /([.!?]["'”’)\]]*|\.\.\.|…)$/;

// Pause model (seconds). Base pauses follow punctuation; extra "beats" give jokes,
// key numbers and explicit [beat] markers room to land.
export const PAUSE = {
  ellipsis: 0.42, question: 0.3, period: 0.24, other: 0.15,
  number: 0.35, // after a sentence that states a number
  punch: 0.35, // after a short punchy sentence (≤ 4 words) — usually a joke
  exclaim: 0.15, // extra after "!"
  beat: 0.4, // default for an explicit [beat]
  max: 0.9,
};

/**
 * Split narration text into caption/TTS units.
 * Markup: {shown|spoken} replaces spoken text; *word* marks emphasis;
 * [beat] or [beat 0.5] inserts a pause after the previous word.
 * @param {string} text
 * @returns {{display: string, spoken: string, emphasis: boolean, beat?: number}[]}
 */
export const parseNarration = (text, lang = 'en') => {
  const subs = [];
  const fr = lang === 'fr';
  const marked = (fr ? frTypo(text) : text)
    .replace(/\[beat(?:\s+(\d*\.?\d+))?\]/gi, (_, secs) => ` \u0003${secs ?? PAUSE.beat}\u0004 `)
    .replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, d, s) => {
      subs.push([d, s]);
      return `\u0001${subs.length - 1}\u0002`;
    });
  const out = [];
  for (const chunk of marked.split(unitSplitter(lang)).filter(Boolean)) {
    const beat = chunk.match(/^\u0003([\d.]+)\u0004$/);
    if (beat) {
      if (out.length) out[out.length - 1].beat = (out[out.length - 1].beat ?? 0) + parseFloat(beat[1]);
      continue;
    }
    let emphasis = false;
    let c = chunk;
    if (/\*/.test(c)) {
      emphasis = true;
      c = c.replace(/\*/g, '');
    }
    const restore = (which) => c.replace(/\u0001(\d+)\u0002/g, (_, i) => subs[Number(i)][which]);
    const display = restore(0);
    // French: the voice gets plain spaces and straight apostrophes; captions keep the typography
    const spoken = fr ? plainSpaces(restore(1)).replace(/’/g, "'").trim() : restore(1);
    if (display.length || spoken.length) out.push({ display, spoken, emphasis });
  }
  return out;
};

/** Base pause (seconds) after a unit that ends a segment, from its punctuation. */
export const pauseAfter = (display) => {
  if (/(\.\.\.|…)["'”’)]*$/.test(display)) return PAUSE.ellipsis;
  if (/[?!]["'”’)]*$/.test(display)) return PAUSE.question;
  if (/\.["'”’)]*$/.test(display)) return PAUSE.period;
  return PAUSE.other;
};

/** Extra beat after a segment: key numbers, short punchlines, "!", explicit [beat]. */
export const beatAfter = (units) => {
  const last = units[units.length - 1];
  let extra = 0;
  if (units.some((u) => /\d/.test(u.display))) extra += PAUSE.number;
  if (units.length <= 4 && /[.!]["'”’)]*$/.test(last.display) && !/(\.\.\.|…)$/.test(last.display)) extra += PAUSE.punch;
  if (/!["'”’)]*$/.test(last.display)) extra += PAUSE.exclaim;
  if (last.beat) extra += last.beat;
  return extra;
};

/**
 * Group units into TTS segments (sentences, ellipsis-separated phrases, or up to a [beat]).
 * `pause` = base + extra beat (capped); `extra` is the beat part, also added to a scene's tail.
 * @returns {{units: ReturnType<typeof parseNarration>, pause: number, extra: number}[]}
 */
export const segmentUnits = (units) => {
  const out = [];
  let cur = [];
  units.forEach((u, i) => {
    cur.push(u);
    const last = i === units.length - 1;
    if (SENTENCE_END.test(u.display) || u.beat || last) {
      const base = pauseAfter(u.display);
      const extra = beatAfter(cur);
      out.push({ units: cur, pause: Math.min(PAUSE.max, base + extra), extra: Math.min(PAUSE.max - base, extra) });
      cur = [];
    }
  });
  return out;
};

/** Normalise a word for "@word" matching (French: accents and typographic spaces too). */
export const normWord = (w, lang = 'en') => normWordFor(w, lang);

const fail = (file, msg) => {
  throw new Error(`${file}: ${msg}`);
};

/**
 * Load and validate an episode script (YAML, or Markdown with a ```yaml block / front matter).
 */
export const loadEpisode = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  return parseEpisode(raw, file);
};

export const parseEpisode = (raw, file = 'episode') => {
  let yamlText = raw;
  if (/\.md$/i.test(file)) {
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    const block = raw.match(/```ya?ml\n([\s\S]*?)```/);
    yamlText = block ? block[1] : fm ? fm[1] : fail(file, 'no YAML block found');
  }
  const ep = YAML.parse(yamlText);
  validateEpisode(ep, file);
  return ep.language === 'fr' ? applyFrenchTypography(ep) : ep;
};

export const validateEpisode = (ep, file = 'episode') => {
  if (!ep || typeof ep !== 'object') fail(file, 'empty script');
  for (const k of ['id', 'title', 'scenes']) if (!ep[k]) fail(file, `missing "${k}"`);
  if (!/^[a-z0-9-]+$/.test(ep.id)) fail(file, `id "${ep.id}" must be lowercase letters, digits and dashes`);
  if (!Array.isArray(ep.scenes) || !ep.scenes.length) fail(file, 'scenes must be a non-empty list');
  const ids = new Set();
  ep.scenes.forEach((s, i) => {
    const where = `scene ${i + 1} (${s.id ?? '?'})`;
    if (!s.id) fail(file, `${where}: missing id`);
    if (ids.has(s.id)) fail(file, `${where}: duplicate id`);
    ids.add(s.id);
    if (!s.background?.type) fail(file, `${where}: background.type is required`);
    if (!BACKGROUNDS.includes(s.background.type)) fail(file, `${where}: unknown background "${s.background.type}"`);
    if (typeof s.narration !== 'string' || !s.narration.trim()) fail(file, `${where}: narration is required`);
    for (const c of s.bix ?? []) {
      if (!BIX_ACTIONS.includes(c.action)) fail(file, `${where}: unknown Bix action "${c.action}"`);
      if (c.hold && !ITEMS.includes(c.hold)) fail(file, `${where}: unknown held item "${c.hold}"`);
    }
    for (const p of s.props ?? []) {
      if (!PROPS.includes(p.type)) fail(file, `${where}: unknown prop "${p.type}"`);
      if ((p.type === 'item' || p.type === 'flyer') && p.item && !ITEMS.includes(p.item)) fail(file, `${where}: unknown item "${p.item}"`);
      for (const a of p.actions ?? []) if (!BIX_ACTIONS.includes(a.action)) fail(file, `${where}: unknown pal action "${a.action}"`);
      if (p.action && !BIX_ACTIONS.includes(p.action)) fail(file, `${where}: unknown pal action "${p.action}"`);
    }
    for (const tx of s.texts ?? []) {
      if (tx.style && !TEXT_STYLES.includes(tx.style)) fail(file, `${where}: unknown text style "${tx.style}"`);
      if (typeof tx.text !== 'string') fail(file, `${where}: text entries need "text"`);
    }
    for (const c of s.chips ?? []) {
      if (!c.label) fail(file, `${where}: chips need a label`);
      if (c.icon && !CHIP_ICONS.includes(c.icon)) fail(file, `${where}: unknown chip icon "${c.icon}"`);
    }
    if (s.transition && !TRANSITIONS.includes(s.transition)) fail(file, `${where}: unknown transition "${s.transition}"`);
    for (const fx of s.sfx ?? []) {
      if (!SFX.includes(fx.name)) fail(file, `${where}: unknown sfx "${fx.name}"`);
    }
  });
  if (ep.language !== undefined && !LANGUAGES.includes(ep.language)) fail(file, `language must be one of ${LANGUAGES.join(', ')}`);
  if (ep.character && !['bix1', 'bix2'].includes(ep.character)) fail(file, `character must be bix1 or bix2`);
  if (ep.music?.style && !MUSIC_STYLES.includes(ep.music.style)) fail(file, `unknown music style "${ep.music.style}"`);
  for (const sh of ep.shorts ?? []) {
    if (!sh.id || !sh.title || !sh.from || !sh.to) fail(file, 'shorts need id, title, from, to');
    const a = ep.scenes.findIndex((s) => s.id === sh.from);
    const b = ep.scenes.findIndex((s) => s.id === sh.to);
    if (a < 0 || b < 0 || b < a) fail(file, `short ${sh.id}: from/to must be scene ids in order`);
  }
  if (ep.introAfter && !ids.has(ep.introAfter)) fail(file, `introAfter "${ep.introAfter}" is not a scene id`);
  if (ep.sources !== undefined && !Array.isArray(ep.sources)) fail(file, 'sources must be a list');
  return true;
};

// Text fields that are shown on screen or published (narration is handled by parseNarration).
const SHOWN_KEYS = new Set(['text', 'label', 'title', 'lines', 'labels', 'sub', 'display', 'subtitle', 'hook', 'question', 'youtubeTitle', 'tiktokCaption', 'description', 'pinnedQuestion']);

const typoDeep = (v, key = '') => {
  if (typeof v === 'string') return SHOWN_KEYS.has(key) ? frTypo(v) : v;
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? (SHOWN_KEYS.has(key) ? frTypo(x) : x) : typoDeep(x)));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = k === 'narration' || k === 'sources' ? x : typoDeep(x, k);
    return out;
  }
  return v;
};

/** French episodes: French typography (espaces insécables, apostrophes) on every shown text. */
export const applyFrenchTypography = (ep) => {
  const out = typoDeep(ep);
  out.title = frTypo(ep.title);
  return out;
};
