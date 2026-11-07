// Turns a parsed episode + narration timings into the render manifest and audio plan.
import { normWord, parseNarration, segmentUnits } from './script.mjs';

// Keys whose numeric values are scene-relative times (converted to absolute).
const TIME_KEYS = new Set(['at', 'until', 'stopAt', 'windAt', 'roofAt', 'hoverUntil', 'shake']);

/** Prepare TTS segments for every scene. */
export const planNarration = (ep) =>
  ep.scenes.map((s, si) => {
    const units = parseNarration(s.narration);
    const segs = segmentUnits(units).map((g, gi) => ({ id: `s${si}_${gi}`, ...g }));
    return { scene: s.id, units, segments: segs };
  });

/**
 * Resolve an "@word" reference (or number) against a scene's words.
 * @param {string|number} ref
 * @param {{start:number,end:number,words:{key:string,start:number,end:number}[]}} ctx
 */
export const resolveTime = (ref, ctx) => {
  if (typeof ref === 'number') return ctx.start + ref;
  if (typeof ref !== 'string' || !ref.startsWith('@')) return ref;
  let body = ref.slice(1);
  let offset = 0;
  const off = body.match(/([+-]\d+(?:\.\d+)?)$/);
  if (off && off.index > 0) {
    offset = parseFloat(off[1]);
    body = body.slice(0, off.index);
  }
  let useEnd = false;
  if (body.endsWith('.end')) {
    useEnd = true;
    body = body.slice(0, -4);
  }
  let nth = 1;
  const nm = body.match(/#(\d+)$/);
  if (nm) {
    nth = parseInt(nm[1], 10);
    body = body.slice(0, nm.index);
  }
  if (body === 'start') return ctx.start + offset;
  if (body === 'end') return ctx.end + offset;
  const key = normWord(body);
  const hits = ctx.words.filter((w) => w.key === key);
  const w = hits[nth - 1];
  if (!w) throw new Error(`scene "${ctx.id}": no word "${body}"${nth > 1 ? ` #${nth}` : ''} in narration (ref "${ref}")`);
  return (useEnd ? w.end : w.start) + offset;
};

/** Deep-resolve time references inside a scene object. */
export const resolveDeep = (value, ctx, key = '') => {
  if (Array.isArray(value)) {
    if (TIME_KEYS.has(key)) return value.map((v) => resolveTime(v, ctx));
    return value.map((v) => resolveDeep(v, ctx));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveDeep(v, ctx, k);
    return out;
  }
  if (typeof value === 'string' && value.startsWith('@')) return resolveTime(value, ctx);
  if (typeof value === 'number' && TIME_KEYS.has(key)) return ctx.start + value;
  return value;
};

/**
 * Build caption pages: short groups of words, never crossing a sentence.
 */
export const buildCaptionPages = (words, { maxWords = 5, maxChars = 30 } = {}) => {
  const pages = [];
  let cur = [];
  const flush = () => {
    if (cur.length) pages.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push({ text: w.text, start: w.start, end: w.end, ...(w.emphasis ? { emphasis: true } : {}) });
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0);
    const next = words[i + 1];
    const strongBreak = w.segEnd || !next;
    const softBreak = /[,;:—–]$/.test(w.text) && cur.length >= 2;
    const nextChars = next ? chars + next.text.length : 0;
    if (strongBreak || softBreak || cur.length >= maxWords || nextChars > maxChars) flush();
  });
  flush();
  // keep a page on screen until the next one starts (no flicker in short gaps)
  for (let i = 0; i < pages.length - 1; i++) {
    const gap = pages[i + 1].start - pages[i].end;
    if (gap > 0 && gap < 0.6) pages[i].end = pages[i + 1].start - 0.02;
  }
  return pages;
};

