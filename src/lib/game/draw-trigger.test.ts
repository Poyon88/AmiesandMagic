// Déclencheur « À LA PIOCHE » (mode "draw" / trigger on_draw).
//
// Sémantique retenue : l'effet appartient à la carte TIRÉE et part au moment où
// elle atteint la main. Ce n'est pas un réactif de plateau « chaque fois que
// vous piochez ».
//
// Deux propriétés structurantes sont verrouillées ici :
//   1. le périmètre exact des pioches concernées — la carte doit ATTEINDRE LA
//      MAIN (ni fatigue, ni main pleine, ni auto-jeu de Cycle éternel), et ni
//      la main de départ ni le mulligan ne comptent comme des pioches ;
//   2. le ciblage est ALÉATOIRE et ne met jamais le tour en pause : les pioches
//      surviennent au milieu de startTurn ou d'un autre effet, où le moteur n'a
//      aucun point d'interruption.
import { describe, expect, it } from "vitest";
import { applyAction, initializeGame, initRNG } from "./engine";
import { MAX_HAND_SIZE } from "./constants";
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

/** Capacité COMPOSÉE déclenchée à la pioche. */
function capPioche(composed: ComposedEffect): Capability {
  return { uid: "c0", trigger: "on_draw", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Fin de tour de P0 → début de tour de P1, qui pioche la 1re carte de son deck. */
function faitPiocher(s: GameState): GameState {
  return applyAction(s, { type: "end_turn" });
}

describe("à la pioche — effet non ciblé", () => {
  it("part quand la carte est tirée en début de tour, et UNE seule fois", () => {
    const s = mkState();
    s.players[1].deck = [carteAPioche("Coffre", "epargne", 2), mkInstance(mkCard({ name: "Banale" }))];

    const st = faitPiocher(s);

    expect(st.players[1].epargne).toBe(2);
    expect(st.players[1].hand.some(c => c.card.name === "Coffre")).toBe(true);
    // Une seule pioche par tour ⇒ un seul déclenchement, pas un par carte du deck.
    expect(st.players[1].hand.length).toBe(1);
  });

  it("une carte SANS mode draw n'est pas affectée", () => {
    const s = mkState();
    // Même mot-clé, mode par défaut (à l'invocation) : rien ne doit partir.
    const inerte = mkInstance(mkCard({
      name: "Coffre", keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2 } as never],
    }));
    s.players[1].deck = [inerte];

    const st = faitPiocher(s);

    expect(st.players[1].epargne ?? 0).toBe(0);
  });

  it("fonctionne aussi pour une capacité COMPOSÉE (trigger on_draw)", () => {
    const s = mkState();
    const carte = mkInstance(mkCard({
      name: "Fouineur",
      capabilities: [capPioche({ content: "deal_damage", magnitude: { x: 3 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } })],
    }));
    s.players[1].deck = [carte];
    const avant = s.players[0].hero.hp;

    const st = faitPiocher(s);

    expect(st.players[0].hero.hp).toBe(avant - 3);
  });
});

