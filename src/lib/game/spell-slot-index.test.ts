// INVARIANT : le slot de cible `kw_${i}` est numéroté par le PICKER d'après la
// position dans `card.spell_keywords` (getSpellTargetSlots), mais relu par la
// RÉSOLUTION d'après la position dans les capacités filtrées
// (spellResolutionInstances → getCapabilities, trigger spell_resolution +
// effectKind immediate).
//
// Les deux ne coïncident que parce que l'adaptateur émet les mots-clés de sort
// EN PREMIER et DANS L'ORDRE, les dons ensuite (écartés par le filtre
// `immediate`), et les effets composés en dernier. Rien dans les types ne
// l'impose : réordonner les capacités, ou insérer un composé avant les
// spell_keywords, ferait silencieusement atterrir chaque cible sur le mauvais
// effet — un Impact soignerait, une Guérison brûlerait.
//
// Un balayage de la base (145 sorts, 66 avec slot) ne montre aucun décalage
// aujourd'hui. Ces tests figent la propriété pour que la régression se voie
// ici, et non en partie.
import { describe, expect, it } from "vitest";
import { getCapabilities } from "./capability-adapter";
import { getSpellTargetSlots } from "./engine";
import { mkCard } from "./test-harness";
import type { Capability, Card } from "./types";

/** Ordre dans lequel la résolution consomme les effets (cf. spellResolutionInstances). */
const resolutionOrder = (card: Card): string[] =>
  getCapabilities(card)
    .filter((c) => c.trigger === "spell_resolution" && c.effectKind === "immediate")
    .map((c) => c.abilityId);

/** Pour chaque slot `kw_${i}` émis, l'effet lu à cet index doit être le bon. */
function expectSlotsAligned(card: Card) {
  const declared = (card.spell_keywords ?? []).map((k) => k.id);
  const resolved = resolutionOrder(card);
  for (const slot of getSpellTargetSlots(card)) {
    if (!slot.slot.startsWith("kw_")) continue;
    const i = Number(slot.slot.slice(3));
    expect(resolved[i], `slot ${slot.slot} émis pour « ${declared[i]} »`).toBe(declared[i]);
  }
}

describe("Alignement des slots de cible d'un sort", () => {
  it("sort à plusieurs effets ciblés (carte non backfillée)", () => {
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      spell_keywords: [
        { id: "impact", amount: 2 },
        { id: "guerison", amount: 3 },
        { id: "entrave" },
      ] as never,
    });
    expect(resolutionOrder(card)).toEqual(["impact", "guerison", "entrave"]);
    expectSlotsAligned(card);
  });

  it("effet NON ciblé intercalé : les index ne glissent pas", () => {
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      spell_keywords: [
        { id: "deferlement", amount: 2 }, // sans cible
        { id: "impact", amount: 1 },      // ciblé → kw_1
      ] as never,
    });
    expectSlotsAligned(card);
  });

  it("carte backfillée : les effets composés arrivent APRÈS et ne décalent rien", () => {
    const caps: Capability[] = [
      { uid: "sk_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "impact", params: { x: 2 }, targets: [] },
      { uid: "sk_1", trigger: "spell_resolution", effectKind: "immediate", abilityId: "guerison", params: { x: 1 }, targets: [] },
      { uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [],
        composed: { content: "draw_cards", magnitude: { x: 1 } } },
    ];
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "impact", amount: 2 }, { id: "guerison", amount: 1 }] as never,
      capabilities: caps as never,
    });
    expectSlotsAligned(card);
    // Le composé est bien en queue : il ne peut pas s'intercaler.
    expect(resolutionOrder(card)).toEqual(["impact", "guerison", "_composed"]);
  });

  it("carte backfillée portant AUSSI un don : le don n'occupe pas d'index", () => {
    const caps: Capability[] = [
      { uid: "sk_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "impact", params: { x: 2 }, targets: [] },
      { uid: "grant_0", trigger: "spell_resolution", effectKind: "grant", abilityId: "gloire", grantScope: "target", targets: [] },
      { uid: "sk_1", trigger: "spell_resolution", effectKind: "immediate", abilityId: "entrave", targets: [] },
    ];
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      keywords: ["gloire"] as never,
      spell_keywords: [{ id: "impact", amount: 2 }, { id: "entrave" }] as never,
      capabilities: caps as never,
    });
    // Le don est écarté par le filtre `immediate` — sinon il décalerait entrave.
    expect(resolutionOrder(card)).toEqual(["impact", "entrave"]);
    expectSlotsAligned(card);
  });
});
