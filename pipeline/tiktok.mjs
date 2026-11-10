#!/usr/bin/env node
// What If Bix — TikTok-optimised Shorts.
//
//   node pipeline/tiktok.mjs [episode-id …] [--only check,render,sheet,strips,verify] [--n 1,3] [--debug-boxes]
//
// Reads shorts-tiktok/<episode-id>/shorts.yaml, builds each Short from the episode's
// scenes (same verified narration lines and numbers), checks it and renders
// shorts-tiktok/<episode-id>/<n>-<slug>.mp4 + .txt. `sheet` renders the first frame of
// every Short into docs/shorts-tiktok.png. Long episodes and classic Shorts are untouched.
import fs from 'node:fs';
import path from 'node:path';
import { loadEpisode } from './lib/script.mjs';
import { buildSrt } from './lib/metadata.mjs';
import { channelVoice, log, mixAudio, narrateAndTime, openRenderer, PY, ROOT, run } from './lib/produce.mjs';
import { spawnSync } from 'node:child_process';
import { checkShort, loadShortLayout } from './lib/framing.mjs';
import {
  loadTiktokSpec, sidecarText, specProblems, tightenPlan, tiktokEpisode, tiktokProblems, toTiktokManifest,
} from './lib/tiktok.mjs';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const only = new Set(flag('only', 'check,render,sheet,verify').split(','));
const pickN = flag('n', '') ? new Set(flag('n', '').split(',').map(Number)) : null;
const TT_DIR = path.join(ROOT, 'shorts-tiktok');
const named = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const episodeIds = named.length ? named : fs.readdirSync(TT_DIR).filter((d) => fs.existsSync(path.join(TT_DIR, d, 'shorts.yaml'))).sort();

const main = async () => {
  const layout = await loadShortLayout(ROOT);
  const all = [];
  let failed = false;
  for (const id of episodeIds) {
    const ep = loadEpisode(path.join(ROOT, 'episodes', `${id}.yaml`));
    const spec = loadTiktokSpec(path.join(TT_DIR, id, 'shorts.yaml'));
    const sp = specProblems(spec, ep);
    if (sp.length) throw new Error(`${id}: ${sp.join('; ')}`);
    const build = path.join(ROOT, 'build', ep.id); // shares the episode's TTS cache
    fs.mkdirSync(build, { recursive: true });
    const voice = channelVoice(ep);
    for (const sh of spec.shorts) {
      if (pickN && !pickN.has(sh.n)) continue;
      const epLike = tiktokEpisode(ep, sh);
      const name = `tt${sh.n}`;
      const t = narrateAndTime(epLike, name, { build, voice, tweakPlan: tightenPlan });
      const { manifest, events } = toTiktokManifest(t.manifest, sh, t.audio.narration);
      if (args.includes('--debug-boxes')) manifest.debugBoxes = true;
      const problems = [
        ...tiktokProblems(manifest, events),
        // whole Short, not just the first 3 s: Bix whole in the safe zone, key objects never cut
        ...checkShort(layout, manifest, manifest.duration),
      ];
      const first = manifest.captions[0]?.words[0]?.start ?? 0;
      log(`${id} #${sh.n} ${sh.slug}: ${manifest.duration.toFixed(1)} s, first word ${first.toFixed(2)} s, ${manifest.tiktok.beats.length} snap zooms`
        + (problems.length ? `\n    PROBLEM ${[...new Set(problems)].join('\n    PROBLEM ')}` : ' — OK'));
      if (problems.length) failed = true;
      all.push({ id, ep, sh, epLike, manifest, audio: t.audio, build });
    }
  }
  if (failed) throw new Error('TikTok Shorts checks failed (see PROBLEM lines)');
  if (['render', 'sheet', 'strips'].some((k) => only.has(k))) await produce(all);
  if (only.has('verify')) verify(all);
};

