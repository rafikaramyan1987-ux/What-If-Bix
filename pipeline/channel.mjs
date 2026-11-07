#!/usr/bin/env node
// Channel assets: avatar (800x800), banner (2560x1440), intro sting (2 s, with
// audio), end-screen template (20 s, with music) and a still of the end screen.
//   node pipeline/channel.mjs [outDir]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(ROOT, 'out', 'channel'));
const build = path.join(ROOT, 'build', '_channel');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(build, { recursive: true });
const PY = process.env.PYTHON ?? 'python3';
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} failed`);
};

const { bundle } = await import('@remotion/bundler');
const { renderMedia, renderStill, selectComposition } = await import('@remotion/renderer');
const browserExecutable = process.env.REMOTION_BROWSER ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts') });
const concurrency = Math.max(1, Math.min(os.cpus().length, 8));
const comp = (id) => selectComposition({ serveUrl, id, inputProps: {}, browserExecutable });

for (const [id, file] of [['Avatar', 'avatar.png'], ['Banner', 'banner.png']]) {
  await renderStill({ composition: await comp(id), serveUrl, output: path.join(out, file), browserExecutable });
  console.log('[channel]', file);
}
await renderStill({ composition: await comp('EndScreen'), serveUrl, output: path.join(out, 'end-screen.png'), frame: 150, browserExecutable });
console.log('[channel] end-screen.png');

// audio: sting SFX for the intro, a 20 s music bed for the end screen
const sfxDir = path.join(ROOT, 'build', '_sfx');
if (!fs.existsSync(path.join(sfxDir, 'sting.wav'))) run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'sfx', sfxDir]);
const bed = path.join(build, 'endscreen-music.wav');
run(PY, [path.join(ROOT, 'pipeline', 'audio_assets.py'), 'music', 'curious', '20', bed, '--seed', '99']);

const jobs = [
  { id: 'IntroSting', file: 'intro-sting.mp4', audio: path.join(sfxDir, 'sting.wav'), dur: 2 },
  { id: 'EndScreen', file: 'end-screen-template.mp4', audio: bed, dur: 20 },
];
for (const j of jobs) {
  const silent = path.join(build, `${j.id}.mp4`);
  await renderMedia({ composition: await comp(j.id), serveUrl, codec: 'h264', outputLocation: silent, browserExecutable, concurrency, crf: 18, muted: true, pixelFormat: 'yuv420p' });
  run('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', j.audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-af', `apad,atrim=0:${j.dur},afade=t=out:st=${j.dur - 0.5}:d=0.5,loudnorm=I=-14:TP=-1.5`, '-t', String(j.dur), '-movflags', '+faststart', path.join(out, j.file)]);
  console.log('[channel]', j.file);
}
