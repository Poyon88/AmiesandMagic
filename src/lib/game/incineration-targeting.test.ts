// Incinération X — remet X cartes au hasard du cimetière CIBLÉ sous le deck de
// son propriétaire.
//
// Constaté en partie : la capacité ne laissait pas choisir le cimetière et
// visait d'office celui de l'adversaire. `getCreatureTargets` savait pourtant
// déjà proposer les deux camps (`friendly_hero` / `enemy_hero`), mais l'ability
// manquait à `CREATURE_TARGETING_KEYWORDS` : `creatureNeedsTarget` rendait faux,
// le picker ne s'ouvrait jamais, et `incinerationVictim(undefined, …)` appliquait
// son repli — l'adversaire. Exactement la panne de Dévoration, un mois plus tard.
//
// La cible désigne un CAMP, pas une carte : on vise un héros, et c'est le
// cimetière de son contrôleur qui est recyclé.
import { describe, expect, it } from "vitest";
import { applyAction, creatureNeedsTarget, getCreatureTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

// Le X est lu par `getKwX` dans `params.x` de la CAPACITÉ (l'adaptateur y a déjà
// replié le `[Incinération X]` de effect_text) — pas dans `keyword_instances`.
const brasier = (x = 2) => mkInstance(mkCard({
  name: "Brasier", mana_cost: 5, attack: 2, health: 2,
  keywords: ["incineration"] as never,
  capabilities: [
    { uid: "cw_0", targets: [], trigger: "on_play", effectKind: "immediate", abilityId: "incineration", params: { x } },
  ] as unknown as Capability[],
}));

/** Deux cimetières garnis de cartes reconnaissables. */
function table() {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  for (let i = 0; i < 4; i++) {
    s.players[0].graveyard.push(mkInstance(mkCard({ name: `Mien${i}` })));
    s.players[1].graveyard.push(mkInstance(mkCard({ name: `Sien${i}` })));
  }
  return s;
}

const noms = (cartes: { card: { name: string } }[]) => cartes.map((c) => c.card.name);

describe("Incinération — le joueur CHOISIT le cimetière", () => {
  it("la carte réclame une cible à l'entrée en jeu", () => {
    expect(creatureNeedsTarget(brasier().card)).toBe(true);
  });

  it("les DEUX camps sont proposés, pas seulement l'adverse", () => {
    const ids = getCreatureTargets(table(), brasier().card);
    expect(ids).toContain("friendly_hero");
    expect(ids).toContain("enemy_hero");
  });
});

describe("Incinération — le cimetière désigné est bien celui qui est recyclé", () => {
  it("en visant SON PROPRE héros, c'est son cimetière qui est vidé", () => {
    const s = table();
    const b = brasier(2);
    s.players[0].hand.push(b);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: b.instanceId, targetInstanceId: "friendly_hero",
    });

    // 2 cartes quittent MON cimetière pour le dessous de MON deck…
    expect(st.players[0].graveyard).toHaveLength(2);
    expect(noms(st.players[0].deck).filter((n) => n.startsWith("Mien"))).toHaveLength(2);
    // …et celui de l'adversaire n'a pas bougé.
    expect(st.players[1].graveyard).toHaveLength(4);
    expect(noms(st.players[1].deck).filter((n) => n.startsWith("Sien"))).toHaveLength(0);
  });

  it("en visant le héros ADVERSE, c'est son cimetière qui est vidé", () => {
    const s = table();
    const b = brasier(2);
    s.players[0].hand.push(b);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: b.instanceId, targetInstanceId: "enemy_hero",
    });

    expect(st.players[1].graveyard).toHaveLength(2);
    expect(noms(st.players[1].deck).filter((n) => n.startsWith("Sien"))).toHaveLength(2);
    expect(st.players[0].graveyard).toHaveLength(4);
  });

  it("viser une UNITÉ recycle le cimetière de son contrôleur", () => {
    const s = table();
    const allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 1 }));
    s.players[0].board.push(allie);
    const b = brasier(1);
    s.players[0].hand.push(b);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: b.instanceId, targetInstanceId: allie.instanceId,
    });

    expect(st.players[0].graveyard).toHaveLength(3);
    expect(st.players[1].graveyard).toHaveLength(4);
  });
});

describe("Incinération — bornes", () => {
  it("X supérieur au cimetière le vide sans casser", () => {
    const s = table();
    const b = brasier(99);
    s.players[0].hand.push(b);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: b.instanceId, targetInstanceId: "friendly_hero",
    });

    expect(st.players[0].graveyard).toHaveLength(0);
    expect(noms(st.players[0].deck).filter((n) => n.startsWith("Mien"))).toHaveLength(4);
  });

  it("un cimetière vide ne produit rien", () => {
    const s = mkState();
    const b = brasier(3);
    s.players[0].hand.push(b);
    const avant = s.players[0].deck.length;

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: b.instanceId, targetInstanceId: "friendly_hero",
    });

    expect(st.players[0].graveyard).toHaveLength(0);
    expect(st.players[0].deck).toHaveLength(avant);
  });

  it("les cartes recyclées repartent neuves (ni dégâts ni bonus traînés)", () => {
    const s = table();
    const blesse = s.players[0].graveyard[0];
    blesse.currentHealth = 1;
    blesse.currentAttack = 99;
    const b = brasier(4);
    s.players[0].hand.push(b);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: b.instanceId, targetInstanceId: "friendly_hero",
    });

    const recyclee = st.players[0].deck.find((c) => c.instanceId === blesse.instanceId)!;
    expect(recyclee.currentHealth).toBe(recyclee.card.health);
    expect(recyclee.currentAttack).toBe(recyclee.card.attack);
  });
});

describe("Retour différé — même panne, trouvée dans la même passe", () => {
  const messager = () => mkInstance(mkCard({
    name: "Messager", mana_cost: 4, attack: 2, health: 2,
    keywords: ["retour_differe"] as never,
    capabilities: [
      { uid: "cw_0", targets: [], trigger: "on_play", effectKind: "immediate", abilityId: "retour_differe" },
    ] as unknown as Capability[],
  }));

  it("réclame une cible au lieu d'en tirer une au hasard", () => {
    expect(creatureNeedsTarget(messager().card)).toBe(true);
  });

  it("propose les unités des deux plateaux", () => {
    const s: GameState = mkState();
    const mien = mkInstance(mkCard({ name: "Mien", attack: 1, health: 1 }));
    const sien = mkInstance(mkCard({ name: "Sien", attack: 1, health: 1 }));
    s.players[0].board.push(mien);
    s.players[1].board.push(sien);

    const ids = getCreatureTargets(s, messager().card);
    expect(ids).toContain(mien.instanceId);
    expect(ids).toContain(sien.instanceId);
  });
});