const AUTO_SFX = (scene) => {
  const fx = [];
  for (const c of scene.chips) fx.push({ name: 'zip', at: c.at, gain: 0.45 });
  for (const tx of scene.texts) {
    if (tx.style === 'title' || tx.style === 'big') fx.push({ name: 'pop', at: tx.at, gain: 0.5 });
    if (tx.style === 'label' || tx.style === 'note') fx.push({ name: 'pop', at: tx.at, gain: 0.35 });
    if (tx.count) fx.push({ name: 'tick', at: tx.at + 0.1, gain: 0.3 }, { name: 'ding', at: tx.at + (tx.count.dur ?? 1.2), gain: 0.35 });
  }
  for (const p of scene.props) {
    if (p.type === 'boom') fx.push({ name: 'boom', at: p.at, gain: 0.8 });
    if (p.type === 'wave') fx.push({ name: 'splash', at: p.at, gain: 0.6 });
    if (p.type === 'wind') fx.push({ name: 'wind', at: p.at, gain: 0.5 });
    if (p.type === 'flyer' && typeof p.hoverUntil === 'number') fx.push({ name: 'swish', at: p.hoverUntil, gain: 0.6 });
    if (p.type === 'arrow') fx.push({ name: 'swish', at: p.at, gain: 0.35 });
  }
  for (const b of scene.bix) {
    if (b.action === 'jump') fx.push({ name: 'swish', at: b.at + 0.15, gain: 0.3 });
    if (b.action === 'shock') fx.push({ name: 'pop', at: b.at, gain: 0.3 });
  }
  if (scene.transition === 'whip') fx.push({ name: 'whoosh', at: scene.start - 0.08, gain: 0.45 });
  if (scene.transition === 'iris') fx.push({ name: 'swish', at: scene.start, gain: 0.35 });
  return fx;
};

/**
 * @param {any} ep parsed episode
 * @param {ReturnType<typeof planNarration>} plan
 * @param {Record<string, {duration:number, units:{start:number,end:number}[], file:string}>} tts by segment id
 */
export const buildTimeline = (ep, plan, tts, opts = {}) => {
  const fps = opts.fps ?? 30;
  const leadFirst = opts.leadFirst ?? 0.45;
  const lead = opts.lead ?? 0.3;
  const tailDefault = opts.tail ?? 0.4;
  const scenes = [];
  const words = [];
  const narration = [];
  const sfx = [];
  let cursor = 0;
  ep.scenes.forEach((s, si) => {
    const start = cursor;
    let t = start + (si === 0 ? leadFirst : s.lead ?? lead);
    const sceneWords = [];
    plan[si].segments.forEach((seg, gi) => {
      const r = tts[seg.id];
      if (!r) throw new Error(`missing TTS for ${seg.id}`);
      narration.push({ file: r.file, at: t });
      seg.units.forEach((u, ui) => {
        const tm = r.units[ui];
        sceneWords.push({
          text: u.display, key: normWord(u.display), start: t + tm.start, end: t + tm.end,
          emphasis: u.emphasis, segEnd: ui === seg.units.length - 1, scene: si,
        });
      });
      t += r.duration + (gi === plan[si].segments.length - 1 ? 0 : seg.pause);
    });
    const narrEnd = t;
    let end = narrEnd + (s.tail ?? tailDefault) + (s.hold ?? 0);
    if (s.minDuration) end = Math.max(end, start + s.minDuration);
    cursor = end;
    scenes.push({ src: s, start, end, words: sceneWords });
    words.push(...sceneWords);
  });

  // stretch the last scene to hit an exact target duration if requested
  if (ep.targetDuration && cursor < ep.targetDuration) {
    scenes[scenes.length - 1].end = ep.targetDuration;
    cursor = ep.targetDuration;
  }
  const duration = Math.round(cursor * fps) / fps;

  const outScenes = scenes.map(({ src: s, start, end, words: w }, si) => {
    const ctx = { id: s.id, start, end, words: w };
    const r = (v) => resolveDeep(v ?? [], ctx);
    const scene = {
      id: s.id,
      start,
      end,
      background: s.background,
      props: r(s.props),
      bix: r(s.bix).map((c) => ({ ...c })),
      bixDefaults: { pos: s.bixStart ?? [960, 820], scale: s.bixScale ?? 1, facing: s.bixFacing ?? 1 },
      texts: r(s.texts),
      chips: r(s.chips),
      camera: s.camera ? resolveDeep(s.camera, ctx) : undefined,
      transition: si === 0 ? 'cut' : s.transition ?? 'cut',
    };
    const explicit = r(s.sfx);
    const auto = s.autoSfx === false ? [] : AUTO_SFX(scene);
    sfx.push(...auto, ...explicit);
    return scene;
  });

  const captions = buildCaptionPages(words, opts.captions);
  return {
    manifest: {
      id: ep.id,
      title: ep.title,
      fps,
      width: 1920,
      height: 1080,
      duration,
      format: 'long',
      scenes: outScenes,
      captions,
    },
    audio: { duration, narration, sfx: sfx.filter((f) => f.at >= 0 && f.at < duration).sort((a, b) => a.at - b.at) },
    words,
  };
};
