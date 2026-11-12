// The English pipeline must stay byte-identical after adding French: every English episode,
// classic Short and TikTok Short is built with a deterministic fake TTS, and the timeline,
// audio plan, captions, SRT and metadata are hashed. tests/fixtures/english-fingerprint.json
// was recorded on main before MarMila was added.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadEpisode } from '../pipeline/lib/script.mjs';
import { buildTimeline, planNarration } from '../pipeline/lib/timeline.mjs';
import { buildMetadata, buildSrt, metadataMarkdown } from '../pipeline/lib/metadata.mjs';
import { shortEpisode, toShortManifest } from '../pipeline/lib/shorts.mjs';
import * as tt from '../pipeline/lib/tiktok.mjs';

const ROOT = path.join(__dirname, '..');
const fake = (plan) => Object.fromEntries(plan.flatMap((p) => p.segments.map((s) => {
  let t = 0;
  const units = s.units.map((u) => { const d = 0.08 + u.spoken.length * 0.06; const r = { start: t, end: t + d }; t += d; return r; });
  return [s.id, { file: `f-${s.id}.wav`, duration: t, units }];
})));
const run = (e) => { const plan = planNarration(e); return buildTimeline(e, plan, fake(plan)); };
const sha = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex');

const fingerprint = () => {
  const out = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'episodes')).filter((x) => x.endsWith('.yaml')).sort()) {
    const ep = loadEpisode(path.join(ROOT, 'episodes', f));
    if (ep.language === 'fr') continue;
    const t = run(ep);
    const shorts = (ep.shorts ?? []).map((sh) => { const se = shortEpisode(ep, sh); const r = run(se); return { short: sh, epLike: se, manifest: toShortManifest(r.manifest, sh, ep), audio: r.audio }; });
    const meta = buildMetadata(ep, t.manifest, shorts);
    out[ep.id] = crypto.createHash('sha1').update(JSON.stringify({ m: t.manifest, a: t.audio, srt: buildSrt(t.manifest.captions), meta, md: metadataMarkdown(meta), shorts: shorts.map((s) => [s.manifest, s.audio, buildSrt(s.manifest.captions)]) })).digest('hex');
    const spec = path.join(ROOT, 'shorts-tiktok', ep.id, 'shorts.yaml');
    if (fs.existsSync(spec)) {
      for (const sh of tt.loadTiktokSpec(spec).shorts) {
        const e2 = tt.tiktokEpisode(ep, sh);
        const plan = planNarration(e2);
        tt.tightenPlan(plan);
        const r = buildTimeline(e2, plan, fake(plan));
        const m = tt.toTiktokManifest(r.manifest, sh, r.audio.narration);
        out[`${ep.id}-tt${sh.n}`] = sha([m, r.audio, buildSrt(m.manifest.captions), tt.sidecarText(sh, m.manifest.duration)]);
      }
    }
  }
  return out;
};

describe('English pipeline unchanged by the French channel', () => {
  it('every English episode, Short and TikTok Short builds exactly as before', () => {
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'english-fingerprint.json'), 'utf8'));
    // episodes added after the snapshot (episode 6+) are new content, not "unchanged" content
    const got = fingerprint();
    for (const k of Object.keys(got)) if (!(k in expected)) delete got[k];
    expect(got).toEqual(expected);
  });
});
