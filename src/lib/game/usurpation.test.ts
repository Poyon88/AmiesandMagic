// USURPATION +X/+Y : un Renforcement multiplié par le nombre de cartes ADVERSES
// que le contrôleur a JOUÉES depuis la main pendant la partie.
//
// Arbitrages de l'auteur (2026-10-30), verrouillés ici :
//   1. ne compte que les cartes JOUÉES dont le vrai propriétaire est
//      l'adversaire (Conquête, carte volée revenue en main) — une unité prise
//      sur le plateau ne compte pas ;
//   2. tous les types (unité, action, objet), historique de toute la partie ;
//   3. la carte porteuse ne se compte pas elle-même ;
//   4. gain figé au déclenchement, CUMULATIF d'un déclenchement à l'autre ;
//   5. trois formes : créature (bénéficiaire réglable), action, composé.
import { describe, expect, it } from "vitest";
import { applyAction, estCarteAdverse, usurpationCount } from "./engine";
import { describeKeyword } from "./keyword-display";
import { usurpationNote } from "./desc-markers";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, GameAction, GameState, KeywordInstance, KeywordMode, SpellKeywordInstance } from "./types";

let seq = 0;

/** Une créature nue ; `adverse` ⇒ conquise au deck de P2. */
function carte(opts: { name?: string; adverse?: boolean; card_type?: "creature" | "spell" } = {}) {
  const { name = `C${seq++}`, adverse = false, card_type = "creature" } = opts;
  const ci = mkInstance(mkCard({
    name, mana_cost: 0, card_type,
    attack: card_type === "spell" ? null : 1, health: card_type === "spell" ? null : 1,
  }));
  if (adverse) ci.conqueredFromId = "P2";
  return ci;
}

/** Créature porteuse d'Usurpation. `mode` absent ⇒ entrée en jeu. */
function usurpatrice(extra: Partial<KeywordInstance> = {}, mode?: KeywordMode, name = "Usurpatrice") {
  return mkInstance(mkCard({
    name, mana_cost: 0, attack: 1, health: 1, keywords: ["usurpation"],
    keyword_instances: [{ id: "usurpation", x: 2, y: 1, ...(mode ? { mode } : {}), ...extra } as KeywordInstance],
  }));
}

function jouer(s: GameState, ci: ReturnType<typeof mkInstance>, targetInstanceId?: string): GameState {
  s.players[0].hand.push(ci);
  return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, targetInstanceId } as GameAction);
}

const stats = (st: GameState, nom: string) => {
  const c = [...st.players[0].board, ...st.players[1].board].find(x => x.card.name === nom)!;
  return [c.currentAttack, c.currentHealth];
};

/** État où P1 a déjà joué `n` cartes adverses. */
function apresCartesAdverses(n: number): GameState {
  let s = mkState();
  for (let i = 0; i < n; i++) s = jouer(s, carte({ adverse: true }));
  return s;
}

// ───────────────────────────────────────────────────────────────────────────

describe("le compteur de cartes adverses jouées", () => {
  it("une carte à soi ne compte pas", () => {
    const st = jouer(mkState(), carte());
    expect(st.players[0].usurpationPlayed ?? 0).toBe(0);
  });

  it("une carte conquise posée depuis la main compte, et se marque", () => {
    const ci = carte({ adverse: true });
    const st = jouer(mkState(), ci);
    expect(st.players[0].usurpationPlayed).toBe(1);
    expect(st.players[0].board.find(c => c.instanceId === ci.instanceId)!.usurpationCounted).toBe(true);
  });

  it("une carte dont le VRAI propriétaire est l'adversaire compte aussi", () => {
    const ci = carte();
    ci.trueOwnerId = "P2";
    expect(jouer(mkState(), ci).players[0].usurpationPlayed).toBe(1);
  });

  it("une ACTION adverse compte, une fois résolue", () => {
    const st = jouer(mkState(), carte({ adverse: true, card_type: "spell" }));
    expect(st.players[0].usurpationPlayed).toBe(1);
  });

  it("une action adverse CONTRÉE a quand même été jouée", () => {
    const s = mkState();
    s.players[1].contresort = 1;
    const st = jouer(s, carte({ adverse: true, card_type: "spell" }));
    expect(st.players[0].usurpationPlayed).toBe(1);
  });

  it("une unité prise SUR LE PLATEAU (Domination) ne compte pas", () => {
    const s = mkState();
    s.players[1].board.push(carte({ name: "Proie" }));
    const dominatrice = mkInstance(mkCard({ name: "Dominatrice", mana_cost: 0, attack: 1, health: 1, keywords: ["domination"] }));
    const st = jouer(s, dominatrice);
    expect(st.players[0].board.some(c => c.card.name === "Proie")).toBe(true);
    expect(st.players[0].usurpationPlayed ?? 0).toBe(0);
  });

  it("historique : le compteur ne redescend pas quand la carte quitte le jeu", () => {
    const st = apresCartesAdverses(3);
    st.players[0].board = [];
    expect(usurpationCount(st.players[0])).toBe(3);
  });

  it("les joueurs sont cloisonnés", () => {
    const st = apresCartesAdverses(2);
    expect(st.players[1].usurpationPlayed ?? 0).toBe(0);
  });

  it("estCarteAdverse : ni à soi, ni conquise chez soi", () => {
    expect(estCarteAdverse({ trueOwnerId: null }, { id: "P1" })).toBe(false);
    expect(estCarteAdverse({ trueOwnerId: "P1" }, { id: "P1" })).toBe(false);
    expect(estCarteAdverse({ trueOwnerId: null, conqueredFromId: "P2" }, { id: "P1" })).toBe(true);
  });

  it("snapshot d'avant le champ : zéro, pas une erreur", () => {
    expect(usurpationCount({})).toBe(0);
    expect(usurpationCount({ usurpationPlayed: 0 }, { usurpationCounted: true })).toBe(0);
  });
});

