// Bruitages d'ENTRÉE EN JEU d'une carte, calculés côté client.
//
// Nécessaire parce que les choix d'une capacité d'entrée (cible, Creuser,
// Sélection…) sont collectés AVANT que l'action ne parte au moteur : à ce
// moment-là le moteur n'a encore rien signalé, et attendre son signal ferait
// sonner l'arrivée de la créature APRÈS la fermeture de la fenêtre de choix.
//
// La liste est dérivée EXACTEMENT comme le fait le moteur en fin de section
// on-play (`getCapabilities` filtré sur `on_play`, composés exclus) — c'est la
// même règle, écrite une fois de chaque côté de la frontière moteur/interface.
// Le dispatch qui suit sait qu'ils ont déjà sonné et ne les rejoue pas
// (cf. `sfxPreAnnouncedInstanceId` dans le store).

import type { Card } from "./types";
import { getCapabilities } from "./capability-adapter";

/** URLs à enchaîner quand la créature se pose : son de la carte (ou son
 *  générique de pose), puis un son par capacité d'entrée en jeu.
 *
 *  L'ordre est celui que le joueur attend : la créature arrive, PUIS son effet
 *  se déclenche. */
export function onPlaySfxChain(
  card: Card,
  abilitySfxUrls: Record<string, string>,
  standardPlayUrl: string | undefined,
): string[] {
  const chain: string[] = [];
  const arrival = card.sfx_play_url || standardPlayUrl;
  if (arrival) chain.push(arrival);
  const seen = new Set<string>();
  for (const cap of getCapabilities(card)) {
    if (cap.trigger !== "on_play" || cap.composed) continue;
    const url = abilitySfxUrls[cap.abilityId];
    if (url && !seen.has(url)) { seen.add(url); chain.push(url); }
  }
  return chain;
}
