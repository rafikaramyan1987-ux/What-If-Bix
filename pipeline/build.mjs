#!/usr/bin/env node
// What If Bix — episode builder.
//
//   node pipeline/build.mjs <episode.yaml> [--only long,shorts,thumb,meta,frames,strips,check] [--out out] [--frames 2,9.5,20]
//     [--debug-boxes] (Shorts: draw framing boxes) [--no-framing-check]
//
// Steps: parse script -> TTS (+word timings) -> timeline/manifest -> music & SFX
// -> audio mix -> Remotion render (silent) -> mux audio -> Shorts -> thumbnail
// -> metadata (title, description, tags, chapters) + SRT captions -> stills.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEpisode } from './lib/script.mjs';
import { buildTimeline, planNarration } from './lib/timeline.mjs';
import { buildMetadata, buildSrt, metadataMarkdown } from './lib/metadata.mjs';
import { shortEpisode, SHORT_MAX, SHORT_MIN, toShortManifest } from './lib/shorts.mjs';
import { checkShort, loadShortLayout } from './lib/framing.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON ?? 'python3';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const file = args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
if (!file) {
  console.error('usage: node pipeline/build.mjs <episode.yaml> [--only long,thumb,frames] [--out out]');
  process.exit(2);
}
const only = new Set((flag('only', 'long,shorts,thumb,meta')).split(','));
const outRoot = path.resolve(flag('out', path.join(ROOT, 'out')));

