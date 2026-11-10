// Shorts framing check. Uses the same layout code as the renderer (src/scene/shortLayout.ts),
// compiled on the fly with esbuild, so the check measures exactly what gets drawn.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let cached;
/** Load src/scene/shortLayout.ts as an ES module (compiled into build/_layout). */
export const loadShortLayout = async (root) => {
  if (cached) return cached;
  const { build } = await import('esbuild');
  const outfile = path.join(root, 'build', '_layout', 'shortLayout.mjs');
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await build({ entryPoints: [path.join(root, 'src', 'scene', 'shortLayout.ts')], bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error' });
  cached = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  return cached;
};

const fmt = (b) => `[${Math.round(b.x0)}, ${Math.round(b.y0)}, ${Math.round(b.x1)}, ${Math.round(b.y1)}]`;

/**
 * Check the first `seconds` of a Short manifest. Returns human-readable problems (empty = OK):
 * Bix and character props must be whole inside the safe zone, other key objects whole inside the frame.
 */
export const checkShort = (layout, manifest, seconds = 3) => {
  const pacing = manifest.tiktok ? { beats: manifest.tiktok.beats, end: manifest.duration, hardCuts: true, profile: layout.TIKTOK } : undefined;
  const issues = layout.checkShortFraming(manifest.scenes, { from: manifest.timeOffset ?? 0, seconds, pacing });
  const seen = new Set();
  const out = [];
  for (const i of issues) {
    const key = `${i.scene}:${i.what}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const zone = i.zone === 'safe' ? 'the safe zone' : 'the frame';
    out.push(`${i.what} in scene "${i.scene}" is cut by ${zone} at ${i.t.toFixed(1)} s (box ${fmt(i.box)})`);
  }
  return out;
};
