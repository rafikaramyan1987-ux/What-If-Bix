#!/usr/bin/env node
// What If Bix posting pack for episodes 6–9: renamed videos in posting order, thumbnails, captions,
// posting-schedule.csv and a README with the schedule and every source.
//
//   node pipeline/pack-whatifbix.mjs [--renders out] [--out posting-pack/whatifbix-ep06-ep09] [--plan-only]
//
// Schedule (Europe/Zurich): one Short a day at 18:00 from 2026-11-20 to 2026-12-13 (24 days), long episodes
// at 20:00 on 2026-11-20, 11-26, 12-02 and 12-08. Each episode's six Shorts run from the day of its long
// episode, so the Shorts of an episode never come before it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEpisode } from './lib/script.mjs';
import { toCsv } from './posting.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EPISODES = ['ep06-space-without-spacesuit', 'ep07-fall-into-black-hole', 'ep08-mariana-trench-dive', 'ep09-insects-disappear'];
export const LONG_DATES = ['2026-11-20', '2026-11-26', '2026-12-02', '2026-12-08'];
export const SHORTS_FROM = '2026-11-20';
export const SHORT_TIME = '18:00';
export const LONG_TIME = '20:00';
export const CSV_COLUMNS = ['file', 'date', 'time', 'type', 'title', 'description', 'hashtags', 'end_question'];

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const longSlug = (id) => id.replace(/^ep\d+-/, '');

/** Posting plan: 28 entries ordered by date and time, numbered 01–28. */
export const plan = (episodes) => {
  const items = [];
  episodes.forEach((ep, k) => {
    items.push({ type: 'long', date: LONG_DATES[k], time: LONG_TIME, episode: ep, slug: longSlug(ep.id) });
    [...ep.tiktokShorts].sort((a, b) => a.n - b.n).forEach((sh, j) => {
      items.push({ type: 'short', date: addDays(SHORTS_FROM, k * 6 + j), time: SHORT_TIME, episode: ep, short: sh, slug: sh.slug });
    });
  });
  items.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return items.map((it, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { ...it, n, name: `${n}-${it.date}-${it.time.replace(':', 'h')}-${it.type}-${it.slug}` };
  });
};

const main = () => {
  const args = process.argv.slice(2);
  const flag = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
  const renders = path.resolve(flag('renders', path.join(ROOT, 'out')));
  const out = path.resolve(flag('out', path.join(ROOT, 'posting-pack', 'whatifbix-ep06-ep09')));
  const episodes = EPISODES.map((id) => loadEpisode(path.join(ROOT, 'episodes', `${id}.yaml`)));
  const p = plan(episodes);
  if (args.includes('--plan-only')) {
    for (const r of p) console.log(`${r.n} ${r.date} ${r.time} ${r.type.padEnd(5)} ${r.name}.mp4`);
    return;
  }
  for (const d of ['1-upload', 'thumbnails', 'captions']) {
    fs.rmSync(path.join(out, d), { recursive: true, force: true });
    fs.mkdirSync(path.join(out, d), { recursive: true });
  }
  const rows = [CSV_COLUMNS];
  const report = [];
  for (const r of p) {
    const dir = path.join(renders, r.episode.id);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8'));
    const file = `${r.name}.mp4`;
    let src;
    let srt;
    let entry;
    if (r.type === 'long') {
      src = path.join(dir, meta.files.video);
      srt = path.join(dir, meta.files.captions);
      entry = { title: meta.title, description: meta.description, hashtags: meta.hashtags, endQuestion: meta.endQuestion };
      fs.copyFileSync(path.join(dir, meta.files.thumbnail), path.join(out, 'thumbnails', `${r.name}.png`));
    } else {
      const s = meta.shorts.find((x) => x.n === r.short.n);
      src = path.join(dir, s.file);
      srt = path.join(dir, s.captions);
      entry = { title: s.title, description: s.description, hashtags: s.hashtags, endQuestion: s.endQuestion };
    }
    if ([...entry.title].length > 70) throw new Error(`${file}: title longer than 70 characters`);
    if (entry.hashtags.length < 3 || entry.hashtags.length > 5) throw new Error(`${file}: needs 3–5 hashtags`);
    if (r.type === 'short' && entry.hashtags[0] !== '#Shorts') throw new Error(`${file}: #Shorts must come first`);
    fs.copyFileSync(src, path.join(out, '1-upload', file));
    fs.copyFileSync(srt, path.join(out, 'captions', `${r.name}.en.srt`));
    rows.push([file, r.date, r.time, r.type, entry.title, entry.description, entry.hashtags.join(' '), entry.endQuestion]);
    report.push({ ...r, ...entry, file, episodeTitle: r.episode.title });
    console.log(`[pack] ${file}`);
  }
  fs.writeFileSync(path.join(out, 'posting-schedule.csv'), '﻿' + toCsv(rows));
  fs.writeFileSync(path.join(out, 'README.md'), readme(report, episodes, out));
  console.log(`[pack] ${report.length} videos -> ${path.relative(ROOT, out)}`);
};

