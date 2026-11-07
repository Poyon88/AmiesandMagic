// RETRAITE N : coût additionnel — en plus du mana, le joueur remonte N de ses
// créatures du plateau vers sa main.
//
// Arbitrages de l'auteur (2026-11-07), verrouillés ici :
//   1. en plus du mana, N réglable, un seul coût additionnel par carte ;
//   2. carte non jouable si la main ne peut pas accueillir les créatures : le
//      coût ne détruit jamais rien par surprise ;
//   3. comportement de Remontée : bonus permanents gardés, PV restaurés, effets
//      « au retour en main » déclenchés ;
//   4. Ancré ne paie pas ; Ombre et Invisible peuvent payer, le joueur désigne
//      ses propres créatures ;
//   5. une créature volée retourne chez son vrai propriétaire.
import { describe, expect, it } from "vitest";
import { applyAction, canPlayCard, canPlayFromGraveyard, getRetreatCost } from "./engine";
import { MAX_BOARD_SIZE, MAX_HAND_SIZE } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameAction, GameState, KeywordInstance } from "./types";

let seq = 0;
const creature = (name = `C${seq++}`, extra: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, mana_cost: 1, attack: 2, health: 3, ...extra }));
const aCout = (n: number, extra: Record<string, unknown> = {}) =>
  creature("Payeuse", { mana_cost: 0, retreat_cost: n, ...extra });

function poser(carte: CardInstance, plateau: CardInstance[], main: CardInstance[] = []): GameState {
  const s = mkState();
  s.players[0].board.push(...plateau);
  s.players[0].hand.push(...main, carte);
  return s;
}
const jouer = (s: GameState, carte: CardInstance, ids: string[]) =>
  applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, retreatInstanceIds: ids } as GameAction);
const dansMain = (st: GameState, c: CardInstance, i = 0) => st.players[i].hand.find(x => x.instanceId === c.instanceId);
const surPlateau = (st: GameState, c: CardInstance) => st.players[0].board.find(x => x.instanceId === c.instanceId);

describe("le paiement", () => {
  it("la créature désignée remonte, la carte payée entre en jeu", () => {
    const a = creature(), carte = aCout(1);
    const st = jouer(poser(carte, [a]), carte, [a.instanceId]);
    expect(dansMain(st, a)).toBeDefined();
    expect(surPlateau(st, a)).toBeUndefined();
    expect(surPlateau(st, carte)).toBeDefined();
  });

  it("Retraite 2 remonte les deux désignées, pas la troisième", () => {
    const a = creature(), b = creature(), c = creature(), carte = aCout(2);
    const st = jouer(poser(carte, [a, b, c]), carte, [a.instanceId, c.instanceId]);
    expect(dansMain(st, a)).toBeDefined();
    expect(dansMain(st, c)).toBeDefined();
    expect(surPlateau(st, b)).toBeDefined();
  });

  it("le coût s'ajoute au mana", () => {
    const a = creature(), carte = aCout(1, { mana_cost: 3 });
    const s = poser(carte, [a]);
    s.players[0].mana = 3;
    expect(jouer(s, carte, [a.instanceId]).players[0].mana).toBe(0);
  });

  it("bonus permanents gardés et PV restaurés", () => {
    const a = creature(), carte = aCout(1);
    a.card = { ...a.card, attack: 5, health: 6 };
    a.currentAttack = 5; a.maxHealth = 6; a.currentHealth = 1;
    const m = dansMain(jouer(poser(carte, [a]), carte, [a.instanceId]), a)!;
    expect(m.card.attack).toBe(5);
    expect(m.currentHealth).toBe(6);
  });

  it("les effets « au retour en main » partent une fois", () => {
    const a = creature("Rappelée", {
      keywords: ["lien_du_sang"],
      keyword_instances: [{ id: "lien_du_sang", x: 2, mode: "return" } as KeywordInstance],
    });
    const carte = aCout(1);
    const st = jouer(poser(carte, [a]), carte, [a.instanceId]);
    expect(st.players[0].hero.hp).toBe(28);
    expect(dansMain(st, a)!.card.attack).toBe(4);
  });

  it("un sort se paie de la même façon", () => {
    const a = creature();
    const sort = mkInstance(mkCard({ name: "Ordre", card_type: "spell", mana_cost: 0, attack: null, health: null, retreat_cost: 1 }));
    const st = jouer(poser(sort, [a]), sort, [a.instanceId]);
    expect(dansMain(st, a)).toBeDefined();
  });
});

