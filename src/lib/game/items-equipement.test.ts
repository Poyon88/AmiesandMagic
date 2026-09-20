// OBJETS, LOT 2 — l'équipement.
//
// Ce que ces tests protègent, dans l'ordre de ce qui casse en silence :
//
//  1. Le LIEN AUTO-RÉPARANT. Le porteur peut quitter le plateau par une
//     douzaine de chemins ; aucun ne connaît les objets. C'est
//     `recalculateAuras` qui coupe le lien en constatant l'absence. Si cette
//     validation disparaît, un objet reste accroché à un fantôme et son bonus
//     devient intransférable — sans la moindre erreur.
//  2. La COMPTABILITÉ PAR DIFFÉRENTIEL des PV. C'est le piège classique de ce
//     moteur : mal tenue, elle SOIGNE la créature à chaque recalcul.
//  3. Le PLANCHER à 1 PV. Retirer un objet ne doit jamais tuer — c'est ce qui
//     autorise `no-corpses-invariant.test.ts` à classer les deux actions
//     « sans dégâts ».
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { bonusDObjet, getEquipCost, objetPorteParUnite, objetsDe, placesOccupees } from "./items";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState } from "./types";

const objet = (name: string, atk: number, pv: number, equipCost = 0, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({
    name, card_type: "item", mana_cost: 0, attack: atk, health: pv,
    faction: "Humains", equip_cost: equipCost, ...over,
  }));

const creature = (name: string, atk = 1, pv = 3): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: atk, health: pv, faction: "Humains" }));

/** Table : une créature sur le plateau, un objet posé, mana à volonté. */
function table(item = objet("Épée", 2, 1), unite = creature("Soldat")): {
  s: GameState; item: CardInstance; unite: CardInstance;
} {
  const s = mkState();
  s.players[0].board.push(unite);
  s.players[0].items = [item];
  return { s, item, unite };
}

const equiper = (s: GameState, item: CardInstance, cible: CardInstance): GameState =>
  applyAction(s, { type: "equip_item", itemInstanceId: item.instanceId, targetInstanceId: cible.instanceId } as GameAction);

const sacrifier = (s: GameState, item: CardInstance): GameState =>
  applyAction(s, { type: "sacrifice_item", itemInstanceId: item.instanceId } as GameAction);

const unite = (s: GameState, nom: string) => s.players[0].board.find(c => c.card.name === nom)!;

describe("Équiper", () => {
  it("le porteur gagne l'ATK et les PV de l'objet", () => {
    const { s, item, unite: soldat } = table();
    const next = equiper(s, item, soldat);

    const apres = unite(next, "Soldat");
    expect(apres.currentAttack).toBe(1 + 2);
    expect(apres.maxHealth).toBe(3 + 1);
    expect(apres.currentHealth).toBe(3 + 1);
  });

  it("le coût d'équipement est débité", () => {
    const { s, item, unite: soldat } = table(objet("Épée", 2, 1, 3));
    s.players[0].mana = 10;
    expect(equiper(s, item, soldat).players[0].mana).toBe(7);
  });

  it("mana insuffisant : action refusée, rien n'est débité ni équipé", () => {
    const { s, item, unite: soldat } = table(objet("Épée", 2, 1, 5));
    s.players[0].mana = 4;

    const next = equiper(s, item, soldat);
    expect(next.players[0].mana).toBe(4);
    expect(objetsDe(next.players[0])[0].equippedToInstanceId).toBeFalsy();
    expect(unite(next, "Soldat").currentAttack).toBe(1);
  });

  it("une créature ne porte qu'UN objet : le second est refusé", () => {
    const epee = objet("Épée", 2, 1);
    const bouclier = objet("Bouclier", 0, 3);
    const { s, unite: soldat } = table(epee);
    s.players[0].items = [epee, bouclier];

    const apresEpee = equiper(s, epee, soldat);
    const apresBouclier = equiper(apresEpee, bouclier, unite(apresEpee, "Soldat"));

    // Refusé ⇒ état d'origine rendu : le bouclier n'est pas équipé, et l'épée
    // n'a surtout pas été remplacée en silence.
    expect(objetsDe(apresBouclier.players[0]).find(o => o.card.name === "Bouclier")!.equippedToInstanceId).toBeFalsy();
    expect(unite(apresBouclier, "Soldat").currentAttack).toBe(3);
  });

  it("rééquiper le MÊME objet sur la même créature est refusé (mana pour rien)", () => {
    const { s, item, unite: soldat } = table(objet("Épée", 2, 1, 2));
    s.players[0].mana = 10;
    const apres = equiper(s, item, soldat);
    expect(apres.players[0].mana).toBe(8);

    const encore = equiper(apres, objetsDe(apres.players[0])[0], unite(apres, "Soldat"));
    expect(encore.players[0].mana).toBe(8);
  });
});

