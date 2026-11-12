// What If Bix episodes 6–9: Shorts rules, English metadata, the posting schedule, and the rendered pack's QA.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadEpisode } from '../pipeline/lib/script.mjs';
import { buildTimeline, planNarration } from '../pipeline/lib/timeline.mjs';
import { buildMetadata, CREDIT_LINES } from '../pipeline/lib/metadata.mjs';
import { tightenPlan, tiktokEpisode, toTiktokManifest, TT_MAX, TT_MIN } from '../pipeline/lib/tiktok.mjs';
import { checkEpisode, estimateTiktok, TT_EST_MARGIN } from '../pipeline/validate.mjs';
import { CSV_COLUMNS, EPISODES, LONG_DATES, plan } from '../pipeline/pack-whatifbix.mjs';

const ROOT = path.join(__dirname, '..');
const EPS = EPISODES.map((id) => loadEpisode(path.join(ROOT, 'episodes', `${id}.yaml`)));
const fakeTts = (p) => Object.fromEntries(p.flatMap((x) => x.segments.map((s) => {
  let t = 0;
  const units = s.units.map((u) => { const d = 0.1 + u.spoken.length * 0.06; const r = { start: t, end: t + d }; t += d; return r; });
  return [s.id, { file: `${s.id}.wav`, duration: t, units }];
})));
const build = (ep) => { const p = planNarration(ep); return buildTimeline(ep, p, fakeTts(p)); };
const short = (ep, sh) => {
  const e = tiktokEpisode(ep, sh);
  const p = planNarration(e);
  tightenPlan(p);
  const r = buildTimeline(e, p, fakeTts(p));
  return { short: sh, manifest: toTiktokManifest(r.manifest, sh, r.audio.narration).manifest };
};

describe('What If Bix episodes 6–9', () => {
  it('validate: 3:45–4:30, chapters, sources with DOI or URL, 6 different Shorts', () => {
    for (const ep of EPS) {
      const r = checkEpisode(path.join(ROOT, 'episodes', `${ep.id}.yaml`));
      expect(r.errors, ep.id).toEqual([]);
      expect(ep.lengthRange).toEqual([225, 270]);
      for (const s of ep.sources) expect(s, ep.id).toMatch(/https?:\/\//);
      expect(ep.outro.narration, `${ep.id} teases the next episode`).toMatch(/Next time/);
    }
  });
  it('thumbnails: at most 3 words, shocked Bix', () => {
    for (const ep of EPS) {
      expect(ep.thumbnail.title.join(' ').split(/\s+/).length, ep.id).toBeLessThanOrEqual(3);
      expect(ep.thumbnail.bix.action).toBe('shock');
    }
  });
  it('every Short: hook on frame 0, captions from frame 0, end question, loop, 15–25 s estimated', () => {
    for (const ep of EPS) for (const sh of ep.tiktokShorts) {
      const { manifest: m } = short(ep, sh);
      expect(m.hook).toBe(sh.hook.toUpperCase());
      expect(sh.hook.split(/\s+/).length).toBeLessThanOrEqual(6);
      expect(m.captions[0].words[0].start).toBeLessThanOrEqual(0.3);
      expect(sh.question).toMatch(/\?/);
      expect(sh.scenes[0].like).toBe(sh.scenes[sh.scenes.length - 1].like);
      const est = estimateTiktok(ep, sh);
      expect(est, `${ep.id} #${sh.n}`).toBeGreaterThanOrEqual(TT_MIN + TT_EST_MARGIN);
      expect(est, `${ep.id} #${sh.n}`).toBeLessThanOrEqual(TT_MAX - TT_EST_MARGIN);
    }
  });
  it('metadata: titles ≤ 70, 3–5 hashtags (#Shorts first), end question, Full episode line, sources, standard credits, not for kids', () => {
    for (const ep of EPS) {
      const { manifest } = build(ep);
      const meta = buildMetadata(ep, manifest, ep.tiktokShorts.map((sh) => short(ep, sh)));
      expect(meta.madeForKids).toBe(false);
      expect([...meta.title].length).toBeLessThanOrEqual(70);
      expect(meta.hashtags.length).toBeGreaterThanOrEqual(3);
      expect(meta.hashtags.length).toBeLessThanOrEqual(5);
      expect(meta.description).toContain(ep.pinnedQuestion);
      expect(meta.description).toContain('Sources:');
      for (const c of CREDIT_LINES) expect(meta.description).toContain(c);
      expect(meta.files.captions).toBe(`${ep.id}.en.srt`);
      for (const s of meta.shorts) {
        expect([...s.title].length).toBeLessThanOrEqual(70);
        expect(s.hashtags[0]).toBe('#Shorts');
        expect(s.hashtags.length).toBeGreaterThanOrEqual(3);
        expect(s.hashtags.length).toBeLessThanOrEqual(5);
        expect(s.description).toContain(s.endQuestion);
        expect(s.description).toContain(`Full episode: "${ep.title}"`);
        for (const c of CREDIT_LINES) expect(s.description).toContain(c);
      }
    }
  });
});

describe('posting schedule', () => {
  const p = plan(EPS);
  it('one Short a day at 18:00 from 2026-11-20 to 2026-12-13, long episodes at 20:00 on the four dates', () => {
    const shorts = p.filter((r) => r.type === 'short');
    expect(shorts).toHaveLength(24);
    expect(new Set(shorts.map((r) => r.date)).size).toBe(24);
    expect(shorts[0].date).toBe('2026-11-20');
    expect(shorts[23].date).toBe('2026-12-13');
    for (const r of shorts) expect(r.time).toBe('18:00');
    expect(p.filter((r) => r.type === 'long').map((r) => `${r.date} ${r.time}`)).toEqual(LONG_DATES.map((d) => `${d} 20:00`));
  });
  it('each episode\'s Shorts start the day of or after its long episode', () => {
    for (const r of p.filter((x) => x.type === 'short')) {
      const long = p.find((x) => x.type === 'long' && x.episode.id === r.episode.id);
      expect(r.date >= long.date, r.name).toBe(true);
    }
  });
  it('file names: NN-YYYY-MM-DD-HHhMM-type-slug, numbered 01–28 in posting order', () => {
    expect(p).toHaveLength(28);
    expect(p[0].name).toBe('01-2026-11-20-18h00-short-15-seconds-in-space');
    for (const [i, r] of p.entries()) expect(r.name).toMatch(new RegExp(`^${String(i + 1).padStart(2, '0')}-\\d{4}-\\d\\d-\\d\\d-\\d\\dh\\d\\d-(short|long)-[a-z0-9-]+$`));
    expect(CSV_COLUMNS).toEqual(['file', 'date', 'time', 'type', 'title', 'description', 'hashtags', 'end_question']);
  });
  const qa = path.join(ROOT, 'posting-pack', 'whatifbix-ep06-ep09', 'qa', 'qa-report.json');
  it.runIf(fs.existsSync(qa))('rendered pack passed the QA watch-check (every file)', () => {
    const r = JSON.parse(fs.readFileSync(qa, 'utf8'));
    expect(r).toHaveLength(28);
    for (const x of r) {
      expect(x.problems, x.file).toEqual([]);
      if (x.type === 'short') expect(x.duration).toBeGreaterThanOrEqual(15), expect(x.duration).toBeLessThanOrEqual(25);
    }
    const csv = fs.readFileSync(path.join(path.dirname(qa), '..', 'posting-schedule.csv'), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(CSV_COLUMNS.join(','));
  });
});
