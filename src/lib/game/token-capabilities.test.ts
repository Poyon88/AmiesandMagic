// Tokens : capacités paramétrées par le template.
//
// Un token est une instance de plateau ORDINAIRE — le moteur n'a aucune garde
// « si token ». Ce qui lui manquait, c'était de pouvoir porter des valeurs :
// sans `keyword_instances`, toute capacité scalable retombait sur un défaut
// dérivé du coût en mana, nul pour un jeton, donc écrasé à 1.
//
// Ces tests verrouillent la chaîne complète : template → applyTokenTemplate →
// carte de l'instance → getCapabilities → résolution en jeu.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { KEYWORDS, isTokenAuthorable, tokenRequiresMode } from "./abilities";
import { FORGE_TO_GAME_KEYWORD } from "@/lib/card-forge/keyword-instances";
import { getCapabilities } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CapabilityTrigger, ComposedEffect, GameState, TokenTemplate } from "./types";

function composedCap(trigger: CapabilityTrigger, composed: ComposedEffect): Capability {
  return { uid: "c0", trigger, effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Créature dont l'entrée en jeu invoque un exemplaire du token `tokenId`. */
function invocateur(tokenId: number) {
  return mkCard({
    name: "Invocateur", faction: "Mercenaires",
    capabilities: [composedCap("on_play", { content: "summon_token", magnitude: { x: 1 }, tokenId })],
  });
}

function play(state: GameState, ci: ReturnType<typeof mkInstance>): GameState {
  state.players[0].hand.push(ci);
  return applyAction(state, { type: "play_card", cardInstanceId: ci.instanceId });
}

const BASE_TMPL: TokenTemplate = {
  id: 77, race: "Fauves", faction: "Hommes-Bêtes", clan: null,
  name: "Tigre", attack: 2, health: 3, image_url: null, keywords: [],
};

describe("token — sidecar de capacités", () => {
  it("le X du template arrive sur la carte du token invoqué", () => {
    const s0 = mkState();
    s0.tokenTemplates = [{
      ...BASE_TMPL,
      keywords: ["resistance"] as never,
      keyword_instances: [{ id: "resistance", x: 3 } as never],
    }];
    const s = play(s0, mkInstance(invocateur(77)));

    const token = s.players[0].board.find(c => c.card.name === "Tigre")!;
    const cap = getCapabilities(token.card).find(c => c.abilityId === "resistance")!;
    expect(cap).toBeTruthy();
    expect(cap.params?.x).toBe(3);
  });

  it("un template SANS sidecar reste valide (aucun X, déclencheur naturel)", () => {
    // Rétro-compatibilité des 32 templates créés avant la colonne.
    const s0 = mkState();
    s0.tokenTemplates = [{ ...BASE_TMPL, keywords: ["taunt"] as never }];
    const s = play(s0, mkInstance(invocateur(77)));

    const token = s.players[0].board.find(c => c.card.name === "Tigre")!;
    const cap = getCapabilities(token.card).find(c => c.abilityId === "taunt")!;
    expect(cap).toBeTruthy();
    expect(cap.params?.x).toBeUndefined();
    expect(cap.trigger).toBe("automatic"); // passif → déclencheur naturel
  });

  it("une capacité « à la mort » du template est bien routée sur on_death", () => {
    const s0 = mkState();
    s0.tokenTemplates = [{
      ...BASE_TMPL,
      keywords: ["carnage"] as never,
      keyword_instances: [{ id: "carnage", x: 2 } as never],
    }];
    const s = play(s0, mkInstance(invocateur(77)));

    const token = s.players[0].board.find(c => c.card.name === "Tigre")!;
    const cap = getCapabilities(token.card).find(c => c.abilityId === "carnage")!;
    expect(cap.trigger).toBe("on_death");
    expect(cap.params?.x).toBe(2);
  });

  it("le X du template pilote vraiment l'effet en jeu (Carnage 2 à la mort du token)", () => {
    const s0 = mkState();
    s0.tokenTemplates = [{
      ...BASE_TMPL, attack: 1, health: 1,
      keywords: ["carnage"] as never,
      keyword_instances: [{ id: "carnage", x: 2 } as never],
    }];
    // Deux témoins à 3 PV de chaque côté : Carnage frappe les DEUX camps.
    s0.players[1].board = [mkInstance(mkCard({ name: "EnnemiA", attack: 1, health: 3 }))];
    let s = play(s0, mkInstance(invocateur(77)));
    s.players[0].board.push(mkInstance(mkCard({ name: "AllieB", attack: 1, health: 3 })));

    // Le token (1/1) est achevé par une frappe adverse → son râle part.
    const token = s.players[0].board.find(c => c.card.name === "Tigre")!;
    const tueur = s.players[1].board.find(c => c.card.name === "EnnemiA")!;
    tueur.hasSummoningSickness = false;
    s.currentPlayerIndex = 1;
    s = applyAction(s, { type: "attack", attackerInstanceId: tueur.instanceId, targetInstanceId: token.instanceId });

    expect(s.players[0].board.some(c => c.card.name === "Tigre")).toBe(false);
    // Carnage 2 : les deux témoins encaissent 2. L'ennemi a d'abord pris 1 de
    // riposte du token (1 ATK) → 3 - 1 - 2 = 0, il meurt ; l'allié tombe à 1.
    expect(s.players[0].board.find(c => c.card.name === "AllieB")!.currentHealth).toBe(1);
    expect(s.players[1].board.some(c => c.card.name === "EnnemiA")).toBe(false);
  });

  it("le mode du template route la capacité curée (Épargne 2 en fin de tour)", () => {
    // Épargne : effet curé NON ciblé, donc entièrement résolu en ligne — le
    // témoin le plus net que le sidecar du token pilote bien le déclencheur.
    const s0 = mkState();
    s0.tokenTemplates = [{
      ...BASE_TMPL, name: "Coffre",
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2, mode: "end_of_turn" } as never],
    }];
    s0.players[0].deck = [mkInstance(mkCard({ name: "D1" }))];
    s0.players[1].deck = [mkInstance(mkCard({ name: "D2" }))];

    let s = play(s0, mkInstance(invocateur(77)));
    expect(s.players[0].epargne ?? 0).toBe(0); // rien à l'invocation du jeton
    s = applyAction(s, { type: "end_turn" });
    expect(s.players[0].epargne).toBe(2);
  });

  it("le même effet curé s'active aussi au tap", () => {
    const s0 = mkState();
    s0.tokenTemplates = [{
      ...BASE_TMPL, name: "Coffre",
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2, mode: "tap" } as never],
    }];
    const s = play(s0, mkInstance(invocateur(77)));
    const token = s.players[0].board.find(c => c.card.name === "Coffre")!;
    token.hasSummoningSickness = false;

    const apres = applyAction(s, { type: "tap_activate", sourceInstanceId: token.instanceId, instanceIdx: 0 });
    expect(apres.players[0].epargne).toBe(2);
    expect(apres.players[0].board.find(c => c.card.name === "Coffre")!.tapped).toBe(true);
  });

  it("SANS mode, la même capacité curée reste MORTE sur un jeton", () => {
    // La raison d'être du garde-fou de la forge : le déclencheur naturel d'une
    // capacité curée est l'invocation, et un token n'y passe jamais.
    const s0 = mkState();
    s0.tokenTemplates = [{
      ...BASE_TMPL, name: "Coffre",
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2 } as never],
    }];
    s0.players[0].deck = [mkInstance(mkCard({ name: "D1" }))];
    s0.players[1].deck = [mkInstance(mkCard({ name: "D2" }))];

    let s = play(s0, mkInstance(invocateur(77)));
    s = applyAction(s, { type: "end_turn" });
    expect(s.players[0].epargne ?? 0).toBe(0);
  });

  it("sans sidecar, le même Carnage retombe sur X=1 (le défaut du moteur)", () => {
    // C'est exactement l'écart que la colonne vient corriger : le coût en mana
    // d'un token étant 0, la formule de repli est écrasée à 1.
    const s0 = mkState();
    s0.tokenTemplates = [{ ...BASE_TMPL, keywords: ["carnage"] as never }];
    const s = play(s0, mkInstance(invocateur(77)));
    const token = s.players[0].board.find(c => c.card.name === "Tigre")!;
    expect(token.carnageX).toBe(1);
  });
});

