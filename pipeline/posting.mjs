#!/usr/bin/env node
// MarMila posting pack: every rendered video renamed in posting order + posting-schedule.csv,
// so a whole fortnight can be scheduled in one YouTube Studio session.
//
//   node pipeline/posting.mjs [--renders out] [--out posting/marmila-2weeks] [--start 2026-11-16]
//     [--episodes fr01-lune-disparait,fr02-genie-mechant,...] [--plan-only]
//
// Schedule (Europe/Zurich): long videos on days 1, 4, 7, 10 at 18:00; Shorts every day at 12:00
// and 18:00, except that on long-video days the 18:00 slot is the long video (Short at 12:00 only).
// Episode k's six Shorts fill the Short slots in order, so each topic is pushed around its episode.
// Checks: every file exists, Shorts are 15–25 s and 1080x1920, long videos 4–6 min and 1920x1080,
// loudness −14 LUFS (±1), thumbnails 1280x720, and no file belongs to another channel or appears twice.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEpisode } from './lib/script.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_EPISODES = ['fr01-lune-disparait', 'fr02-genie-mechant', 'fr03-evasion-prison', 'fr04-trou-traverse-terre'];
export const LONG_DAYS = [1, 4, 7, 10];
export const DAYS = 14;
export const CHANNEL = 'MarMila';
export const TIMEZONE = 'Europe/Zurich';