const log = (...m) => console.log('[bix]', ...m);
const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { stdio: opts.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.slice(0, 3).join(' ')}… failed (${r.status})`);
  return r.stdout;
};

export const resolveVoiceModel = (voice) => {
  const name = voice.model ?? 'en-us-libritts-high';
  if (name.endsWith('.onnx') && fs.existsSync(name)) return name;
  const p = path.join(ROOT, 'models', 'piper', `${name}.onnx`);
  if (!fs.existsSync(p)) throw new Error(`voice model ${p} not found — run: bash pipeline/fetch_voice.sh ${name}`);
  return p;
};

const findBrowser = () => {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  for (const p of ['/opt/pw-browsers/chromium']) if (fs.existsSync(p)) return p;
  return undefined; // Remotion downloads its own headless shell
};

const main = async () => {
  const ep = loadEpisode(file);
  const build = path.join(ROOT, 'build', ep.id);
  const out = path.join(outRoot, ep.id);
  fs.mkdirSync(build, { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  log(`episode ${ep.id}: ${ep.title}`);

  // Defaults: Piper LibriTTS speaker 92 at lengthScale 1.05 (approved channel voice and pace).
  const voice = { provider: 'piper', model: 'en-us-libritts-high', speaker: 92, lengthScale: 1.05, ...(ep.voice ?? {}) };
  // BIX_TTS_PROVIDER=elevenlabs|openai switches to a paid voice (API key from the environment).
  if (process.env.BIX_TTS_PROVIDER) voice.provider = process.env.BIX_TTS_PROVIDER;
  if (voice.provider === 'piper') voice.model = resolveVoiceModel(voice);
  if (process.env.BIX_VOICE_ID) voice.voiceId = process.env.BIX_VOICE_ID;
  const sfxDir = path.join(ROOT, 'build', '_sfx');
  if (!fs.existsSync(path.join(sfxDir, 'sting.wav'))) run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'sfx', sfxDir]);

  /** TTS for every sentence (cached by content in build/<id>/tts) + timeline. */
  const narrateAndTime = (epLike, name) => {
    const plan = planNarration(epLike);
    const job = {
      voice,
      outDir: path.join(build, 'tts'),
      segments: plan.flatMap((p) => p.segments.map((s) => ({ id: s.id, units: s.units }))),
    };
    const jobFile = path.join(build, `tts-job-${name}.json`);
    fs.writeFileSync(jobFile, JSON.stringify(job, null, 1));
    const ttsOut = JSON.parse(run(PY, [path.join(ROOT, 'pipeline', 'tts.py'), jobFile], { capture: true }));
    const tts = Object.fromEntries(ttsOut.segments.map((s) => [s.id, s]));
    return buildTimeline(epLike, plan, tts);
  };

  /** Music (synthesized, deterministic) + narration + SFX -> loudness-normalised mix. */
  const mixAudio = (manifestX, audioX, musicCfg, name) => {
    const offset = musicCfg.offset ?? 0;
    const musicFile = path.join(build, `music-${musicCfg.style}-${name}.wav`);
    run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'music', musicCfg.style, String(manifestX.duration + offset + 1), musicFile,
      '--seed', String(musicCfg.seed ?? 7)]);
    const mixFile = path.join(build, `mix-${name}.wav`);
    const mixJob = {
      duration: manifestX.duration,
      out: mixFile,
      workDir: path.join(build, `mix-${name}`),
      narration: audioX.narration,
      sfx: audioX.sfx.map((f) => ({ ...f, file: path.join(sfxDir, `${f.name}.wav`) })),
      music: { file: musicFile, gain: musicCfg.gain ?? 0.22, duck: musicCfg.duck ?? 0.55, offset, fadeOut: musicCfg.fadeOut ?? 1.5 },
    };
    fs.writeFileSync(path.join(build, `mix-job-${name}.json`), JSON.stringify(mixJob, null, 1));
    run(PY, [path.join(ROOT, 'pipeline', 'mix.py'), path.join(build, `mix-job-${name}.json`)], { capture: true });
    return mixFile;
  };

  // 1-2. narration + timeline (long episode)
  const { manifest, audio } = narrateAndTime(ep, 'long');
  fs.writeFileSync(path.join(build, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log(`timeline: ${manifest.scenes.length} scenes, ${manifest.duration.toFixed(2)} s (${voice.provider})`);

  // Shorts: standalone mini-episodes (hook line, context-free cuts, CTA); unchanged
  // sentences reuse the long episode's cached audio, only new lines are voiced.
  const shorts = (ep.shorts ?? []).map((sh) => {
    const sep = shortEpisode(ep, sh);
    const t = narrateAndTime(sep, sh.id);
    return { short: sh, epLike: sep, manifest: toShortManifest(t.manifest, sh, ep), audio: t.audio };
  });
  for (const s of shorts) {
    const d = s.manifest.duration;
    log(`short ${s.short.id}: ${d.toFixed(1)} s${d < SHORT_MIN || d > SHORT_MAX ? ` — WARNING outside ${SHORT_MIN}–${SHORT_MAX} s` : ''}`);
  }

  // Shorts framing check: in the first 3 s Bix (and character props) must be whole inside the
  // safe zone and every key object whole inside the frame. Fails the build otherwise.
  if (shorts.length && ['shorts', 'strips', 'check'].some((k) => only.has(k)) && !args.includes('--no-framing-check')) {
    const layout = await loadShortLayout(ROOT);
    const problems = shorts.flatMap((s) => checkShort(layout, s.manifest).map((p) => `short ${s.short.id}: ${p}`));
    if (problems.length) throw new Error(`Shorts framing check failed (first 3 s):\n  ${problems.join('\n  ')}`);
    log('shorts framing check: OK (Bix and key objects whole and in the safe zone for the first 3 s)');
  }
  if (args.includes('--debug-boxes')) for (const s of shorts) s.manifest.debugBoxes = true;

  // 3-4. music + mix
  const mixFile = only.has('long') ? mixAudio(manifest, audio, ep.music ?? { style: 'curious' }, 'long') : null;
  if (mixFile) log('audio mixed');

  // 5. render
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
  const browserExecutable = findBrowser();
  const needsRender = ['long', 'shorts', 'thumb', 'frames', 'strips'].some((k) => only.has(k));
  const serveUrl = needsRender ? await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts') }) : '';
  const concurrency = Math.max(1, Math.min(os.cpus().length, 8));

  if (only.has('long')) {
    const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: manifest, browserExecutable });
    const silent = path.join(build, 'video-silent.mp4');
    let last = -1;
    await renderMedia({
      composition: comp, serveUrl, codec: 'h264', outputLocation: silent, inputProps: manifest,
      browserExecutable, concurrency, crf: 18, muted: true, pixelFormat: 'yuv420p',
      onProgress: ({ progress }) => {
        const p = Math.floor(progress * 20);
        if (p !== last) { last = p; log(`render ${Math.round(progress * 100)}%`); }
      },
    });
    const final = path.join(out, `${ep.id}.mp4`);
    run('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', mixFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
    log(`video -> ${path.relative(ROOT, final)}`);
  }

  if (only.has('shorts') && shorts.length) {
    fs.mkdirSync(path.join(out, 'shorts'), { recursive: true });
    for (const s of shorts) {
      const d = s.manifest.duration;
      const shortMix = mixAudio(s.manifest, s.audio, { ...s.epLike.music, fadeOut: 0 }, s.short.id);
      const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: s.manifest, browserExecutable });
      const silent = path.join(build, `short-${s.short.id}-silent.mp4`);
      await renderMedia({
        composition: comp, serveUrl, codec: 'h264', outputLocation: silent, inputProps: s.manifest,
        browserExecutable, concurrency, crf: 18, muted: true, pixelFormat: 'yuv420p',
      });
      const final = path.join(out, 'shorts', `${s.short.id}.mp4`);
      run('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', shortMix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
      fs.writeFileSync(path.join(out, 'shorts', `${s.short.id}.en.srt`), buildSrt(s.manifest.captions));
      log(`short ${s.short.id} (${d.toFixed(1)} s) -> ${path.relative(ROOT, final)}`);
    }
  }

  // First-3-seconds strips of each Short (0, 0.5 … 3 s), for reviewing the hook and framing.
  if (only.has('strips') && shorts.length) {
    const dir = path.join(out, 'shorts', 'strips');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of shorts) {
      const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: s.manifest, browserExecutable });
      const items = [];
      for (let k = 0; k <= 6; k++) {
        const tt = k * 0.5;
        const f = path.join(build, `strip-${s.short.id}-${k}.png`);
        const frame = Math.min(comp.durationInFrames - 1, Math.round(tt * s.manifest.fps));
        await renderStill({ composition: comp, serveUrl, output: f, frame, inputProps: s.manifest, browserExecutable, scale: 0.5 });
        items.push(`${tt.toFixed(1)}s=${f}`);
      }
      const suffix = s.manifest.debugBoxes ? '-debug' : '';
      run(PY, [path.join(ROOT, 'pipeline', 'strip.py'), path.join(dir, `${s.short.id}-first3s${suffix}.png`), ...items]);
    }
    log(`strips -> ${path.relative(ROOT, dir)}`);
  }

  if (only.has('thumb') && ep.thumbnail) {
    const props = { background: { type: 'space' }, props: [], character: ep.character ?? 'bix2', ...ep.thumbnail };
    const comp = await selectComposition({ serveUrl, id: 'Thumbnail', inputProps: props, browserExecutable });
    const thumb = path.join(out, 'thumbnail.png');
    await renderStill({ composition: comp, serveUrl, output: thumb, inputProps: props, browserExecutable });
    log(`thumbnail -> ${path.relative(ROOT, thumb)}`);
  }

  if (only.has('frames')) {
    const times = (flag('frames', '') || '').split(',').filter(Boolean).map(Number);
    const picks = times.length ? times : manifest.scenes.map((s) => Math.min(s.end - 0.1, s.start + (s.end - s.start) * 0.6));
    const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: manifest, browserExecutable });
    fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
    for (const [i, t] of picks.entries()) {
      const frame = Math.min(comp.durationInFrames - 1, Math.round(t * manifest.fps));
      const f = path.join(out, 'frames', `frame-${String(i + 1).padStart(2, '0')}-${t.toFixed(1)}s.png`);
      await renderStill({ composition: comp, serveUrl, output: f, frame, inputProps: manifest, browserExecutable });
    }
    log(`frames -> ${path.relative(ROOT, path.join(out, 'frames'))}`);
  }

  if (only.has('meta')) {
    const meta = buildMetadata(ep, manifest, shorts);
    fs.writeFileSync(path.join(out, 'metadata.json'), JSON.stringify(meta, null, 2));
    fs.writeFileSync(path.join(out, 'metadata.md'), metadataMarkdown(meta));
    fs.writeFileSync(path.join(out, `${ep.id}.en.srt`), buildSrt(manifest.captions));
    log(`metadata -> ${path.relative(ROOT, path.join(out, 'metadata.md'))}`);
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  if (ep.sources) fs.writeFileSync(path.join(out, 'sources.txt'), ep.sources.map((s) => `- ${s}`).join('\n') + '\n');
  log('done');
};

main().catch((e) => {
  console.error('[bix] ERROR', e.message);
  process.exit(1);
});
