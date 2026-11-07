#!/usr/bin/env node
// Renders one still per gallery scene so new backgrounds/props can be checked by eye.
//   node pipeline/gallery.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(ROOT, 'out', 'gallery'));
fs.mkdirSync(out, { recursive: true });

const scene = (id, background, props, bix = [{ at: 0, action: 'idle' }], pos = [300, 820]) => ({
  id, start: 0, end: 4, background, props, bix, bixDefaults: { pos, scale: 0.8, facing: 1 }, texts: [], chips: [],
});
const G = [
  scene('lab', { type: 'lab' }, [
    { type: 'pal', x: 1500, y: 820, action: 'present', seed: 2 },
    { type: 'bars', x: 960, y: 500, w: 600, h: 250, values: [3, 7, 12], labels: ['A', 'B', 'C'], at: 0 },
  ], [{ at: 0, action: 'think' }]),
  scene('city-night', { type: 'night-city' }, [{ type: 'crowd', x: 1100, y: 900, w: 1400, count: 22, jumpAt: 0.6, sync: true }]),
  scene('bedroom', { type: 'bedroom', clock: '3:40' }, [
    { type: 'calendar', x: 960, y: 330, from: 1, to: 17, at: 0, dur: 2 },
    { type: 'brain', x: 1550, y: 520, s: 0.8, state: 'fried' },
  ], [{ at: 0, action: 'sleepy' }], [700, 820]),
  scene('ocean', { type: 'ocean', beach: true }, [
    { type: 'moon', x: 1450, y: 250, r: 150, face: 'smile' },
    { type: 'tide', x0: 0, x1: 1920, from: 1000, to: 870, at: 0, dur: 2 },
  ], [{ at: 0, action: 'point' }], [400, 960]),
  scene('moon', { type: 'moon' }, [
    { type: 'earth', x: 1500, y: 250, r: 130, spin: 0.1 },
    { type: 'satellite', kind: 'station', x: 700, y: 220, s: 0.7 },
    { type: 'orbit', x: 1500, y: 250, rx: 300, ry: 90, body: 'dot', period: 4 },
  ], [{ at: 0, action: 'float' }], [500, 760]),
  scene('tech', { type: 'plain', color: '#2a1659' }, [
    { type: 'phone', x: 280, y: 400, screen: 'nosignal' },
    { type: 'wifi', x: 640, y: 300, s: 1.1, crossAt: 0 },
    { type: 'server', x: 1050, y: 760, s: 0.8, failAt: 0 },
    { type: 'cable', points: [[100, 940], [800, 900], [1800, 960]], at: 0, cutAt: 1 },
    { type: 'gauge', x: 1550, y: 300, r: 140, to: 95, at: 0, label: 'STRESS' },
    { type: 'burst', x: 1500, y: 700, text: 'OOPS!', r: 140 },
    { type: 'icon', icon: 'warning', x: 640, y: 640, s: 0.8 },
    { type: 'vehicle', kind: 'plane', from: [1200, 150], to: [1201, 150], at: 0, dur: 1, s: 0.8 },
    { type: 'seismo', x: 960, y: 150, w: 500, h: 160, spikeAt: 1.5 },
  ], [{ at: 0, action: 'facepalm' }], [1300, 980]),
];

const { bundle } = await import('@remotion/bundler');
const { renderStill, selectComposition } = await import('@remotion/renderer');
const browserExecutable = process.env.REMOTION_BROWSER ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts') });
for (const s of G) {
  const m = { id: s.id, title: s.id, fps: 30, width: 1920, height: 1080, duration: 4, format: 'long', captions: [], scenes: [s] };
  const comp = await selectComposition({ serveUrl, id: 'Episode', inputProps: m, browserExecutable });
  await renderStill({ composition: comp, serveUrl, output: path.join(out, `${s.id}.png`), frame: 60, inputProps: m, browserExecutable });
  console.log('gallery', s.id);
}
