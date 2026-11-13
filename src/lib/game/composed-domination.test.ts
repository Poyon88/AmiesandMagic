// DOMINATION en effet composé : prise de contrôle permanente, réglable par les
// champs de cible déjà communs aux composés.
//
// Arbitrages de l'auteur (2026-11-07), verrouillés ici :
//   1. le plafond de coût est `target.maxCost`, fixe, sur le coût imprimé ;
//   2. la créature volée arrive avec le mal d'invocation ;
//   3. vols dans la limite des places libres ;
//   4. le menu des sorts insère cette forme, les cartes en base gardent la leur.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { composedChoicePrompt, composedIcon, describeComposedCap } from "./composed-display";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { buildSpellEffectCatalog } from "@/lib/card-forge/spell-effect-catalog";
import type { Capability, CapabilityTrigger, CardInstance, ComposedEffect, GameAction, GameState, HeroDefinition, TargetSpec } from "./types";

const cible = (t: Partial<TargetSpec> = {}): TargetSpec =>
  ({ entity: "unit", count: 1, side: "enemy", location: "board", designation: "random", ...t }) as TargetSpec;
const effet = (t: Partial<TargetSpec> = {}): ComposedEffect => ({ content: "domination", target: cible(t) });
const cap = (trigger: CapabilityTrigger, composed: ComposedEffect): Capability =>
  ({ uid: "d0", trigger, effectKind: "immediate", abilityId: "_composed", targets: [], composed });
const sort = (composed: ComposedEffect) => mkInstance(mkCard({
  name: "Sort", card_type: "spell", mana_cost: 0, attack: null, health: null,
  capabilities: [cap("spell_resolution", composed)],
}));
const unite = (name: string, extra: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, mana_cost: 3, attack: 1, health: 5, ...extra }));

function etat(ennemis: CardInstance[]): GameState {
  const s = mkState();
  s.players[1].board.push(...ennemis);
  return s;
}
function lancer(s: GameState, ci: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, targetMap } as GameAction);
}
const noms = (st: GameState, camp: 0 | 1) => st.players[camp].board.map((c) => c.card.name).sort();

describe("nombre de cibles", () => {
  it("une cible au hasard change de camp, l'autre reste", () => {
    const st = lancer(etat([unite("A"), unite("B")]), sort(effet()));
    expect(st.players[0].board).toHaveLength(1);
    expect(st.players[1].board).toHaveLength(1);
  });

  it("une cible au choix : celle désignée", () => {
    const b = unite("B");
    const st = lancer(etat([unite("A"), b]), sort(effet({ designation: "choice" })), { "d0#0": b.instanceId });
    expect(noms(st, 0)).toEqual(["B"]);
  });

  it("deux cibles au choix : les deux désignées", () => {
    const b = unite("B");
    const c = unite("C");
    const st = lancer(etat([unite("A"), b, c]), sort(effet({ designation: "choice", count: 2 })),
      { "d0#0": b.instanceId, "d0#1": c.instanceId });
    expect(noms(st, 0)).toEqual(["B", "C"]);
    expect(noms(st, 1)).toEqual(["A"]);
  });

  it("N au hasard, et toutes", () => {
    const n = lancer(etat([unite("A"), unite("B"), unite("C")]), sort(effet({ count: 2 })));
    expect(n.players[0].board).toHaveLength(2);
    const t = lancer(etat([unite("A"), unite("B"), unite("C")]), sort(effet({ count: "all", designation: "automatic" })));
    expect(noms(t, 0)).toEqual(["A", "B", "C"]);
    expect(t.players[1].board).toHaveLength(0);
  });
});

