"use client";

// Résout des cartes par ID pour les références croisées d'une carte à une autre
// (Compagnons : citer ses cartes liées et en montrer le verso au survol).
//
// Deux sources, dans cet ordre :
//   1. les POOLS DU MATCH, déjà en mémoire quand on est en partie. La page de
//      match les complète exprès avec les cartes liées, pour que le moteur
//      puisse les résoudre — c'est donc gratuit et immédiat ;
//   2. à défaut — collection, constructeur de deck, aperçu de la forge — une
//      requête CIBLÉE sur /api/cards/by-ids, mise en cache au niveau du module.
//
// Le cache est partagé par toutes les cartes affichées : ouvrir dix versos qui
// citent les mêmes compagnons ne déclenche qu'une requête.

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import type { Card } from "@/lib/game/types";

const cache = new Map<number, Card>();
/** Requêtes en vol, par id : deux versos ouverts en même temps sur le même
 *  compagnon ne doivent pas partir deux fois. */
const enVol = new Map<number, Promise<void>>();

async function chercher(ids: number[]): Promise<void> {
  const manquants = ids.filter((id) => !cache.has(id) && !enVol.has(id));
  if (manquants.length === 0) {
    await Promise.all(ids.map((id) => enVol.get(id)).filter(Boolean));
    return;
  }
  const p = fetch(`/api/cards/by-ids?ids=${manquants.join(",")}`)
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: Card[]) => {
      for (const c of rows) if (c && typeof c.id === "number") cache.set(c.id, c);
    })
    .catch(() => { /* silencieux : l'appelant retombe sur le texte générique */ })
    .finally(() => { for (const id of manquants) enVol.delete(id); });

  for (const id of manquants) enVol.set(id, p);
  await p;
}

/** Cartes correspondant à `ids`, dans l'ordre demandé. Les ids introuvables sont
 *  omis — une carte liée supprimée depuis ne doit pas afficher de trou nommé.
 *
 *  Rend un tableau vide au premier rendu hors partie, le temps de la requête :
 *  l'appelant doit donc savoir ne rien afficher plutôt que d'afficher « … ». */
export function useLinkedCards(ids: readonly number[] | undefined): Card[] {
  const pools = useGameStore((s) => s.gameState);
  const cles = (ids ?? []).join(",");
  const [, forcer] = useState(0);

  // Pools du match : source prioritaire, aucune requête.
  const depuisPools = new Map<number, Card>();
  for (const c of [...(pools?.factionCardPool ?? []), ...(pools?.allSpellsPool ?? [])]) {
    if (!depuisPools.has(c.id)) depuisPools.set(c.id, c);
  }

  useEffect(() => {
    const liste = cles ? cles.split(",").map(Number) : [];
    const aChercher = liste.filter((id) => !depuisPools.has(id) && !cache.has(id));
    if (aChercher.length === 0) return;
    let vivant = true;
    chercher(aChercher).then(() => { if (vivant) forcer((n) => n + 1); });
    return () => { vivant = false; };
    // `depuisPools` est reconstruit à chaque rendu : le mettre en dépendance
    // relancerait l'effet en boucle. `cles` suffit — c'est la seule entrée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cles]);

  return (ids ?? [])
    .map((id) => depuisPools.get(id) ?? cache.get(id))
    .filter((c): c is Card => !!c);
}
