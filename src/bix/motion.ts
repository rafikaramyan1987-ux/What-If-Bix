import { actionPose, blendPose, BixAction, Emote, Face, Pose } from './poses';

export type Vec = [number, number];

export type BixCue = {
  at: number; // absolute seconds
  action: BixAction;
  from?: Vec;
  to?: Vec;
  dur?: number; // seconds to travel from -> to
  arc?: number; // px of upward arc while travelling
  facing?: 1 | -1;
  scale?: number;
  hold?: string; // prop held in the near hand
  params?: Record<string, number>;
  hidden?: boolean;
};

export type BixState = {
  x: number;
  y: number;
  scale: number;
  facing: 1 | -1;
  pose: Pose;
  face: Face;
  emote: Emote;
  hold?: string;
  hidden: boolean;
  action: BixAction;
  airborne: number; // px above ground (for shadow)
};

type Resolved = BixCue & { start: Vec; end: Vec; travel: number; scaleV: number; facingV: 1 | -1 };

const BLEND = 0.18;
const SPEED: Partial<Record<BixAction, number>> = { walk: 190, run: 520, fly: 900, tumble: 700, float: 120 };

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export const resolveCues = (cues: BixCue[], defaults: { pos: Vec; scale: number; facing: 1 | -1 }): Resolved[] => {
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  const out: Resolved[] = [];
  let pos = defaults.pos;
  let scale = defaults.scale;
  let facing = defaults.facing;
  for (const c of sorted) {
    const start = c.from ?? pos;
    const end = c.to ?? start;
    const dist = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const travel = dist === 0 ? 0 : c.dur ?? dist / (SPEED[c.action] ?? 300);
    if (c.facing) facing = c.facing;
    else if (Math.abs(end[0] - start[0]) > 1) facing = end[0] > start[0] ? 1 : -1;
    scale = c.scale ?? scale;
    out.push({ ...c, start, end, travel, scaleV: scale, facingV: facing });
    pos = end;
  }
  return out;
};

const posAt = (c: Resolved, t: number): { p: Vec; arcY: number } => {
  if (c.travel <= 0) return { p: c.end, arcY: 0 };
  const raw = Math.min(1, Math.max(0, (t - c.at) / c.travel));
  const linear = c.action === 'walk' || c.action === 'run' || c.action === 'fly' || c.action === 'tumble';
  const k = linear ? raw : easeInOut(raw);
  const arcY = (c.arc ?? 0) * 4 * raw * (1 - raw);
  return { p: [c.start[0] + (c.end[0] - c.start[0]) * k, c.start[1] + (c.end[1] - c.start[1]) * k], arcY };
};

/** Locomotion actions turn into idle once Bix arrives at the destination. */
const effectiveAction = (c: Resolved, t: number): BixAction => {
  if ((c.action === 'walk' || c.action === 'run') && c.travel > 0 && t > c.at + c.travel) return 'idle';
  return c.action;
};

export const bixStateAt = (resolved: Resolved[], t: number, seed = 0): BixState | null => {
  if (!resolved.length) return null;
  let i = -1;
  for (let k = 0; k < resolved.length; k++) if (resolved[k].at <= t) i = k;
  if (i < 0) i = 0;
  const cur = resolved[i];
  const prev = i > 0 ? resolved[i - 1] : undefined;
  const tt = t + seed * 0.37;
  const curA = effectiveAction(cur, t);
  const curStart = curA === cur.action ? cur.at : cur.at + cur.travel;
  const now = actionPose(curA, t - curStart, tt, cur.params);
  let pose = now.pose;
  let face = now.face;
  const since = t - curStart;
  if (since < BLEND) {
    const from = prev && curA === cur.action
      ? actionPose(effectiveAction(prev, t), t - prev.at, tt, prev.params).pose
      : curA !== cur.action
        ? actionPose(cur.action, t - cur.at, tt, cur.params).pose
        : pose;
    pose = blendPose(from, pose, easeInOut(Math.max(0, since) / BLEND));
  }
  const { p, arcY } = posAt(cur, t);
  let scale = cur.scaleV;
  if (prev && t - cur.at < BLEND && prev.scaleV !== cur.scaleV) {
    scale = prev.scaleV + (cur.scaleV - prev.scaleV) * easeInOut((t - cur.at) / BLEND);
  }
  return {
    x: p[0],
    y: p[1] - arcY,
    scale,
    facing: cur.facingV,
    pose,
    face,
    emote: now.emote,
    hold: cur.hold,
    hidden: !!cur.hidden,
    action: curA,
    airborne: Math.max(0, pose.bob) + arcY,
  };
};
