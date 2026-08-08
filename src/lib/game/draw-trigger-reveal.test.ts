// state.drawTriggerEvents : révélation des cartes dont l'effet « à la pioche »
// vient de partir. La carte n'est JAMAIS jouée (elle rejoint la main), donc rien
// à l'écran n'expliquait ses dégâts / invocations — et l'adversaire ne voit même
// pas la carte entrer dans la main d'en face. Le store la révèle avec l'overlay
// de lancement de sort à partir de cet indice. Purement visuel : hors hash.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameState } from "./types";

/** Carte dont l'effet curé `id` part À LA PIOCHE. */
function carteAPioche(nom: string, id: string, x = 1) {
  return mkInstance(mkCard({
    name: nom, mana_cost: 3, attack: 2, health: 2,
    keywords: [id] as never,
    keyword_instances: [{ id, x, mode: "draw" } as never],
  }));
}

function capPioche(composed: ComposedEffect): Capability {
  return { uid: "c0", trigger: "on_draw", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Fin de tour de P0 → début de tour de P1, qui pioche la 1re carte de son deck. */
function faitPiocher(s: GameState): GameState {
  return applyAction(s, { type: "end_turn" });
}

describe("drawTriggerEvents — révélation de la carte piochée", () => {
  it("annonce la carte et son propriétaire quand l'effet part", () => {
    const s = mkState();
    s.players[1].deck = [carteAPioche("Coffre", "epargne", 2)];

    const st = faitPiocher(s);

    expect(st.drawTriggerEvents).toHaveLength(1);
    expect(st.drawTriggerEvents![0].card.name).toBe("Coffre");
    // ownerId = celui qui pioche : le store en déduit le POV de la bannière
    // (« votre pioche » vs « pioche adverse »).
    expect(st.drawTriggerEvents![0].ownerId).toBe(s.players[1].id);
  });

  it("vaut aussi pour une capacité COMPOSÉE (trigger on_draw)", () => {
    const s = mkState();
    s.players[1].deck = [mkInstance(mkCard({
      name: "Fouineur",
      capabilities: [capPioche({
        content: "deal_damage", magnitude: { x: 3 },
        target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" },
      })],
    }))];

    const st = faitPiocher(s);

    expect(st.drawTriggerEvents?.map(e => e.card.name)).toEqual(["Fouineur"]);
  });

  it("une carte piochée SANS effet à la pioche n'annonce rien", () => {
    const s = mkState();
    // Même mot-clé, mode par défaut (à l'invocation) : aucune révélation, sinon
    // chaque début de tour ouvrirait un overlay pour une pioche banale.
    s.players[1].deck = [mkInstance(mkCard({
      name: "Banale", keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2 } as never],
    }))];

    const st = faitPiocher(s);

    expect(st.drawTriggerEvents).toBeUndefined();
  });

  it("une carte défaussée main pleine n'annonce rien (l'effet ne part pas non plus)", () => {
    const s = mkState();
    s.players[1].hand = Array.from({ length: 10 }, (_, i) => mkInstance(mkCard({ name: `Main${i}` })));
    s.players[1].deck = [carteAPioche("Coffre", "epargne", 2)];

    const st = faitPiocher(s);

    expect(st.players[1].epargne ?? 0).toBe(0);
    expect(st.drawTriggerEvents).toBeUndefined();
  });
});

describe("drawTriggerEvents — exclu du hash d'état", () => {
  it("deux états ne différant que par drawTriggerEvents hashent identique", () => {
    const a = mkState();
    const b = mkState();
    b.drawTriggerEvents = [{ card: mkCard({ name: "Coffre" }), ownerId: "P2" }];
    expect(syncHash(a)).toBe(syncHash(b));
  });
});
