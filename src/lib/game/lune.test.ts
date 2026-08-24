// Lune X — le second amplificateur du jeu, et le pendant TEMPOREL de Chant.
//
// Règle : à partir de la DEUXIÈME carte jouée dans le tour, toutes les valeurs
// X/Y de la carte portant Lune gagnent +X. Côté SORT le bonus est un instantané
// de résolution (calque de Chant) ; côté CRÉATURE il est GRAVÉ à l'entrée en jeu
// et vaut pour toute sa vie.
//
// Ce fichier verrouille les quatre règles arbitrées avec l'auteur :
//   1. créature : gain figé à l'entrée, permanent, et ANNULÉ si elle est rejouée
//      en première carte d'un tour ;
//   2. « carte jouée » = tout ce qui passe par playCard (donc pas les jetons,
//      pas les invocations, pas les sorts relancés) ;
//   3. périmètre = TOUT X/Y, comme Chant ;
//   4. Lune et Chant s'additionnent sans jamais se majorer l'un l'autre.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { MAX_BOARD_SIZE } from "./constants";
import { getSpellKeywordDesc } from "./spell-keywords";
import { activeThresholdGlows } from "./threshold-glow";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, GameState, KeywordInstance, SpellKeywordInstance } from "./types";

/** Sort porteur de `kws`, plus Lune X (et éventuellement Chant). */
function sortLune(x: number | null, kws: SpellKeywordInstance[], chant?: number) {
  return mkInstance(mkCard({
    name: "Clair de lune", card_type: "spell", attack: null, health: null,
    spell_keywords: [
      ...kws,
      ...(x != null ? [{ id: "lune", amount: x } as SpellKeywordInstance] : []),
      ...(chant != null ? [{ id: "chant", amount: chant } as SpellKeywordInstance] : []),
    ],
  }));
}

/** Créature portant Lune X, plus les mots-clés passés en sidecar. */
function creatureLune(x: number | null, instances: KeywordInstance[] = [], extra: Partial<Card> = {}) {
  const kws = [...instances.map(k => k.id), ...(x != null ? ["lune"] : [])];
  return mkInstance(mkCard({
    name: "Naga des Marées", attack: 2, health: 5,
    keywords: kws as never,
    keyword_instances: [
      ...instances,
      ...(x != null ? [{ id: "lune", x } as KeywordInstance] : []),
    ],
    ...extra,
  }));
}

function jouer(s: GameState, inst: ReturnType<typeof mkInstance>, action: Partial<GameAction> = {}): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId, ...action } as GameAction);
}

/** Plateau : une cible ennemie à 30 PV. `dejaJoue` cartes déjà jouées ce tour. */
function table(dejaJoue: number) {
  const s = mkState();
  const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 30 }));
  s.players[1].board.push(cible);
  s.players[0].cardsPlayedThisTurn = dejaJoue;
  return { s, cible };
}

const pv = (st: GameState, nom = "Cible") =>
  st.players[1].board.find((c) => c.card.name === nom)!.currentHealth;
const surPlateau = (st: GameState, nom: string) =>
  st.players[0].board.find((c) => c.card.name === nom)!;

// ─── 1. Le cas de référence ─────────────────────────────────────────────────

