// Episode script loading, validation and narration parsing.
import fs from 'node:fs';
import YAML from 'yaml';

export const BIX_ACTIONS = [
  'idle', 'walk', 'run', 'jump', 'fly', 'point', 'shock', 'laugh', 'think',
  'shrug', 'wave', 'tumble', 'facepalm', 'sleepy', 'cheer', 'float', 'sit', 'present',
];
export const BACKGROUNDS = ['space', 'sky', 'land', 'plain', 'lab', 'city', 'night-city', 'bedroom', 'ocean', 'moon'];
export const SFX = ['whoosh', 'pop', 'boing', 'screech', 'boom', 'ding', 'tick', 'rumble', 'wind', 'splash', 'thud', 'sparkle', 'swish', 'zip'];

const SENTENCE_END = /([.!?]["'”’)\]]*|\.\.\.|…)$/;

/**
 * Split narration text into caption/TTS units.
 * Markup: {shown|spoken} replaces spoken text; *word* marks emphasis.
 * @param {string} text
 * @returns {{display: string, spoken: string, emphasis: boolean}[]}
 */
export const parseNarration = (text) => {
  const subs = [];
  const marked = text.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, d, s) => {
    subs.push([d, s]);
    return `\u0001${subs.length - 1}\u0002`;
  });
  return marked
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => {
      let emphasis = false;
      let c = chunk;
      if (/\*/.test(c)) {
        emphasis = true;
        c = c.replace(/\*/g, '');
      }
      const restore = (which) => c.replace(/\u0001(\d+)\u0002/g, (_, i) => subs[Number(i)][which]);
      const display = restore(0);
      const spoken = restore(1);
      return { display, spoken, emphasis };
    })
    .filter((u) => u.display.length || u.spoken.length);
};

/** Pause (seconds) to leave after a unit that ends a segment. */
export const pauseAfter = (display) => {
  if (/(\.\.\.|…)["'”’)]*$/.test(display)) return 0.42;
  if (/[?!]["'”’)]*$/.test(display)) return 0.3;
  if (/\.["'”’)]*$/.test(display)) return 0.24;
  return 0.15;
};

/**
 * Group units into TTS segments (sentences or ellipsis-separated phrases).
 * @returns {{units: ReturnType<typeof parseNarration>, pause: number}[]}
 */
export const segmentUnits = (units) => {
  const out = [];
  let cur = [];
  units.forEach((u, i) => {
    cur.push(u);
    const last = i === units.length - 1;
    if (SENTENCE_END.test(u.display) || last) {
      out.push({ units: cur, pause: pauseAfter(u.display) });
      cur = [];
    }
  });
  return out;
};

/** Normalise a word for "@word" matching. */
export const normWord = (w) =>
  String(w)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

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
  return ep;
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
    }
    for (const fx of s.sfx ?? []) {
      if (!SFX.includes(fx.name)) fail(file, `${where}: unknown sfx "${fx.name}"`);
    }
  });
  if (ep.sources !== undefined && !Array.isArray(ep.sources)) fail(file, 'sources must be a list');
  return true;
};
