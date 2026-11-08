// Shorts are built as standalone mini-episodes: a run of scenes from the episode
// (with per-Short overrides so the first line is a hook that needs no context),
// followed by an animated SUBSCRIBE call-to-action.

export const DEFAULT_CTA = 'Subscribe for more what ifs!';
export const SHORT_MIN = 35;
export const SHORT_MAX = 59;
export const SHORT_MUSIC_OFFSET = 19.2; // start the music where the beat + melody are already going

/** The CTA scene appended to every Short (rendered by the vertical CTA overlay). */
export const ctaScene = (text = DEFAULT_CTA) => ({
  id: '_cta',
  kind: 'cta',
  background: { type: 'space' },
  narration: text,
  lead: 0.15,
  tail: 0.2,
  transition: 'cut',
  props: [],
  bix: [],
});

/**
 * Turn one `shorts:` entry into an episode-like object that buildTimeline() understands.
 * Short fields: id, title, from, to, hook, cta, scenes: { <sceneId>: { ...overrides } }.
 */
export const shortEpisode = (ep, sh) => {
  const a = ep.scenes.findIndex((s) => s.id === sh.from);
  const b = ep.scenes.findIndex((s) => s.id === sh.to);
  if (a < 0 || b < 0 || b < a) throw new Error(`short ${sh.id}: from/to must be scene ids in order`);
  const overrides = sh.scenes ?? {};
  for (const id of Object.keys(overrides)) {
    if (!ep.scenes.slice(a, b + 1).some((s) => s.id === id)) throw new Error(`short ${sh.id}: override for scene "${id}" outside ${sh.from}..${sh.to}`);
  }
  const scenes = ep.scenes.slice(a, b + 1).map((s, i) => {
    const o = overrides[s.id] ?? {};
    const merged = { ...s, ...o };
    delete merged.chapter;
    if (i === 0) {
      merged.transition = 'cut';
      merged.lead = o.lead ?? 0.1; // hook starts immediately
    }
    return merged;
  });
  return {
    id: `${ep.id}-${sh.id}`,
    title: sh.title,
    voice: ep.voice,
    music: { ...(ep.music ?? { style: 'curious' }), offset: sh.musicOffset ?? SHORT_MUSIC_OFFSET },
    scenes: [...scenes, ctaScene(sh.cta ?? DEFAULT_CTA)],
    short: sh,
  };
};

/** Finish a Short's manifest: vertical format, hook banner. */
export const toShortManifest = (manifest, sh, ep) => ({
  ...manifest,
  format: 'short',
  width: 1080,
  height: 1920,
  timeOffset: 0,
  hook: sh.hook ?? ep.title.toUpperCase(),
});
