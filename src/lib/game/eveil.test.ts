// COÛT D'ÉVEIL — payer une carte en plusieurs tours.
//
// Premier coût ALTERNATIF général du jeu : les cinq autres (PV, défausse,
// sacrifice, exil, repli) s'AJOUTENT au mana, celui-ci le REMPLACE. Jouer une
// carte pour son coût d'éveil, c'est la retirer du jeu avec autant de points,
// puis y verser 1 mana à la fois ; au dernier point elle entre en jeu comme si
// elle venait de la main.
//
// L'INVARIANT que la plupart de ces tests protègent : une carte en éveil ne
// séjourne JAMAIS à zéro point. Le dernier versement et l'entrée en jeu sont
// une seule action (`play_card` avec `fromEveil`), les précédents passent par
// `pay_eveil` qui ne descend jamais à 1 → 0. Sans cette invariante il faudrait
// des règles pour un état « payée mais pas jouée » — précisément le cas où
// l'arrivée est impossible (plateau plein, sort sans cible, coût additionnel
// impayable), que le REFUS du dernier point traite déjà, sans rien prélever.
import { describe, expect, it } from "vitest";
import {
  applyAction, canPayEveil, canSuspendToEveil, eveilArrivalBlocker, getEveilCost,
  maxEveilPayment,
} from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_BOARD_SIZE, MAX_EVEIL } from "./constants";
import type { Card, GameState, KeywordInstance, SpellKeywordInstance } from "./types";

const CLAN = "Cénacle Nécromant";

function creature(partial: Partial<Card> = {}) {
  return mkInstance(mkCard({
    name: "Colosse", mana_cost: 8, attack: 5, health: 5, eveil_cost: 3, ...partial,
  }));
}

/** Un joueur avec une carte à éveil en main, et le mana demandé. */
function etat(carteEnMain = creature(), mana = 10) {
  const s = mkState();
  s.players[0].mana = mana;
  s.players[0].hand = [carteEnMain];
  return { s, carte: carteEnMain };
}

const enEveil = (s: GameState, idx = 0) => s.players[idx].eveil ?? [];
const nomsMain = (s: GameState) => s.players[0].hand.map(c => c.card.name).join(",");
const nomsPlateau = (s: GameState) => s.players[0].board.map(c => c.card.name).join(",");

/** Met la carte en éveil puis verse `n` points intermédiaires. */
function eveilleeAvec(s: GameState, id: string, points: number): GameState {
  let st = applyAction(s, { type: "suspend_eveil", cardInstanceId: id });
  for (let i = 0; i < points; i++) {
    st = applyAction(st, { type: "pay_eveil", cardInstanceId: id });
  }
  return st;
}

// ─── Mise en éveil ──────────────────────────────────────────────────────────

describe("mise en éveil", () => {
  it("retire la carte de la main, pose le compteur, et ne coûte AUCUN mana", () => {
    const { s, carte } = etat(creature({ eveil_cost: 4 }), 7);

    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    expect(nomsMain(st)).toBe("");
    expect(enEveil(st)).toHaveLength(1);
    expect(enEveil(st)[0].remaining).toBe(4);
    expect(enEveil(st)[0].instance.card.name).toBe("Colosse");
    // Ce qu'on engage, c'est la carte et une place — pas du mana.
    expect(st.players[0].mana).toBe(7);
  });

  it("refuse une carte sans coût d'éveil", () => {
    const { s, carte } = etat(creature({ eveil_cost: 0 }));

    expect(canSuspendToEveil(s, carte.instanceId)).toBe(false);
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    expect(st).toBe(s);
  });

  it(`refuse au-delà du plafond de ${MAX_EVEIL}`, () => {
    const s = mkState();
    s.players[0].hand = Array.from({ length: MAX_EVEIL + 1 }, (_, i) =>
      creature({ name: `C${i}`, eveil_cost: 2 }));
    let st: GameState = s;
    for (const c of s.players[0].hand) {
      st = applyAction(st, { type: "suspend_eveil", cardInstanceId: c.instanceId });
    }

    expect(enEveil(st)).toHaveLength(MAX_EVEIL);
    // La dernière est restée en main, pas perdue.
    expect(nomsMain(st)).toBe(`C${MAX_EVEIL}`);
    expect(canSuspendToEveil(st, s.players[0].hand[MAX_EVEIL].instanceId)).toBe(false);
  });

  it("est possible même sans un seul point de mana — c'est tout l'intérêt", () => {
    const { s, carte } = etat(creature({ mana_cost: 9, eveil_cost: 3 }), 0);

    expect(canSuspendToEveil(s, carte.instanceId)).toBe(true);
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    expect(enEveil(st)).toHaveLength(1);
  });
});

// ─── Versement des points ───────────────────────────────────────────────────

