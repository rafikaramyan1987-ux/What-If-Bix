// YouTube metadata, chapters, SRT captions and Shorts manifests.

export const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** YouTube chapters: first at 0:00, at least 10 s each (short ones merge into the previous). */
export const buildChapters = (manifest, minLen = 10) => {
  const raw = manifest.scenes.filter((s) => s.chapter).map((s) => ({ time: s.start, title: s.chapter }));
  if (!raw.length) return [];
  raw[0].time = 0;
  const end = manifest.duration;
  const out = [];
  for (const c of raw) {
    if (out.length && c.time - out[out.length - 1].time < minLen) continue;
    out.push({ ...c });
  }
  if (out.length > 1 && end - out[out.length - 1].time < minLen) out.pop();
  return out;
};

const srtTime = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

/** SRT subtitles from caption pages (optionally shifted for a Short). */
export const buildSrt = (pages, offset = 0) =>
  pages
    .map((p, i) => `${i + 1}\n${srtTime(p.start - offset)} --> ${srtTime(p.end - offset)}\n${p.words.map((w) => w.text).join(' ')}\n`)
    .join('\n');

/** Manifests for each Short: a vertical slice of the long timeline. */
export const buildShortManifests = (ep, manifest) =>
  (ep.shorts ?? []).map((sh) => {
    const a = manifest.scenes.find((s) => s.id === sh.from);
    const b = manifest.scenes.find((s) => s.id === sh.to);
    if (!a || !b) throw new Error(`short ${sh.id}: unknown scene`);
    const start = a.start;
    const end = b.end + 0.4;
    const scenes = manifest.scenes
      .filter((s) => s.end > start && s.start < end)
      .map((s) => (s.id === sh.from ? { ...s, transition: 'cut' } : s));
    return {
      short: sh,
      start,
      end,
      manifest: {
        ...manifest,
        id: `${manifest.id}-${sh.id}`,
        title: sh.title,
        format: 'short',
        width: 1080,
        height: 1920,
        timeOffset: start,
        duration: Math.round((end - start) * manifest.fps) / manifest.fps,
        hook: sh.hook ?? ep.title.toUpperCase(),
        scenes,
        captions: manifest.captions.filter((p) => p.end > start && p.start < end),
      },
    };
  });

export const CREDIT_LINES = [
  'Animation, music and sound effects: made entirely in code for What If Bix (original; music/SFX CC0).',
  'Narration voice: Piper TTS, LibriTTS voice (CC BY 4.0).',
];

export const buildMetadata = (ep, manifest, shorts = []) => {
  const chapters = buildChapters(manifest);
  const sources = (ep.sources ?? []).map((s) => `• ${s}`);
  const tags = [...new Set([...(ep.tags ?? []), 'what if', 'what if bix', 'science', 'animation'])];
  let tagChars = 0;
  const tagsFit = tags.filter((t) => (tagChars += t.length + 1) <= 480); // YouTube limit is 500
  const description = [
    (ep.description ?? '').trim(),
    '',
    chapters.length ? 'Chapters:' : '',
    ...chapters.map((c) => `${fmtTime(c.time)} ${c.title}`),
    '',
    'Sources:',
    ...sources,
    '',
    ...CREDIT_LINES,
    '',
    '#science #whatif #animation',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return {
    id: ep.id,
    title: ep.title,
    description,
    tags: tagsFit,
    chapters: chapters.map((c) => ({ time: fmtTime(c.time), seconds: Math.round(c.time), title: c.title })),
    duration: manifest.duration,
    categoryId: 27, // Education
    madeForKids: false,
    defaultLanguage: 'en',
    files: { video: `${ep.id}.mp4`, thumbnail: 'thumbnail.png', captions: `${ep.id}.en.srt` },
    shorts: shorts.map((s) => ({
      id: s.short.id,
      file: `shorts/${s.short.id}.mp4`,
      title: s.short.title.includes('#Shorts') ? s.short.title : `${s.short.title} #Shorts`.slice(0, 100),
      description: `${s.short.description ?? ep.description?.split('\n')[0] ?? ''}\n\nFull episode: "${ep.title}" on the channel.\n\n${CREDIT_LINES.join('\n')}\n\n#Shorts #science #whatif`,
      duration: s.manifest.duration,
    })),
  };
};

export const metadataMarkdown = (meta) => {
  const lines = [
    `# ${meta.title}`,
    '',
    `**Duration:** ${fmtTime(meta.duration)} · **Category:** Education · **Made for kids:** No · **Language:** English`,
    '',
    '## Title',
    '',
    '```',
    meta.title,
    '```',
    '',
    '## Description',
    '',
    '```',
    meta.description,
    '```',
    '',
    '## Tags',
    '',
    '```',
    meta.tags.join(', '),
    '```',
    '',
    '## Shorts',
    '',
  ];
  for (const s of meta.shorts) {
    lines.push(`### ${s.file} (${s.duration.toFixed(1)} s)`, '', '```', s.title, '```', '', '```', s.description, '```', '');
  }
  return lines.join('\n');
};