const readme = (report, episodes, out) => {
  const qa = path.join(out, 'qa', 'qa-report.md');
  return [
    '# What If Bix — posting pack, episodes 6–9',
    '',
    'Channel: **What If Bix** (English). Times are **Europe/Zurich** (CET). Made for kids: **No** for every video.',
    '',
    '| Folder / file | What |',
    '|---|---|',
    '| `1-upload/` | the 28 videos, numbered in posting order: `NN-YYYY-MM-DD-HHhMM-type-slug.mp4` |',
    '| `thumbnails/` | one 1280×720 thumbnail per long episode (same name as its video) |',
    '| `captions/` | an English `.en.srt` for every video (same name as its video) |',
    '| `posting-schedule.csv` | UTF-8 with BOM: file, date, time, type, title, description, hashtags, end_question |',
    '| `qa/` | the quality check: `qa-report.md` / `.json`, and phone-size sheets of every video at 0 s, middle and last second |',
    '',
    '## Schedule',
    '',
    '| # | Date | Time | Type | File | Title |',
    '|---|---|---|---|---|---|',
    ...report.map((r) => `| ${r.n} | ${r.date} | ${r.time} | ${r.type} | \`${r.file}\` | ${r.title} |`),
    '',
    '## In YouTube Studio',
    '',
    '1. **Create → Upload videos**, select everything in `1-upload/`.',
    '2. For each video, copy the title, description and hashtags from its row in `posting-schedule.csv`. **Audience: No, it\'s not made for kids.**',
    '   Language: English. Category: Education. Subtitles: upload the matching file from `captions/`.',
    '3. Long videos: upload the matching thumbnail from `thumbnails/`; end screen with 2 videos + subscribe on the last 20 s.',
    '4. Shorts: link the full episode under **Related video**.',
    '5. **Schedule** each video at its date and time (Europe/Zurich). After it goes live, pin the `end_question` as a comment.',
    '',
    '## Sources (every fact in the videos)',
    '',
    'Every number and claim in the scripts was checked against these sources before rendering. How: web searches of the official',
    'pages and papers (NASA, ESA, ESO/EHT, LIGO, NOAA, USGS, US Navy history, CSIRO, IPBES, Smithsonian, peer-reviewed DOIs). Some',
    'official hosts could not be opened in full from the build machine, so those checks rely on the search results and abstracts',
    'of those exact pages. Where no official page exists (e.g. the Armstrong limit, the 1966 NASA chamber accident) a clearly',
    'labelled encyclopedia or press source is given. Estimates are said with "about", "scientists think" or "scientists estimate".',
    'Corrections made during the check: the 1966 accident (14 Dec 1966, unconscious after ~14 s, chamber refilled in ~1 min); dogs',
    'recovered from ~90 s of near vacuum (not longer); no number for how fast unfiltered UV burns; the Sichuan hand-pollination',
    'study is about Maoxian County apples; almond hives are "about two million"; no exact temperature for the trench bottom.',
    '',
    ...episodes.flatMap((ep) => [`### ${ep.title}`, '', ...(ep.sources ?? []).map((s) => `- ${s}`), '']),
    fs.existsSync(qa) ? '## Quality check\n\nSee [`qa/qa-report.md`](qa/qa-report.md).\n' : '',
  ].join('\n');
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
