// Language support: English (What If Bix, unchanged) and French (MarMila).
// Every function is a no-op for English, so English episodes build exactly as before.

export const LANGUAGES = ['en', 'fr'];
export const langOf = (ep) => ep?.language ?? 'en';

export const NNBSP = '\u202f'; // espace fine insécable: before ; ! ? and as thousands separator
export const NBSP = '\u00a0'; // espace insécable: before : and inside « »

/** Units written right after a number (an espace insécable joins them: "384 400 km"). */
const UNITS = 'km/h|km/s|km²|km|m/s|m²|m|cm|mm|kg|g|t|°C|°|%|h|min|s|ms|ans?|jours?|heures?|minutes?|secondes?|fois|millions?|milliards?|mètres?|kilomètres?|degrés?';

/**
 * French typography for any text shown or published (captions, on-screen texts, titles,
 * descriptions, SRT). Idempotent.
 *  - espace fine insécable (U+202F) before ? ! ; and between digit groups (384 400)
 *  - espace insécable (U+00A0) before : (not in URLs or times like 18:00), inside « »,
 *    and between a number and its unit (3,8 cm)
 *  - straight apostrophe -> ’ (typographic apostrophe), except inside URLs and hashtags
 */
export const frTypo = (input) => {
  if (input == null) return input;
  return String(input)
    .split(/(https?:\/\/\S+)/)
    .map((part, i) => {
      if (i % 2) return part; // URL, untouched
      let s = part;
      s = s.replace(/(\p{L})'(?=\p{L})/gu, '$1’');
      // one thin no-break space before ? ! ; (a run like "?!" counts as one mark)
      s = s.replace(/(\S)[ \u00a0\u202f]*([?!;]+)/gu, (m, a, p) => (/[?!;]/.test(a) ? m : `${a}${NNBSP}${p}`));
      // no-break space before a colon that ends a clause (not in times like 18:00)
      s = s.replace(/(\S)[ \u00a0\u202f]*:(?=\s|$)/gu, `$1${NBSP}:`);
      // guillemets
      s = s.replace(/«[ \u00a0\u202f]*/g, `«${NBSP}`).replace(/[ \u00a0\u202f]*»/g, `${NBSP}»`);
      // digit groups: 384 400 -> 384 400 (thin no-break space); keep years/times alone
      s = s.replace(/(\d)[ \u00a0\u202f](?=\d{3}(?!\d))/g, `$1${NNBSP}`);
      // number + unit
      s = s.replace(new RegExp(`(\\d)[ \\u202f](?=(?:${UNITS})(?![\\p{L}]))`, 'gu'), `$1${NBSP}`);
      return s;
    })
    .join('');
};

/** Apply the language's typography (identity for English). */
export const typo = (s, lang) => (lang === 'fr' ? frTypo(s) : s);

/** Remove non-breaking spaces again (for TTS input and for word matching). */
export const plainSpaces = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');

/**
 * Normalise a word for "@word" matching. English: the original rule (ASCII letters and
 * digits). French: Unicode letters (é, à, ç, œ…), typographic apostrophes and NBSPs.
 */
export const normWordFor = (w, lang = 'en') => {
  if (lang !== 'fr') {
    return String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  }
  return String(w)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
};

/**
 * French "@word" matching: a unit also matches by any of its words ("@degrés" finds
 * "{23,4 degrés|…}", "@384" finds "384 400 km") and without its elided article
 * ("@animaux" finds "d'animaux", "@éloigne" finds "s'éloigne").
 */
export const frMatches = (key, ref) => {
  if (key === ref) return true;
  for (const tok of key.split(' ')) {
    const t = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (t === ref) return true;
    const el = t.match(/^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu)'(.+)$/u);
    if (el && el[1] === ref) return true;
  }
  return false;
};

/** Whitespace that separates caption/TTS units. French keeps "demain ?" and "384 400" together. */
export const unitSplitter = (lang) => (lang === 'fr' ? /[^\S\u00a0\u202f]+/ : /\s+/);

/** Per-language channel strings (titles, credits, file suffixes). */
export const CHANNELS = {
  en: {
    channel: 'What If Bix',
    captionsExt: 'en.srt',
    credits: [
      'Animation, music and sound effects: made entirely in code for What If Bix (original; music/SFX CC0).',
      'Narration voice: Piper TTS, en_US LibriTTS voice (CC BY 4.0: https://creativecommons.org/licenses/by/4.0/)',
    ],
    hashtags: '#science #whatif #animation',
    chapters: 'Chapters:',
    sources: 'Sources:',
    fullEpisode: (title) => `Full episode: "${title}" on the channel.`,
    shortsTags: '#Shorts #science #whatif',
    baseTags: ['what if', 'what if bix', 'science', 'animation'],
  },
  fr: {
    channel: 'MarMila',
    captionsExt: 'fr.srt',
    credits: [
      'Animation, musique et bruitages : entièrement créés en code pour MarMila (originaux ; musique et bruitages CC0).',
      // the narration line is filled in from the voice (see voiceCredit)
    ],
    hashtags: '#science #etsi #animation',
    chapters: 'Chapitres :',
    sources: 'Sources :',
    fullEpisode: (title) => `Épisode complet : « ${title} » sur la chaîne.`,
    shortsTags: '#Shorts #science #etsi',
    baseTags: ['et si', 'marmila', 'science', 'vulgarisation', 'animation'],
  },
};

/** License line for the French narration voice (from pipeline/lib/voices.mjs). */
export const FR_VOICES = {
  'fr_FR-siwis-medium': { credit: 'Voix off : Piper TTS, voix fr_FR « siwis » (SIWIS, CC BY 4.0 : https://creativecommons.org/licenses/by/4.0/)' },
  'fr-siwis-medium': { credit: 'Voix off : Piper TTS, voix fr_FR « siwis » (SIWIS, CC BY 4.0 : https://creativecommons.org/licenses/by/4.0/)' },
  'fr_FR-tom-medium': { credit: 'Voix off : Piper TTS, voix fr_FR « tom » (Piper voices, rhasspy)' },
  'fr_FR-upmc-medium': { credit: 'Voix off : Piper TTS, voix fr_FR « upmc » (Piper voices, rhasspy)' },
};

export const channelStrings = (lang, voiceModel) => {
  const c = CHANNELS[lang] ?? CHANNELS.en;
  if (lang !== 'fr') return c;
  const v = FR_VOICES[voiceModel] ?? { credit: `Voix off : Piper TTS (${voiceModel})` };
  return { ...c, credits: [...c.credits, frTypo(v.credit)] };
};
