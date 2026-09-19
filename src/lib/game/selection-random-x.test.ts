// SÉLECTION AU HASARD — la case « ? » d'une Sélection (selection /
// selection_magique / renfort_royal).
//
// RÈGLE ACTUELLE : sans la case, l'offre ne contient que des cartes de coût
// EXACTEMENT X. Avec la case, chaque carte offerte tire SON PROPRE coût entre 1
// et X — trois tirages indépendants, donc une offre panachée. C'est le seul
// régime où X redevient un plafond.
//
// Auparavant X était un plafond dans les deux cas, et la case tirait UN plafond
// pour toute l'offre : une Sélection 6 proposait surtout des cartes à 1 ou 2,
// les seules nombreuses, et le nombre saisi par l'auteur ne se lisait plus sur
// la table.
import { describe, expect, it } from "vitest";
import { applyAction, getSelectionCards, initRNG, selectionAmplitudeOnPlay } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { buildKeywordInstances } from "../card-forge/keyword-instances";
import { getSpellKeywordBadgeValue, getSpellKeywordDesc } from "./spell-keywords";
import { keywordBadgeValue } from "./keyword-labels";
import { resolveMarkers } from "./desc-markers";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, Keyword, SpellKeywordInstance } from "./types";

describe("le régime de coût de l'offre", () => {
  /** Vivier de communes à coût 1, 2 et 3. */
  function etat() {
    const s = mkState();
    s.factionCardPool = [1, 2, 3].flatMap((cost) => [0, 1].map((n) => mkCard({
      id: 600 + cost * 10 + n, name: `C${cost}-${n}`, faction: "Mercenaires",
      rarity: "Commune", mana_cost: cost,
    })));
    return s;
  }

  it("sans la case : QUE des cartes du coût exact", () => {
    const offre = getSelectionCards(etat(), 2, { faction: "Mercenaires" });
    expect(offre.length).toBeGreaterThan(0);
    expect(offre.every((c) => c.mana_cost === 2)).toBe(true);
  });

  it("aucune carte à ce coût : offre VIDE, aucun repli sur moins cher", () => {
    expect(getSelectionCards(etat(), 7, { faction: "Mercenaires" })).toEqual([]);
  });

  it("avec la case : des coûts PANACHÉS, jamais au-dessus du plafond", () => {
    // Sur plusieurs états, l'offre doit finir par mêler deux coûts différents —
    // ce qu'un plafond unique tiré pour toute l'offre ne produirait jamais.
    let panachee = false;
    for (let i = 0; i < 20 && !panachee; i++) {
      const s = etat();
      s.players[0].mana = i; // fait varier le germe, comme en partie
      const offre = getSelectionCards(s, 3, { faction: "Mercenaires" }, undefined, true);
      expect(offre.every((c) => c.mana_cost >= 1 && c.mana_cost <= 3)).toBe(true);
      if (new Set(offre.map((c) => c.mana_cost)).size > 1) panachee = true;
    }
    expect(panachee).toBe(true);
  });

  it("même état ⇒ même offre : les deux clients voient la même chose", () => {
    const s = etat();
    const a = getSelectionCards(s, 3, { faction: "Mercenaires" }, undefined, true);
    const b = getSelectionCards(s, 3, { faction: "Mercenaires" }, undefined, true);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });

  it("ne consomme pas le flux RNG partagé", () => {
    const s = etat();
    const avant = s.rngState;
    getSelectionCards(s, 3, { faction: "Mercenaires" }, undefined, true);
    expect(s.rngState).toBe(avant);
  });
});

describe("le drapeau voyage dans le modèle unifié", () => {
  it("créature : keyword_instances.randomX → capability.params.randomX", () => {
    const card = mkCard({
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, x: 3, randomX: true }],
    });
    const cap = getCapabilities(card).find((c) => c.abilityId === "selection")!;
    expect(cap.params?.x).toBe(3);
    expect(cap.params?.randomX).toBe(true);
    expect(selectionAmplitudeOnPlay(card, "selection")).toEqual({ x: 3, randomX: true });
  });
  it("créature sans drapeau : aucun champ parasite", () => {
    const card = mkCard({
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, x: 3 }],
    });
    const cap = getCapabilities(card).find((c) => c.abilityId === "selection")!;
    expect(cap.params).toEqual({ x: 3 });
    expect(selectionAmplitudeOnPlay(card, "selection")).toEqual({ x: 3, randomX: false });
  });
  it("sort : spell_keywords.randomX → capability.params.randomX", () => {
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "selection_magique", amount: 4, randomX: true }] as SpellKeywordInstance[],
    });
    const cap = getCapabilities(card).find((c) => c.abilityId === "selection_magique")!;
    expect(cap.params?.randomX).toBe(true);
  });
});

