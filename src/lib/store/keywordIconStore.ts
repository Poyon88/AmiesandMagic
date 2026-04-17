import { create } from 'zustand';

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
      set({ overrides: map, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
