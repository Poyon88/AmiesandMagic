// Ordre STRICT gauche→droite des effets de fin de tour, TOUS RÉGIMES CONFONDUS.
// Un effet automatique d'une créature à droite ne doit se résoudre qu'APRÈS un
// effet interactif d'une créature située à sa gauche (avant, la séquence était
// scindée : tous les automatiques d'abord, puis les interactifs).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `cap_${trigger}_${composed.content}`, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}

// Effet INTERACTIF : inflige 3 à une unité ennemie AU CHOIX.
const CHOICE_DMG: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 3 },
  target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
};
// Effet AUTOMATIQUE : +1/+1 sur soi.
const SELF_BUFF: ComposedEffect = {
  content: "buff", magnitude: { x: 1, y: 1 },
  target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
};

describe("Fin de tour — ordre strict gauche→droite tous régimes confondus", () => {
  it("l'automatique d'une créature à droite attend la résolution de l'interactif à gauche", () => {
    const s = mkState();
    // Plateau P0 : [0] interactif (choix), [1] automatique (self-buff).
    const interactif = mkInstance(mkCard({ name: "Choix", attack: 1, health: 1,
      capabilities: [composedCap("on_end_of_turn", CHOICE_DMG)] }));
    const automatique = mkInstance(mkCard({ name: "Auto", attack: 2, health: 2,
      capabilities: [composedCap("on_end_of_turn", SELF_BUFF)] }));
    s.players[0].board.push(interactif, automatique);
    // Cible ennemie pour l'effet interactif.
    const victim = mkInstance(mkCard({ name: "Cible", attack: 0, health: 5 }));
    s.players[1].board.push(victim);

    // 1) Fin de tour : pause sur l'interactif (créature 0). L'AUTO de la
    //    créature 1 NE DOIT PAS encore s'être appliqué (ordre strict).
    const paused = applyAction(s, { type: "end_turn" });
    expect(paused.endTurnPending).toBe(true);
    expect(paused.pendingTriggers?.length).toBe(1);
    const autoPaused = paused.players[0].board.find((c) => c.instanceId === automatique.instanceId)!;
    expect(autoPaused.currentAttack).toBe(2); // PAS encore buffé
    expect(autoPaused.maxHealth).toBe(2);

    // 2) Résolution de l'interactif → l'effet AUTO de la créature à droite
    //    s'applique ensuite, puis le tour bascule.
    const triggerId = paused.pendingTriggers![0].id;
    const resolved = applyAction(paused, { type: "resolve_pending_trigger", triggerId, targetInstanceId: victim.instanceId });

    const hitVictim = resolved.players[1].board.find((c) => c.instanceId === victim.instanceId)!;
    expect(hitVictim.currentHealth).toBe(2); // 5 - 3 (interactif appliqué)
    const autoAfter = resolved.players[0].board.find((c) => c.instanceId === automatique.instanceId)!;
    expect(autoAfter.currentAttack).toBe(3); // 2 + 1 (auto appliqué APRÈS)
    expect(autoAfter.maxHealth).toBe(3);
    expect(resolved.currentPlayerIndex).toBe(1); // tour basculé
    expect(resolved.endTurnPending ?? false).toBe(false);
  });

  it("deux interactifs : résolus un par un dans l'ordre du plateau (un seul en file à la fois)", () => {
    const s = mkState();
    const gauche = mkInstance(mkCard({ name: "Gauche", attack: 1, health: 1,
      capabilities: [composedCap("on_end_of_turn", CHOICE_DMG)] }));
    const droite = mkInstance(mkCard({ name: "Droite", attack: 1, health: 1,
      capabilities: [composedCap("on_end_of_turn", CHOICE_DMG)] }));
    s.players[0].board.push(gauche, droite);
    const a = mkInstance(mkCard({ name: "A", attack: 0, health: 5 }));
    const b = mkInstance(mkCard({ name: "B", attack: 0, health: 5 }));
    s.players[1].board.push(a, b);

    // Pause 1 : un seul pending, porté par la créature de GAUCHE.
    const p1 = applyAction(s, { type: "end_turn" });
    expect(p1.pendingTriggers?.length).toBe(1);
    expect(p1.pendingTriggers![0].sourceInstanceId).toBe(gauche.instanceId);

    // Résout gauche (frappe A) → pause 2 sur la créature de DROITE.
    const p2 = applyAction(p1, { type: "resolve_pending_trigger", triggerId: p1.pendingTriggers![0].id, targetInstanceId: a.instanceId });
    expect(p2.endTurnPending).toBe(true);
    expect(p2.pendingTriggers?.length).toBe(1);
    expect(p2.pendingTriggers![0].sourceInstanceId).toBe(droite.instanceId);

    // Résout droite (frappe B) → bascule.
    const p3 = applyAction(p2, { type: "resolve_pending_trigger", triggerId: p2.pendingTriggers![0].id, targetInstanceId: b.instanceId });
    expect(p3.players[1].board.find((c) => c.instanceId === a.instanceId)!.currentHealth).toBe(2);
    expect(p3.players[1].board.find((c) => c.instanceId === b.instanceId)!.currentHealth).toBe(2);
    expect(p3.currentPlayerIndex).toBe(1);
    expect(p3.endTurnPending ?? false).toBe(false);
  });
});

