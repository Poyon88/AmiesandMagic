"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "next-intl";
import { normalizeLocale, DEFAULT_LOCALE } from "@/i18n/config";

// Localisation du nom + ambiance des cartes SUR LA SURFACE DE JEU, purement au
// rendu. ⚠️ On ne touche JAMAIS aux objets `card` du GameState : ils sont hashés
// (syncHash) et snapshottés (match_state) — y injecter des champs traduits ferait
// diverger le hash entre un joueur FR et un joueur DE (fausse désync + adoption
// de snapshot en boucle). On garde donc une table `card_id → {name, ambiance}`
// hors état, consultée à l'affichage ; le moteur continue de lire le FR canonique
// (`effect_text`/`name`) pour le parsing X/brackets.

interface CardLike {
  id: number;
  name?: string | null;
  flavor_text?: string | null;
}

interface CardTextCtx {
  localizeName: (card: CardLike) => string;
  localizeFlavor: (card: CardLike) => string | null;
}

// Repli identité (locale FR, ou hors provider comme en test) : renvoie le FR.
const IDENTITY: CardTextCtx = {
  localizeName: (c) => c.name ?? "",
  localizeFlavor: (c) => c.flavor_text ?? null,
};

const Ctx = createContext<CardTextCtx>(IDENTITY);

export function useCardText(): CardTextCtx {
  return useContext(Ctx);
}

export default function CardTextProvider({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale(useLocale());
  const [map, setMap] = useState<Map<number, { name: string | null; flavor_text: string | null }> | null>(null);

  useEffect(() => {
    // FR : aucun fetch, repli identité.
    if (locale === DEFAULT_LOCALE) {
      setMap(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    // Lecture publique (RLS lecture ouverte sur card_translations). Le pool tient
    // en une requête (≤ 1 ligne par carte pour la locale).
    supabase
      .from("card_translations")
      .select("card_id, name, flavor_text")
      .eq("locale", locale)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const m = new Map<number, { name: string | null; flavor_text: string | null }>();
        for (const r of data as { card_id: number; name: string | null; flavor_text: string | null }[]) {
          m.set(r.card_id, { name: r.name, flavor_text: r.flavor_text });
        }
        setMap(m);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const value = useMemo<CardTextCtx>(() => {
    if (!map) return IDENTITY;
    return {
      localizeName: (c) => map.get(c.id)?.name ?? c.name ?? "",
      localizeFlavor: (c) => map.get(c.id)?.flavor_text ?? c.flavor_text ?? null,
    };
  }, [map]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
