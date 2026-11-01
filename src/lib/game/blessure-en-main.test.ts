// DÉGÂTS EN MAIN — règles de l'auteur (2026-11-01) :
//   1. une unité tuée en main part AU CIMETIÈRE tout de suite, au lieu de
//      rester jouable à 0 PV ou moins (vu en partie : un Sipahi 4/4 touché pour
//      5 par Salve dans la Brume, payé 4 mana, mort à l'arrivée) ;
//   2. en main, une unité n'a AUCUNE capacité active : ni râle à sa mort, ni
//      protection (Bouclier, Résistance, Transcendance…) contre les dégâts ;
//   3. une unité blessée mais vivante garde sa blessure, que la carte affiche.
import { describe, expect, it } from "vitest";
import { applyAction, blessureHorsPlateau } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState, Keyword } from "./types";

/** « 5 dégâts à toutes les unités de votre main » — la forme de Salve, sans hasard. */
function salve(x = 5): CardInstance {
  return mkInstance(mkCard({
    name: "Salve", card_type: "spell", mana_cost: 0, attack: null, health: null,
    capabilities: [{ uid: "s", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "deal_damage", magnitude: { x }, target: { entity: "unit", count: "all", side: "ally", location: "hand", designation: "automatic" } } }],
  }));
}

const enMain = (name: string, health: number, extra: { kws?: Keyword[]; caps?: Capability[] } = {}) =>
  mkInstance(mkCard({ name, attack: 4, health, keywords: extra.kws ?? [], capabilities: extra.caps }));

function lancer(s: GameState, sort = salve()): GameState {
  s.players[0].hand.push(sort);
  return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as GameAction);
}

const nomsMain = (st: GameState) => st.players[0].hand.map(c => c.card.name);
const nomsCimetiere = (st: GameState) => st.players[0].graveyard.map(c => c.card.name);

describe("une unité tuée en main", () => {
  it("part au cimetière aussitôt (le cas du Sipahi)", () => {
    const s = mkState();
    s.players[0].hand.push(enMain("Sipahi", 4));
    const st = lancer(s);
    expect(nomsMain(st)).not.toContain("Sipahi");
    expect(nomsCimetiere(st)).toContain("Sipahi");
  });

  it("ne déclenche AUCUN effet à sa mort", () => {
    const s = mkState();
    for (let i = 0; i < 3; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `Pioche ${i}` })));
    s.players[0].hand.push(enMain("Râle", 2, { caps: [{ uid: "r", trigger: "on_death", effectKind: "immediate", abilityId: "_composed",
      composed: { content: "draw_cards", magnitude: { x: 1 } } }] }));
    const st = lancer(s);
    expect(nomsCimetiere(st)).toContain("Râle");
    expect(st.players[0].hand.some(c => c.card.name.startsWith("Pioche"))).toBe(false);
  });
});

describe("en main, aucune protection", () => {
  it.each([["divine_shield"], ["resistance"], ["transcendance"], ["indestructible"]] as [Keyword][])(
    "%s n'arrête pas les dégâts", (kw) => {
      const s = mkState();
      // 5 PV pour 5 dégâts : la moindre réduction (Résistance 1) la sauverait.
      s.players[0].hand.push(enMain("Protégée", 5, { kws: [kw] }));
      const st = lancer(s);
      expect(nomsCimetiere(st)).toContain("Protégée");
    });
});

describe("une unité blessée mais vivante", () => {
  it("reste en main avec sa blessure, mesurée pour l'affichage", () => {
    const s = mkState();
    s.players[0].hand.push(enMain("Robuste", 9));
    const st = lancer(s);
    const c = st.players[0].hand.find(h => h.card.name === "Robuste")!;
    expect(c.currentHealth).toBe(4);
    expect(blessureHorsPlateau(c)).toBe(5);
  });

  it("une carte fraîche ne porte aucune blessure", () => {
    expect(blessureHorsPlateau(enMain("Neuve", 4))).toBe(0);
  });

  it("les cartes non-unités de la main ne sont pas touchées par le balayage", () => {
    const s = mkState();
    s.players[0].hand.push(mkInstance(mkCard({ name: "Sort en main", card_type: "spell", attack: null, health: null })));
    const st = lancer(s);
    expect(nomsMain(st)).toContain("Sort en main");
  });
});