describe("versement des points", () => {
  it("un point coûte 1 mana et décrémente le compteur", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }), 5);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId });

    expect(enEveil(st)[0].remaining).toBe(2);
    expect(st.players[0].mana).toBe(4);
  });

  it("plusieurs points peuvent être versés dans le MÊME tour", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }), 5);
    const st = eveilleeAvec(s, carte.instanceId, 2);

    expect(enEveil(st)[0].remaining).toBe(1);
    expect(st.players[0].mana).toBe(3);
  });

  it("refuse sans mana", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }), 1);
    const st0 = eveilleeAvec(s, carte.instanceId, 1);
    expect(st0.players[0].mana).toBe(0);

    expect(canPayEveil(st0, carte.instanceId)).toBe(false);
    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId });
    expect(st).toBe(st0);
  });

  it("NE descend JAMAIS le compteur à zéro : le dernier point n'est pas de son ressort", () => {
    const { s, carte } = etat(creature({ eveil_cost: 2 }), 10);
    const st0 = eveilleeAvec(s, carte.instanceId, 1);
    expect(enEveil(st0)[0].remaining).toBe(1);

    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId });

    expect(st).toBe(st0);
    expect(enEveil(st)[0].remaining).toBe(1);
    expect(nomsPlateau(st)).toBe("");
  });
});

// ─── Versement de PLUSIEURS points d'un coup ────────────────────────────────
//
// Le plafond `remaining - 1` n'est pas un réglage : le dernier point EST
// l'entrée en jeu, le moment où le joueur désigne cibles, place et coûts
// additionnels. Le fondre dans un versement en gros les lui retirerait.

describe("versement de plusieurs points", () => {
  it("verse N points et retire N mana", () => {
    const { s, carte } = etat(creature({ eveil_cost: 5 }), 10);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId, amount: 3 });

    expect(enEveil(st)[0].remaining).toBe(2);
    expect(st.players[0].mana).toBe(7);
  });

  it("sans `amount`, verse 1 — les actions journalisées se rejouent à l'identique", () => {
    const { s, carte } = etat(creature({ eveil_cost: 5 }), 10);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId });

    expect(enEveil(st)[0].remaining).toBe(4);
    expect(st.players[0].mana).toBe(9);
  });

  it("le maximum est borné par le MANA", () => {
    const { s, carte } = etat(creature({ eveil_cost: 6 }), 2);
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    expect(maxEveilPayment(st, carte.instanceId)).toBe(2);
  });

  it("… et par le compteur MOINS UN, jamais plus", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }), 10);
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    // 10 de mana pour 3 points : c'est le compteur qui borne, pas le mana.
    expect(maxEveilPayment(st, carte.instanceId)).toBe(2);
  });

  it("un versement ne peut JAMAIS achever l'éveil", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }), 10);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId, amount: 3 });

    expect(st, "3 dépasse le plafond de 2 : refusé en bloc").toBe(st0);
    expect(enEveil(st)[0].remaining).toBe(3);
    expect(st.players[0].mana).toBe(10);
  });

  it("un montant trop grand est REFUSÉ, jamais écrêté en silence", () => {
    // Écrêter reviendrait à payer autre chose que ce qui a été demandé, sur une
    // ressource que le joueur ne récupère pas.
    const { s, carte } = etat(creature({ eveil_cost: 6 }), 2);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId, amount: 4 });

    expect(st).toBe(st0);
    expect(st.players[0].mana).toBe(2);
  });

  it("refuse zéro, le négatif et les décimales", () => {
    const { s, carte } = etat(creature({ eveil_cost: 5 }), 10);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    for (const amount of [0, -2, 1.5]) {
      expect(applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId, amount })).toBe(st0);
    }
  });

  it("verser le maximum amène pile au dernier point, prêt à entrer en jeu", () => {
    const { s, carte } = etat(creature({ eveil_cost: 4 }), 10);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    const max = maxEveilPayment(st0, carte.instanceId);

    const st1 = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId, amount: max });
    expect(enEveil(st1)[0].remaining).toBe(1);
    expect(maxEveilPayment(st1, carte.instanceId)).toBe(0);

    const st2 = applyAction(st1, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });
    expect(nomsPlateau(st2)).toBe("Colosse");
    expect(st2.players[0].mana).toBe(10 - max - 1);
  });

  it("maxEveilPayment vaut 0 sur une carte absente ou au dernier point", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1 }), 10);
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    expect(maxEveilPayment(st, carte.instanceId)).toBe(0);
    expect(maxEveilPayment(st, "inconnu")).toBe(0);
    // Le dernier point reste payable — mais par l'autre chemin.
    expect(canPayEveil(st, carte.instanceId)).toBe(true);
  });
});

// ─── Arrivée en jeu ─────────────────────────────────────────────────────────