describe("filtres", () => {
  it("plafond de coût sur le coût imprimé, 0 compris", () => {
    const cher = unite("Cher", { mana_cost: 5 });
    const moyen = unite("Moyen", { mana_cost: 4 });
    const jeton = unite("Jeton", { mana_cost: 0 });
    const st = lancer(etat([cher, moyen]), sort(effet({ count: "all", designation: "automatic", maxCost: 4 })));
    expect(noms(st, 0)).toEqual(["Moyen"]);
    const zero = lancer(etat([cher, jeton]), sort(effet({ count: "all", designation: "automatic", maxCost: 0 })));
    expect(noms(zero, 0)).toEqual(["Jeton"]);
  });

  it("au hasard, le tirage ne tombe jamais au-dessus du plafond", () => {
    for (let i = 0; i < 12; i++) {
      const st = lancer(etat([unite("Cher", { mana_cost: 9 }), unite("Petit", { mana_cost: 1 })]), sort(effet({ maxCost: 2 })));
      expect(noms(st, 0)).toEqual(["Petit"]);
    }
  });

  it("race : seule l'appartenance visée est volée", () => {
    const st = lancer(etat([unite("Elfe", { race: "Elfes" }), unite("Nain", { race: "Nains" })]),
      sort(effet({ count: "all", designation: "automatic", membership: { race: ["Elfes"] } })));
    expect(noms(st, 0)).toEqual(["Elfe"]);
  });

  it("aucune cible valide : rien ne bouge", () => {
    const st = lancer(etat([unite("Cher", { mana_cost: 9 })]), sort(effet({ maxCost: 1 })));
    expect(st.players[0].board).toHaveLength(0);
    expect(st.players[1].board).toHaveLength(1);
  });
});

describe("places", () => {
  const remplir = (s: GameState, n: number) => {
    for (let i = 0; i < n; i++) s.players[0].board.push(unite(`Occupant${i}`));
  };

  it("plateau plein : aucun vol", () => {
    const s = etat([unite("A")]);
    remplir(s, 8);
    const st = lancer(s, sort(effet()));
    expect(st.players[1].board).toHaveLength(1);
    expect(st.players[0].board).toHaveLength(8);
  });

  it("3 vols pour 1 place : un seul passe", () => {
    const s = etat([unite("A"), unite("B"), unite("C")]);
    remplir(s, 7);
    const st = lancer(s, sort(effet({ count: 3 })));
    expect(st.players[0].board).toHaveLength(8);
    expect(st.players[1].board).toHaveLength(2);
  });
});

describe("état de l'unité volée", () => {
  it("mal d'invocation, propriétaire d'origine mémorisé, contrôle permanent", () => {
    const a = unite("A");
    a.hasSummoningSickness = false;
    const s = etat([a]);
    const st = lancer(s, sort(effet()));
    const volee = st.players[0].board[0];
    expect(volee.hasSummoningSickness).toBe(true);
    expect(volee.trueOwnerId).toBe(st.players[1].id);
    expect(volee.originalOwnerId).toBeNull();
    const suite = applyAction(applyAction(st, { type: "end_turn" } as GameAction), { type: "end_turn" } as GameAction);
    expect(suite.players[0].board.map((c) => c.card.name)).toContain("A");
  });

  it("reprendre sa propre créature efface le vol", () => {
    const a = unite("A");
    const s = etat([a]);
    a.trueOwnerId = s.players[0].id;
    const st = lancer(s, sort(effet()));
    expect(st.players[0].board[0].trueOwnerId).toBeNull();
  });

  it("une unité sous Corruption volée ne repart pas", () => {
    const a = unite("A");
    const s = etat([a]);
    a.originalOwnerId = s.players[0].id; // Corrompue par l'adversaire, à moi d'origine
    a.trueOwnerId = s.players[0].id;
    const st = lancer(s, sort(effet()));
    const moi = st.players[0].board[0];
    expect(moi.originalOwnerId).toBeNull();
    expect(moi.trueOwnerId).toBeNull();
  });
});