describe("Lune X — la première carte du tour n'est jamais renforcée", () => {
  it("SORT : Impact 3 + Lune 2 inflige 3 en première carte, 5 ensuite", () => {
    const premier = table(0);
    const st1 = jouer(premier.s, sortLune(2, [{ id: "impact", amount: 3 }]), { targetInstanceId: premier.cible.instanceId });
    expect(pv(st1)).toBe(27); // 30 − 3

    const second = table(1);
    const st2 = jouer(second.s, sortLune(2, [{ id: "impact", amount: 3 }]), { targetInstanceId: second.cible.instanceId });
    expect(pv(st2)).toBe(25); // 30 − 5
  });

  it("CRÉATURE : le X du sidecar est majoré à la pose, et seulement alors", () => {
    const premier = table(0);
    const st1 = jouer(premier.s, creatureLune(2, [{ id: "resistance", x: 1 }]));
    expect(surPlateau(st1, "Naga des Marées").card.keyword_instances!.find(k => k.id === "resistance")!.x).toBe(1);

    const second = table(1);
    const st2 = jouer(second.s, creatureLune(2, [{ id: "resistance", x: 1 }]));
    expect(surPlateau(st2, "Naga des Marées").card.keyword_instances!.find(k => k.id === "resistance")!.x).toBe(3);
  });

  it("le compteur repart de zéro au tour suivant", () => {
    const { s, cible } = table(0);
    const st = jouer(s, sortLune(1, [{ id: "impact", amount: 1 }]), { targetInstanceId: cible.instanceId });
    expect(st.players[0].cardsPlayedThisTurn).toBe(1);
    const apres = applyAction(st, { type: "end_turn" } as GameAction);
    // Le tour est passé à l'adversaire ; celui qui ENTRE a son compteur remis à
    // zéro. Celui du joueur sortant ne sera remis qu'à son propre tour.
    expect(apres.players[apres.currentPlayerIndex].cardsPlayedThisTurn).toBe(0);
  });

  it("une carte REFUSÉE ne compte pas (plateau plein)", () => {
    const { s } = table(0);
    for (let i = 0; i < MAX_BOARD_SIZE; i++) s.players[0].board.push(mkInstance(mkCard({ name: `Mur${i}` })));
    const avant = s.players[0].board.length;
    const st = jouer(s, creatureLune(2));
    // Refus : l'état d'origine est rendu tel quel, compteur compris.
    expect(st.players[0].board.length).toBe(avant);
    expect(st.players[0].cardsPlayedThisTurn ?? 0).toBe(0);
  });
});

// ─── 2. Créature : le gain dure toute sa vie ────────────────────────────────

describe("Lune X sur une créature — gain FIGÉ, et permanent", () => {
  it("Riposte est majorée LONGTEMPS après la pose", () => {
    const { s } = table(1);
    const naga = creatureLune(2, [{ id: "riposte", x: 1 }]);
    const st = jouer(s, naga);
    const pose = surPlateau(st, "Naga des Marées");
    // Le X figé sur l'instance suit le sidecar gravé : c'est lui que lit le
    // combat, plusieurs tours plus tard comme à l'instant même.
    expect(pose.riposteX).toBe(3);
    expect(pose.card.keyword_instances!.find(k => k.id === "riposte")!.x).toBe(3);
  });

  it("le bloc [Riposte 1] du texte est réécrit lui aussi", () => {
    // La moitié des résolveurs de créature ne lisent QUE ce canal (Douleur,
    // Inspiration, Résistance…). Une carte sans sidecar doit donc être majorée
    // par son texte.
    const { s } = table(1);
    const carte = mkInstance(mkCard({
      name: "Naga muet", attack: 2, health: 5,
      keywords: ["lune", "resistance"] as never,
      keyword_instances: [{ id: "lune", x: 2 } as KeywordInstance],
      effect_text: "Un serpent des eaux. [Résistance 1]",
    }));
    const st = jouer(s, carte);
    expect(surPlateau(st, "Naga muet").card.effect_text).toContain("[Résistance 3]");
  });

  it("le X de Lune lui-même n'est jamais majoré", () => {
    const { s } = table(1);
    const st = jouer(s, creatureLune(2, [{ id: "riposte", x: 1 }]));
    expect(surPlateau(st, "Naga des Marées").card.keyword_instances!.find(k => k.id === "lune")!.x).toBe(2);
  });

  it("rejouée EN PREMIÈRE carte d'un tour, elle retrouve ses valeurs d'origine", () => {
    const { s } = table(1);
    const st = jouer(s, creatureLune(2, [{ id: "riposte", x: 1 }]));
    const pose = surPlateau(st, "Naga des Marées");
    expect(pose.riposteX).toBe(3);

    // Renvoyée en main (l'instance conserve sa carte gravée), puis rejouée en
    // ouverture du tour suivant : la différence est négative.
    st.players[0].board = st.players[0].board.filter(c => c !== pose);
    st.players[0].cardsPlayedThisTurn = 0;
    const rejoue = jouer(st, pose);
    const repose = surPlateau(rejoue, "Naga des Marées");
    expect(repose.riposteX).toBe(1);
    expect(repose.card.keyword_instances!.find(k => k.id === "riposte")!.x).toBe(1);
    expect(repose.tempoApplied ?? 0).toBe(0);
  });

  it("rejouée en DEUXIÈME carte, elle ne cumule pas deux fois le bonus", () => {
    const { s } = table(1);
    const st = jouer(s, creatureLune(2, [{ id: "riposte", x: 1 }]));
    const pose = surPlateau(st, "Naga des Marées");
    st.players[0].board = st.players[0].board.filter(c => c !== pose);
    st.players[0].cardsPlayedThisTurn = 1;
    const rejoue = jouer(st, pose);
    expect(surPlateau(rejoue, "Naga des Marées").riposteX).toBe(3);
  });
});

