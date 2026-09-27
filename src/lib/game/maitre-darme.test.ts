// MAÎTRE D'ARME — la créature s'équipe, gratuitement, des objets en jeu de son
// contrôleur, y compris ceux que portent ses autres créatures : DEUX au plus
// (comme toute unité), les plus chers d'abord, au hasard à coût égal. Objets en
// main : non concernés.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { objetsDe } from "./items";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, CardInstance, GameAction, GameState, Keyword, KeywordInstance } from "./types";

const objet = (name: string, atk: number, pv: number, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, card_type: "item", mana_cost: 0, attack: atk, health: pv, faction: "Humains", equip_cost: 3, ...over }));
const creature = (name: string, atk = 1, pv = 3, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: atk, health: pv, faction: "Humains", ...over }));
const maitre = (mode?: "end_of_turn") => creature("Maître", 2, 4, {
  keywords: ["maitre_darme"] as unknown as Card["keywords"],
  ...(mode ? { keyword_instances: [{ id: "maitre_darme" as Keyword, mode }] as KeywordInstance[] } : {}),
});
const sur = (s: GameState, nom: string) => s.players[0].board.find(c => c.card.name === nom)!;
const porteur = (s: GameState, nomObjet: string) => objetsDe(s.players[0]).find(o => o.card.name === nomObjet)!.equippedToInstanceId;

/** Un Soldat allié porte l'Épée (+2/+1) ; le Bouclier (+0/+2) est posé, libre. */
function table(): GameState {
  const s = mkState();
  const soldat = creature("Soldat");
  const epee = objet("Épée", 2, 1);
  const bouclier = objet("Bouclier", 0, 2);
  s.players[0].board.push(soldat);
  s.players[0].items = [epee, bouclier];
  s.players[0].mana = 10;
  return applyAction(s, { type: "equip_item", itemInstanceId: epee.instanceId, targetInstanceId: soldat.instanceId } as GameAction);
}

describe("Maître d'arme à l'entrée en jeu", () => {
  it("prend les objets en jeu (2 ici), même portés par un allié, sans payer", () => {
    const s = table();
    const mana = s.players[0].mana;
    const m = maitre();
    s.players[0].hand.push(m);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: m.instanceId });
    expect(porteur(apres, "Épée")).toBe(m.instanceId);
    expect(porteur(apres, "Bouclier")).toBe(m.instanceId);
    expect(apres.players[0].mana).toBe(mana); // coûts d'équipement (3 + 3) non payés
    // Bonus CUMULÉS sur le Maître : 2+2 ATK, 4+1+2 PV.
    expect(sur(apres, "Maître").currentAttack).toBe(4);
    expect(sur(apres, "Maître").maxHealth).toBe(7);
    // Le Soldat perd l'Épée et redevient 1/3.
    expect(sur(apres, "Soldat").currentAttack).toBe(1);
    expect(sur(apres, "Soldat").maxHealth).toBe(3);
  });

  it("ne touche pas aux objets en MAIN", () => {
    const s = table();
    const enMain = objet("Dague", 1, 0);
    s.players[0].hand.push(enMain);
    const m = maitre();
    s.players[0].hand.push(m);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: m.instanceId });
    expect(apres.players[0].hand.map(c => c.card.name)).toContain("Dague");
    expect(objetsDe(apres.players[0]).map(o => o.card.name)).not.toContain("Dague");
  });

  it("greffe les capacités de CHAQUE objet porté", () => {
    const s = mkState();
    s.players[0].items = [
      objet("Bottes", 0, 0, { keywords: ["charge"] as unknown as Card["keywords"] }),
      objet("Égide", 0, 0, { keywords: ["taunt"] as unknown as Card["keywords"] }),
    ];
    const m = maitre();
    s.players[0].hand.push(m);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: m.instanceId });
    const kws = sur(apres, "Maître").card.keywords as unknown as string[];
    expect(kws).toEqual(expect.arrayContaining(["charge", "taunt"]));
  });
});

describe("Maître d'arme sur un autre déclencheur", () => {
  it("en fin de tour : récupère un objet posé APRÈS son arrivée, s'il a une place", () => {
    const s = table();
    const m = maitre("end_of_turn");
    s.players[0].board.push(m);
    s.players[0].items!.push(objet("Heaume", 0, 1, { mana_cost: 5 }));
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    // Deux places : le Heaume (coût 5) d'abord, puis un des deux objets à coût 0.
    expect(porteur(apres, "Heaume")).toBe(m.instanceId);
    const portes = objetsDe(apres.players[0]).filter(o => o.equippedToInstanceId === m.instanceId);
    expect(portes).toHaveLength(2);
  });
});

