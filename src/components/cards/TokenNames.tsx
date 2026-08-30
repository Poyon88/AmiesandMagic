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
import { useTranslations } from "next-intl";
import CompagnonsNames from "./CompagnonsNames";
import { tokenPreviewName } from "@/lib/game/token-preview";
import type { Card } from "@/lib/game/types";

export default function TokenNames({ cards, scale = 1 }: { cards: Card[]; scale?: number }) {
  // `useTranslations` sur la racine : les noms de tokens vivent sous
  // `vocab.tokens.<id>`, en dehors des espaces de noms des cartes.
  const t = useTranslations();
  if (!cards.length) return null;
  return (
    <CompagnonsNames
      cards={cards}
      scale={scale}
      icon="⚔️"
      nameOf={(c) => tokenPreviewName(c, (k) => {
        // SafeT-like : une clé absente ne doit pas jeter, elle doit rendre le
        // nom brut du template (cf. tokenPreviewName).
        try { return t.raw(k) as string; } catch { return undefined; }
      })}
    />
  );
}
