#!/usr/bin/env node
// Bix 2.0 design sheets: lineup of the 3 variants, 4 emotions per variant, phone-size test.
//   node pipeline/design_sheets.mjs [outDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? path.join(ROOT, 'docs', 'bix2'));
fs.mkdirSync(out, { recursive: true });
const { bundle } = await import('@remotion/bundler');
const { renderStill, selectComposition } = await import('@remotion/renderer');
const browserExecutable = process.env.REMOTION_BROWSER ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src', 'index.ts') });
const jobs = [
  ['Bix2Lineup', {}, 'bix2-variants.png'],
  ['Bix2Emotions', { variant: 'A' }, 'bix2-A-emotions.png'],
  ['Bix2Emotions', { variant: 'B' }, 'bix2-B-emotions.png'],
  ['Bix2Emotions', { variant: 'C' }, 'bix2-C-emotions.png'],
  ['Bix2Phone', {}, 'bix2-phone-test-180px.png'],
];
for (const [id, inputProps, file] of jobs) {
  const composition = await selectComposition({ serveUrl, id, inputProps, browserExecutable });
  await renderStill({ composition, serveUrl, output: path.join(out, file), inputProps, browserExecutable });
  console.log('[bix2]', file);
}
