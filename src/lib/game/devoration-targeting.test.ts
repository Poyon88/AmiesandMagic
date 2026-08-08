// Dévoration — détruit une unité et la SOURCE absorbe définitivement ses stats.
//
// Constaté en partie avec « L'Ancêtre aux Mille Dents » : la capacité dévorait
// une créature AU HASARD, et cette fois-ci un allié du joueur qui venait de la
// jouer. Deux défauts distincts derrière ce seul symptôme :
//
//   1. `getCreatureTargets` savait déjà bâtir la liste de cibles de Dévoration,
//      mais l'ability manquait à `CREATURE_TARGETING_KEYWORDS` — donc
//      `creatureNeedsTarget` rendait faux, le picker ne s'ouvrait jamais et le
//      moteur retombait systématiquement sur le tirage au sort. Deux listes à
//      tenir d'accord, une seule tenue à jour.
//   2. Ce tirage puisait dans les DEUX plateaux. Choisir de dévorer son propre
//      allié reste une option légitime (sacrifier une grosse unité pour en
//      gonfler une autre) ; le faire AU HASARD ne l'est jamais.
import { describe, expect, it } from "vitest";
import { applyAction, creatureNeedsTarget, getCreatureTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

const ancetre = () => mkInstance(mkCard({
  name: "Ancêtre", mana_cost: 8, attack: 4, health: 4,
  keywords: ["devoration", "charge"] as never,
  capabilities: [
    { uid: "cw_0", targets: [], trigger: "on_play", effectKind: "immediate", abilityId: "devoration" },
    { uid: "cw_1", targets: [], trigger: "automatic", effectKind: "immediate", abilityId: "charge" },
  ] as unknown as Capability[],
}));

function table() {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.players[0].board.push(mkInstance(mkCard({ name: "Allié", attack: 2, health: 3 })));
  s.players[1].board.push(mkInstance(mkCard({ name: "Ennemi", attack: 3, health: 5 })));
  return s;
}

const sur = (s: GameState) => s.players[0].board.find((c) => c.card.name === "Ancêtre")!;

describe("Dévoration — le joueur CHOISIT sa victime", () => {
  it("la carte réclame une cible à l'entrée en jeu", () => {
    expect(creatureNeedsTarget(ancetre().card)).toBe(true);
  });

  it("les deux plateaux sont proposés : dévorer son propre allié reste un choix", () => {
    const s = table();
    const ids = getCreatureTargets(s, ancetre().card);
    expect(ids).toContain(s.players[0].board[0].instanceId);
    expect(ids).toContain(s.players[1].board[0].instanceId);
  });
});

describe("Dévoration — absorption des stats", () => {
  it("la victime meurt et la source gagne SES stats, de façon suivie", () => {
    const s = table();
    const a = ancetre();
    s.players[0].hand.push(a);
    const victime = s.players[1].board[0];

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: a.instanceId, targetInstanceId: victime.instanceId,
    });

    const src = sur(st);
    expect([src.currentAttack, src.currentHealth, src.maxHealth]).toEqual([7, 9, 9]); // 4/4 + 3/5
    // Les bonus vivent dans des champs DÉDIÉS : recalculateAuras rebâtit
    // currentAttack depuis la base et effacerait un simple `+=`.
    expect([src.devorationATKBonus, src.devorationPVBonus]).toEqual([3, 5]);
    expect(st.players[1].graveyard.map((c) => c.card.name)).toContain("Ennemi");
  });

  it("dévorer un ALLIÉ désigné fonctionne aussi (sacrifice assumé)", () => {
    const s = table();
    const a = ancetre();
    s.players[0].hand.push(a);
    const allie = s.players[0].board[0];

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: a.instanceId, targetInstanceId: allie.instanceId,
    });

    expect(sur(st).currentAttack).toBe(6); // 4 + 2
    expect(st.players[0].graveyard.map((c) => c.card.name)).toContain("Allié");
  });
});

describe("Dévoration — le repli AU HASARD ne mange jamais son camp", () => {
  it("sans cible désignée, la victime est toujours ennemie", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = table();
      s.rngState = seed;
      // Plusieurs alliés : avant le correctif, le tirage les incluait.
      s.players[0].board.push(mkInstance(mkCard({ name: "Allié2", attack: 5, health: 6 })));
      const a = ancetre();
      s.players[0].hand.push(a);

      const st = applyAction(s, { type: "play_card", cardInstanceId: a.instanceId });

      expect(st.players[0].graveyard, `graine ${seed}`).toHaveLength(0);
      expect(st.players[1].graveyard.map((c) => c.card.name)).toEqual(["Ennemi"]);
    }
  });

  it("aucun ennemi en jeu ⇒ personne n'est dévoré (et surtout pas un allié)", () => {
    const s = mkState();
    s.players[0].board.push(
      mkInstance(mkCard({ name: "AllieA", attack: 2, health: 3 })),
      mkInstance(mkCard({ name: "AllieB", attack: 5, health: 6 })),
    );
    const a = ancetre();
    s.players[0].hand.push(a);

    const st = applyAction(s, { type: "play_card", cardInstanceId: a.instanceId });

    expect(st.players[0].graveyard).toHaveLength(0);
    expect(sur(st).currentAttack).toBe(4); // aucun gain
  });
});