describe("Déplacer un objet", () => {
  it("l'équiper ailleurs le détache de la première créature, et recoûte", () => {
    const epee = objet("Épée", 2, 1, 2);
    const s = mkState();
    s.players[0].mana = 10;
    const a = creature("Soldat"), b = creature("Garde");
    s.players[0].board.push(a, b);
    s.players[0].items = [epee];

    const apres1 = equiper(s, epee, a);
    expect(unite(apres1, "Soldat").currentAttack).toBe(3);

    const apres2 = equiper(apres1, objetsDe(apres1.players[0])[0], unite(apres1, "Garde"));
    expect(unite(apres2, "Soldat").currentAttack).toBe(1);
    expect(unite(apres2, "Soldat").maxHealth).toBe(3);
    expect(unite(apres2, "Garde").currentAttack).toBe(3);
    expect(apres2.players[0].mana).toBe(6);
  });
});

describe("Le lien se répare tout seul", () => {
  it("le porteur quitte le plateau : l'objet reste en jeu, déséquipé", () => {
    const { s, item, unite: soldat } = table();
    const apres = equiper(s, item, soldat);
    expect(objetsDe(apres.players[0])[0].equippedToInstanceId).toBe(soldat.instanceId);

    // Le porteur s'en va — peu importe par quel chemin, aucun ne connaît les
    // objets. Une action neutre suffit à déclencher le recalcul.
    apres.players[0].board = [];
    const fin = applyAction(apres, { type: "end_turn" } as GameAction);

    const epee = objetsDe(fin.players[0])[0];
    expect(epee, "l'objet SURVIT à son porteur").toBeDefined();
    expect(epee.equippedToInstanceId).toBeNull();
    expect(fin.players[0].graveyard.some(c => c.card.name === "Épée")).toBe(false);
  });

  it("un objet déséquipé se rééquipe sur une autre créature", () => {
    const { s, item, unite: soldat } = table();
    s.players[0].board.push(creature("Garde"));
    const apres = equiper(s, item, soldat);
    apres.players[0].board = apres.players[0].board.filter(c => c.card.name !== "Soldat");
    // DEUX fins de tour : une seule passerait la main à P2, et l'équipement qui
    // suit agirait alors sur le mauvais joueur (l'action lit toujours le joueur
    // courant). Le lien, lui, est déjà réparé au premier recalcul.
    const libre = applyAction(
      applyAction(apres, { type: "end_turn" } as GameAction),
      { type: "end_turn" } as GameAction);

    const fin = equiper(libre, objetsDe(libre.players[0])[0], unite(libre, "Garde"));
    expect(unite(fin, "Garde").currentAttack).toBe(3);
  });
});

