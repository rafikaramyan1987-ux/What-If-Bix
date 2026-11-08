#!/usr/bin/env node
// What If Bix — episode builder.
//
//   node pipeline/build.mjs <episode.yaml> [--only long,shorts,thumb,meta,frames] [--out out] [--frames 2,9.5,20]
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
import { buildMetadata, buildShortManifests, buildSrt, metadataMarkdown } from './lib/metadata.mjs';

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

  // 1. narration
  const plan = planNarration(ep);
  // Defaults: Piper LibriTTS speaker 92 at lengthScale 1.05 (approved channel voice and pace).
  const voice = { provider: 'piper', model: 'en-us-libritts-high', speaker: 92, lengthScale: 1.05, ...(ep.voice ?? {}) };
  // BIX_TTS_PROVIDER=elevenlabs|openai switches to a paid voice (API key from the environment).
  if (process.env.BIX_TTS_PROVIDER) voice.provider = process.env.BIX_TTS_PROVIDER;
  if (voice.provider === 'piper') voice.model = resolveVoiceModel(voice);
  if (process.env.BIX_VOICE_ID) voice.voiceId = process.env.BIX_VOICE_ID;
  const job = {
    voice,
    outDir: path.join(build, 'tts'),
    segments: plan.flatMap((p) => p.segments.map((s) => ({ id: s.id, units: s.units }))),
  };
  const jobFile = path.join(build, 'tts-job.json');
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 1));
  log(`tts: ${job.segments.length} segments (${voice.provider})`);
  const ttsOut = JSON.parse(run(PY, [path.join(ROOT, 'pipeline', 'tts.py'), jobFile], { capture: true }));
  const tts = Object.fromEntries(ttsOut.segments.map((s) => [s.id, s]));

  // 2. timeline
  const { manifest, audio } = buildTimeline(ep, plan, tts);
  fs.writeFileSync(path.join(build, 'manifest.json'), JSON.stringify(manifest, null, 1));
  log(`timeline: ${manifest.scenes.length} scenes, ${manifest.duration.toFixed(2)} s`);

  // 3. music + sfx (synthesized, deterministic)
  const sfxDir = path.join(ROOT, 'build', '_sfx');
  if (!fs.existsSync(path.join(sfxDir, 'sting.wav'))) run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'sfx', sfxDir]);
  const music = ep.music ?? { style: 'curious' };
  const musicFile = path.join(build, `music-${music.style}.wav`);
  run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'music', music.style, String(manifest.duration + 1), musicFile, '--seed', String(music.seed ?? 7)]);

  // 4. mix
  const mixFile = path.join(build, 'mix.wav');
  const mixJob = {
    duration: manifest.duration,
    out: mixFile,
    workDir: path.join(build, 'mix'),
    narration: audio.narration,
    sfx: audio.sfx.map((f) => ({ ...f, file: path.join(sfxDir, `${f.name}.wav`) })),
    music: { file: musicFile, gain: music.gain ?? 0.22, duck: music.duck ?? 0.55 },
  };
  fs.writeFileSync(path.join(build, 'mix-job.json'), JSON.stringify(mixJob, null, 1));
  run(PY, [path.join(ROOT, 'pipeline', 'mix.py'), path.join(build, 'mix-job.json')], { capture: true });
  log('audio mixed');

  // 5. render
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
  const browserExecutable = findBrowser();
  const needsRender = ['long', 'shorts', 'thumb', 'frames'].some((k) => only.has(k));
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

  const shorts = buildShortManifests(ep, manifest);
  if (only.has('shorts') && shorts.length) {
    fs.mkdirSync(path.join(out, 'shorts'), { recursive: true });
    for (const s of shorts) {
      const d = s.manifest.duration;
      if (d < 30 || d > 60) log(`WARNING short ${s.short.id} is ${d.toFixed(1)} s (YouTube Shorts: ≤ 60 s, aim 30–55 s)`);
      const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: s.manifest, browserExecutable });
      const silent = path.join(build, `short-${s.short.id}-silent.mp4`);
      await renderMedia({
        composition: comp, serveUrl, codec: 'h264', outputLocation: silent, inputProps: s.manifest,
        browserExecutable, concurrency, crf: 18, muted: true, pixelFormat: 'yuv420p',
      });
      const audio = path.join(build, `short-${s.short.id}.wav`);
      run('ffmpeg', ['-y', '-v', 'error', '-ss', s.start.toFixed(3), '-t', d.toFixed(3), '-i', mixFile,
        '-af', `afade=t=in:d=0.12,afade=t=out:st=${Math.max(0, d - 0.6).toFixed(3)}:d=0.6`, audio]);
      const final = path.join(out, 'shorts', `${s.short.id}.mp4`);
      run('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
      fs.writeFileSync(path.join(out, 'shorts', `${s.short.id}.en.srt`), buildSrt(s.manifest.captions, s.start));
      log(`short ${s.short.id} (${d.toFixed(1)} s) -> ${path.relative(ROOT, final)}`);
    }
  }

  if (only.has('thumb') && ep.thumbnail) {
    const props = { background: { type: 'space' }, props: [], ...ep.thumbnail };
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