// ─── 3. Ce qui compte comme « une carte jouée » ─────────────────────────────

describe("Lune X — le compteur ne retient que ce que le joueur JOUE", () => {
  it("une créature jouée depuis le CIMETIÈRE compte, et reçoit le bonus", () => {
    // Seconde vie est une provenance de `playCard` comme une autre : le joueur
    // en paie le coût, donc elle compte — et profite de Lune.
    const { s } = table(1);
    const revenante = creatureLune(2, [
      { id: "seconde_vie", x: 1 } as KeywordInstance,
      { id: "riposte", x: 1 } as KeywordInstance,
    ]);
    s.players[0].graveyard.push(revenante);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: revenante.instanceId, fromGraveyard: true,
    } as GameAction);
    expect(surPlateau(st, "Naga des Marées").riposteX).toBe(3);
    expect(st.players[0].cardsPlayedThisTurn).toBe(2);
  });

  it("un JETON mis en jeu par un effet ne compte pas", () => {
    // Un jeton n'est pas « joué » : il ne passe pas par playCard. Le sort qui
    // l'invoque compte pour un, et un seul.
    const { s } = table(0);
    const sort = mkInstance(mkCard({
      name: "Appel", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "convocation_simple", amount: 1 } as SpellKeywordInstance],
      convocation_token_id: null,
    } as Parameters<typeof mkCard>[0]));
    const st = jouer(s, sort);
    expect(st.players[0].cardsPlayedThisTurn).toBe(1);
  });

  it("un sort RELANCÉ ne reçoit pas le bonus de l'englobant, et ne se compte pas", () => {
    // Relancer X rejoue un sort SANS repasser par playCard : il n'est pas
    // « joué ». Même montage que le test jumeau de Chant — l'historique porte
    // le sort à rejouer.
    const { s } = table(1);
    // Douleur 2 plutôt qu'Impact : elle frappe le héros du lanceur sans avoir
    // besoin d'une cible, ce qui rend le montant relancé lisible sans dépendre
    // du ciblage d'un sort tiré de l'historique.
    const ancien = mkCard({
      name: "Vieille Douleur", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "douleur", amount: 2 }] as SpellKeywordInstance[],
    });
    s.players[0].spellHistory = [{ card: ancien }] as never;
    const pvAvant = s.players[0].hero.hp;

    const st = jouer(s, sortLune(2, [{ id: "relancer", amount: 1 }]));
    // Le sort relancé n'a pas Lune : il inflige ses 2 points nus, pas 4.
    expect(st.players[0].hero.hp).toBe(pvAvant - 2);
    // Une seule carte JOUÉE de plus : celle qui portait Relancer.
    expect(st.players[0].cardsPlayedThisTurn).toBe(2);
  });
});

// ─── 4. Périmètre « tout X », et cumul avec Chant ───────────────────────────

