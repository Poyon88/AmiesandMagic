import { create } from 'zustand';
import { POLYMORPHIC_ICON_KEY_FALLBACK } from '@/lib/game/abilities';

interface KeywordIconStore {
  overrides: Record<string, string>;
  /** Facteur d'échelle d'affichage par mot-clé (défaut 1). Compense les marges
   *  internes hétérogènes des PNG custom pour uniformiser leur taille apparente. */
  scales: Record<string, number>;
  loaded: boolean;
  /** URLs d'icônes dont l'image est CHARGÉE. Une icône teintée est un carré
   *  de couleur découpé par un masque CSS : tant que l'image du masque n'est
   *  pas arrivée, Chrome peint le carré plein. KeywordIcon garde donc l'emoji
   *  de repli tant que son URL n'est pas ici. */
  ready: Record<string, true>;
  /** Loads overrides once (no-op if already loaded). */
  fetchOverrides: () => Promise<void>;
  /** Forces a refetch regardless of `loaded` — call after the forge uploads or
   *  resets an icon so every open view picks up the change without a reload. */
  reload: () => Promise<void>;
}

export const useKeywordIconStore = create<KeywordIconStore>((set, get) => {
  // Requête EN COURS, partagée. Sans elle, chaque KeywordIcon monté avant la
  // première réponse relançait son propre fetch (`loaded` n'est vrai qu'à
  // l'arrivée) : ~1 900 appels identiques en ouvrant la collection.
  let enCours: Promise<void> | null = null;

  // Préchargement des images, publié par lots : un `set` par image ferait
  // re-rendre chaque icône de la page à chaque arrivée.
  let lot: string[] = [];
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  const publier = () => {
    minuterie = null;
    const prets = { ...get().ready };
    for (const url of lot) prets[url] = true;
    lot = [];
    set({ ready: prets });
  };
  const precharger = (urls: string[]) => {
    if (typeof Image === "undefined") return; // rendu serveur
    for (const url of new Set(urls)) {
      if (get().ready[url]) continue;
      const img = new Image();
      // Même mode que le chargement du masque CSS (CORS), pour que le navigateur
      // réutilise l'image au lieu de la retélécharger.
      img.crossOrigin = "anonymous";
      img.onload = () => {
        lot.push(url);
        if (!minuterie) minuterie = setTimeout(publier, 120);
      };
      img.src = url;
    }
  };

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
      precharger(Object.values(map));
    } catch {
      set({ loaded: true });
    }
  };

  return {
    overrides: {},
    scales: {},
    loaded: false,
    ready: {},
    fetchOverrides: async () => {
      if (get().loaded) return;
      enCours ??= doFetch().finally(() => { enCours = null; });
      await enCours;
    },
    reload: doFetch,
  };
});