describe("token — qui est authorable, et à quelle condition", () => {
  it("un passif ne réclame aucun déclencheur (il se déclenche tel quel)", () => {
    expect(isTokenAuthorable("taunt")).toBe(true);
    expect(tokenRequiresMode("taunt")).toBe(false);
  });

  it("un râle d'agonie non plus (son déclencheur naturel est déjà la mort)", () => {
    expect(isTokenAuthorable("carnage")).toBe(true);
    expect(tokenRequiresMode("carnage")).toBe(false);
  });

  it("une capacité curée est authorable MAIS réclame un déclencheur explicite", () => {
    for (const id of ["epargne", "impact", "loyaute", "rappel"]) {
      expect(isTokenAuthorable(id), id).toBe(true);
      expect(tokenRequiresMode(id), id).toBe(true);
    }
  });

  it("une capacité à donnée annexe non stockable reste hors catalogue", () => {
    // Elles n'ouvriront qu'avec les colonnes dédiées (convocation_token_id,
    // entraide_race, …) et leurs sélecteurs.
    for (const id of ["convocation", "convocation_simple", "convocations_multiples", "entraide", "conferer"]) {
      expect(isTokenAuthorable(id), id).toBe(false);
    }
  });

  it("aucune capacité historiquement proposée (palier ≤1) n'a été retirée", () => {
    // Garde-fou de non-régression : le passage au filtre par taxonomie a
    // temporairement écarté 11 capacités curées, revenues avec le déclencheur
    // obligatoire. Le catalogue ne doit plus jamais rétrécir en silence.
    const perdues = Object.entries(KEYWORDS)
      .filter(([, kw]) => kw.minTier <= 1)
      .map(([label]) => label)
      .filter(label => !isTokenAuthorable(FORGE_TO_GAME_KEYWORD[label] ?? label));
    expect(perdues).toEqual([]);
  });
});
