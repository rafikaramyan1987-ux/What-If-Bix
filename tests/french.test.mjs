// MarMila (French): typography, captions (.fr.srt), metadata, TikTok-rule Shorts (15–25 s),
// the posting schedule, and the rendered posting pack when it is in the repo.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { frMatches, frTypo, normWordFor, NBSP, NNBSP } from '../pipeline/lib/lang.mjs';
import { loadEpisode, parseNarration, segmentUnits } from '../pipeline/lib/script.mjs';
import { buildTimeline, ENDSCREEN_ANIM, planNarration } from '../pipeline/lib/timeline.mjs';
import { buildMetadata, buildSrt } from '../pipeline/lib/metadata.mjs';
import { tightenPlan, tiktokEpisode, toTiktokManifest, TT_MAX, TT_MIN } from '../pipeline/lib/tiktok.mjs';
import { estimateTiktok, frenchTypoProblems, checkEpisode, TT_EST_MARGIN } from '../pipeline/validate.mjs';
import { CSV_HEADER, DEFAULT_EPISODES, plan as postingPlan, slots, toCsv } from '../pipeline/posting.mjs';

const ROOT = path.join(__dirname, '..');
const FR = DEFAULT_EPISODES.map((id) => loadEpisode(path.join(ROOT, 'episodes', `${id}.yaml`)));
const fakeTts = (plan) => {
  const tts = {};
  for (const p of plan) for (const s of p.segments) {
    let t = 0;
    const units = s.units.map((u) => { const d = 0.1 + u.spoken.length * 0.065; const r = { start: t, end: t + d }; t += d; return r; });
    tts[s.id] = { file: `${s.id}.wav`, duration: t, units };
  }
  return tts;
};
const build = (ep) => { const plan = planNarration(ep); return buildTimeline(ep, plan, fakeTts(plan)); };
const buildShort = (ep, sh) => {
  const e = tiktokEpisode(ep, sh);
  const plan = planNarration(e);
  tightenPlan(plan);
  const r = buildTimeline(e, plan, fakeTts(plan));
  return { short: sh, manifest: toTiktokManifest(r.manifest, sh, r.audio.narration).manifest };
};

describe('French typography', () => {
  it('puts the right no-break spaces before ? ! ; : and inside « »', () => {
    expect(frTypo('Et si la Lune disparaissait demain ?')).toBe(`Et si la Lune disparaissait demain${NNBSP}?`);
    expect(frTypo('Quoi?! Non !')).toBe(`Quoi${NNBSP}?! Non${NNBSP}!`);
    expect(frTypo('deux ; trois')).toBe(`deux${NNBSP}; trois`);
    expect(frTypo('Bonne nouvelle : rien')).toBe(`Bonne nouvelle${NBSP}: rien`);
    expect(frTypo('« supermax »')).toBe(`«${NBSP}supermax${NBSP}»`);
    expect(frTypo('384 400 km')).toBe(`384${NNBSP}400${NBSP}km`);
    expect(frTypo("l'Univers")).toBe('l’Univers');
  });
  it('leaves URLs, times and already-correct text alone (idempotent)', () => {
    expect(frTypo('https://nasa.gov/x?a=1 à 18:00')).toBe('https://nasa.gov/x?a=1 à 18:00');
    const once = frTypo('Tu sauterais ? Oui : « vraiment » !');
    expect(frTypo(once)).toBe(once);
    expect(frenchTypoProblems(once)).toEqual([]);
    expect(frenchTypoProblems('Tu sauterais ?').length).toBeGreaterThan(0);
  });
  it('keeps "demain ?" as one caption word and gives the voice plain text', () => {
    const u = parseNarration("Et si demain ? Pas d'explosion : rien.", 'fr');
    expect(u.map((x) => x.display)).toEqual(['Et', 'si', `demain${NNBSP}?`, 'Pas', `d’explosion${NBSP}:`, 'rien.']);
    expect(u.every((x) => /[\p{L}\p{N}]/u.test(x.display))).toBe(true); // no orphan punctuation
    expect(u[2].spoken).toBe('demain ?');
    expect(u[4].spoken).toBe("d'explosion :");
    expect(segmentUnits(u)[0].units.length).toBe(3);
  });
  it('matches @words with accents, elisions and numbers in {shown|spoken}', () => {
    expect(normWordFor('*Éloigne*.', 'fr')).toBe('éloigne');
    expect(frMatches(normWordFor('s’éloigne', 'fr'), 'éloigne')).toBe(true);
    expect(frMatches(normWordFor('384 400 kilomètres', 'fr'), 'kilomètres')).toBe(true);
    expect(normWordFor('Don’t', 'en')).toBe("don't");
  });
});

