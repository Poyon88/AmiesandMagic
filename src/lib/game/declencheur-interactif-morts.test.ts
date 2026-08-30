// Un choix tranché peut TUER — et la dépouille doit partir tout de suite.
//
// Vu en partie : l'Archère des Cieux tue le Jeune Éclaireur avec son Impact de
// fin de tour, et le cadavre reste sur le plateau à 0 PV. Il ne rejoignait le
// cimetière qu'à l'action SUIVANTE, qui le balayait au passage.
//
// CAUSE : `resolvePendingTrigger` appliquait l'effet, recalculait les auras et
// vérifiait la victoire, mais ne balayait jamais les morts. Le cas se produit
// surtout hors file de fin de tour : les mots-clés curés interactifs (Impact,
// Remontée) déposent leur déclencheur SANS suspendre la file, si bien que
// `finalizeEndOfTurn` — le seul autre balayeur — passe AVANT que les dégâts
// n'aient eu lieu.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

/** Créature dont l'Impact X part à la FIN DU TOUR, avec choix de cible. */
function archere(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Archère des Cieux", attack: 2, health: 2, mana_cost: 3,
    keywords: ["impact"] as never,
    keyword_instances: [{ id: "impact", x, mode: "end_of_turn" }] as never,
  }));
}

function scene(pvCible: number, graine?: number): GameState {
  const s = mkState();
  if (graine != null) s.rngState = graine;
  s.players[0].board = [archere(1)];
  s.players[1].board = [mkInstance(mkCard({ name: "Éclaireur", attack: 1, health: pvCible }))];
  return applyAction(s, { type: "end_turn" });
}

describe("Impact de fin de tour, cible désignée", () => {
  it("la victime rejoint le cimetière IMMÉDIATEMENT", () => {
    let s = scene(1);
    const trig = (s.pendingTriggers ?? [])[0];
    expect(trig?.kw).toBe("impact");

    s = applyAction(s, {
      type: "resolve_pending_trigger", triggerId: trig!.id,
      targetInstanceId: s.players[1].board[0].instanceId,
    });

    // Le défaut : le plateau gardait une dépouille à 0 PV, cimetière vide.
    expect(s.players[1].board).toHaveLength(0);
    expect(s.players[1].graveyard).toHaveLength(1);
  });

  it("une victime qui SURVIT reste bien en jeu, blessée", () => {
    let s = scene(4);
    const trig = (s.pendingTriggers ?? [])[0];
    s = applyAction(s, {
      type: "resolve_pending_trigger", triggerId: trig!.id,
      targetInstanceId: s.players[1].board[0].instanceId,
    });
    expect(s.players[1].board).toHaveLength(1);
    expect(s.players[1].board[0].currentHealth).toBe(3);
  });
});

describe("repli automatique du chrono", () => {
  it("balaie aussi les morts qu'il provoque", () => {
    // Le tirage au hasard tue tout aussi bien qu'un choix du joueur. Graine
    // FIGÉE : Impact peut aussi viser le héros, et un tirage libre rendrait le
    // test vacant une fois sur deux — il passerait sans rien vérifier.
    let s = scene(1, 12);
    expect((s.pendingTriggers ?? []).length).toBe(1);
    s = applyAction(s, { type: "auto_resolve_pending_triggers" });
    expect(s.players[1].board).toHaveLength(0);
    expect(s.players[1].graveyard).toHaveLength(1);
  });
});