describe("les refus du moteur", () => {
  it.each([
    ["aucune désignation", (a: CardInstance) => { void a; return [] as string[]; }],
    ["doublon", (a: CardInstance) => [a.instanceId, a.instanceId]],
  ])("%s", (_, ids) => {
    const a = creature(), carte = aCout(1);
    const s = poser(carte, [a, creature()]);
    expect(jouer(s, carte, ids(a))).toBe(s);
  });

  it("une désignation en trop sur une carte sans Retraite", () => {
    const a = creature(), carte = aCout(0);
    const s = poser(carte, [a]);
    expect(jouer(s, carte, [a.instanceId])).toBe(s);
  });

  it("une créature adverse", () => {
    const a = creature(), e = creature(), carte = aCout(1);
    const s = poser(carte, [a]);
    s.players[1].board.push(e);
    expect(jouer(s, carte, [e.instanceId])).toBe(s);
  });

  it("une créature Ancrée", () => {
    const a = creature("Ancrée", { keywords: ["ancre"] }), carte = aCout(1);
    const s = poser(carte, [a, creature()]);
    expect(jouer(s, carte, [a.instanceId])).toBe(s);
  });
});

describe("la jouabilité", () => {
  const jouable = (s: GameState, c: CardInstance) => canPlayCard(s, c.instanceId);

  it("il faut N créatures sur le plateau", () => {
    const carte = aCout(2);
    expect(jouable(poser(carte, [creature()]), carte)).toBe(false);
    const c2 = aCout(2);
    expect(jouable(poser(c2, [creature(), creature()]), c2)).toBe(true);
  });

  it("une Ancrée ne compte pas parmi les disponibles", () => {
    const carte = aCout(1);
    expect(jouable(poser(carte, [creature("Ancrée", { keywords: ["ancre"] })]), carte)).toBe(false);
  });

  it("Ombre et Invisible peuvent payer", () => {
    const o = creature("Ombre", { keywords: ["ombre"] }), carte = aCout(1);
    const s = poser(carte, [o]);
    expect(jouable(s, carte)).toBe(true);
    expect(dansMain(jouer(s, carte, [o.instanceId]), o)).toBeDefined();
  });

  const pleine = (n: number) => Array.from({ length: n }, () => creature());

  it("main pleine : Retraite 1 passe, la carte jouée libère sa place", () => {
    const a = creature(), carte = aCout(1);
    const s = poser(carte, [a], pleine(MAX_HAND_SIZE - 1));
    expect(jouable(s, carte)).toBe(true);
    expect(dansMain(jouer(s, carte, [a.instanceId]), a)).toBeDefined();
  });

  it("main pleine : Retraite 2 est refusée", () => {
    const a = creature(), b = creature(), carte = aCout(2);
    const s = poser(carte, [a, b], pleine(MAX_HAND_SIZE - 1));
    expect(jouable(s, carte)).toBe(false);
    expect(jouer(s, carte, [a.instanceId, b.instanceId])).toBe(s);
  });

  it("plateau plein : la créature remontée libère la place", () => {
    const plateau = Array.from({ length: MAX_BOARD_SIZE }, () => creature());
    const carte = aCout(1);
    const s = poser(carte, plateau);
    expect(jouable(s, carte)).toBe(true);
    expect(surPlateau(jouer(s, carte, [plateau[0].instanceId]), carte)).toBeDefined();
  });

  it("Seconde vie : le prédicat du cimetière suit le même test", () => {
    const carte = creature("Revenante", {
      mana_cost: 0, retreat_cost: 1, keywords: ["seconde_vie"],
      keyword_instances: [{ id: "seconde_vie", x: 1 } as KeywordInstance],
    });
    const s = mkState();
    s.players[0].graveyard.push(carte);
    expect(canPlayFromGraveyard(s, carte.instanceId)).toBe(false);
    s.players[0].board.push(creature());
    expect(canPlayFromGraveyard(s, carte.instanceId)).toBe(true);
  });
});

describe("une créature volée", () => {
  const volee = () => {
    const v = creature("Volée");
    v.trueOwnerId = "P2";
    return v;
  };

  it("retourne chez son vrai propriétaire", () => {
    const v = volee(), carte = aCout(1);
    const st = jouer(poser(carte, [v]), carte, [v.instanceId]);
    expect(dansMain(st, v, 1)).toBeDefined();
    expect(dansMain(st, v, 0)).toBeUndefined();
  });

  it("n'occupe pas de place dans la main de celui qui paie", () => {
    const v = volee(), a = creature(), carte = aCout(2);
    const main = Array.from({ length: MAX_HAND_SIZE - 1 }, () => creature());
    const s = poser(carte, [v, a], main);
    expect(canPlayCard(s, carte.instanceId)).toBe(true);
    expect(dansMain(jouer(s, carte, [v.instanceId, a.instanceId]), a)).toBeDefined();
  });
});

describe("le getter", () => {
  it("absent, nul ou négatif : inactif", () => {
    expect(getRetreatCost(mkCard({}))).toBe(0);
    expect(getRetreatCost(mkCard({ retreat_cost: null }))).toBe(0);
    expect(getRetreatCost(mkCard({ retreat_cost: -1 }))).toBe(0);
    expect(getRetreatCost(mkCard({ retreat_cost: 2 }))).toBe(2);
  });
});