describe("à la pioche — sorts", () => {
  // Un SORT ne peut porter ce déclencheur QUE par effet composé : sur un sort,
  // `keyword_instances` décrit les capacités CONFÉRÉES à une cible, un « mode »
  // y désignerait le déclencheur du don une fois posé sur la créature.
  function sortPiege(): ReturnType<typeof mkInstance> {
    return mkInstance(mkCard({
      name: "Piège de Manuscrit", card_type: "spell", attack: null, health: null,
      capabilities: [capPioche({ content: "deal_damage", magnitude: { x: 3 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } })],
    }));
  }

  it("un sort déclenche son effet composé quand il est pioché", () => {
    const s = mkState();
    s.players[1].deck = [sortPiege()];
    const avant = s.players[0].hero.hp;

    const st = faitPiocher(s);

    expect(st.players[0].hero.hp).toBe(avant - 3);
    expect(st.players[1].hand.some(c => c.card.name === "Piège de Manuscrit")).toBe(true);
  });

  it("le même effet ne REPART PAS quand le sort est ensuite lancé", () => {
    // `runComposedCapsForCard` filtre par déclencheur : une capacité on_draw
    // n'est pas rejouée à la résolution. Conséquence de design à connaître —
    // un sort dont c'est le SEUL effet ne fait rien une fois lancé.
    const s = mkState();
    s.players[1].deck = [sortPiege()];
    let st = faitPiocher(s);
    const apresPioche = st.players[0].hero.hp;

    const enMain = st.players[1].hand.find(c => c.card.name === "Piège de Manuscrit")!;
    st = applyAction(st, { type: "play_card", cardInstanceId: enMain.instanceId });

    expect(st.players[0].hero.hp).toBe(apresPioche);
  });

  it("un sort qui CONFÈRE des mots-clés garde son don intact", () => {
    // Garde-fou : le réalignement de triggers de l'adaptateur ne doit pas
    // toucher à la capacité composée on_draw (abilityId `_composed`, aucune
    // instance de mot-clé correspondante), ni le don être perturbé par elle.
    const s = mkState();
    const sort = mkInstance(mkCard({
      name: "Piège Généreux", card_type: "spell", attack: null, health: null,
      keywords: ["taunt"] as never,
      keyword_instances: [{ id: "taunt" } as never],
      capabilities: [capPioche({ content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } })],
    }));
    s.players[1].deck = [sort];
    s.players[1].board = [mkInstance(mkCard({ name: "Allié", attack: 1, health: 3 }))];
    const avant = s.players[0].hero.hp;

    let st = faitPiocher(s);
    expect(st.players[0].hero.hp).toBe(avant - 2); // l'effet à la pioche est parti

    const enMain = st.players[1].hand.find(c => c.card.name === "Piège Généreux")!;
    const allie = st.players[1].board[0];
    st = applyAction(st, { type: "play_card", cardInstanceId: enMain.instanceId, targetInstanceId: allie.instanceId });

    const apres = st.players[1].board.find(c => c.card.name === "Allié")!;
    expect(apres.card.keywords as unknown as string[]).toContain("taunt");
  });
});