describe("arrivée en jeu", () => {
  it("le dernier point paie 1 mana ET pose la créature", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }), 5);
    const st0 = eveilleeAvec(s, carte.instanceId, 2);
    expect(st0.players[0].mana).toBe(3);

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(nomsPlateau(st)).toBe("Colosse");
    expect(enEveil(st)).toHaveLength(0);
    expect(st.players[0].mana).toBe(2);
  });

  it("le coût en mana IMPRIMÉ n'est jamais prélevé — l'éveil le remplace", () => {
    // 9 de coût normal, 2 d'éveil : le joueur ne dépense que 2 en tout.
    const { s, carte } = etat(creature({ mana_cost: 9, eveil_cost: 2 }), 4);
    const st0 = eveilleeAvec(s, carte.instanceId, 1);

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(nomsPlateau(st)).toBe("Colosse");
    expect(st.players[0].mana).toBe(2);
  });

  it("un coût d'éveil de 1 arrive du premier coup", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1 }), 3);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    expect(canPayEveil(st0, carte.instanceId)).toBe(true);
    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(nomsPlateau(st)).toBe("Colosse");
    expect(st.players[0].mana).toBe(2);
  });

  it("la créature arrive avec le MAL D'INVOCATION", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1 }));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(st.players[0].board[0].hasSummoningSickness).toBe(true);
  });

  it("… sauf avec Traque", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1, keywords: ["charge"] as never }));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(st.players[0].board[0].hasSummoningSickness).toBe(false);
  });

  it("les effets d'INVOCATION se résolvent comme depuis la main", () => {
    // Douleur 2 : la créature inflige 2 dégâts à son propre héros en arrivant.
    const { s, carte } = etat(creature({
      eveil_cost: 1, effect_text: "[Douleur 2]",
      keywords: ["douleur"] as never,
      keyword_instances: [{ id: "douleur", x: 2 }] as KeywordInstance[],
    }));
    const pvAvant = s.players[0].hero.hp;
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(st.players[0].hero.hp).toBe(pvAvant - 2);
  });

  it("compte comme POSÉE DEPUIS LA MAIN pour Esprit de corps", () => {
    // Contraste voulu avec Seconde vie, qui pose depuis le cimetière et ne
    // compte pas : l'éveil n'est qu'un chemin de paiement différé, la carte a
    // bien quitté la main du joueur.
    const { s, carte } = etat(creature({
      eveil_cost: 1, clan: CLAN,
      keywords: ["esprit_de_corps"] as never,
      keyword_instances: [{ id: "esprit_de_corps" }] as KeywordInstance[],
    }));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(st.players[0].espritDeCorpsPlayed?.[CLAN]).toBe(1);
  });

  it("un SORT en éveil se résout avec la cible choisie À L'ARRIVÉE", () => {
    const sort = mkInstance(mkCard({
      name: "Foudre", card_type: "spell", mana_cost: 6, attack: null, health: null,
      eveil_cost: 1,
      spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
    }));
    const { s } = etat(sort, 3);
    const victime = mkInstance(mkCard({ name: "Cible", attack: 1, health: 5 }));
    s.players[1].board = [victime];
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: sort.instanceId });

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: sort.instanceId, fromEveil: true,
      targetInstanceId: victime.instanceId,
    });

    expect(st.players[1].board[0].currentHealth).toBe(2);
    expect(st.players[0].graveyard.map(c => c.card.name)).toContain("Foudre");
  });
});

// ─── Arrivée impossible : le dernier point est REFUSÉ ───────────────────────