describe("Sacrifier un objet", () => {
  it("il part au cimetière et libère sa place", () => {
    const { s, item } = table();
    expect(placesOccupees(s.players[0])).toBe(2);

    const next = sacrifier(s, item);
    expect(objetsDe(next.players[0])).toHaveLength(0);
    expect(next.players[0].graveyard.map(c => c.card.name)).toEqual(["Épée"]);
    expect(placesOccupees(next.players[0])).toBe(1);
  });

  it("c'est gratuit", () => {
    const { s, item } = table(objet("Épée", 2, 1, 4));
    s.players[0].mana = 5;
    expect(sacrifier(s, item).players[0].mana).toBe(5);
  });

  it("le porteur perd le bonus, sans être soigné ni tué", () => {
    const { s, item, unite: soldat } = table(objet("Épée", 2, 2));
    const equipe = equiper(s, item, soldat);
    // On blesse le porteur pour vérifier que le retrait ne le SOIGNE pas : c'est
    // le défaut classique d'un différentiel mal tenu.
    unite(equipe, "Soldat").currentHealth = 2;

    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    const s2 = unite(apres, "Soldat");
    expect(s2.maxHealth).toBe(3);
    // 2 PV courants moins l'écart de 2 ⇒ 0, relevé au plancher. C'est la
    // CONVENTION DU MOTEUR, celle de `auraHealthBonus` : retirer un bonus de PV
    // retire aussi des PV courants, sans jamais tuer. Un objet se comporte donc
    // comme un Commandement qui s'en va — et non comme Magic, où seuls les
    // dégâts marqués subsistent. Écart assumé, pas oublié.
    expect(s2.currentHealth).toBe(1);
    expect(s2.currentAttack).toBe(1);
  });

  it("PLANCHER : retirer un objet ne tue jamais, même à 1 PV", () => {
    // Ce qui autorise `no-corpses-invariant` à classer l'action « sans dégâts ».
    const { s, item, unite: soldat } = table(objet("Épée", 0, 5));
    const equipe = equiper(s, item, soldat);
    unite(equipe, "Soldat").currentHealth = 1;

    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    const s2 = unite(apres, "Soldat");
    expect(s2.currentHealth).toBeGreaterThanOrEqual(1);
    expect(apres.players[0].board.some(c => c.card.name === "Soldat")).toBe(true);
  });
});

describe("Stabilité du différentiel", () => {
  it("dix recalculs d'affilée ne font pas dériver les PV d'un point", () => {
    // Le différentiel est la partie la plus facile à casser de tout ce lot : un
    // écart mal mémorisé ne se voit pas au premier recalcul, il DÉRIVE.
    const { s, item, unite: soldat } = table(objet("Épée", 2, 3));
    let etat = equiper(s, item, soldat);
    const attendus = { atk: unite(etat, "Soldat").currentAttack, pv: unite(etat, "Soldat").maxHealth };
    expect(attendus).toEqual({ atk: 3, pv: 6 });

    for (let i = 0; i < 10; i++) etat = applyAction(etat, { type: "end_turn" } as GameAction);

    expect(unite(etat, "Soldat").currentAttack).toBe(3);
    expect(unite(etat, "Soldat").maxHealth).toBe(6);
  });
});

describe("Helpers", () => {
  it("coût absent, nul ou négatif ⇒ gratuit", () => {
    expect(getEquipCost({ equip_cost: null })).toBe(0);
    expect(getEquipCost({ equip_cost: undefined })).toBe(0);
    expect(getEquipCost({ equip_cost: -3 })).toBe(0);
    expect(getEquipCost({ equip_cost: 4 })).toBe(4);
  });

  it("un objet sans stats ne donne aucun bonus (capacités seules)", () => {
    const sansStats = mkInstance(mkCard({ name: "Talisman", card_type: "item", attack: null, health: null }));
    expect(bonusDObjet(sansStats)).toEqual({ atk: 0, pv: 0 });
  });

  it("objetPorteParUnite dérive le sens inverse du lien", () => {
    const { s, item, unite: soldat } = table();
    expect(objetPorteParUnite(s.players[0], soldat.instanceId)).toBeUndefined();
    const apres = equiper(s, item, soldat);
    expect(objetPorteParUnite(apres.players[0], soldat.instanceId)?.card.name).toBe("Épée");
  });
});
