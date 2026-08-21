// APPRENTISSAGE — la créature retire un sort de la main et le MÉMORISE. Le sort
// devient un pouvoir activable : elle peut le relancer autant de fois qu'elle
// peut s'engager, en payant à chaque fois ses coûts.
//
// C'est la première capacité qui rend une carte RÉPÉTABLE. Quatre choses à
// verrouiller, par ordre d'importance :
//
//   1. **Le sort ne quitte JAMAIS la créature en se lançant.** S'il partait au
//      cimetière comme un sort ordinaire, la capacité n'aurait plus d'objet —
//      c'est le seul point qui la distingue d'une pioche déguisée.
//   2. **Le sort n'existe que sur le plateau.** Mort, retour en main, Silence ⇒
//      oubli. C'est le garde-fou qui paie la répétabilité : tuer la créature
//      détruit DEUX cartes.
//   3. **Les coûts sont ceux du sort, intégralement.** Et le piège est le test
//      de défausse : `canPlayCard` retranche 1 à la main pour la carte jouée,
//      or un sort mémorisé n'y est pas. Sans cette différence, un sort à
//      « défausser 1 » serait refusé alors qu'une carte attend en main.
//   4. **L'interface et le moteur doivent dire la MÊME chose.** Un bouton actif
//      sur une activation que le moteur refuse est indiscernable d'un bug.
import { describe, expect, it } from "vitest";
import { applyAction, creatureCanCastLearnedSpell } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameState, KeywordInstance, SpellKeywordInstance } from "./types";

type Mode = "tap" | "end_of_turn" | "attack" | "low_hp";

/** Une créature porteuse d'Apprentissage. `mode` absent ⇒ entrée en jeu. */
function apprenante(opts: { name?: string; mode?: Mode } = {}) {
  const { name = "Élève", mode } = opts;
  return mkInstance(mkCard({
    name, mana_cost: 1, attack: 2, health: 3,
    keywords: ["apprentissage"] as never,
    keyword_instances: [{ id: "apprentissage", ...(mode ? { mode } : {}) }] as KeywordInstance[],
  } as Partial<Card>));
}

/** Un sort qui inflige 3 dégâts à une cible — observable sans ambiguïté. */
function trait(name = "Trait", extra: Partial<Card> = {}) {
  return mkInstance(mkCard({
    name, card_type: "spell", mana_cost: 2, attack: null, health: null,
    spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
    ...extra,
  } as Partial<Card>));
}

const memorise = (s: GameState, nom = "Élève") =>
  s.players[0].board.find(c => c.card.name === nom)?.apprentissageSpell ?? null;

/** Pose l'apprenante et lui fait apprendre `sort`, déjà en main. */
function poserEtApprendre(s: GameState, sort: ReturnType<typeof mkInstance>, nom = "Élève") {
  const src = apprenante({ name: nom });
  s.players[0].hand.push(sort);
  s.players[0].hand.push(src);
  return applyAction(s, {
    type: "play_card", cardInstanceId: src.instanceId,
    learnSpellInstanceId: sort.instanceId,
  });
}

/** Lance le sort mémorisé par `nom`, sur `cible`. */
function lancer(s: GameState, cible: string, nom = "Élève") {
  const src = s.players[0].board.find(c => c.card.name === nom)!;
  return applyAction(s, {
    type: "play_card",
    cardInstanceId: src.apprentissageSpell!.instanceId,
    learnedFromInstanceId: src.instanceId,
    targetInstanceId: cible,
  });
}

/** Toutes les cartes de la partie, quelle que soit leur zone — sert à prouver
 *  qu'aucune n'est perdue ni dupliquée. */
function inventaire(s: GameState): string[] {
  const noms: string[] = [];
  for (const p of s.players) {
    for (const zone of [p.hand, p.board, p.deck, p.graveyard]) {
      for (const c of zone) {
        noms.push(c.card.name);
        if (c.apprentissageSpell) noms.push(c.apprentissageSpell.card.name);
      }
    }
  }
  return noms.sort();
}

// ───────────────────────────────────────────────────────────────────────────