const isoDay = (start, offset) => {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** The 14-day slot grid: [{ day, date, time, type }] in posting order. */
export const slots = (start = '2026-11-16', days = DAYS, longDays = LONG_DAYS) => {
  const out = [];
  for (let day = 1; day <= days; day++) {
    const date = isoDay(start, day - 1);
    const long = longDays.includes(day);
    out.push({ day, date, time: '12:00', type: 'short' });
    out.push({ day, date, time: '18:00', type: long ? 'long' : 'short' });
  }
  return out;
};

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Posting plan from the episode scripts (no files needed): which video goes in which slot.
 * Returns [{ n, day, date, time, type, episode, short? , name }].
 */
export const plan = (episodes, start) => {
  const grid = slots(start);
  const longs = [...episodes];
  const shorts = episodes.flatMap((ep) => [...ep.tiktokShorts].sort((a, b) => a.n - b.n).map((sh) => ({ ep, sh })));
  const needLong = grid.filter((g) => g.type === 'long').length;
  const needShort = grid.filter((g) => g.type === 'short').length;
  if (longs.length !== needLong) throw new Error(`${longs.length} long videos for ${needLong} long slots`);
  if (shorts.length !== needShort) throw new Error(`${shorts.length} Shorts for ${needShort} Short slots`);
  let li = 0;
  let si = 0;
  return grid.map((g, i) => {
    const n = String(i + 1).padStart(2, '0');
    const stamp = `${g.date}-${g.time.replace(':', 'h')}`;
    if (g.type === 'long') {
      const ep = longs[li++];
      return { ...g, n, episode: ep, name: `${n}-${stamp}-long-${slug(ep.id.replace(/^fr\d+-/, ''))}` };
    }
    const { ep, sh } = shorts[si++];
    return { ...g, n, episode: ep, short: sh, name: `${n}-${stamp}-short-${sh.slug}` };
  });
};

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export const CSV_HEADER = ['date', `time (${TIMEZONE})`, 'channel', 'type', 'file', 'title', 'description', 'hashtags', 'pinned comment question',
  'thumbnail file', 'captions file', 'duration (s)'];

const probe = (file) => {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}`);
  return JSON.parse(r.stdout);
};
const loudness = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = [...r.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? Number(m[1]) : NaN;
};
const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

const main = () => {
  const args = process.argv.slice(2);
  const flag = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const renders = path.resolve(flag('renders', path.join(ROOT, 'out')));
  const outDir = path.resolve(flag('out', path.join(ROOT, 'posting', 'marmila-2weeks')));
  const start = flag('start', '2026-11-16');
  const ids = flag('episodes', DEFAULT_EPISODES.join(',')).split(',');
  const episodes = ids.map((id) => loadEpisode(path.join(ROOT, 'episodes', `${id}.yaml`)));
  for (const ep of episodes) if (ep.language !== 'fr' || ep.channel !== 'marmila') throw new Error(`${ep.id} is not a MarMila episode (no video may appear on two channels)`);
  const p = plan(episodes, start);
  if (args.includes('--plan-only')) {
    for (const r of p) console.log(`${r.n} ${r.date} ${r.time} ${r.type.padEnd(5)} ${r.name}`);
    return;
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [CSV_HEADER];
  const report = [];
  const problems = [];
  const hashes = new Map();
  for (const r of p) {
    const dir = path.join(renders, r.episode.id);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
    let src;
    let srt;
    let title;
    let description;
    let hashtags;
    let pinned;
    let thumb = '';
    if (r.type === 'long') {
      src = path.join(dir, meta.files.video);
      srt = path.join(dir, meta.files.captions);
      title = meta.title;
      description = meta.description;
      hashtags = meta.hashtags;
      pinned = meta.pinnedComment;
      thumb = `${r.name}-thumbnail.png`;
      fs.copyFileSync(path.join(dir, meta.files.thumbnail), path.join(outDir, thumb));
    } else {
      const s = meta.shorts.find((x) => x.n === r.short.n);
      src = path.join(dir, s.file);
      srt = path.join(dir, s.captions);
      title = s.title;
      description = s.description;
      hashtags = s.hashtags;
      pinned = s.pinnedComment;
      // Shorts cover: the first frame (hook title + captions are on frame 0)
      thumb = `${r.name}-cover.png`;
      spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1', path.join(outDir, thumb)]);
    }
    const file = `${r.name}.mp4`;
    const caps = `${r.name}.fr.srt`;
    fs.copyFileSync(src, path.join(outDir, file));
    fs.copyFileSync(srt, path.join(outDir, caps));
    // checks
    const pr = probe(src);
    const v = pr.streams.find((x) => x.codec_type === 'video');
    const dur = Number(pr.format.duration);
    const lufs = loudness(src);
    const tag = `${r.n} ${file}`;
    if (r.type === 'short') {
      if (!(dur >= 15 && dur <= 25)) problems.push(`${tag}: Short is ${dur.toFixed(2)} s (must be 15–25 s)`);
      if (v.width !== 1080 || v.height !== 1920) problems.push(`${tag}: ${v.width}x${v.height} (Short must be 1080x1920)`);
      if (!hashtags.includes('#Shorts')) problems.push(`${tag}: #Shorts missing`);
    } else {
      if (!(dur >= 240 && dur <= 360)) problems.push(`${tag}: long video is ${(dur / 60).toFixed(2)} min (must be 4–6 min)`);
      if (v.width !== 1920 || v.height !== 1080) problems.push(`${tag}: ${v.width}x${v.height} (long video must be 1920x1080)`);
      const t = probe(path.join(outDir, thumb)).streams[0];
      if (t.width !== 1280 || t.height !== 720) problems.push(`${tag}: thumbnail ${t.width}x${t.height} (must be 1280x720)`);
    }
    if (hashtags.length < 3 || hashtags.length > 5) problems.push(`${tag}: ${hashtags.length} hashtags (3–5)`);
    if (!(Math.abs(lufs + 14) <= 1)) problems.push(`${tag}: loudness ${lufs} LUFS (target −14)`);
    const h = sha1(src);
    if (hashes.has(h)) problems.push(`${tag}: same video as ${hashes.get(h)}`);
    hashes.set(h, tag);
    rows.push([r.date, r.time, CHANNEL, r.type, file, title, description, hashtags.join(' '), pinned, thumb, caps, dur.toFixed(1)]);
    report.push({ n: r.n, date: r.date, time: r.time, type: r.type, episode: r.episode.id, short: r.short?.slug ?? null, kind: r.short?.kind ?? null,
      file, thumbnail: thumb, captions: caps, duration: Number(dur.toFixed(2)), width: v.width, height: v.height, lufs, sha1: h });
    console.log(`[posting] ${tag}  ${dur.toFixed(1)} s  ${v.width}x${v.height}  ${lufs} LUFS`);
  }
  fs.writeFileSync(path.join(outDir, 'posting-schedule.csv'), '\ufeff' + toCsv(rows)); // BOM: opens cleanly in Excel / Numbers
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ channel: CHANNEL, timezone: TIMEZONE, start, videos: report }, null, 1));
  fs.writeFileSync(path.join(outDir, 'README.md'), packReadme(report, start));
  if (problems.length) {
    console.error(`[posting] ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`[posting] ${report.length} videos -> ${path.relative(ROOT, outDir)} (all checks OK)`);
};

const packReadme = (report, start) => [
  `# MarMila — posting pack (2 weeks from ${start})`,
  '',
  `Channel: **${CHANNEL}** only (none of these videos is posted on What If Bix). Times are **${TIMEZONE}** (CET in November).`,
  '',
  'Files are numbered in posting order. `posting-schedule.csv` has, for every video: date, time, type, file, title, description,',
  'hashtags, pinned-comment question, thumbnail (long videos) or cover (Shorts), captions file and duration.',
  '',
  '## In YouTube Studio (one session)',
  '',
  '1. **Create → Upload videos**, select all the `.mp4` files at once.',
  '2. For each upload, open its row in `posting-schedule.csv`: paste the title and description, add the hashtags if they are not',
  '   already at the end of the description, set **Audience: not made for kids**, **Language: French**, **Category: Education**.',
  '3. Long videos: upload the `-thumbnail.png`, add the `.fr.srt` under **Subtitles**, add an end screen (2 videos + subscribe) on',
  '   the last 20 s, and **Schedule** at the row\'s date and time.',
  '4. Shorts: add the `.fr.srt`, link the related long episode, and **Schedule** at the row\'s date and time.',
  '5. After each video goes live, post the **pinned comment question** and pin it.',
  '',
  '## Schedule',
  '',
  '| # | Date | Time | Type | File | Length |',
  '|---|---|---|---|---|---|',
  ...report.map((r) => `| ${r.n} | ${r.date} | ${r.time} | ${r.type} | \`${r.file}\` | ${r.duration.toFixed(1)} s |`),
  '',
].join('\n');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