/** Check the finished files: 1080x1920, 30 fps, H.264 + AAC, under 25 s, voice audible within 0.3 s. */
const verify = (all) => {
  let bad = 0;
  for (const s of all) {
    const f = path.join(TT_DIR, s.id, `${s.sh.n}-${s.sh.slug}.mp4`);
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f], { capture: true }));
    const v = probe.streams.find((x) => x.codec_type === 'video');
    const a = probe.streams.find((x) => x.codec_type === 'audio');
    const dur = Number(probe.format.duration);
    const sd = spawnSync('ffmpeg', ['-v', 'info', '-i', f, '-af', 'silencedetect=noise=-35dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const firstEnd = sd.match(/silence_start: (-?[\d.]+)[\s\S]*?silence_end: ([\d.]+)/);
    const onset = firstEnd && Number(firstEnd[1]) <= 0.01 ? Number(firstEnd[2]) : 0;
    const issues = [];
    if (v.width !== 1080 || v.height !== 1920) issues.push(`${v.width}x${v.height}`);
    if (v.codec_name !== 'h264' || a?.codec_name !== 'aac') issues.push(`${v.codec_name}/${a?.codec_name}`);
    if (v.r_frame_rate !== '30/1') issues.push(`fps ${v.r_frame_rate}`);
    if (!(dur >= 15 && dur < 25)) issues.push(`length ${dur.toFixed(2)} s`);
    if (onset > 0.3) issues.push(`sound starts at ${onset.toFixed(2)} s`);
    if (issues.length) bad++;
    log(`verify ${path.relative(ROOT, f)}: ${dur.toFixed(2)} s, ${v.width}x${v.height} ${v.r_frame_rate} ${v.codec_name}+${a?.codec_name}, sound at ${onset.toFixed(2)} s`
      + (issues.length ? ` — PROBLEM ${issues.join(', ')}` : ' — OK'));
  }
  if (bad) throw new Error(`${bad} file(s) failed verification`);
};

const produce = async (all) => {

  const r = await openRenderer();
  for (const s of all) {
    const base = path.join(TT_DIR, s.id, `${s.sh.n}-${s.sh.slug}`);
    if (only.has('render')) {
      const mix = mixAudio(s.manifest, s.audio, s.epLike.music, `tt${s.sh.n}`, { build: s.build });
      const tmp = path.join(s.build, `tt${s.sh.n}-silent.mp4`);
      const muxed = path.join(s.build, `tt${s.sh.n}.mp4`);
      await r.video(s.manifest, mix, muxed, tmp);
      // 1080x1920, 30 fps, H.264 + AAC, sized for upload
      run('ffmpeg', ['-y', '-v', 'error', '-i', muxed, '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-r', '30', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${base}.mp4`]);
      fs.writeFileSync(`${base}.txt`, sidecarText(s.sh, s.manifest.duration));
      fs.writeFileSync(`${base}.en.srt`, buildSrt(s.manifest.captions));
      log(`rendered ${path.relative(ROOT, base)}.mp4 (${s.manifest.duration.toFixed(1)} s)`);
    }
    if (only.has('strips')) {
      const items = [];
      const times = [0, 0.5, 1, 1.5, 2, s.manifest.duration - 1.9, s.manifest.duration - 1 / 30];
      for (const [k, tt] of times.entries()) {
        const f = path.join(s.build, `tt${s.sh.n}-strip-${k}.png`);
        await r.still(s.manifest, Math.round(tt * 30), f, 0.5);
        items.push(`${tt.toFixed(1)}s=${f}`);
      }
      const out = path.join(ROOT, 'out', 'tiktok-strips', `${s.id}-${s.sh.n}${s.manifest.debugBoxes ? '-debug' : ''}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      run(PY, [path.join(ROOT, 'pipeline', 'strip.py'), out, ...items]);
    }
  }
  if (only.has('sheet')) {
    const items = [];
    for (const s of all) {
      const f = path.join(s.build, `tt${s.sh.n}-first.png`);
      await r.still(s.manifest, 0, f, 0.5);
      items.push(`${s.id.slice(0, 4)} #${s.sh.n} (${s.manifest.duration.toFixed(1)} s)=${f}`);
    }
    const out = path.join(ROOT, 'docs', 'shorts-tiktok.png');
    run(PY, [path.join(ROOT, 'pipeline', 'contact_sheet.py'), out, '5', ...items]);
    log(`contact sheet -> ${path.relative(ROOT, out)}`);
  }
};

main().catch((e) => {
  console.error('[bix] ERROR', e.message);
  process.exit(1);
});