describe("apprendre", () => {
  it("le sort désigné quitte la main et rejoint la créature", () => {
    const s = mkState();
    const sort = trait();
    const st = poserEtApprendre(s, sort);
    expect(memorise(st)?.card.name).toBe("Trait");
    expect(st.players[0].hand.some(c => c.card.name === "Trait")).toBe(false);
  });

  it("main SANS sort ⇒ no-op, et aucun tirage consommé", () => {
    const s = mkState();
    s.rngState = 4242;
    s.players[0].hand.push(mkInstance(mkCard({ name: "Bête", mana_cost: 1 })));
    const src = apprenante();
    s.players[0].hand.push(src);
    const st = applyAction(s, { type: "play_card", cardInstanceId: src.instanceId });
    expect(memorise(st)).toBeNull();
    expect(st.rngState).toBe(4242);
  });

  it("UN SEUL sort, définitif : un second déclenchement ne réapprend rien", () => {
    const s = mkState();
    const src = apprenante({ mode: "end_of_turn" });
    src.apprentissageSpell = trait("Premier");
    s.players[0].board.push(src);
    s.players[0].hand.push(trait("Second"));

    const st = applyAction(s, { type: "end_turn" });
    expect(memorise(st)?.card.name).toBe("Premier");
    expect(st.players[0].hand.some(c => c.card.name === "Second")).toBe(true);
  });

  it("une désignation introuvable n'apprend rien ET ne consomme aucun tirage", () => {
    // Le repli au hasard serait pire que l'inaction : il ne partirait que chez
    // le client dont la main diverge, et décalerait son flux aléatoire pour
    // tout le reste de la partie.
    const s = mkState();
    s.rngState = 999;
    s.players[0].hand.push(trait());
    const src = apprenante();
    s.players[0].hand.push(src);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: src.instanceId,
      learnSpellInstanceId: "instance-qui-n-existe-pas",
    });
    expect(memorise(st)).toBeNull();
    expect(st.rngState).toBe(999);
  });
});

describe("lancer le sort mémorisé", () => {
  function prete(): { s: GameState; cible: string } {
    const s = mkState();
    const victime = mkInstance(mkCard({ name: "Victime", attack: 1, health: 20 }));
    s.players[1].board.push(victime);
    const st = poserEtApprendre(s, trait());
    st.players[0].board.find(c => c.card.name === "Élève")!.hasSummoningSickness = false;
    return { s: st, cible: victime.instanceId };
  }

  it("le sort résout, et la créature s'engage", () => {
    const { s, cible } = prete();
    const st = lancer(s, cible);
    expect(st.players[1].board[0].currentHealth).toBe(17);
    expect(st.players[0].board.find(c => c.card.name === "Élève")!.tapped).toBe(true);
  });

  it("le sort RESTE mémorisé — c'est tout le propos", () => {
    const { s, cible } = prete();
    const st = lancer(s, cible);
    expect(memorise(st)?.card.name).toBe("Trait");
  });

  it("il ne va JAMAIS au cimetière, et rien n'est perdu ni dupliqué", () => {
    const { s, cible } = prete();
    const avant = inventaire(s);
    const st = lancer(s, cible);
    expect(st.players[0].graveyard.some(c => c.card.name === "Trait")).toBe(false);
    expect(inventaire(st)).toEqual(avant);
  });

  it("relançable au tour suivant, une fois la créature désengagée", () => {
    const { s, cible } = prete();
    let st = lancer(s, cible);
    expect(st.players[1].board[0].currentHealth).toBe(17);
    // Désengagement, comme au début du tour du contrôleur.
    st.players[0].board.find(c => c.card.name === "Élève")!.tapped = false;
    st.players[0].mana = 10;
    st = lancer(st, cible);
    expect(st.players[1].board[0].currentHealth).toBe(14);
    expect(memorise(st)?.card.name).toBe("Trait");
  });

  it("une créature ENGAGÉE, PARALYSÉE ou avec le mal d'invocation ne peut pas lancer", () => {
    for (const abimer of [
      (c: ReturnType<typeof mkInstance>) => { c.tapped = true; },
      (c: ReturnType<typeof mkInstance>) => { c.isParalyzed = true; },
      (c: ReturnType<typeof mkInstance>) => { c.hasSummoningSickness = true; },
    ]) {
      const { s, cible } = prete();
      abimer(s.players[0].board.find(c => c.card.name === "Élève")!);
      const st = lancer(s, cible);
      expect(st).toBe(s); // action refusée, état inchangé
    }
  });

  it("une action forgée sur un sort qui n'est pas celui mémorisé est refusée", () => {
    const { s, cible } = prete();
    const src = s.players[0].board.find(c => c.card.name === "Élève")!;
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: "autre-instance",
      learnedFromInstanceId: src.instanceId, targetInstanceId: cible,
    });
    expect(st).toBe(s);
  });
});

