// Turns a parsed episode + narration timings into the render manifest and audio plan.
import { normWord, parseNarration, segmentUnits } from './script.mjs';
import { frMatches } from './lang.mjs';

// Keys whose numeric values are scene-relative times (converted to absolute).
export const TIME_KEYS = new Set([
  'at', 'until', 'stopAt', 'windAt', 'roofAt', 'hoverUntil', 'shake', 'switchAt', 'crossAt', 'failAt', 'cutAt',
  'jumpAt', 'cheerAt', 'panicAt', 'spikeAt', 'shakeAt', 'moveAt', 'stateAt', 'lightsOffAt', 'eyeAt', 'blowAt', 'swapAt', 'swaps', 'bothAt', 'floatAt', 'heatAt', 'pauseAt',
  'fallAt', 'alarmAt', 'spawnAt',
]);

export const INTRO_SECONDS = 2;
export const SCENE_LEAD = 0.5;
export const SCENE_TAIL = 0.5;
export const ENDSCREEN_SECONDS = 20;
/** MarMila end screen: when the animated ABONNE-TOI button pops in, rings and is pressed (s from the end-screen start; mirrored in Channel.tsx). */
export const ENDSCREEN_ANIM = { popAt: 1.0, bellAt: 1.35, pressAt: 3.2 };

/**
 * Scenes in render order. Full episodes (those with an `outro`) get the channel
 * intro sting after `introAfter` (default: the first scene) and a 20 s end screen.
 */
export const expandScenes = (ep) => {
  if (!ep.outro) return ep.scenes;
  const idx = ep.introAfter ? ep.scenes.findIndex((s) => s.id === ep.introAfter) : 0;
  const intro = {
    id: '_intro', kind: 'intro', background: { type: 'plain' }, narration: '', minDuration: INTRO_SECONDS, lead: 0, tail: 0, hold: 0,
  };
  const end = {
    id: '_endscreen', kind: 'endscreen', background: ep.outro.background ?? { type: 'space' }, narration: ep.outro.narration,
    minDuration: ENDSCREEN_SECONDS, lead: 0.9, tail: 0, transition: 'fade',
  };
  return [...ep.scenes.slice(0, idx + 1), intro, ...ep.scenes.slice(idx + 1), end];
};