describe("Lune X — périmètre et cumul", () => {
  it("majore le X ET le Y d'un couple", () => {
    const { s } = table(1);
    const allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 5 }));
    s.players[0].board.push(allie);
    const st = jouer(s, sortLune(2, [{ id: "renforcement", attack: 1, health: 1 }]), { targetInstanceId: allie.instanceId });
    const buff = st.players[0].board.find(c => c.card.name === "Allié")!;
    expect(buff.currentAttack).toBe(1 + 3);
    expect(buff.maxHealth).toBe(5 + 3);
  });

  it("Lune et Chant s'ADDITIONNENT sans se majorer l'un l'autre", () => {
    const { s, cible } = table(1);
    s.players[0].board.push(mkInstance(mkCard({ name: "Barde", attack: 1, health: 4, keywords: ["chant"] as never })));
    const st = jouer(s, sortLune(2, [{ id: "impact", amount: 4 }], 3), { targetInstanceId: cible.instanceId });
    // 4 + 2 (Lune) + 3 (Chant) = 9. Si l'un majorait l'autre on lirait 14.
    expect(pv(st)).toBe(21); // 30 − 9
  });

  it("sans chanteuse, seul le bonus de Lune s'applique", () => {
    const { s, cible } = table(1);
    const st = jouer(s, sortLune(2, [{ id: "impact", amount: 4 }], 3), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(24); // 30 − (4+2)
  });

  it("un sort Lune joué en premier ne reçoit rien, chanteuse ou non", () => {
    const { s, cible } = table(0);
    s.players[0].board.push(mkInstance(mkCard({ name: "Barde", attack: 1, health: 4, keywords: ["chant"] as never })));
    const st = jouer(s, sortLune(2, [{ id: "impact", amount: 4 }], 3), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(23); // 30 − (4+3) : Chant seul
  });
});

// ─── 5. Contrat d'affichage ─────────────────────────────────────────────────

describe("Lune X — la description", () => {
  it("ne contient qu'un seul « X », sans quoi la substitution le mangerait", () => {
    // getSpellKeywordDesc fait un replace(/X/g) GLOBAL : deux « X » dans la
    // phrase et la première occurrence est remplacée elle aussi (leçon de Chant).
    const desc = getSpellKeywordDesc({ id: "lune", amount: 4 } as SpellKeywordInstance);
    expect(desc).toContain("4");
    expect(desc).not.toContain("X");
    expect((desc.match(/4/g) ?? []).length).toBe(1);
  });
});

// ─── 6. Effets composés et halo ─────────────────────────────────────────────

describe("Lune X — les effets COMPOSÉS d'une créature suivent aussi", () => {
  it("la magnitude d'un effet composé à l'entrée est majorée", () => {
    // Le troisième canal de lecture d'un X : `capabilities[].composed.magnitude`,
    // que ni le sidecar ni le texte ne portent.
    const { s } = table(1);
    const carte = mkInstance(mkCard({
      name: "Naga composé", attack: 2, health: 5,
      keywords: ["lune"] as never,
      keyword_instances: [{ id: "lune", x: 2 } as KeywordInstance],
      capabilities: [
        { uid: "l0", trigger: "automatic", abilityId: "lune", effectKind: "automatic", params: { x: 2 } },
        {
          uid: "p0", trigger: "on_play", abilityId: "_composed", effectKind: "immediate",
          composed: { content: "draw_cards", magnitude: { x: 1 } },
        },
      ],
    } as Parameters<typeof mkCard>[0]));
    for (let i = 0; i < 10; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `D${i}` })));
    const mainAvant = s.players[0].hand.length;
    const st = jouer(s, carte);
    // 1 + 2 cartes piochées (la carte jouée a quitté la main : +1 au compte).
    expect(st.players[0].hand.length).toBe(mainAvant + 3);
    // Et le X de Lune, lui, n'a pas bougé.
    const cap = surPlateau(st, "Naga composé").card.capabilities!.find(c => c.abilityId === "lune")!;
    expect(cap.params!.x).toBe(2);
  });
});

describe("Lune X — le halo", () => {
  it("s'allume dès qu'une carte a été jouée, sur les DEUX faces", () => {
    const { s } = table(0);
    const sort = sortLune(2, [{ id: "impact", amount: 1 }]);
    const creature = creatureLune(2, [{ id: "riposte", x: 1 }]);
    const id = s.players[0].id;

    expect(activeThresholdGlows(sort.card, s, id).map(g => g.abilityId)).not.toContain("lune");
    expect(activeThresholdGlows(creature.card, s, id).map(g => g.abilityId)).not.toContain("lune");

    s.players[0].cardsPlayedThisTurn = 1;
    expect(activeThresholdGlows(sort.card, s, id).map(g => g.abilityId)).toContain("lune");
    expect(activeThresholdGlows(creature.card, s, id).map(g => g.abilityId)).toContain("lune");
  });
});
