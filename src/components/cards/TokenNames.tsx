"use client";

// Pastilles des TOKENS qu'une capacité crée, avec le verso de chacun au survol.
//
// Le descriptif écrivait le token en toutes lettres — « 3 tokens Archer Sylvain
// 1/1 (Vol) ». La ligne s'allongeait à chaque mot-clé, et depuis que les jetons
// acceptent des EFFETS COMPOSÉS, aucune phrase ne peut plus les décrire : le
// verso, lui, les montre comme il montre ceux d'une créature.
//
// Le nom reste dans la phrase ; la pastille porte le reste. Même geste que les
// Compagnons, dont ce composant réutilise l'affichage — seule la résolution du
// nom diffère, les tokens ayant leur propre table et donc leurs propres ids.
import CompagnonsNames from "./CompagnonsNames";
import { useSafeT } from "@/i18n/useVocab";
import { tokenPreviewName } from "@/lib/game/token-preview";
import type { Card } from "@/lib/game/types";

export default function TokenNames({ cards, scale = 1 }: { cards: Card[]; scale?: number }) {
  // `useSafeT` et non un try/catch autour de `t.raw` : sur une clé absente,
  // `t.raw` ne lève pas — il rend le CHEMIN de la clé. La pastille affichait
  // donc « vocab.tokens.47 » au lieu du nom du token. `useSafeT` teste `t.has`
  // d'abord, ce qui rend bien `undefined` et laisse le repli opérer.
  const safe = useSafeT();
  if (!cards.length) return null;
  return (
    <CompagnonsNames
      cards={cards}
      scale={scale}
      icon="⚔️"
      nameOf={(c) => tokenPreviewName(c, safe)}
    />
  );
}