/** Prepare TTS segments for every scene. */
export const planNarration = (ep) =>
  expandScenes(ep).map((s, si) => {
    const units = parseNarration(s.narration, ep.language);
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
  const key = normWord(body, ctx.lang);
  const hits = ctx.lang === 'fr' ? ctx.words.filter((w) => frMatches(w.key, key)) : ctx.words.filter((w) => w.key === key);
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
  // fold a lone trailing word ("east.") into the page before it when they belong together
  for (let i = pages.length - 1; i > 0; i--) {
    const p = pages[i];
    const prev = pages[i - 1];
    const sameSentence = !/[.!?…]["'”’)]*$/.test(prev.words[prev.words.length - 1].text);
    if (p.words.length === 1 && sameSentence && p.start - prev.end < 0.2 && prev.words.length <= maxWords) {
      prev.words.push(...p.words);
      prev.end = p.end;
      pages.splice(i, 1);
    }
  }
  // merge very short comma fragments ("the air,") with the next page of the same sentence
  for (let i = 0; i < pages.length - 1; i++) {
    const p = pages[i];
    const next = pages[i + 1];
    const endsSentence = /[.!?…]["'”’)]*$/.test(p.words[p.words.length - 1].text);
    if (!endsSentence && p.end - p.start < 0.45 && next.start - p.end < 0.2 && p.words.length + next.words.length <= maxWords + 1) {
      p.words.push(...next.words);
      p.end = next.end;
      pages.splice(i + 1, 1);
      i--;
    }
  }
  // keep a page on screen until the next one starts (no flicker in short gaps)
  for (let i = 0; i < pages.length - 1; i++) {
    const gap = pages[i + 1].start - pages[i].end;
    if (gap > 0 && gap < 1.0) pages[i].end = pages[i + 1].start - 0.02;
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
  if (scene.kind === 'cta') {
    // button pops in, bell rings, button gets pressed (matches the CTA animation timing)
    const d = scene.end - scene.start;
    fx.push({ name: 'pop', at: scene.start + 0.02, gain: 0.6 }, { name: 'ding', at: scene.start + 0.35, gain: 0.55 },
      { name: 'pop', at: scene.start + d * 0.55, gain: 0.5 }, { name: 'sparkle', at: scene.start + d * 0.58, gain: 0.4 });
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
  const lead = opts.lead ?? SCENE_LEAD; // breathing room after a scene change
  const tailDefault = opts.tail ?? SCENE_TAIL;
  const scenes = [];
  const words = [];
  const narration = [];
  const sfx = [];
  let cursor = 0;
  const all = expandScenes(ep);
  all.forEach((s, si) => {
    const start = cursor;
    let t = start + (s.lead ?? (si === 0 ? leadFirst : lead));
    const sceneWords = [];
    plan[si].segments.forEach((seg, gi) => {
      const r = tts[seg.id];
      if (!r) throw new Error(`missing TTS for ${seg.id}`);
      narration.push({ file: r.file, at: t });
      seg.units.forEach((u, ui) => {
        const tm = r.units[ui];
        sceneWords.push({
          text: u.display, key: normWord(u.display, ep.language), start: t + tm.start, end: t + tm.end,
          emphasis: u.emphasis, segEnd: ui === seg.units.length - 1, scene: si,
        });
      });
      t += r.duration + (gi === plan[si].segments.length - 1 ? 0 : seg.pause);
    });
    const narrEnd = t;
    const segs = plan[si].segments;
    const lastBeat = segs.length ? segs[segs.length - 1].extra ?? 0 : 0; // let a final joke/number land
    let end = narrEnd + (s.tail ?? tailDefault) + lastBeat + (s.hold ?? 0);
    if (s.minDuration) end = Math.max(end, start + s.minDuration);
    if (s.kind === 'intro') end = start + INTRO_SECONDS;
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
    const ctx = { id: s.id, start, end, words: w, lang: ep.language };
    const r = (v) => resolveDeep(v ?? [], ctx);
    const scene = {
      id: s.id,
      start,
      end,
      background: resolveDeep(s.background, ctx),
      props: r(s.props),
      bix: r(s.bix).map((c) => ({ ...c })),
      bixDefaults: { pos: s.bixStart ?? [960, 820], scale: s.bixScale ?? 1, facing: s.bixFacing ?? 1 },
      texts: r(s.texts),
      chips: r(s.chips),
      camera: s.camera ? resolveDeep(s.camera, ctx) : undefined,
      transition: si === 0 ? 'cut' : s.transition ?? 'cut',
      ...(s.kind ? { kind: s.kind } : {}),
      ...(typeof s.focus === 'number' ? { focus: s.focus } : Array.isArray(s.focus) ? { focus: s.focus[0] } : {}),
      ...(s.chapter ? { chapter: s.chapter } : {}),
      ...(s.shortLayout ? { shortLayout: resolveDeep(s.shortLayout, ctx) } : {}),
    };
    if (s.kind === 'intro') sfx.push({ name: 'sting', at: start, gain: 0.8 });
    // MarMila end screen: the ABONNE-TOI button pops in, the bell rings, the button gets pressed
    if (s.kind === 'endscreen' && ep.language === 'fr') {
      const e = ENDSCREEN_ANIM;
      sfx.push({ name: 'pop', at: start + e.popAt, gain: 0.55 }, { name: 'ding', at: start + e.bellAt, gain: 0.5 },
        { name: 'pop', at: start + e.pressAt, gain: 0.5 }, { name: 'sparkle', at: start + e.pressAt + 0.05, gain: 0.4 });
    }
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
      character: ep.character ?? 'bix2',
      ...(ep.language && ep.language !== 'en' ? { lang: ep.language } : {}),
      scenes: outScenes,
      captions,
    },
    audio: { duration, narration, sfx: sfx.filter((f) => f.at >= 0 && f.at < duration).sort((a, b) => a.at - b.at) },
    words,
  };
};