describe("les coûts", () => {
  function avecSort(sort: ReturnType<typeof mkInstance>, mana = 10) {
    const s = mkState();
    const victime = mkInstance(mkCard({ name: "Victime", attack: 1, health: 20 }));
    s.players[1].board.push(victime);
    const st = poserEtApprendre(s, sort);
    const src = st.players[0].board.find(c => c.card.name === "Élève")!;
    src.hasSummoningSickness = false;
    st.players[0].mana = mana;
    return { s: st, cible: victime.instanceId, src };
  }

  it("mana insuffisant ⇒ activation refusée", () => {
    const { s, cible } = avecSort(trait(), 1); // le Trait coûte 2
    expect(lancer(s, cible)).toBe(s);
    expect(creatureCanCastLearnedSpell(s, s.players[0].board[0].instanceId)).toBe(false);
  });

  it("le mana est bien débité à chaque lancement", () => {
    const { s, cible } = avecSort(trait(), 10);
    const st = lancer(s, cible);
    expect(st.players[0].mana).toBe(8);
  });

  it("LE PIÈGE : « défausser 1 » passe avec EXACTEMENT une carte en main", () => {
    // `canPlayCard` retranche 1 à la main pour la carte jouée — or un sort
    // mémorisé n'y est pas. Reprendre ce `-1` refuserait l'activation alors
    // qu'une carte attend bel et bien en main.
    const { s, cible, src } = avecSort(trait("Trait", { discard_cost: 1 } as Partial<Card>));
    const rebut = mkInstance(mkCard({ name: "Rebut", mana_cost: 0 }));
    s.players[0].hand = [rebut];

    expect(creatureCanCastLearnedSpell(s, src.instanceId)).toBe(true);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: src.apprentissageSpell!.instanceId,
      learnedFromInstanceId: src.instanceId, targetInstanceId: cible,
      discardInstanceIds: [rebut.instanceId],
    });
    expect(st.players[1].board[0].currentHealth).toBe(17);
    expect(st.players[0].hand).toHaveLength(0);
    expect(st.players[0].graveyard.some(c => c.card.name === "Rebut")).toBe(true);
  });

  it("main VIDE et « défausser 1 » ⇒ refusé", () => {
    const { s, src } = avecSort(trait("Trait", { discard_cost: 1 } as Partial<Card>));
    s.players[0].hand = [];
    expect(creatureCanCastLearnedSpell(s, src.instanceId)).toBe(false);
  });

  it("coût en PV : débité, et refusé s'il serait mortel", () => {
    const { s, cible, src } = avecSort(trait("Saignée", { life_cost: 3 } as Partial<Card>));
    const st = lancer(s, cible);
    expect(st.players[0].hero.hp).toBe(s.players[0].hero.hp - 3);

    const mourant = avecSort(trait("Saignée", { life_cost: 3 } as Partial<Card>));
    mourant.s.players[0].hero.hp = 3;
    expect(creatureCanCastLearnedSpell(mourant.s, mourant.src.instanceId)).toBe(false);
  });

  it("coût d'exil : refusé si le deck est trop court", () => {
    const { s, src } = avecSort(trait("Trait", { exile_cost: 2 } as Partial<Card>));
    s.players[0].deck = [mkInstance(mkCard({ name: "Seule" }))];
    expect(creatureCanCastLearnedSpell(s, src.instanceId)).toBe(false);
  });
});

