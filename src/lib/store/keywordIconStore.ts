import { create } from 'zustand';
import { POLYMORPHIC_ICON_KEY_FALLBACK } from '@/lib/game/abilities';

interface KeywordIconStore {
  overrides: Record<string, string>;
  loaded: boolean;
  fetchOverrides: () => Promise<void>;
}

export const useKeywordIconStore = create<KeywordIconStore>((set, get) => ({
  overrides: {},
  loaded: false,

  fetchOverrides: async () => {
    if (get().loaded) return;
    try {
      const res = await fetch('/api/keyword-icons');
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const icon of data.icons ?? []) {
        map[icon.keyword] = icon.icon_url;
      }
      // Polymorphic abilities historically stored separate icons per host
      // (e.g. "convocations_multiples" + "spell_invocation_multiple").
      // Mirror each side's icon to its sibling key when the sibling has no
      // upload of its own, so a single upload covers both contexts.
      for (const [key, sibling] of Object.entries(POLYMORPHIC_ICON_KEY_FALLBACK)) {
        if (!map[key] && map[sibling]) map[key] = map[sibling];
      }
      set({ overrides: map, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