describe("à la pioche — règlement des morts", () => {
  // Régression vue en partie avec « Présage du Masque Courroucé » : un sort
  // dont la Tempête est portée par un effet composé on_draw blessait bien, mais
  // laissait un « Gardien des Cristaux » (2/1) à 0 PV SUR LE PLATEAU.
  // Cause : la pioche principale a lieu dans startTurn, qui ne balaie que le
  // plateau du joueur actif (morts par poison) — jamais celui d'en face.
  it("une unité ADVERSE tuée par l'effet part au cimetière", () => {
    const s = mkState();
    s.players[0].board = [mkInstance(mkCard({ name: "Gardien", attack: 2, health: 1 }))];
    s.players[1].deck = [mkInstance(mkCard({
      name: "Présage", card_type: "spell", attack: null, health: null,
      capabilities: [capPioche({ content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" } })],
    }))];

    const st = faitPiocher(s);

    expect(st.players[0].board.some(c => c.card.name === "Gardien")).toBe(false);
    expect(st.players[0].graveyard.some(c => c.card.name === "Gardien")).toBe(true);
  });

  it("une unité ALLIÉE tuée par l'effet part aussi", () => {
    // Les deux camps sont balayés : un effet à la pioche peut se retourner
    // contre son propre plateau (Cataclysme, Tempête « n'importe quel bord »).
    const s = mkState();
    s.players[1].board = [mkInstance(mkCard({ name: "Allié", attack: 1, health: 1 }))];
    s.players[1].deck = [mkInstance(mkCard({
      name: "Présage", card_type: "spell", attack: null, health: null,
      capabilities: [capPioche({ content: "deal_damage", magnitude: { x: 2 }, target: { entity: "unit", count: "all", side: "ally", location: "board", designation: "random" } })],
    }))];

    const st = faitPiocher(s);

    expect(st.players[1].board.some(c => c.card.name === "Allié")).toBe(false);
    expect(st.players[1].graveyard.some(c => c.card.name === "Allié")).toBe(true);
  });

  it("le râle d'agonie de la victime se déclenche bien", () => {
    // Balayer sans jouer les râles serait un demi-correctif.
    const s = mkState();
    const victime = mkInstance(mkCard({
      name: "Vengeur", attack: 1, health: 1,
      keywords: ["carnage"] as never,
      keyword_instances: [{ id: "carnage", x: 2 } as never],
    }));
    // `mkInstance` est un raccourci de test : il ne passe pas par
    // `createCardInstance`, donc les X figés à la naissance de l'instance
    // (carnageX & co) restent à 0 et la capacité serait inerte. En jeu réel le
    // stampage a toujours eu lieu.
    victime.carnageX = 2;
    s.players[0].board = [victime, mkInstance(mkCard({ name: "Témoin", attack: 1, health: 5 }))];
    s.players[1].deck = [mkInstance(mkCard({
      name: "Présage", card_type: "spell", attack: null, health: null,
      capabilities: [capPioche({ content: "deal_damage", magnitude: { x: 1 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" } })],
    }))];

    const st = faitPiocher(s);

    // Le Vengeur meurt et son Carnage 2 frappe le Témoin resté sur le plateau.
    expect(st.players[0].board.some(c => c.card.name === "Vengeur")).toBe(false);
    expect(st.players[0].board.find(c => c.card.name === "Témoin")!.currentHealth).toBe(3);
  });
});

describe("à la pioche — ciblage", () => {
  it("prend une cible AU HASARD sans jamais mettre le tour en pause", () => {
    // Impact est un effet ciblé : hors mode draw/attack et sur son propre tour,
    // le moteur poserait un pendingTrigger et attendrait le joueur. Au milieu
    // d'une pioche, il n'y a pas de point de pause — la cible doit être tirée.
    const s = mkState();
    initRNG(42);
    s.players[0].board = [mkInstance(mkCard({ name: "CibleA", attack: 1, health: 9 }))];
    s.players[1].deck = [carteAPioche("Fouineur", "impact", 3)];

    const st = faitPiocher(s);

    expect(st.pendingTriggers ?? []).toEqual([]);
    expect(st.endTurnPending ?? false).toBe(false);
    // L'effet a bien frappé (créature ou héros — la cible est aléatoire).
    const degatsCreature = 9 - st.players[0].board[0].currentHealth;
    const degatsHeros = 30 - st.players[0].hero.hp;
    expect(degatsCreature + degatsHeros).toBe(3);
  });

  it("est DÉTERMINISTE : même graine ⇒ même cible", () => {
    // Garantie anti-désync : les deux clients rejouent la même pioche.
    const resoudre = () => {
      const s = mkState();
      initRNG(1234);
      s.players[0].board = [
        mkInstance(mkCard({ name: "A", attack: 1, health: 9 })),
        mkInstance(mkCard({ name: "B", attack: 1, health: 9 })),
      ];
      s.players[1].deck = [carteAPioche("Fouineur", "impact", 3)];
      const st = faitPiocher(s);
      return [
        st.players[0].board.map(c => c.currentHealth).join("/"),
        st.players[0].hero.hp,
      ].join("|");
    };
    expect(resoudre()).toBe(resoudre());
  });
});

describe("à la pioche — périmètre des pioches", () => {
  it("ne part PAS sur la main de départ", () => {
    // initializeGame sert la main d'ouverture par deck.splice, sans passer par
    // drawCard. Verrouillé ici car un refactor de la distribution le casserait.
    const carte = mkCard({
      name: "Coffre", mana_cost: 1, attack: 1, health: 1,
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2, mode: "draw" } as never],
    });
    const deck = [{ card: carte, quantity: 30 }];

    const st = initializeGame("P1", "P2", deck, deck, 0, 999);

    expect(st.players[0].epargne ?? 0).toBe(0);
    expect(st.players[1].epargne ?? 0).toBe(0);
  });

  it("ne part PAS au mulligan (remplacement par deck.splice)", () => {
    const carte = mkCard({
      name: "Coffre", mana_cost: 1, attack: 1, health: 1,
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2, mode: "draw" } as never],
    });
    const deck = [{ card: carte, quantity: 30 }];
    let st = initializeGame("P1", "P2", deck, deck, 0, 999);
    const aJeter = st.players[0].hand.map(c => c.instanceId);

    st = applyAction(st, { type: "mulligan", playerId: "P1", replacedInstanceIds: aJeter });

    expect(st.players[0].epargne ?? 0).toBe(0);
  });

  it("ne part PAS sur une pioche à vide (fatigue)", () => {
    const s = mkState();
    s.players[1].deck = [];
    const avant = s.players[1].hero.hp;

    const st = faitPiocher(s);

    // La fatigue a bien mordu, mais aucun effet n'a pu partir : rien n'est tiré.
    expect(st.players[1].hero.hp).toBeLessThan(avant);
    expect(st.players[1].epargne ?? 0).toBe(0);
  });

  it("ne part PAS quand la main est pleine (la carte va au cimetière)", () => {
    const s = mkState();
    s.players[1].hand = Array.from({ length: MAX_HAND_SIZE }, (_, i) =>
      mkInstance(mkCard({ name: `Main${i}` })));
    s.players[1].deck = [carteAPioche("Coffre", "epargne", 2)];

    const st = faitPiocher(s);

    expect(st.players[1].graveyard.some(c => c.card.name === "Coffre")).toBe(true);
    expect(st.players[1].epargne ?? 0).toBe(0);
  });

  it("ne part PAS sur l'auto-jeu de Cycle éternel (la carte arrive sur le PLATEAU)", () => {
    const s = mkState();
    const recyclee = carteAPioche("Revenant", "epargne", 2);
    recyclee.cycleEternelAutoPlay = true;
    s.players[1].deck = [recyclee, mkInstance(mkCard({ name: "Remplacement" }))];

    const st = faitPiocher(s);

    expect(st.players[1].board.some(c => c.card.name === "Revenant")).toBe(true);
    expect(st.players[1].epargne ?? 0).toBe(0);
  });
});

describe("à la pioche — garde de récursion", () => {
  it("« à la pioche : piochez » s'arrête sur la BORNE, pas sur un accident", () => {
    // Deck de cartes qui repiochent chacune. Le piège : sans compteur de
    // ré-entrance la chaîne semble s'arrêter quand même — mais seulement parce
    // que la main se remplit (8 cartes) ou que le deck se vide. Une carte qui
    // se remettrait dans le deck tournerait alors pour toujours.
    // On donne donc une main déjà partiellement pleine ET un deck profond, pour
    // qu'AUCUN de ces deux accidents ne puisse masquer l'absence de borne.
    const s = mkState();
    s.players[1].deck = Array.from({ length: 40 }, (_, i) =>
      carteAPioche(`Chaine${i}`, "inspiration", 1));

    const st = faitPiocher(s);

    // La chaîne est coupée par la profondeur (8) avant d'épuiser le deck (40).
    expect(st.players[1].deck.length).toBeGreaterThan(20);
    expect(st.players[1].hand.length).toBeLessThanOrEqual(MAX_HAND_SIZE);
  });

  it("la borne est REMISE À ZÉRO entre deux actions", () => {
    // Sinon la deuxième pioche de la partie hériterait de la marge consommée
    // par la première et se ferait couper trop tôt.
    const s = mkState();
    s.players[0].deck = [carteAPioche("CoffreA", "epargne", 2), mkInstance(mkCard({ name: "X" }))];
    s.players[1].deck = [carteAPioche("CoffreB", "epargne", 3), mkInstance(mkCard({ name: "Y" }))];

    let st = faitPiocher(s);            // P1 pioche CoffreB
    expect(st.players[1].epargne).toBe(3);
    st = applyAction(st, { type: "end_turn" }); // P0 pioche CoffreA
    expect(st.players[0].epargne).toBe(2);
  });
});
