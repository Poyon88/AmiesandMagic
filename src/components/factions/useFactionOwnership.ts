"use client";

import { useEffect, useState } from "react";

/** Ce que la grille de la page de garde a besoin de savoir de chaque faction. */
export interface Possession {
  /** Le joueur détient les communes de cette faction. */
  owned: boolean;
  /** Elle lui a été offerte à l'inscription. */
  starter: boolean;
}

/**
 * L'état de possession des NEUF factions, en UNE requête.
 *
 * La grille compte neuf tuiles ; laisser chacune interroger le serveur ferait
 * neuf appels pour une seule information. Le hook vit donc au niveau de la
 * grille, et les tuiles reçoivent leur ligne en propriété.
 *
 * Renvoie `null` tant que la réponse n'est pas là, ET pour un visiteur anonyme
 * — dans les deux cas la grille ne doit rien affirmer. Distinguer les deux
 * n'apporterait rien ici : sans compte, il n'y a aucune possession à montrer.
 */
export function useFactionOwnership(): Map<string, Possession> | null {
  const [etat, setEtat] = useState<Map<string, Possession> | null>(null);

  useEffect(() => {
    let vivant = true;
    fetch("/api/faction-shop")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivant || !d) return;
        const m = new Map<string, Possession>();
        for (const f of d.factions ?? []) {
          m.set(f.id, { owned: Boolean(f.owned), starter: Boolean(f.isStarter) });
        }
        setEtat(m);
      })
      .catch(() => {});
    // La page de garde est une vitrine : on peut la quitter avant la réponse.
    return () => { vivant = false; };
  }, []);

  return etat;
}
