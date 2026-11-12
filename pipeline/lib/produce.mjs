// Shared production helpers for build.mjs (long episodes + classic Shorts) and
// tiktok.mjs (TikTok-optimised Shorts): voice, TTS + timeline, audio mix, render.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTimeline, planNarration } from './timeline.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PY = process.env.PYTHON ?? 'python3';

export const log = (...m) => console.log('[bix]', ...m);

export const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { stdio: opts.capture ? ['inherit', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.slice(0, 3).join(' ')}… failed (${r.status})`);
  return r.stdout;
};

export const resolveVoiceModel = (voice) => {
  const name = voice.model ?? 'en-us-libritts-high';
  if (name.endsWith('.onnx') && fs.existsSync(name)) return name;
  const p = path.join(ROOT, 'models', 'piper', `${name}.onnx`);
  // Local previews only: BIX_VOICE_FALLBACK=fr-siwis-medium uses the older GitHub-release export of the
  // same voice when Hugging Face is unreachable (it lacks the nasal-vowel marker: never publish with it).
  const fb = process.env.BIX_VOICE_FALLBACK && path.join(ROOT, 'models', 'piper', `${process.env.BIX_VOICE_FALLBACK}.onnx`);
  if (!fs.existsSync(p) && fb && fs.existsSync(fb)) {
    console.warn(`[bix] WARNING voice ${name} not found, using ${process.env.BIX_VOICE_FALLBACK} for a local preview`);
    return fb;
  }
  if (!fs.existsSync(p)) throw new Error(`voice model ${p} not found — run: bash pipeline/fetch_voice.sh ${name}`);
  return p;
};

/** Channel voice: Piper LibriTTS speaker 92 at lengthScale 1.05, unless the script or environment says otherwise. */
/** MarMila voice: Piper fr_FR "siwis" (medium, CC BY 4.0), picked by pipeline/voice_compare.py (docs/marmila/VOICE.md). */
export const FR_VOICE = { provider: 'piper', model: 'fr_FR-siwis-medium', lengthScale: 1.0 };

export const channelVoice = (ep) => {
  const base = ep.language === 'fr' ? FR_VOICE : { provider: 'piper', model: 'en-us-libritts-high', speaker: 92, lengthScale: 1.05 };
  const voice = { ...base, ...(ep.voice ?? {}) };
  // BIX_TTS_PROVIDER=elevenlabs|openai switches to a paid voice (API key from the environment).
  if (process.env.BIX_TTS_PROVIDER) voice.provider = process.env.BIX_TTS_PROVIDER;
  if (voice.provider === 'piper') voice.model = resolveVoiceModel(voice);
  if (process.env.BIX_VOICE_ID) voice.voiceId = process.env.BIX_VOICE_ID;
  return voice;
};

export const findBrowser = () => {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  for (const p of ['/opt/pw-browsers/chromium']) if (fs.existsSync(p)) return p;
  return undefined; // Remotion downloads its own headless shell
};

export const sfxDir = () => {
  const dir = path.join(ROOT, 'build', '_sfx');
  if (!fs.existsSync(path.join(dir, 'sting.wav'))) run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'sfx', dir]);
  return dir;
};

/** TTS for every sentence (cached by content in <build>/tts) + timeline. tweakPlan(plan) may tighten pauses. */
export const narrateAndTime = (epLike, name, { build, voice, tweakPlan }) => {
  const plan = planNarration(epLike);
  if (tweakPlan) tweakPlan(plan);
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
export const mixAudio = (manifestX, audioX, musicCfg, name, { build }) => {
  const sfx = sfxDir();
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
    sfx: audioX.sfx.map((f) => ({ ...f, file: path.join(sfx, `${f.name}.wav`) })),
    music: { file: musicFile, gain: musicCfg.gain ?? 0.22, duck: musicCfg.duck ?? 0.55, offset, fadeOut: musicCfg.fadeOut ?? 1.5 },
    ...(musicCfg.loudnorm ? { loudnorm: musicCfg.loudnorm } : {}),
  };
  fs.writeFileSync(path.join(build, `mix-job-${name}.json`), JSON.stringify(mixJob, null, 1));
  run(PY, [path.join(ROOT, 'pipeline', 'mix.py'), path.join(build, `mix-job-${name}.json`)], { capture: true });
  return mixFile;
};

let renderer;
/** Bundle the Remotion project once and return render helpers. */
export const openRenderer = async () => {
  if (renderer) return renderer;
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
  const browserExecutable = findBrowser();
  const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts') });
  const concurrency = Math.max(1, Math.min(os.cpus().length, 8));
  /** Render a manifest (silent, CRF 18) and mux it with an audio mix. */
  const video = async (manifest, mixFile, out, tmp, onProgress) => {
    const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: manifest, browserExecutable });
    await renderMedia({
      composition: comp, serveUrl, codec: 'h264', outputLocation: tmp, inputProps: manifest,
      browserExecutable, concurrency, crf: 18, muted: true, pixelFormat: 'yuv420p', onProgress,
    });
    run('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-i', mixFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
  };
  const still = async (manifest, frame, out, scale = 1, id = 'Episode') => {
    const comp = await selectComposition({ serveUrl, id, inputProps: manifest, browserExecutable });
    await renderStill({ composition: comp, serveUrl, output: out, frame: Math.min(comp.durationInFrames - 1, frame), inputProps: manifest, browserExecutable, scale });
  };
  renderer = { serveUrl, browserExecutable, concurrency, renderMedia, renderStill, selectComposition, video, still };
  return renderer;
};
