// TRANSFORMATION — selon son déclencheur, la créature DEVIENT la carte désignée
// (neuve, sans effets d'entrée en jeu, objets et état d'attaque conservés). À la
// mort, elle revient transformée. Elle retrouve sa forme d'origine dès qu'elle
// quitte le plateau.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "./types";

const DRAGON_ID = 7701;
const dragon = mkCard({ id: DRAGON_ID, name: "Dragon Éveillé", mana_cost: 6, attack: 5, health: 6, faction: "Humains" });

function larve(mode: KeywordInstance["mode"], cible = DRAGON_ID): CardInstance {
  return mkInstance(mkCard({
    name: "Larve", mana_cost: 2, attack: 1, health: 2, faction: "Humains",
    keywords: ["transformation"] as unknown as Card["keywords"],
    keyword_instances: [{ id: "transformation" as Keyword, mode, linkedCardIds: [cible] }] as KeywordInstance[],
  }));
}
function table(): GameState {
  const s = mkState();
  s.factionCardPool = [dragon];
  return s;
}
const surPlateau = (s: GameState, i = 0) => s.players[i].board;

describe("Transformation sur le plateau", () => {
  it("en fin de tour : même instance, stats pleines de la carte cible, forme d'origine mémorisée", () => {
    const s = table();
    const l = larve("end_of_turn");
    l.currentHealth = 1; // blessée : la transformation remet à neuf
    s.players[0].board.push(l);
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    const c = surPlateau(apres)[0];
    expect(c.instanceId).toBe(l.instanceId);
    expect(c.card.name).toBe("Dragon Éveillé");
    expect(c.currentAttack).toBe(5);
    expect(c.currentHealth).toBe(6);
    expect(c.formeOrigine?.name).toBe("Larve");
  });

  it("garde son objet équipé et son état d'attaque", () => {
    const s = table();
    const l = larve("end_of_turn");
    l.hasAttacked = true; l.attacksRemaining = 0;
    s.players[0].board.push(l);
    const epee = mkInstance(mkCard({ name: "Épée", card_type: "item", attack: 1, health: 0, equip_cost: 0 }));
    epee.equippedToInstanceId = l.instanceId;
    s.players[0].items = [epee];
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    expect(apres.players[0].items![0].equippedToInstanceId).toBe(l.instanceId);
    const c = surPlateau(apres)[0];
    expect(c.currentAttack).toBe(6); // 5 + 1 de l'Épée
  });

  it("une seule fois : un second déclenchement ne change plus rien", () => {
    let s = table();
    s.players[0].board.push(larve("end_of_turn"));
    s = applyAction(s, { type: "end_turn" } as GameAction);
    s = applyAction(s, { type: "end_turn" } as GameAction);
    s = applyAction(s, { type: "end_turn" } as GameAction);
    const c = surPlateau(s)[0];
    expect(c.card.name).toBe("Dragon Éveillé");
    expect(c.formeOrigine?.name).toBe("Larve");
  });

  it("à l'attaque : se transforme AVANT le combat, c'est la nouvelle forme qui frappe", () => {
    const s = table();
    const l = larve("attack");
    l.hasSummoningSickness = false;
    s.players[0].board.push(l);
    const garde = mkInstance(mkCard({ name: "Garde", attack: 2, health: 4 }));
    s.players[1].board.push(garde);
    const apres = applyAction(s, { type: "attack", attackerInstanceId: l.instanceId, targetInstanceId: garde.instanceId } as GameAction);
    expect(surPlateau(apres, 1)).toHaveLength(0);          // 5 dégâts tuent la Garde (4 PV)
    const c = surPlateau(apres)[0];
    expect(c.card.name).toBe("Dragon Éveillé");
    expect(c.currentHealth).toBe(4);                       // 6 - 2
  });
});

describe("Transformation à la mort", () => {
  it("revient sur le plateau transformée, PV pleins, sans pouvoir attaquer de suite", () => {
    const s = table();
    const l = larve("death");
    s.players[1].board.push(l);
    const brute = mkInstance(mkCard({ name: "Brute", attack: 5, health: 5 }));
    brute.hasSummoningSickness = false;
    s.players[0].board.push(brute);
    const apres = applyAction(s, { type: "attack", attackerInstanceId: brute.instanceId, targetInstanceId: l.instanceId } as GameAction);
    const c = surPlateau(apres, 1)[0];
    expect(c?.card.name).toBe("Dragon Éveillé");
    expect(c.currentHealth).toBe(6);
    expect(c.hasSummoningSickness).toBe(true);
    expect(apres.players[1].graveyard.map(g => g.card.name)).not.toContain("Larve");
  });
});

describe("retour à la forme d'origine hors du plateau", () => {
  it("tuée sous sa nouvelle forme : part au cimetière sous sa forme d'ORIGINE", () => {
    let s = table();
    const l = larve("end_of_turn");
    s.players[0].board.push(l);
    s = applyAction(s, { type: "end_turn" } as GameAction); // → Dragon ; tour du joueur 2
    s.players[1].mana = 10;
    const couperet = mkInstance(mkCard({
      name: "Couperet", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "execution" } as SpellKeywordInstance],
    }));
    s.players[1].hand.push(couperet);
    s = applyAction(s, { type: "play_card", cardInstanceId: couperet.instanceId, targetMap: { kw_0: l.instanceId, target_0: l.instanceId } });
    expect(surPlateau(s)).toHaveLength(0);
    const mort = s.players[0].graveyard.find(g => g.instanceId === l.instanceId)!;
    expect(mort.card.name).toBe("Larve");
    expect(mort.formeOrigine).toBeUndefined();
    expect(mort.currentAttack).toBe(1);
  });

  it("renvoyée en main sous sa nouvelle forme : revient en main sous sa forme d'ORIGINE", () => {
    let s = table();
    const l = larve("end_of_turn");
    s.players[0].board.push(l);
    s = applyAction(s, { type: "end_turn" } as GameAction);
    s.players[1].mana = 10;
    const renvoi = mkInstance(mkCard({
      name: "Reflux", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "remontee" } as SpellKeywordInstance],
    }));
    s.players[1].hand.push(renvoi);
    s = applyAction(s, { type: "play_card", cardInstanceId: renvoi.instanceId, targetMap: { kw_0: l.instanceId, target_0: l.instanceId } });
    const enMain = s.players[0].hand.find(c => c.instanceId === l.instanceId);
    expect(enMain?.card.name).toBe("Larve");
    expect(enMain?.formeOrigine).toBeUndefined();
  });

  it("carte cible introuvable : aucun effet, aucune erreur", () => {
    const s = table();
    s.players[0].board.push(larve("end_of_turn", 999999));
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    expect(surPlateau(apres)[0].card.name).toBe("Larve");
  });
});