describe("mort de l'unité volée", () => {
  const tuerMesUnites = () => sort({ content: "destroy", target: cible({ side: "ally", designation: "automatic", count: "all" }) });
  const curee = () => mkInstance(mkCard({
    name: "Décret", card_type: "spell", attack: null, health: null, mana_cost: 0,
    spell_keywords: [{ id: "domination" }] as never,
  }));
  const cureeCorruption = () => mkInstance(mkCard({
    name: "Pacte", card_type: "spell", attack: null, health: null, mana_cost: 0,
    spell_keywords: [{ id: "corruption" }] as never,
  }));
  const jouerCible = (s: GameState, c: CardInstance, id: string) => {
    s.players[0].hand.push(c);
    return applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, targetInstanceId: id } as GameAction);
  };

  it("composée : elle meurt dans le cimetière de son propriétaire", () => {
    const st = lancer(lancer(etat([unite("A")]), sort(effet())), tuerMesUnites());
    expect(st.players[1].graveyard.map((c) => c.card.name)).toEqual(["A"]);
    expect(st.players[0].graveyard.map((c) => c.card.name)).not.toContain("A");
    expect(st.players[1].graveyard[0].trueOwnerId).toBeNull();
  });

  it("curée : même règle", () => {
    const a = unite("A");
    const st = lancer(jouerCible(etat([a]), curee(), a.instanceId), tuerMesUnites());
    expect(st.players[1].graveyard.map((c) => c.card.name)).toEqual(["A"]);
  });

  it("Corruption : même règle", () => {
    const a = unite("A");
    const st = lancer(jouerCible(etat([a]), cureeCorruption(), a.instanceId), tuerMesUnites());
    expect(st.players[1].graveyard.map((c) => c.card.name)).toEqual(["A"]);
  });

  it("curée, reprise de ma propre créature : elle meurt chez moi", () => {
    const a = unite("A");
    const s = etat([a]);
    a.trueOwnerId = s.players[0].id;
    const st = lancer(jouerCible(s, curee(), a.instanceId), tuerMesUnites());
    expect(st.players[0].graveyard.map((c) => c.card.name)).toContain("A");
    expect(st.players[1].graveyard).toHaveLength(0);
  });
});

describe("protections", () => {
  const transcendante = () => unite("Trans", { keywords: ["transcendance"] });

  it("Transcendance arrête un sort, même en « toutes », et le hasard retombe sur une cible volable", () => {
    const t = lancer(etat([transcendante(), unite("A")]), sort(effet({ count: "all", designation: "automatic" })));
    expect(noms(t, 0)).toEqual(["A"]);
    for (let i = 0; i < 12; i++) {
      const st = lancer(etat([transcendante(), unite("A")]), sort(effet()));
      expect(noms(st, 0)).toEqual(["A"]);
    }
  });

  it("une capacité de créature passe outre Transcendance", () => {
    const s = etat([transcendante()]);
    const c = mkInstance(mkCard({ name: "Source", mana_cost: 0, capabilities: [cap("on_play", effet())] }));
    s.players[0].hand.push(c);
    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
    expect(noms(st, 0)).toContain("Trans");
  });

  it("Ombre : protégée du ciblage, pas du hasard", () => {
    const ombre = unite("Ombre", { keywords: ["ombre"] });
    const st = lancer(etat([ombre]), sort(effet()));
    expect(noms(st, 0)).toEqual(["Ombre"]);
  });
});

describe("garde-fous", () => {
  it("carte mal réglée sur le camp allié : rien ne bouge", () => {
    const s = etat([unite("A")]);
    s.players[0].board.push(unite("Allié"));
    const st = lancer(s, sort(effet({ side: "ally" })));
    expect(noms(st, 0)).toEqual(["Allié"]);
    expect(noms(st, 1)).toEqual(["A"]);
  });

  it("objet équipé : il reste chez son propriétaire, le lien se coupe", () => {
    const a = unite("A");
    const objet = mkInstance(mkCard({ name: "Épée", card_type: "item", attack: 2, health: 0, mana_cost: 0 }));
    objet.equippedToInstanceId = a.instanceId;
    const s = etat([a]);
    s.players[1].items = [objet];
    const st = lancer(s, sort(effet()));
    expect(st.players[1].items?.[0].equippedToInstanceId).toBeNull();
    expect(noms(st, 0)).toEqual(["A"]);
  });
});

describe("déclencheurs", () => {
  it("entrée en jeu", () => {
    const s = etat([unite("A")]);
    const c = mkInstance(mkCard({ name: "Source", mana_cost: 0, capabilities: [cap("on_play", effet())] }));
    s.players[0].hand.push(c);
    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as GameAction);
    expect(noms(st, 0)).toEqual(["A", "Source"]);
  });

  it("à la mort de la source", () => {
    const s = etat([unite("A")]);
    const c = mkInstance(mkCard({ name: "Source", attack: 1, health: 1, capabilities: [cap("on_death", effet())] }));
    s.players[0].board.push(c);
    const killer = sort({ content: "destroy", target: cible({ count: "all", designation: "automatic", side: "ally" }) });
    const st = lancer(s, killer);
    expect(noms(st, 0)).toEqual(["A"]);
  });
});

