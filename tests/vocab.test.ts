import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module
import * as V from '../pipeline/lib/vocab.mjs';
import { ACTIONS } from '../src/bix/poses';
import { BACKGROUNDS } from '../src/scene/backgrounds';
import { PROPS } from '../src/scene/props';
import { Held } from '../src/props/Held';

describe('script vocabulary matches the renderer', () => {
  it('actions', () => expect([...ACTIONS].sort()).toEqual([...V.BIX_ACTIONS].sort()));
  it('backgrounds', () => expect(Object.keys(BACKGROUNDS).sort()).toEqual([...V.BACKGROUNDS].sort()));
  it('props', () => expect(Object.keys(PROPS).sort()).toEqual([...V.PROPS].sort()));
  it('held items render', () => {
    for (const item of V.ITEMS) expect(Held({ kind: item })).not.toBeNull();
  });
});