// ─── Ordre gauche→droite : tous les CANAUX, pas seulement les composés ──────
// Les deux cas ci-dessus prouvent l'entrelacement interactif/automatique sur des
// effets COMPOSÉS. Un effet de fin de tour peut aussi venir d'un mot-clé CURÉ
// (keyword_instances en mode "end_of_turn"), et les deux canaux alimentent la
// même file. On le vérifie avec un effet dont l'ordre est OBSERVABLE : chaque
// créature pioche une carte, donc l'ordre de la main révèle la séquence.
describe("Fin de tour — ordre gauche→droite sur tous les canaux", () => {
  const DRAW1: ComposedEffect = { content: "draw_cards", magnitude: { x: 1 } };

  /** Créature dont l'effet de fin de tour est COMPOSÉ. */
  function composee(nom: string) {
    return mkInstance(mkCard({
      name: nom, attack: 1, health: 3,
      capabilities: [{ ...composedCap("on_end_of_turn", DRAW1), uid: `cx_${nom}` }],
    }));
  }
  /** Créature dont l'effet de fin de tour est un mot-clé CURÉ (Inspiration 1). */
  function curee(nom: string) {
    return mkInstance(mkCard({
      name: nom, attack: 1, health: 3,
      keywords: ["inspiration"] as never,
      keyword_instances: [{ id: "inspiration", x: 1, mode: "end_of_turn" } as never],
    }));
  }

  /** Joue la fin de tour et rend la main de P0 : son ORDRE est l'ordre de
   *  résolution, puisque toutes les créatures piochent dans le même deck. */
  function ordreDeResolution(board: ReturnType<typeof composee>[]): string[] {
    const s = mkState();
    s.players[0].board.push(...board);
    s.players[0].deck = ["1er", "2e", "3e", "4e"].map(n => mkInstance(mkCard({ name: n })));
    s.players[1].deck = [mkInstance(mkCard({ name: "Z" }))];
    return applyAction(s, { type: "end_turn" }).players[0].hand.map(c => c.card.name);
  }

  it("trois effets COMPOSÉS se résolvent de gauche à droite", () => {
    expect(ordreDeResolution([composee("G"), composee("M"), composee("D")]))
      .toEqual(["1er", "2e", "3e"]);
  });

  it("trois mots-clés CURÉS aussi", () => {
    expect(ordreDeResolution([curee("G"), curee("M"), curee("D")]))
      .toEqual(["1er", "2e", "3e"]);
  });

  it("un plateau MIXTE curé/composé garde l'ordre du plateau, pas l'ordre des canaux", () => {
    // Le piège serait de traiter tous les curés puis tous les composés : la
    // position sur le plateau doit primer sur la nature de l'effet.
    expect(ordreDeResolution([curee("G"), composee("M"), curee("D")]))
      .toEqual(["1er", "2e", "3e"]);
    expect(ordreDeResolution([composee("G"), curee("M"), composee("D")]))
      .toEqual(["1er", "2e", "3e"]);
  });

  it("une créature portant les DEUX canaux les déclenche tous les deux", () => {
    const double = mkInstance(mkCard({
      name: "Double", attack: 1, health: 3,
      keywords: ["inspiration"] as never,
      keyword_instances: [{ id: "inspiration", x: 1, mode: "end_of_turn" } as never],
      capabilities: [{ ...composedCap("on_end_of_turn", DRAW1), uid: "cx_double" }],
    }));
    expect(ordreDeResolution([double])).toEqual(["1er", "2e"]);
  });

  it("la POSITION d'arrivée sur le plateau décide de l'ordre, pas l'ordre de jeu", () => {
    // `boardPosition` insère la carte où le joueur l'a lâchée (splice) ; le
    // rendu suit l'ordre du tableau. Une créature posée À GAUCHE d'une autre
    // déjà en jeu doit donc agir AVANT elle, même si elle est jouée après.
    const s = mkState();
    s.players[0].board.push(composee("DejaLa"));
    const nouvelle = composee("Nouvelle");
    s.players[0].hand.push(nouvelle);
    s.players[0].deck = ["1er", "2e"].map(n => mkInstance(mkCard({ name: n })));
    s.players[1].deck = [mkInstance(mkCard({ name: "Z" }))];

    // Posée en position 0 → à gauche de « DejaLa ».
    let st = applyAction(s, { type: "play_card", cardInstanceId: nouvelle.instanceId, boardPosition: 0 });
    expect(st.players[0].board.map(c => c.card.name)).toEqual(["Nouvelle", "DejaLa"]);

    st = applyAction(st, { type: "end_turn" });
    const piochees = st.players[0].hand.filter(c => ["1er", "2e"].includes(c.card.name)).map(c => c.card.name);
    expect(piochees).toEqual(["1er", "2e"]); // « Nouvelle » a pioché la première
  });
});
