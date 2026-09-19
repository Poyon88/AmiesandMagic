// NOMBRE D'OCCURRENCES d'un effet composé — « Appel du clan 5, 3 occurrences »
// appelle les TROIS premières unités du deck qui tiennent dans le filtre.
//
// Sept contenus sont concernés : ceux qui ne visent aucune unité en jeu et
// n'avaient donc aucun moyen de dire leur multiplicité (les autres ont
// `target.count`). Ce qui est verrouillé ici : le nombre de passes, le fait que
// chaque passe reparte de l'état laissé par la précédente (le deck s'épuise),
// l'arrêt anticipé quand il n'y a plus de place ou plus de candidat, et
// l'identité stricte du comportement à 1 occurrence.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { nombreDOccurrences, MAX_OCCURRENCES } from "./composed-occurrences";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, ComposedEffect, GameState } from "./types";

function porteuse(composed: ComposedEffect, nom = "Héraut"): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed", composed,
  }];
  return mkInstance(mkCard({ name: nom, attack: 1, health: 3, capabilities: caps as never }));
}

function jouer(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

const unite = (nom: string, cout: number, over: Partial<Card> = {}) =>
  mkInstance(mkCard({ name: nom, mana_cost: cout, attack: 1, health: 1, ...over }));

const plateau = (s: GameState) => s.players[0].board.map((c) => c.card.name);
const main = (s: GameState) => s.players[0].hand.map((c) => c.card.name);

describe("nombreDOccurrences", () => {
  it("absent, nul ou négatif ⇒ une seule passe", () => {
    expect(nombreDOccurrences({})).toBe(1);
    expect(nombreDOccurrences({ occurrences: 0 })).toBe(1);
    expect(nombreDOccurrences({ occurrences: -4 })).toBe(1);
  });
  it("plafonné : une saisie aberrante ne bloque pas le joueur", () => {
    expect(nombreDOccurrences({ occurrences: 500 })).toBe(MAX_OCCURRENCES);
  });
  it("décimal tronqué", () => {
    expect(nombreDOccurrences({ occurrences: 2.9 })).toBe(2);
  });
});

describe("Appel — les N premières unités du deck", () => {
  const appel = (x: number, occurrences?: number): ComposedEffect =>
    ({ content: "appel", magnitude: { x }, ...(occurrences ? { occurrences } : {}) });

  it("3 occurrences appellent les 3 premières unités de coût ≤ X", () => {
    const s = mkState();
    s.players[0].deck.push(
      unite("Trop chère", 9), unite("Première", 2), unite("Deuxième", 5),
      unite("Troisième", 1), unite("Quatrième", 3),
    );
    const apres = jouer(s, porteuse(appel(5, 3)));
    expect(plateau(apres)).toEqual(["Héraut", "Première", "Deuxième", "Troisième"]);
    // Les appelées ont bien QUITTÉ le deck, chacune une seule fois.
    expect(apres.players[0].deck.map((c) => c.card.name)).toEqual(["Trop chère", "Quatrième"]);
  });

  it("sans occurrence déclarée, le comportement d'avant tient : une seule", () => {
    const s = mkState();
    s.players[0].deck.push(unite("Première", 2), unite("Deuxième", 2));
    expect(plateau(jouer(s, porteuse(appel(5))))).toEqual(["Héraut", "Première"]);
  });

  it("s'arrête quand le deck n'a plus de candidat, sans tourner à vide", () => {
    const s = mkState();
    s.players[0].deck.push(unite("Seule", 2), unite("Trop chère", 9));
    expect(plateau(jouer(s, porteuse(appel(5, 4))))).toEqual(["Héraut", "Seule"]);
  });
});

describe("Appel Suprême — les N plus chères", () => {
  it("3 occurrences ramènent les 3 cartes les plus chères, décroissantes", () => {
    const s = mkState();
    s.players[0].deck.push(unite("Petite", 1), unite("Colosse", 8), unite("Grande", 6), unite("Moyenne", 4));
    const apres = jouer(s, porteuse({ content: "appel_supreme", magnitude: { x: 0 }, occurrences: 3 }));
    expect(main(apres)).toEqual(["Colosse", "Grande", "Moyenne"]);
    expect(apres.players[0].deck.map((c) => c.card.name)).toEqual(["Petite"]);
  });

  it("le plafond de coût s'applique à chaque passe", () => {
    const s = mkState();
    s.players[0].deck.push(unite("Colosse", 8), unite("Grande", 5), unite("Moyenne", 4));
    const apres = jouer(s, porteuse({ content: "appel_supreme", magnitude: { x: 5 }, occurrences: 3 }));
    expect(main(apres)).toEqual(["Grande", "Moyenne"]);
  });
});

describe("Tuteur et Invocation désignée — la LISTE entière se rejoue", () => {
  const poolCard = (id: number, name: string): Card =>
    mkCard({ id, name, faction: "Mercenaires", rarity: "Commune", mana_cost: 2, attack: 1, health: 1 });

  it("Tuteur [A, B] × 3 ⇒ A B A B A B", () => {
    const s = mkState();
    s.factionCardPool = [poolCard(7001, "A"), poolCard(7002, "B")];
    const apres = jouer(s, porteuse({ content: "tuteur", cardIds: [7001, 7002], occurrences: 3 }));
    expect(main(apres)).toEqual(["A", "B", "A", "B", "A", "B"]);
  });

  it("Invocation désignée [A] × 2 ⇒ deux exemplaires sur le plateau", () => {
    const s = mkState();
    s.factionCardPool = [poolCard(7001, "A")];
    const apres = jouer(s, porteuse({ content: "invocation", cardIds: [7001], occurrences: 2 }));
    expect(plateau(apres)).toEqual(["Héraut", "A", "A"]);
  });
});

describe("Sélections — N fenêtres SUCCESSIVES", () => {
  /** Collection assez fournie pour que chaque passe ait de quoi révéler 3
   *  cartes. Toutes à coût 1 : l'offre d'une Sélection vise un coût EXACT. */
  function collection(n = 30): Card[] {
    return Array.from({ length: n }, (_, i) =>
      mkCard({ id: 8000 + i, name: `C${i}`, faction: "Mercenaires", rarity: "Commune", mana_cost: 1, attack: 1, health: 1 }));
  }

  it("3 occurrences mettent en file 3 déclencheurs, aux ids DISTINCTS", () => {
    const s = mkState();
    s.factionCardPool = collection();
    const apres = jouer(s, porteuse({ content: "selection", magnitude: { x: 1 }, occurrences: 3 }));
    const file = apres.pendingTriggers ?? [];
    expect(file).toHaveLength(3);
    // Sans ids distincts, resolvePendingTrigger dépilerait toujours le premier
    // et les fenêtres suivantes ne se refermeraient jamais.
    expect(new Set(file.map((t) => t.id)).size).toBe(3);
    for (const t of file) expect(t.selectionType).toBe("selection");
  });

  it("chaque passe tire son PROPRE triplet (germe distinct)", () => {
    const s = mkState();
    s.factionCardPool = collection();
    const file = (jouer(s, porteuse({ content: "selection", magnitude: { x: 1 }, occurrences: 3 })).pendingTriggers ?? []);
    const triplets = file.map((t) => (t.selectionOptionIds ?? []).join(","));
    // Trois passes au même germe auraient proposé trois fois les mêmes cartes.
    expect(new Set(triplets).size).toBeGreaterThan(1);
  });

  it("la passe 0 garde l'id d'avant : aucune carte existante ne bouge", () => {
    // L'id vaut `${instanceId}#${capUid}` — c'est la clé que le client renvoie
    // pour refermer la fenêtre. Le suffixe d'occurrence ne doit JAMAIS toucher
    // la première passe, sinon toutes les Sélections déjà en base changeraient
    // de clé du jour au lendemain.
    for (const composed of [
      { content: "selection" as const, magnitude: { x: 1 } },
      { content: "selection" as const, magnitude: { x: 1 }, occurrences: 1 },
    ]) {
      const s = mkState(); s.factionCardPool = collection();
      const inst = porteuse(composed);
      const file = jouer(s, inst).pendingTriggers ?? [];
      expect(file).toHaveLength(1);
      expect(file[0].id).toBe(`${inst.instanceId}#cx_0`);
    }
  });

  it("les passes suivantes portent le suffixe d'occurrence", () => {
    const s = mkState(); s.factionCardPool = collection();
    const inst = porteuse({ content: "selection", magnitude: { x: 1 }, occurrences: 3 });
    const ids = (jouer(s, inst).pendingTriggers ?? []).map((t) => t.id);
    expect(ids).toEqual([
      `${inst.instanceId}#cx_0`,
      `${inst.instanceId}#cx_0#occ1`,
      `${inst.instanceId}#cx_0#occ2`,
    ]);
  });
});

describe("Ce que la carte annonce", () => {
  it("le préfixe « N fois : » ouvre la phrase", async () => {
    const { describeComposedCap } = await import("./composed-display");
    const cap = {
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "appel", magnitude: { x: 5 }, occurrences: 3 },
    } as never;
    expect(describeComposedCap(cap)).toMatch(/^3 fois : /);
  });

  it("une seule occurrence n'ajoute aucun préfixe", async () => {
    const { describeComposedCap } = await import("./composed-display");
    const cap = {
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "appel", magnitude: { x: 5 } },
    } as never;
    expect(describeComposedCap(cap)).not.toMatch(/fois/);
  });
});