describe("la forge persiste le drapeau", () => {
  it("buildKeywordInstances écrit randomX: true sur une Sélection cochée", () => {
    expect(buildKeywordInstances({
      labels: ["Sélection X"], xValues: { "Sélection X": 3 }, randomX: { "Sélection X": true },
    })).toEqual([{ id: "selection", x: 3, randomX: true }]);
  });
  it("…et l'ignore sur une capacité qui n'est pas une Sélection", () => {
    expect(buildKeywordInstances({
      labels: ["Tempête X"], xValues: { "Tempête X": 3 }, randomX: { "Tempête X": true },
    })).toEqual([{ id: "tempete", x: 3 }]);
  });
});

describe("affichage : « 1 à X » et badge « X? »", () => {
  it("description créature : le X devient « 1 à X » quand l'instance porte le drapeau", () => {
    const s = resolveMarkers("coût ≤ X", "selection", { x: 3, instance: { randomX: true } });
    expect(s).toBe("coût ≤ 1 à 3");
    expect(resolveMarkers("coût ≤ X", "selection", { x: 3, instance: {} })).toBe("coût ≤ 3");
    // Plafond 1 : constante, pas de plage.
    expect(resolveMarkers("coût ≤ X", "selection", { x: 1, instance: { randomX: true } })).toBe("coût ≤ 1");
  });
  it("description sort : même règle", () => {
    const desc = getSpellKeywordDesc({ id: "selection", amount: 3, randomX: true });
    expect(desc).toContain("1 à 3");
    expect(getSpellKeywordDesc({ id: "selection", amount: 3 })).not.toContain("1 à");
  });
  it("badges : « 3? » côté créature comme côté sort", () => {
    expect(keywordBadgeValue("selection" as Keyword, 3, { id: "selection" as Keyword, x: 3, randomX: true })).toBe("3?");
    expect(keywordBadgeValue("selection" as Keyword, 3, { id: "selection" as Keyword, x: 3 })).toBe("3");
    expect(getSpellKeywordBadgeValue({ id: "selection", amount: 3, randomX: true })).toBe("3?");
  });
});

// Bout en bout : une Sélection curée « ? » en fin de tour. Le vivier offre des
// communes à 1, 2 et 3 ; l'offre doit panacher les coûts sans jamais dépasser 3.
describe("moteur : Sélection curée « ? » en fin de tour", () => {
  /** Plateau prêt à finir le tour, avec une Sélection 3 au hasard. */
  function table(seed: number) {
    const s = mkState();
    s.factionCardPool = [1, 2, 3].flatMap((cost) => [0, 1].map((n) => mkCard({
      id: 700 + cost * 10 + n, name: `C${cost}-${n}`, faction: "Mercenaires",
      rarity: "Commune", mana_cost: cost,
    })));
    const src = mkInstance(mkCard({
      attack: 1, health: 3, faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn", x: 3, randomX: true }],
    }));
    s.players[0].board = [src];
    s.rngState = seed;
    initRNG(seed);
    return s;
  }
  const coutsOfferts = (st: ReturnType<typeof applyAction>) => {
    const ids = st.pendingTriggers?.[0]?.selectionOptionIds ?? [];
    return ids.map((id) => Math.floor((id - 700) / 10));
  };

  it("ne dépasse jamais le plafond, et finit par panacher les coûts", () => {
    let panachee = false;
    for (let seed = 1; seed <= 40; seed++) {
      const couts = coutsOfferts(applyAction(table(seed), { type: "end_turn" }));
      expect(couts.length).toBeGreaterThan(0);
      expect(couts.every((c) => c >= 1 && c <= 3)).toBe(true);
      if (new Set(couts).size > 1) panachee = true;
    }
    expect(panachee).toBe(true);
  });

  it("rejouable à l'identique : même ÉTAT, même offre", () => {
    // Le même état, pas un état reconstruit : les identifiants d'instance
    // entrent dans le germe de tirage (cf. saltDeSource), et le harnais en
    // fabrique de nouveaux à chaque construction. En partie, les deux clients
    // partagent le même état — donc le même germe.
    const s = table(7);
    const a = applyAction(s, { type: "end_turn" }).pendingTriggers?.[0]?.selectionOptionIds ?? [];
    initRNG(7);
    const b = applyAction(s, { type: "end_turn" }).pendingTriggers?.[0]?.selectionOptionIds ?? [];
    expect(b).toEqual(a);
  });

  it("sans le drapeau, l'offre se limite au coût EXACT", () => {
    const s = table(7);
    s.players[0].board[0].card = {
      ...s.players[0].board[0].card,
      keyword_instances: [{ id: "selection" as Keyword, mode: "end_of_turn", x: 3 }],
    };
    const couts = coutsOfferts(applyAction(s, { type: "end_turn" }));
    expect(couts.length).toBeGreaterThan(0);
    expect(couts.every((c) => c === 3)).toBe(true);
  });
});
