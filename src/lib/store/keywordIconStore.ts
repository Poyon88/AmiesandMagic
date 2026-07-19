import { create } from 'zustand';
import { POLYMORPHIC_ICON_KEY_FALLBACK } from '@/lib/game/abilities';

interface KeywordIconStore {
  overrides: Record<string, string>;
  /** Facteur d'échelle d'affichage par mot-clé (défaut 1). Compense les marges
   *  internes hétérogènes des PNG custom pour uniformiser leur taille apparente. */
  scales: Record<string, number>;
  loaded: boolean;
  /** Loads overrides once (no-op if already loaded). */
  fetchOverrides: () => Promise<void>;
  /** Forces a refetch regardless of `loaded` — call after the forge uploads or
   *  resets an icon so every open view picks up the change without a reload. */
  reload: () => Promise<void>;
}

export const useKeywordIconStore = create<KeywordIconStore>((set, get) => {
  const doFetch = async () => {
    try {
      const res = await fetch('/api/keyword-icons');
      if (!res.ok) return;
      const data = await res.json();
      const map: Record<string, string> = {};
      const scaleMap: Record<string, number> = {};
      for (const icon of data.icons ?? []) {
        map[icon.keyword] = icon.icon_url;
        if (icon.scale != null && Number(icon.scale) !== 1) scaleMap[icon.keyword] = Number(icon.scale);
      }
      // Polymorphic abilities historically stored separate icons per host
      // (e.g. "convocations_multiples" + "spell_invocation_multiple").
      // Mirror each side's icon (and its scale) to its sibling key when the
      // sibling has no upload of its own, so a single upload covers both.
      for (const [key, sibling] of Object.entries(POLYMORPHIC_ICON_KEY_FALLBACK)) {
        if (!map[key] && map[sibling]) map[key] = map[sibling];
        if (scaleMap[key] == null && scaleMap[sibling] != null) scaleMap[key] = scaleMap[sibling];
      }
      set({ overrides: map, scales: scaleMap, loaded: true });
    } catch {
      set({ loaded: true });
    }
  };

  return {
    overrides: {},
    scales: {},
    loaded: false,
    fetchOverrides: async () => {
      if (get().loaded) return;
      await doFetch();
    },
    reload: doFetch,
  };
});
