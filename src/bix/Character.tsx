import React, { useContext } from 'react';
import { Bix, BixProps, Head } from './Bix';
import { Bix2, Bix2Variant } from './Bix2';
import { Face } from './poses';

// Which Bix to draw. Bix 2.0 (variant C, "Chibi") is the channel default since episode 2;
// an episode can pin `character: bix1` in its script to reproduce the original look.
export type CharacterId = 'bix1' | 'bix2';
export const BIX2_VARIANT: Bix2Variant = 'C';
export const CharacterContext = React.createContext<CharacterId>('bix2');

/** Drop-in replacement for <Bix>: draws Bix 1 or Bix 2.0 depending on the context. Extras ("pal") stay generic. */
export const Character: React.FC<BixProps> = (p) => {
  const c = useContext(CharacterContext);
  if (c === 'bix1' || p.variant === 'pal') return <Bix {...p} />;
  const { variant: _v, color: _c, hair: _h, ...rest } = p;
  return <Bix2 variant={BIX2_VARIANT} {...rest} />;
};

/** Bix's head on its own (intro sting, avatar), matching the active character. */
export const CharacterHead: React.FC<{ face: Face; beanie: number; blink: boolean }> = (p) => {
  const c = useContext(CharacterContext);
  return c === 'bix1' ? <Head {...p} /> : <Head {...p} eyeScale={1.4} mouthScale={1.35} />;
};
