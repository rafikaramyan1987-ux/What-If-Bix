import React, { useMemo } from 'react';
import { Bix } from '../bix/Bix';
import { bixStateAt, resolveCues } from '../bix/motion';
import { Scene } from '../types';
import { clamp, easeInOut, lerp } from '../util';
import { Background } from './backgrounds';
import { Prop } from './props';

export const cameraTransform = (scene: Scene, t: number) => {
  const cam = scene.camera ?? {};
  const k = easeInOut((t - scene.start) / Math.max(0.01, scene.end - scene.start));
  const zoom = cam.zoom ? lerp(cam.zoom[0], cam.zoom[1], k) : 1;
  const focus = cam.pan ? [lerp(cam.pan[0][0], cam.pan[1][0], k), lerp(cam.pan[0][1], cam.pan[1][1], k)] : cam.focus ?? [960, 540];
  let sx = 0;
  let sy = 0;
  for (const s of cam.shake ?? []) {
    const d = t - s;
    if (d >= 0 && d < 0.6) {
      const a = (cam.shakeAmp ?? 22) * (1 - d / 0.6);
      sx += a * Math.sin(d * 83);
      sy += a * Math.cos(d * 71);
    }
  }
  return `translate(${960 + sx} ${540 + sy}) scale(${zoom}) translate(${-focus[0]} ${-focus[1]})`;
};

/** Draws one scene on the 1920x1080 stage (background, props, Bix) with its camera. */
export const SceneView: React.FC<{ scene: Scene; t: number; index: number }> = ({ scene, t, index }) => {
  const resolved = useMemo(
    () => resolveCues(scene.bix, scene.bixDefaults ?? { pos: [960, 820], scale: 1, facing: 1 }),
    [scene],
  );
  const st = bixStateAt(resolved, t, index);
  const back = scene.props.filter((p) => p.layer !== 'front');
  const front = scene.props.filter((p) => p.layer === 'front');
  const bgFixed = scene.background.fixed === true;
  return (
    <g>
      {bgFixed && <Background spec={scene.background} t={t} />}
      <g transform={cameraTransform(scene, t)}>
        {!bgFixed && <Background spec={scene.background} t={t} />}
        {back.map((p, i) => (
          <Prop key={i} spec={p} t={t} />
        ))}
        {st && !st.hidden && (
          <Bix x={st.x} y={st.y} scale={st.scale} facing={st.facing} pose={st.pose} face={st.face} emote={st.emote} t={t}
            hold={st.hold} airborne={st.airborne} shadow={st.action !== 'fly' && st.action !== 'float' && st.action !== 'tumble'} seed={index} />
        )}
        {front.map((p, i) => (
          <Prop key={i} spec={p} t={t} />
        ))}
      </g>
    </g>
  );
};

export const transitionProgress = (scene: Scene, t: number, dur = 0.4) => clamp((t - scene.start) / dur);
