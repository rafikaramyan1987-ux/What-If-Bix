import React from 'react';

// Channel branding per language. English = What If Bix (unchanged), French = MarMila.
export type Lang = 'en' | 'fr';

export const LangContext = React.createContext<Lang>('en');

export const BRAND = {
  en: {
    introTop: 'WHAT IF', introBottom: 'BIX', introBottomSize: 260,
    endTitle: 'MORE WHAT IFS?', endTitleSize: 110, watchNext: 'WATCH NEXT', recommends: 'BIX RECOMMENDS', subscribeSlot: 'SUBSCRIBE', subscribeSlotSize: 34,
    subscribe: 'SUBSCRIBE', subscribed: 'SUBSCRIBED ✓',
    bannerTitle: 'WHAT IF BIX', bannerTagline: 'Absurd questions. Real science.',
  },
  fr: {
    introTop: 'ET SI…', introBottom: 'MARMILA', introBottomSize: 200,
    endTitle: 'Abonne-toi à MarMila', endTitleSize: 104, watchNext: 'À VOIR ENSUITE', recommends: 'BIX RECOMMANDE', subscribeSlot: 'ABONNE-TOI', subscribeSlotSize: 30,
    subscribe: 'ABONNE-TOI', subscribed: 'ABONNÉ ✓',
    bannerTitle: 'MARMILA', bannerTagline: 'Et si ? Des questions folles, de la vraie science.',
  },
} as const;

export const useBrand = () => BRAND[React.useContext(LangContext)] ?? BRAND.en;