describe("Maître d'arme : deux objets, les plus chers d'abord", () => {
  it("prend les deux plus chers, laisse le moins cher", () => {
    const s = mkState();
    s.players[0].items = [objet("Dague", 1, 0, { mana_cost: 1 }), objet("Lance", 2, 0, { mana_cost: 4 }), objet("Armure", 0, 3, { mana_cost: 3 })];
    const m = maitre();
    s.players[0].hand.push(m);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: m.instanceId });
    expect(porteur(apres, "Lance")).toBe(m.instanceId);
    expect(porteur(apres, "Armure")).toBe(m.instanceId);
    expect(porteur(apres, "Dague")).toBeFalsy();
  });

  it("à coût égal, tirage au sort — le même pour une même graine", () => {
    const tirage = (graine: number) => {
      const s = mkState();
      s.players[0].items = [objet("A", 1, 0, { mana_cost: 2 }), objet("B", 1, 0, { mana_cost: 2 }), objet("C", 1, 0, { mana_cost: 2 })];
      const m = maitre();
      s.players[0].hand.push(m);
      s.rngState = graine; // le hasard du moteur vit dans l'état de partie
      const apres = applyAction(s, { type: "play_card", cardInstanceId: m.instanceId });
      return objetsDe(apres.players[0]).filter(o => o.equippedToInstanceId === m.instanceId).map(o => o.card.name).sort();
    };
    expect(tirage(7)).toHaveLength(2);
    expect(tirage(7)).toEqual(tirage(7));
    const issues = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => tirage(g).join()));
    expect(issues.size).toBeGreaterThan(1);
  });

  it("déjà plein : ne prend rien de plus", () => {
    const s = mkState();
    const m = maitre("end_of_turn");
    s.players[0].board.push(m);
    s.players[0].items = [objet("A", 1, 0, { mana_cost: 1 }), objet("B", 1, 0, { mana_cost: 1 })];
    for (const o of s.players[0].items) o.equippedToInstanceId = m.instanceId;
    s.players[0].items.push(objet("Joyau", 0, 0, { mana_cost: 9 }));
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    expect(porteur(apres, "Joyau")).toBeFalsy();
  });
});

describe("règle « deux objets par créature »", () => {
  it("un Maître d'arme accepte un objet de plus à la main tant qu'il a une place", () => {
    const s = table();
    const m = maitre("end_of_turn"); // pas d'effet à l'entrée : on équipe à la main
    s.players[0].board.push(m);
    const bouclier = objetsDe(s.players[0]).find(o => o.card.name === "Bouclier")!;
    const hache = objet("Hache", 1, 0);
    s.players[0].items!.push(hache);
    let st = applyAction(s, { type: "equip_item", itemInstanceId: bouclier.instanceId, targetInstanceId: m.instanceId } as GameAction);
    st = applyAction(st, { type: "equip_item", itemInstanceId: hache.instanceId, targetInstanceId: m.instanceId } as GameAction);
    expect(porteur(st, "Bouclier")).toBe(m.instanceId);
    expect(porteur(st, "Hache")).toBe(m.instanceId);
    // Le Soldat porte l'Épée : il lui reste une place, la Hache peut l'y rejoindre.
    const soldat = sur(st, "Soldat");
    st.players[0].mana = 10; // chaque équipement coûte 3 : on isole la règle des places
    const deplace = applyAction(st, { type: "equip_item", itemInstanceId: hache.instanceId, targetInstanceId: soldat.instanceId } as GameAction);
    expect(porteur(deplace, "Hache")).toBe(soldat.instanceId);
    // Plein (Épée + Hache) : un troisième objet lui est refusé.
    const masse = objet("Masse", 1, 0, { equip_cost: 0 });
    deplace.players[0].items!.push(masse);
    const refuse = applyAction(deplace, { type: "equip_item", itemInstanceId: masse.instanceId, targetInstanceId: soldat.instanceId } as GameAction);
    expect(porteur(refuse, "Masse")).toBeFalsy();
  });
});