describe("forme CRÉATURE — à l'entrée en jeu", () => {
  it("« S » : +X/+Y par carte adverse jouée", () => {
    const st = jouer(apresCartesAdverses(2), usurpatrice({ recipient: "self" }));
    expect(stats(st, "Usurpatrice")).toEqual([1 + 2 * 2, 1 + 1 * 2]);
  });

  it("aucune carte adverse jouée ⇒ rien", () => {
    const st = jouer(mkState(), usurpatrice({ recipient: "self" }));
    expect(stats(st, "Usurpatrice")).toEqual([1, 1]);
  });

  it("une Usurpation CONQUISE ne se compte pas elle-même", () => {
    const u = usurpatrice({ recipient: "self" });
    u.conqueredFromId = "P2";
    const st = jouer(apresCartesAdverses(1), u);
    expect(st.players[0].usurpationPlayed).toBe(2);
    expect(stats(st, "Usurpatrice")).toEqual([1 + 2, 1 + 1]); // ×1, pas ×2
  });

  it("défaut : une AUTRE unité alliée désignée reçoit le bonus", () => {
    const s = apresCartesAdverses(2);
    const allie = carte({ name: "Allié" });
    s.players[0].board.push(allie);
    const st = jouer(s, usurpatrice(), allie.instanceId);
    expect(stats(st, "Allié")).toEqual([1 + 4, 1 + 2]);
    expect(stats(st, "Usurpatrice")).toEqual([1, 1]);
  });

  it("portée « toutes » : toutes les autres alliées, multipliées", () => {
    const s = apresCartesAdverses(3);
    const st = jouer(s, usurpatrice({ targetScope: "all_allies", x: 1, y: 1 }));
    // Les trois cartes conquises posées : chacune +3/+3, la porteuse rien.
    const autres = st.players[0].board.filter(c => c.card.name !== "Usurpatrice");
    expect(autres.map(c => [c.currentAttack, c.currentHealth])).toEqual([[4, 4], [4, 4], [4, 4]]);
    expect(stats(st, "Usurpatrice")).toEqual([1, 1]);
  });

  it("le gain est cuit dans la carte, comme Renforcement", () => {
    const st = jouer(apresCartesAdverses(1), usurpatrice({ recipient: "self" }));
    const c = st.players[0].board.find(x => x.card.name === "Usurpatrice")!;
    expect([c.card.attack, c.card.health]).toEqual([3, 2]);
  });
});

