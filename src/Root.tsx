import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { CharacterSheet } from './compositions/CharacterSheet';
import { calculateEpisodeMetadata, Episode } from './compositions/Episode';
import { Thumbnail } from './compositions/Thumbnail';
import { Manifest, ThumbnailProps } from './types';

const demo: Manifest = {
  id: 'demo', title: 'Demo', fps: 30, width: 1920, height: 1080, duration: 4, format: 'long', captions: [],
  scenes: [{
    id: 'demo', start: 0, end: 4, background: { type: 'space' }, props: [{ type: 'earth', x: 960, y: 1500, r: 900, spin: 0.03, tilt: 0 }],
    bix: [{ at: 0, action: 'walk' }], bixDefaults: { pos: [960, 604], scale: 0.85, facing: 1 }, texts: [], chips: [],
  }],
};

const demoThumb: ThumbnailProps = {
  title: ['WHAT IF', 'BIX?'], accent: 1, background: { type: 'space' }, props: [], bix: { action: 'shock' },
};

export const Root: React.FC = () => (
  <>
    <Composition id="Episode" component={Episode} defaultProps={demo} calculateMetadata={calculateEpisodeMetadata}
      durationInFrames={120} fps={30} width={1920} height={1080} />
    <Composition id="Thumbnail" component={Thumbnail} defaultProps={demoThumb} durationInFrames={1} fps={30} width={1280} height={720} />
    <Composition id="CharacterSheet" component={CharacterSheet} durationInFrames={90} fps={30} width={1920} height={1080} />
  </>
);