describe("autres provenances", () => {
  const pioches = (s: GameState) => {
    for (const p of s.players) for (let i = 0; i < 10; i++) p.deck.push(unite("Pioche"));
  };

  it("activation d'une créature", () => {
    const s = etat([unite("A")]);
    const c = mkInstance(mkCard({ name: "Source", capabilities: [cap("on_activation", effet())] }));
    c.hasSummoningSickness = false;
    s.players[0].board.push(c);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: 0, composedUid: "d0" } as GameAction);
    expect(noms(st, 0)).toEqual(["A", "Source"]);
  });

  it("source tuée au tour adverse : le vol profite au propriétaire de la source", () => {
    const s = etat([unite("A")]);
    pioches(s);
    const c = mkInstance(mkCard({ name: "Source", attack: 1, health: 1, capabilities: [cap("on_death", effet())] }));
    s.players[0].board.push(c);
    let st = applyAction(s, { type: "end_turn" } as GameAction);
    const tueuse = mkInstance(mkCard({
      name: "Tueur", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [cap("spell_resolution", { content: "destroy", target: cible({ count: "all", designation: "automatic" }) })],
    }));
    st.players[1].hand.push(tueuse);
    st = applyAction(st, { type: "play_card", cardInstanceId: tueuse.instanceId } as GameAction);
    expect(noms(st, 0)).toEqual(["A"]);
    expect(st.players[1].board).toHaveLength(0);
  });

  it("pouvoir de héros, cible choisie et plafond de coût", () => {
    const petit = unite("Petit", { mana_cost: 2 });
    const s = etat([petit, unite("Cher", { mana_cost: 8 })]);
    s.players[0].hero.heroDefinition = {
      id: 1, name: "Héros", race: "humans", powerName: "Vol", powerCost: 1, powerDescription: "",
      powerEffect: { mode: "composed", keywordId: "_composed", composed: effet({ designation: "choice", maxCost: 3 }) },
    } as HeroDefinition;
    const st = applyAction(s, { type: "hero_power", targetMap: { "hp_0#0": petit.instanceId } } as GameAction);
    expect(noms(st, 0)).toEqual(["Petit"]);
  });

  it("emblème : vole à chaque début de tour du porteur", () => {
    const s = etat([unite("A")]);
    pioches(s);
    const c = mkInstance(mkCard({
      name: "Sceau", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "d0", trigger: "on_start_of_turn", effectKind: "emblem", abilityId: "_composed", targets: [], composed: effet() } as unknown as Capability],
    }));
    let st = lancer(s, c);
    expect(st.players[0].board).toHaveLength(0);
    do st = applyAction(st, { type: "end_turn" } as GameAction); while (st.currentPlayerIndex !== 0);
    expect(noms(st, 0)).toEqual(["A"]);
  });
});

describe("affichage et forge", () => {
  const texte = (e: ComposedEffect) => describeComposedCap(cap("spell_resolution", e));

  it("décrit la cible, le plafond et la limite des places", () => {
    expect(texte(effet({ designation: "choice" }))).toContain("Prend le contrôle d'une unité ennemie");
    const n = texte(effet({ count: 2, maxCost: 4 }));
    expect(n).toContain("Prend le contrôle de 2 unités ennemies");
    expect(n).toContain("4");
    expect(n).toContain("dans la limite des places");
  });

  it("icône et invite de ciblage dédiées", () => {
    expect(composedIcon(cap("spell_resolution", effet())).keyword).toBe("spell_domination");
    expect(composedChoicePrompt(cap("spell_resolution", effet()))).toContain("dominer");
  });

  it("le menu des sorts insère la forme composée", () => {
    const entree = buildSpellEffectCatalog(["domination"]).find((e) => e.id === "domination");
    expect(entree?.kind === "composed" && entree.preset.content).toBe("domination");
  });
});