describe('MarMila episodes', () => {
  it('validate (length, sources, 6 Shorts, typography, uniqueness)', () => {
    for (const ep of FR) {
      const r = checkEpisode(path.join(ROOT, 'episodes', `${ep.id}.yaml`));
      expect(r.errors, ep.id).toEqual([]);
      expect(ep.sources.length).toBeGreaterThanOrEqual(5);
      for (const s of ep.sources) expect(s).toMatch(/https?:\/\//);
    }
  });
  it('French captions: .fr.srt with correct typography, never an orphan "?" line', () => {
    for (const ep of FR) {
      const { manifest } = build(ep);
      expect(manifest.lang).toBe('fr');
      const srt = buildSrt(manifest.captions);
      const lines = srt.split('\n').filter((l) => l && !/^\d+$/.test(l) && !/-->/.test(l));
      for (const l of lines) {
        expect(frenchTypoProblems(l), `${ep.id}: ${l}`).toEqual([]);
        expect(l, ep.id).not.toMatch(/^[?!;:.,»]/);
      }
      expect(srt).toContain(`${NNBSP}?`);
      const meta = buildMetadata(ep, manifest, ep.tiktokShorts.map((sh) => buildShort(ep, sh)));
      expect(meta.files.captions).toBe(`${ep.id}.fr.srt`);
      expect(meta.defaultLanguage).toBe('fr');
      expect(meta.channel).toBe('MarMila');
      // our own text is typeset; quoted source titles (often English) stay as published
      expect(meta.description.split('\n').filter((l) => !l.startsWith('•')).flatMap(frenchTypoProblems)).toEqual([]);
      expect(meta.description).not.toMatch(/undefined/);
      expect(meta.description).toMatch(/Voix off/);
      expect(meta.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(meta.hashtags.length).toBeLessThanOrEqual(5);
      for (const s of meta.shorts) {
        expect(s.captions).toMatch(/\.fr\.srt$/);
        expect(s.hashtags).toContain('#Shorts');
        expect(s.hashtags.length).toBeGreaterThanOrEqual(3);
        expect(s.hashtags.length).toBeLessThanOrEqual(5);
        expect(s.pinnedComment).toMatch(/\?$/);
        expect([...s.title].length).toBeLessThanOrEqual(60);
      }
    }
  });
  it('every Short follows the TikTok rules: title and captions on frame 0, end question, loop, 15–25 s estimated', () => {
    for (const ep of FR) {
      expect(ep.tiktokShorts).toHaveLength(6);
      for (const sh of ep.tiktokShorts) {
        const { manifest: m } = buildShort(ep, sh);
        expect(m.hook).toBe(sh.hook.toUpperCase());
        expect(m.captions[0].start).toBe(0);
        expect(m.tiktok.question).toMatch(/\?$/);
        expect(sh.scenes[0].like).toBe(sh.scenes[sh.scenes.length - 1].like);
        expect(m.scenes.some((s) => s.kind === 'cta' || s.kind === 'endscreen' || s.kind === 'intro')).toBe(false);
        const est = estimateTiktok(ep, sh);
        expect(est, `${ep.id} #${sh.n}`).toBeGreaterThanOrEqual(TT_MIN + TT_EST_MARGIN);
        expect(est, `${ep.id} #${sh.n}`).toBeLessThanOrEqual(TT_MAX - TT_EST_MARGIN);
      }
    }
  });
  it('the end-screen animation timing matches between the mixer and the renderer', () => {
    const tsx = fs.readFileSync(path.join(ROOT, 'src', 'compositions', 'Channel.tsx'), 'utf8');
    const m = tsx.match(/ENDSCREEN_ANIM = \{ popAt: ([\d.]+), bellAt: ([\d.]+), pressAt: ([\d.]+) \}/);
    expect(m && m.slice(1).map(Number)).toEqual([ENDSCREEN_ANIM.popAt, ENDSCREEN_ANIM.bellAt, ENDSCREEN_ANIM.pressAt]);
  });
});

describe('posting schedule', () => {
  it('starts Monday 16 Nov 2026: long videos on days 1, 4, 7, 10 at 18:00, Shorts at 12:00 and 18:00', () => {
    const g = slots('2026-11-16');
    expect(new Date('2026-11-16T12:00:00Z').getUTCDay()).toBe(1);
    expect(g).toHaveLength(28);
    expect(g.filter((s) => s.type === 'long').map((s) => `${s.date} ${s.time}`)).toEqual(['2026-11-16 18:00', '2026-11-19 18:00', '2026-11-22 18:00', '2026-11-25 18:00']);
    for (const s of g.filter((x) => x.type === 'short')) expect(['12:00', '18:00']).toContain(s.time);
    for (const d of [1, 4, 7, 10]) expect(g.filter((s) => s.day === d && s.type === 'short').map((s) => s.time)).toEqual(['12:00']);
    expect(g[g.length - 1].date).toBe('2026-11-29');
  });
  it('places 4 long videos and 24 different Shorts, all MarMila, each file once', () => {
    const p = postingPlan(FR, '2026-11-16');
    expect(p.filter((r) => r.type === 'long')).toHaveLength(4);
    expect(p.filter((r) => r.type === 'short')).toHaveLength(24);
    expect(new Set(p.map((r) => r.name)).size).toBe(28);
    expect(p.map((r) => r.n)).toEqual(Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, '0')));
    for (const r of p) expect(r.episode.channel).toBe('marmila');
    // a topic's Shorts never run before the day its episode is published, except the day-1 teaser
    for (const r of p.filter((x) => x.type === 'short')) {
      const longDate = p.find((x) => x.type === 'long' && x.episode.id === r.episode.id).date;
      expect(r.date >= longDate, r.name).toBe(true);
    }
  });
  it('CSV has the requested columns and escapes descriptions', () => {
    expect(CSV_HEADER.slice(0, 10)).toEqual(['date', 'time (Europe/Zurich)', 'channel', 'type', 'file', 'title', 'description', 'hashtags', 'pinned comment question', 'thumbnail file']);
    expect(toCsv([['a,b', 'c"d', 'e\nf']])).toBe('"a,b","c""d","e\nf"\r\n');
  });
  const pack = path.join(ROOT, 'posting', 'marmila-2weeks', 'manifest.json');
  it.runIf(fs.existsSync(pack))('rendered pack: every Short is 15–25 s, long videos 4–6 min, −14 LUFS', () => {
    const m = JSON.parse(fs.readFileSync(pack, 'utf8'));
    expect(m.videos).toHaveLength(28);
    for (const v of m.videos) {
      if (v.type === 'short') {
        expect(v.duration, v.file).toBeGreaterThanOrEqual(15);
        expect(v.duration, v.file).toBeLessThanOrEqual(25);
        expect([v.width, v.height]).toEqual([1080, 1920]);
      } else {
        expect(v.duration, v.file).toBeGreaterThanOrEqual(240);
        expect(v.duration, v.file).toBeLessThanOrEqual(360);
        expect([v.width, v.height]).toEqual([1920, 1080]);
      }
      expect(Math.abs(v.lufs + 14), v.file).toBeLessThanOrEqual(1);
      expect(fs.existsSync(path.join(path.dirname(pack), v.file)), v.file).toBe(true);
    }
  });
});