describe("arrivée impossible", () => {
  it("plateau plein : le point n'est pas prélevé, la carte reste en éveil", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1 }), 5);
    s.players[0].board = Array.from({ length: MAX_BOARD_SIZE }, (_, i) =>
      mkInstance(mkCard({ name: `B${i}`, attack: 1, health: 1 })));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    expect(eveilArrivalBlocker(st0, carte.instanceId)).toBe("board_plein");
    expect(canPayEveil(st0, carte.instanceId)).toBe(false);

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(st).toBe(st0);
    expect(enEveil(st)[0].remaining).toBe(1);
    expect(st.players[0].mana).toBe(5);
  });

  it("sort sans aucune cible valide : même refus", () => {
    // Affaiblissement, et non Impact : Impact vise « n'importe quoi », donc le
    // héros adverse fait toujours une cible et le sort n'est jamais orphelin.
    // Affaiblissement, lui, exige une CRÉATURE ennemie.
    const sort = mkInstance(mkCard({
      name: "Marque", card_type: "spell", mana_cost: 6, attack: null, health: null,
      eveil_cost: 1,
      spell_keywords: [{ id: "affaiblissement", attack: 2, health: 2 }] as SpellKeywordInstance[],
    }));
    const { s } = etat(sort, 5);
    // Plateau adverse vide : le sort n'a personne à affaiblir.
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: sort.instanceId });

    expect(eveilArrivalBlocker(st0, sort.instanceId)).toBe("sans_cible");
    expect(canPayEveil(st0, sort.instanceId)).toBe(false);
  });

  it("coût additionnel de défausse impayable : même refus", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1, discard_cost: 1 }), 5);
    // La main est vide une fois la carte mise en éveil : rien à défausser.
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    expect(eveilArrivalBlocker(st0, carte.instanceId)).toBe("main");
    expect(canPayEveil(st0, carte.instanceId)).toBe(false);
  });

  it("le coût de défausse se compte SANS le -1 de canPlayCard", () => {
    // Le `-1` de canPlayCard compte la carte jouée, qui quitte la main. Une
    // carte en éveil n'y est pas : une seule carte en main DOIT suffire à payer
    // « défausser 1 ».
    const { s, carte } = etat(creature({ eveil_cost: 1, discard_cost: 1 }), 5);
    const appat = mkInstance(mkCard({ name: "Appât" }));
    s.players[0].hand.push(appat);
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    expect(st0.players[0].hand).toHaveLength(1);

    expect(eveilArrivalBlocker(st0, carte.instanceId)).toBeNull();

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
      discardInstanceIds: [appat.instanceId],
    });

    expect(nomsPlateau(st)).toBe("Colosse");
    expect(st.players[0].hand).toHaveLength(0);
    expect(st.players[0].graveyard.map(c => c.card.name)).toContain("Appât");
  });

  it("le blocage se lève dès qu'une place se libère", () => {
    const { s, carte } = etat(creature({ eveil_cost: 1 }), 5);
    s.players[0].board = Array.from({ length: MAX_BOARD_SIZE }, (_, i) =>
      mkInstance(mkCard({ name: `B${i}`, attack: 1, health: 1 })));
    let st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    expect(canPayEveil(st, carte.instanceId)).toBe(false);

    st.players[0].board.pop();

    expect(eveilArrivalBlocker(st, carte.instanceId)).toBeNull();
    st = applyAction(st, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });
    expect(nomsPlateau(st)).toContain("Colosse");
  });
});

// ─── Hors du jeu : rien ne peut l'atteindre ─────────────────────────────────

describe("une carte en éveil est hors du jeu", () => {
  it("n'est ni en main, ni au cimetière, ni sur le plateau, ni dans le deck", () => {
    const { s, carte } = etat(creature({ eveil_cost: 2 }));
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    const p = st.players[0];

    for (const zone of [p.hand, p.board, p.deck, p.graveyard]) {
      expect(zone.find(c => c.instanceId === carte.instanceId)).toBeUndefined();
    }
    expect(enEveil(st)[0].instance.instanceId).toBe(carte.instanceId);
  });

  it("ne peut pas être jouée normalement tant qu'elle est en éveil", () => {
    const { s, carte } = etat(creature({ mana_cost: 1, eveil_cost: 2 }));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, { type: "play_card", cardInstanceId: carte.instanceId });

    expect(st).toBe(st0);
    expect(nomsPlateau(st)).toBe("");
  });

  it("ne peut pas être jouée par le chemin d'éveil tant qu'il reste 2 points", () => {
    const { s, carte } = etat(creature({ eveil_cost: 2 }));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });

    const st = applyAction(st0, {
      type: "play_card", cardInstanceId: carte.instanceId, fromEveil: true,
    });

    expect(st).toBe(st0);
    expect(enEveil(st)[0].remaining).toBe(2);
  });
});

// ─── Anti-désync ────────────────────────────────────────────────────────────

describe("synchronisation", () => {
  it("le compteur d'éveil entre dans le hash d'état", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }));
    const st0 = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    const st1 = applyAction(st0, { type: "pay_eveil", cardInstanceId: carte.instanceId });

    expect(syncHash(st0)).not.toBe(syncHash(st1));
  });

  it("les événements d'animation, eux, en sont EXCLUS", () => {
    const { s, carte } = etat(creature({ eveil_cost: 3 }));
    const st = applyAction(s, { type: "suspend_eveil", cardInstanceId: carte.instanceId });
    expect(st.eveilEvents).toHaveLength(1);

    const sansEvenements = { ...st, eveilEvents: undefined };
    expect(syncHash(sansEvenements)).toBe(syncHash(st));
  });
});

// ─── Lecture du coût ────────────────────────────────────────────────────────

describe("getEveilCost", () => {
  it("écrase null, undefined et les valeurs négatives à 0", () => {
    expect(getEveilCost(mkCard({ eveil_cost: null }))).toBe(0);
    expect(getEveilCost(mkCard({}))).toBe(0);
    expect(getEveilCost(mkCard({ eveil_cost: -3 }))).toBe(0);
    expect(getEveilCost(mkCard({ eveil_cost: 4 }))).toBe(4);
  });
});
