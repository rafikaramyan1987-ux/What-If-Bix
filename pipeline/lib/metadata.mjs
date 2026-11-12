// YouTube metadata, chapters, SRT captions and Shorts manifests.
import { channelStrings, frTypo, langOf } from './lang.mjs';

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

/**
 * Compact one-line source for the YouTube description: "Author et al. 2012: https://doi.org/…".
 * The full citation stays in sources.txt.
 */
export const shortSource = (raw) => {
  const s = String(raw);
  const url = (s.match(/https?:\/\/\S+/g) ?? []).pop();
  const paper = s.match(/^([A-Z][A-Za-zÀ-ž'’-]+),[^()]*?\((\d{4})\)/);
  let label;
  if (paper) {
    const authors = s.slice(0, s.indexOf(`(${paper[2]})`));
    const many = /&|et al\./.test(authors) || (authors.match(/,/g) ?? []).length > 2;
    label = `${paper[1]}${many ? ' et al.' : ''} ${paper[2]}`;
  } else {
    label = s.split(' — ')[0].replace(/:\s*https?:\/\/\S+$/, '').trim();
    if (label.length > 70) label = `${label.slice(0, 67).trimEnd()}…`;
  }
  return url ? `${label}: ${url}` : label;
};

export const CREDIT_LINES = [
  'Animation, music and sound effects: made entirely in code for What If Bix (original; music/SFX CC0).',
  'Narration voice: Piper TTS, en_US LibriTTS voice (CC BY 4.0: https://creativecommons.org/licenses/by/4.0/)',
];

export const buildMetadata = (ep, manifest, shorts = []) => {
  if (langOf(ep) === 'fr') return buildFrenchMetadata(ep, manifest, shorts);
  if (ep.tiktokShorts) return buildPackMetadata(ep, manifest, shorts);
  const chapters = buildChapters(manifest);
  const sources = (ep.sources ?? []).map((s) => `• ${shortSource(s)}`);
  const tags = [...new Set([...(ep.tags ?? []), 'what if', 'what if bix', 'science', 'animation'])];
  let tagChars = 0;
  const tagsFit = tags.filter((t) => (tagChars += t.length + 1) <= 480); // YouTube limit is 500
  const compose = (srcLines) => [
    (ep.description ?? '').trim(),
    '',
    chapters.length ? 'Chapters:' : '',
    ...chapters.map((c) => `${fmtTime(c.time)} ${c.title}`),
    '',
    'Sources:',
    ...srcLines,
    '',
    ...CREDIT_LINES,
    '',
    '#science #whatif #animation',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  // YouTube caps descriptions at 5,000 characters: fall back to bare URLs if needed
  let description = compose(sources);
  if (description.length > 4900) {
    description = compose((ep.sources ?? []).map((x) => `• ${String(x).match(/https?:\/\/\S+/)?.[0] ?? String(x).slice(0, 80)}`));
  }
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

const hashtagsIn = (text) => String(text ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? [];
const withoutHashtags = (text) => String(text ?? '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+$/gm, '').trim();

/**
 * What If Bix pack metadata (episodes with inline `tiktokShorts:`, from episode 6): the long video gets a short
 * description, the end question, chapters, sources, the standard credits block and 3–5 hashtags; every Short gets its
 * own 2–3 line description, its end question, a "Full episode" line, the credits and 3–5 hashtags with #Shorts first.
 */
export const buildPackMetadata = (ep, manifest, shorts = []) => {
  const chapters = buildChapters(manifest);
  const tags = [...new Set([...(ep.tags ?? []), 'what if', 'what if bix', 'science', 'animation'])];
  let tagChars = 0;
  const tagsFit = tags.filter((t) => (tagChars += t.length + 1) <= 480);
  const hashtags = ep.hashtags ?? ['#whatif', '#science', '#animation'];
  const compose = (srcLines) => [
    (ep.description ?? '').trim(),
    '',
    ep.pinnedQuestion ?? '',
    '',
    chapters.length ? 'Chapters:' : '',
    ...chapters.map((c) => `${fmtTime(c.time)} ${c.title}`),
    '',
    'Sources:',
    ...srcLines,
    '',
    ...CREDIT_LINES,
    '',
    hashtags.join(' '),
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  let description = compose((ep.sources ?? []).map((x) => `• ${shortSource(x)}`));
  if (description.length > 4900) description = compose((ep.sources ?? []).map((x) => `• ${String(x).match(/https?:\/\/\S+/)?.[0] ?? String(x).slice(0, 80)}`));
  return {
    id: ep.id,
    channel: 'What If Bix',
    title: ep.title,
    description,
    tags: tagsFit,
    hashtags,
    endQuestion: ep.pinnedQuestion ?? null,
    pinnedComment: ep.pinnedQuestion ?? null,
    chapters: chapters.map((c) => ({ time: fmtTime(c.time), seconds: Math.round(c.time), title: c.title })),
    duration: manifest.duration,
    categoryId: 27,
    madeForKids: false,
    defaultLanguage: 'en',
    files: { video: `${ep.id}.mp4`, thumbnail: 'thumbnail.png', captions: `${ep.id}.en.srt` },
    shorts: shorts.map((s) => {
      const sh = s.short;
      const shTags = [...new Set(['#Shorts', ...hashtagsIn(sh.tiktokCaption)])].slice(0, 5);
      return {
        id: `${sh.n}-${sh.slug}`,
        n: sh.n,
        kind: sh.kind ?? 'cut',
        file: `shorts/${sh.n}-${sh.slug}.mp4`,
        captions: `shorts/${sh.n}-${sh.slug}.en.srt`,
        title: sh.youtubeTitle,
        hook: sh.hook,
        description: `${withoutHashtags(sh.tiktokCaption)}\n${sh.question}\n\nFull episode: "${ep.title}" on the channel.\n\n${CREDIT_LINES.join('\n')}\n\n${shTags.join(' ')}`,
        hashtags: shTags,
        endQuestion: sh.question,
        pinnedComment: sh.question,
        duration: s.manifest.duration,
      };
    }),
  };
};

/**
 * MarMila (French) metadata: French labels and credits, French typography everywhere,
 * captions as <id>.fr.srt, and one entry per TikTok-rule Short (title, description,
 * 3–5 hashtags incl. #Shorts, pinned-comment question).
 */
export const buildFrenchMetadata = (ep, manifest, shorts = []) => {
  const ch = channelStrings('fr', ep.voice?.model ?? 'fr_FR-siwis-medium');
  const chapters = buildChapters(manifest);
  const tags = [...new Set([...(ep.tags ?? []), ...ch.baseTags])];
  let tagChars = 0;
  const tagsFit = tags.filter((t) => (tagChars += t.length + 1) <= 480);
  const hashtags = ep.hashtags ?? ['#etsi', '#science', '#marmila'];
  // French typography on our own text; source titles (often English) are quoted as they are
  const compose = (srcLines) => [
    frTypo((ep.description ?? '').trim()),
    '',
    chapters.length ? frTypo(ch.chapters) : '',
    ...chapters.map((c) => frTypo(`${fmtTime(c.time)} ${c.title}`)),
    '',
    frTypo(ch.sources),
    ...srcLines,
    '',
    ...ch.credits.map(frTypo),
    '',
    hashtags.join(' '),
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  let description = compose((ep.sources ?? []).map((s) => `• ${shortSource(s).replace(/:\s(https?:\/\/)/, '\u00a0: $1')}`));
  if (description.length > 4900) description = compose((ep.sources ?? []).map((x) => `• ${String(x).match(/https?:\/\/\S+/)?.[0] ?? String(x).slice(0, 80)}`));
  return {
    id: ep.id,
    channel: ch.channel,
    title: ep.title,
    description,
    tags: tagsFit,
    hashtags,
    pinnedComment: ep.pinnedQuestion ?? null,
    chapters: chapters.map((c) => ({ time: fmtTime(c.time), seconds: Math.round(c.time), title: c.title })),
    duration: manifest.duration,
    categoryId: 27,
    madeForKids: false,
    defaultLanguage: 'fr',
    files: { video: `${ep.id}.mp4`, thumbnail: 'thumbnail.png', captions: `${ep.id}.${ch.captionsExt}` },
    shorts: shorts.map((s) => {
      const sh = s.short;
      const tagsOf = (String(sh.tiktokCaption ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? []);
      const shTags = [...new Set(['#Shorts', ...tagsOf])].slice(0, 5);
      const caption = String(sh.tiktokCaption ?? '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s+$/,'').trim();
      return {
        id: `${sh.n}-${sh.slug}`,
        n: sh.n,
        kind: sh.kind ?? 'cut',
        file: `shorts/${sh.n}-${sh.slug}.mp4`,
        captions: `shorts/${sh.n}-${sh.slug}.${ch.captionsExt}`,
        title: sh.youtubeTitle,
        hook: sh.hook,
        description: frTypo(`${caption}\n\n${ch.fullEpisode(ep.title)}\n\n${ch.credits.join('\n')}\n\n${shTags.join(' ')}`),
        hashtags: shTags,
        pinnedComment: sh.question,
        duration: s.manifest.duration,
      };
    }),
  };
};

export const metadataMarkdown = (meta) => {
  const fr = meta.defaultLanguage === 'fr';
  const lines = [
    `# ${meta.title}`,
    '',
    meta.defaultLanguage === 'fr'
      ? `**Durée :** ${fmtTime(meta.duration)} · **Catégorie :** Éducation · **Conçu pour les enfants :** Non · **Langue :** Français · **Chaîne :** ${meta.channel}`
      : `**Duration:** ${fmtTime(meta.duration)} · **Category:** Education · **Made for kids:** No · **Language:** English`,
    '',
    fr ? '## Titre' : '## Title',
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
    fr ? '## Mots-clés' : '## Tags',
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
    if (s.pinnedComment) lines.push(`${fr ? 'Commentaire épinglé :' : 'End question / pinned comment:'} ${s.pinnedComment}`, '');
  }
  if (meta.pinnedComment) lines.push(fr ? '## Commentaire épinglé' : '## End question / pinned comment', '', '```', meta.pinnedComment, '```', '');
  return lines.join('\n');
};
