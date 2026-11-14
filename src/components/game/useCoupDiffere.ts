"use client";

import { useEffect, useState } from "react";

/** Coup DIFFÉRÉ : sur un effet de zone, le store décale le popup de chaque
 *  cible (`delayMs`), mais l'état d'impact — PV compris — arrive d'un bloc au
 *  début de la vague. Sans ce hook, toutes les cartes clignotaient et perdaient
 *  leurs PV à t=0, et le « -N » de la k-ième cible n'arrivait qu'ensuite.
 *
 *  Rend `frappe` (le clignotement peut partir) et la valeur à AFFICHER : la
 *  valeur précédente tant que le délai court, la nouvelle à l'impact. Sans coup
 *  ou sans délai, tout passe immédiatement (soins, buffs, coups simples). */
export function useCoupDiffere(montant: number | null, delaiMs: number, valeur: number) {
  const touche = montant != null && montant > 0;
  const differe = touche && delaiMs > 0;
  // Dernière valeur montrée hors délai : c'est elle qu'on garde pendant l'attente.
  const [retenue, setRetenue] = useState(valeur);
  const [arrive, setArrive] = useState(false);
  // Ajustement PENDANT LE RENDU quand les entrées changent (modèle React
  // « stocker les props précédentes ») : pas de rendu en cascade par un effet.
  const cle = `${montant ?? ""}|${delaiMs}|${valeur}`;
  const [cleVue, setCleVue] = useState(cle);
  if (cle !== cleVue) {
    setCleVue(cle);
    setArrive(false);
    if (!differe) setRetenue(valeur);
  }
  useEffect(() => {
    if (!differe) return;
    const t = setTimeout(() => {
      setArrive(true);
      setRetenue(valeur);
    }, delaiMs);
    return () => clearTimeout(t);
  }, [differe, delaiMs, valeur]);
  return {
    frappe: touche && (!differe || arrive),
    valeurAffichee: differe && !arrive ? retenue : valeur,
  };
}
