// BOOMERANG — après sa résolution, le sort est mélangé dans le deck de son
// lanceur au lieu d'aller au cimetière.
//
// Modificateur GLOBAL du sort, sans cible ni valeur propre : il ne fait rien seul
// et ne change que le SORT du sort une fois résolu. Même famille que Précision et
// Touché mortel.
//
// Le point qui compte : le sort ne TRANSITE PAS par le cimetière. Il est donc
// invisible aux effets qui le comptent ou le fouillent (Nécrophagie, Exhumation,
// Force des ancêtres, Incinération…).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { SPELL_KEYWORDS } from "./spell-keywords";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

/** Sort à 1 mana : Impact 2 sur une cible, plus Boomerang. */
const sortBoomerang = () => mkInstance(mkCard({
  name: "Retour de flamme", card_type: "spell", attack: null, health: null, mana_cost: 1,
  spell_keywords: [
    { id: "impact", amount: 2 },
    { id: "boomerang" },
  ] as never,
  capabilities: [
    { uid: "sk_0", params: { x: 2 }, targets: [{ type: "any", label: "Impact X" }], trigger: "spell_resolution", abilityId: "impact", effectKind: "immediate" },
    { uid: "sk_1", targets: [], trigger: "spell_resolution", abilityId: "boomerang", effectKind: "immediate" },
  ] as unknown as Capability[],
}));

/** Le même sort SANS Boomerang, pour isoler la différence. */
const sortOrdinaire = () => mkInstance(mkCard({
  name: "Trait simple", card_type: "spell", attack: null, health: null, mana_cost: 1,
  spell_keywords: [{ id: "impact", amount: 2 }] as never,
  capabilities: [
    { uid: "sk_0", params: { x: 2 }, targets: [{ type: "any", label: "Impact X" }], trigger: "spell_resolution", abilityId: "impact", effectKind: "immediate" },
  ] as unknown as Capability[],
}));

function table(graine = 1): GameState {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.rngState = graine;
  for (let i = 0; i < 8; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `Deck${i}` })));
  return s;
}

const jouer = (s: GameState, sort: ReturnType<typeof sortBoomerang>) => {
  s.players[0].hand.push(sort);
  s.players[0].mana = 10;
  return applyAction(s, {
    type: "play_card", cardInstanceId: sort.instanceId,
    targetMap: { kw_0: "enemy_hero" },
  });
};

describe("Boomerang — le registre", () => {
  it("est déclaré comme mot-clé de SORT, sans cible ni paramètre", () => {
    const def = SPELL_KEYWORDS["boomerang"];
    expect(def).toBeTruthy();
    expect(def.needsTarget).toBeFalsy();
    expect(def.params).toEqual([]);
  });
});

describe("Boomerang — destination du sort résolu", () => {
  it("le sort revient dans le deck et NON au cimetière", () => {
    const s = table();
    const sort = sortBoomerang();
    const avant = s.players[0].deck.length;

    const st = jouer(s, sort);

    expect(st.players[0].graveyard.map((c) => c.card.name)).not.toContain("Retour de flamme");
    expect(st.players[0].deck.map((c) => c.card.name)).toContain("Retour de flamme");
    expect(st.players[0].deck).toHaveLength(avant + 1);
  });

  it("le même sort SANS Boomerang part bien au cimetière", () => {
    const s = table();
    const sort = sortOrdinaire();
    const avant = s.players[0].deck.length;

    const st = jouer(s, sort);

    expect(st.players[0].graveyard.map((c) => c.card.name)).toContain("Trait simple");
    expect(st.players[0].deck).toHaveLength(avant);
  });

  it("l'effet du sort se résout NORMALEMENT avant de repartir", () => {
    const s = table();
    const pvAvant = s.players[1].hero.hp;

    const st = jouer(s, sortBoomerang());

    expect(st.players[1].hero.hp).toBe(pvAvant - 2);
  });

  it("le sort ne transite JAMAIS par le cimetière (invisible aux effets qui le fouillent)", () => {
    const s = table();
    const st = jouer(s, sortBoomerang());
    // Cimetière rigoureusement vide : pas même un passage.
    expect(st.players[0].graveyard).toHaveLength(0);
  });
});

describe("Boomerang — la position est mélangée, et déterministe", () => {
  it("la position varie selon la graine (ce n'est pas toujours le dessus)", () => {
    const positions = new Set<number>();
    for (let graine = 1; graine <= 12; graine++) {
      const s = table(graine);
      const st = jouer(s, sortBoomerang());
      positions.add(st.players[0].deck.findIndex((c) => c.card.name === "Retour de flamme"));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("à graine ÉGALE, la position est la même — pas de désync entre clients", () => {
    const position = () => {
      const st = jouer(table(7), sortBoomerang());
      return st.players[0].deck.findIndex((c) => c.card.name === "Retour de flamme");
    };
    expect(position()).toBe(position());
  });

  it("le fond du deck est atteignable (borne haute incluse)", () => {
    // splice accepte un index de 0 à length : un `% length` aurait exclu le fond.
    const vues = new Set<number>();
    for (let graine = 1; graine <= 60; graine++) {
      const st = jouer(table(graine), sortBoomerang());
      vues.add(st.players[0].deck.findIndex((c) => c.card.name === "Retour de flamme"));
    }
    expect(Math.max(...vues)).toBe(8); // 8 cartes au départ → index 8 = le fond
  });

  it("un deck VIDE ne casse rien : le sort devient l'unique carte", () => {
    const s = mkState();
    s.players[0].deck = [];
    const st = jouer(s, sortBoomerang());
    expect(st.players[0].deck.map((c) => c.card.name)).toEqual(["Retour de flamme"]);
  });
});

describe("Boomerang — ce que le sort emporte avec lui", () => {
  it("la réduction de Préincanter SURVIT à l'aller-retour", () => {
    // Préincanter la promet « de façon permanente » : l'effacer au retour
    // contredirait la carte. C'est aussi la doctrine des retours en main, qui
    // conservent les bonus permanents.
    const s = table();
    const sort = sortBoomerang();
    sort.manaCostReduction = 2;

    const st = jouer(s, sort);

    const revenu = st.players[0].deck.find((c) => c.card.name === "Retour de flamme")!;
    expect(revenu.manaCostReduction).toBe(2);
  });

  it("c'est bien la MÊME instance qui revient (et non une copie)", () => {
    const s = table();
    const sort = sortBoomerang();
    const st = jouer(s, sort);
    expect(st.players[0].deck.some((c) => c.instanceId === sort.instanceId)).toBe(true);
  });
});