describe("oublier — le sort n'existe que sur le plateau", () => {
  it("à la MORT, le sort disparaît avec elle", () => {
    const s = mkState();
    const st = poserEtApprendre(s, trait());
    const src = st.players[0].board.find(c => c.card.name === "Élève")!;
    const bourreau = mkInstance(mkCard({ name: "Bourreau", attack: 9, health: 9 }));
    st.players[1].board.push(bourreau);
    st.currentPlayerIndex = 1;

    const apres = applyAction(st, {
      type: "attack", attackerInstanceId: bourreau.instanceId, targetInstanceId: src.instanceId,
    });
    const depouille = apres.players[0].graveyard.find(c => c.card.name === "Élève")!;
    expect(depouille.apprentissageSpell).toBeUndefined();
    expect(apres.players[0].graveyard.some(c => c.card.name === "Trait")).toBe(false);
  });

  it("REJOUÉE après un retour en main, elle ne connaît plus rien", () => {
    const s = mkState();
    const src = apprenante();
    src.apprentissageSpell = trait("Ancien");
    s.players[0].hand.push(src);
    // Rejouée sans rien désigner : elle ne doit pas retrouver « Ancien ».
    const st = applyAction(s, { type: "play_card", cardInstanceId: src.instanceId });
    expect(memorise(st)).toBeNull();
  });

  it("le SILENCE le lui fait oublier", () => {
    const s = mkState();
    const st = poserEtApprendre(s, trait());
    const src = st.players[0].board.find(c => c.card.name === "Élève")!;
    const silence = mkInstance(mkCard({
      name: "Silence", card_type: "spell", mana_cost: 1, attack: null, health: null,
      spell_keywords: [{ id: "silence" }] as SpellKeywordInstance[],
    } as Partial<Card>));
    st.players[0].hand.push(silence);

    const apres = applyAction(st, {
      type: "play_card", cardInstanceId: silence.instanceId, targetInstanceId: src.instanceId,
    });
    expect(memorise(apres)).toBeNull();
  });
});

describe("sans fenêtre de choix, le moteur désigne au hasard", () => {
  function enFinDeTour(seed: number) {
    const s = mkState();
    s.rngState = seed;
    const src = apprenante({ mode: "end_of_turn" });
    s.players[0].board.push(src);
    for (const n of ["Alpha", "Beta", "Gamma"]) s.players[0].hand.push(trait(n));
    return applyAction(s, { type: "end_turn" });
  }

  it("apprend bel et bien quelque chose", () => {
    expect(memorise(enFinDeTour(7))).not.toBeNull();
  });

  it("est DÉTERMINISTE : même graine, même sort appris", () => {
    expect(memorise(enFinDeTour(123))?.card.name).toBe(memorise(enFinDeTour(123))?.card.name);
  });

  it("des graines différentes finissent par apprendre autre chose", () => {
    const vus = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(g => memorise(enFinDeTour(g))?.card.name));
    expect(vus.size).toBeGreaterThan(1);
  });
});

describe("le sort mémorisé est une VÉRITÉ DE JEU", () => {
  it("il entre dans le hash de synchro", () => {
    // Contrairement aux indices d'animation : deux états qui ne diffèrent que
    // par le sort appris DOIVENT se distinguer, sinon un client resterait sur
    // une créature sans pouvoir sans que rien ne le signale.
    const a = poserEtApprendre(mkState(), trait());
    const b = poserEtApprendre(mkState(), trait());
    b.players[0].board.find(c => c.card.name === "Élève")!.apprentissageSpell = undefined;
    expect(syncHash(a)).not.toBe(syncHash(b));
  });
});

describe("l'interface et le moteur disent la même chose", () => {
  it("le prédicat refuse exactement ce que le moteur refuse", () => {
    // La garde qui empêche un bouton actif sur une activation impossible.
    const cas: Array<(s: GameState) => void> = [
      (s) => { s.players[0].board[0].tapped = true; },
      (s) => { s.players[0].board[0].isParalyzed = true; },
      (s) => { s.players[0].board[0].hasSummoningSickness = true; },
      (s) => { s.players[0].mana = 0; },
      (s) => { s.players[0].board[0].apprentissageSpell = undefined; },
    ];
    for (const abimer of cas) {
      const base = mkState();
      const victime = mkInstance(mkCard({ name: "Victime", attack: 1, health: 20 }));
      base.players[1].board.push(victime);
      const s = poserEtApprendre(base, trait());
      s.players[0].board[0].hasSummoningSickness = false;
      abimer(s);
      const src = s.players[0].board[0];
      expect(creatureCanCastLearnedSpell(s, src.instanceId)).toBe(false);
      const st = applyAction(s, {
        type: "play_card",
        cardInstanceId: src.apprentissageSpell?.instanceId ?? "néant",
        learnedFromInstanceId: src.instanceId,
        targetInstanceId: victime.instanceId,
      });
      expect(st).toBe(s);
    }
  });

  it("…et l'autorise quand tout est réuni", () => {
    const base = mkState();
    base.players[1].board.push(mkInstance(mkCard({ name: "Victime", attack: 1, health: 20 })));
    const s = poserEtApprendre(base, trait());
    s.players[0].board[0].hasSummoningSickness = false;
    expect(creatureCanCastLearnedSpell(s, s.players[0].board[0].instanceId)).toBe(true);
  });
});
