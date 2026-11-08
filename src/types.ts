import type { BixCue, Vec } from './bix/motion';

// The render manifest is produced by pipeline/build.mjs from an episode script.
// All times are absolute seconds on the episode timeline.

export type Spec = { type: string; [key: string]: unknown };

export type TextSpec = {
  at: number;
  until?: number;
  text: string;
  style?: 'title' | 'label' | 'big' | 'note' | 'shout';
  x?: number;
  y?: number;
  color?: string;
  rotate?: number;
  count?: { from: number; to: number; dur?: number; decimals?: number; prefix?: string; suffix?: string };
};

export type ChipSpec = { at: number; until?: number; label: string; icon?: 'clock' | 'calendar' | 'globe' | 'bolt' };

export type CameraSpec = {
  zoom?: [number, number];
  focus?: Vec;
  pan?: [Vec, Vec];
  shake?: number[];
  shakeAmp?: number;
};

export type Transition = 'cut' | 'whip' | 'iris' | 'fade' | 'pop';

export type Scene = {
  id: string;
  start: number;
  end: number;
  background: Spec;
  props: Spec[];
  bix: BixCue[];
  bixDefaults?: { pos: Vec; scale: number; facing: 1 | -1 };
  texts: TextSpec[];
  chips: ChipSpec[];
  camera?: CameraSpec;
  transition?: Transition;
  /** Special generated scenes: the channel intro sting and the end screen. */
  kind?: 'intro' | 'endscreen' | 'cta';
  /** Shorts: fixed horizontal crop centre for this scene (default: follow Bix). */
  focus?: number;
};

export type CaptionWord = { text: string; start: number; end: number; emphasis?: boolean };
export type CaptionPage = { start: number; end: number; words: CaptionWord[] };

export type Manifest = {
  id: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  format: 'long' | 'short';
  scenes: Scene[];
  captions: CaptionPage[];
  /** Shorts: horizontal crop window center over the 1920-wide stage, per scene. */
  reframe?: { at: number; x: number; zoom?: number }[];
  /** Offset when rendering a slice of the episode (Shorts). */
  timeOffset?: number;
  /** Shorts: banner text at the top. */
  hook?: string;
  /** Which Bix to draw (default: Bix 2.0). */
  character?: 'bix1' | 'bix2';
};

export type ThumbnailProps = {
  character?: 'bix1' | 'bix2';
  title: string[];
  accent?: number; // index of the title line drawn in the accent color
  subtitle?: string;
  background: Spec;
  props: Spec[];
  bix: { action: string; x?: number; y?: number; scale?: number; facing?: 1 | -1; hold?: string; t?: number };
  badge?: string;
};