describe("forme CRÉATURE — autres déclencheurs", () => {
  it("fin de tour : relu à chaque fois, et CUMULATIF", () => {
    let s = apresCartesAdverses(1);
    s.players[0].board.push(usurpatrice({ recipient: "self", x: 1, y: 1 }, "end_of_turn"));
    s = applyAction(s, { type: "end_turn" });
    expect(stats(s, "Usurpatrice")).toEqual([2, 2]);
    s = applyAction(s, { type: "end_turn" }); // tour de P2
    // P1 joue une nouvelle carte adverse : le compteur passe à 2.
    s = jouer(s, carte({ adverse: true }));
    s = applyAction(s, { type: "end_turn" });
    expect(stats(s, "Usurpatrice")).toEqual([2 + 2, 2 + 2]);
  });

  it("choix différé : le multiplicateur n'est appliqué qu'UNE fois", () => {
    const s = apresCartesAdverses(2);
    const allie = carte({ name: "Allié" });
    s.players[0].board.push(allie, usurpatrice({ x: 1, y: 1 }, "end_of_turn"));
    const next = applyAction(s, { type: "end_turn" });
    const t = next.pendingTriggers?.find(p => p.kw === "usurpation");
    expect(t).toBeDefined();
    expect([t!.x, t!.y]).toEqual([1, 1]); // le X/Y PAR CARTE voyage
    const st = applyAction(next, { type: "resolve_pending_trigger", triggerId: t!.id, targetInstanceId: allie.instanceId });
    expect(stats(st, "Allié")).toEqual([1 + 2, 1 + 2]);
  });

  it("à l'attaque", () => {
    const s = apresCartesAdverses(2);
    const u = usurpatrice({ recipient: "self" }, "attack");
    u.hasSummoningSickness = false;
    s.players[0].board.push(u);
    const st = applyAction(s, { type: "attack", attackerInstanceId: u.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(st.players[0].board.find(c => c.card.name === "Usurpatrice")!.card.attack).toBe(1 + 4);
  });
});

describe("forme ACTION — une alliée ciblée", () => {
  const sort = (adverse = false) => {
    const ci = mkInstance(mkCard({
      name: "Sceptre volé", mana_cost: 0, card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "usurpation", attack: 1, health: 2 }] as SpellKeywordInstance[],
    }));
    if (adverse) ci.conqueredFromId = "P2";
    return ci;
  };

  it("+X/+Y par carte adverse jouée à la cible", () => {
    const s = apresCartesAdverses(2);
    const cible = s.players[0].board[0];
    const st = jouer(s, sort(), cible.instanceId);
    const c = st.players[0].board.find(x => x.instanceId === cible.instanceId)!;
    expect([c.currentAttack, c.currentHealth]).toEqual([1 + 2, 1 + 4]);
  });

  it("une action CONQUISE ne se compte pas, mais compte pour la suite", () => {
    const s = apresCartesAdverses(1);
    const cible = s.players[0].board[0];
    const st = jouer(s, sort(true), cible.instanceId);
    const c = st.players[0].board.find(x => x.instanceId === cible.instanceId)!;
    expect([c.currentAttack, c.currentHealth]).toEqual([1 + 1, 1 + 2]);
    expect(st.players[0].usurpationPlayed).toBe(2);
  });

  it("une cible ENNEMIE n'est jamais renforcée", () => {
    const s = apresCartesAdverses(2);
    const ennemi = carte({ name: "Ennemi" });
    s.players[1].board.push(ennemi);
    const st = jouer(s, sort(), ennemi.instanceId);
    expect(stats(st, "Ennemi")).toEqual([1, 1]);
  });
});

describe("forme COMPOSÉE", () => {
  const cap = (trigger: Capability["trigger"], composed: ComposedEffect): Capability =>
    ({ uid: `u_${seq++}`, trigger, effectKind: "immediate", abilityId: "_composed", composed });
  const toutesAlliees = { entity: "unit", count: "all", side: "ally", location: "board", designation: "random" } as ComposedEffect["target"];

  it("créature : le buff des alliées est multiplié", () => {
    const s = apresCartesAdverses(2);
    const porteuse = mkInstance(mkCard({
      name: "Régente", mana_cost: 0, attack: 1, health: 1,
      capabilities: [cap("on_play", { content: "usurpation", magnitude: { x: 1, y: 1 }, target: toutesAlliees })],
    }));
    const st = jouer(s, porteuse);
    const conquises = st.players[0].board.filter(c => c.conqueredFromId === "P2");
    expect(conquises.map(c => [c.currentAttack, c.currentHealth])).toEqual([[3, 3], [3, 3]]);
  });

  it("action : sans instance source, le sort ne se compte pas", () => {
    const s = apresCartesAdverses(1);
    const sortie = mkInstance(mkCard({
      name: "Décret", mana_cost: 0, card_type: "spell", attack: null, health: null,
      capabilities: [cap("spell_resolution", { content: "usurpation", magnitude: { x: 2, y: 2 }, target: toutesAlliees })],
    }));
    sortie.conqueredFromId = "P2";
    const st = jouer(s, sortie);
    const c = st.players[0].board[0];
    expect([c.currentAttack, c.currentHealth]).toEqual([3, 3]); // ×1
  });

  it("aucune carte adverse jouée ⇒ rien", () => {
    const s = mkState();
    s.players[0].board.push(carte({ name: "Allié" }));
    const porteuse = mkInstance(mkCard({
      name: "Régente", mana_cost: 0, attack: 1, health: 1,
      capabilities: [cap("on_play", { content: "usurpation", magnitude: { x: 1, y: 1 }, target: toutesAlliees })],
    }));
    expect(stats(jouer(s, porteuse), "Allié")).toEqual([1, 1]);
  });
});

describe("affichage", () => {
  it("description : bénéficiaire par défaut, « S » et « toutes »", () => {
    expect(describeKeyword("usurpation", { x: 2, instance: { y: 1 } as KeywordInstance }))
      .toBe("Donne +2/+1 permanent à une autre unité alliée ciblée par carte adverse que vous avez jouée.");
    expect(describeKeyword("usurpation", { x: 2, instance: { y: 1, recipient: "self" } as KeywordInstance }))
      .toBe("Gagne +2 ATK et +1 PV de façon permanente par carte adverse que vous avez jouée.");
  });

  it("le gain du moment est écrit, pas à calculer", () => {
    expect(usurpationNote(3, 2, 1)).toBe("Cartes adverses jouées : 3 — actuellement +6/+3.");
  });
});
