// MAÎTRE D'ARME — la créature s'équipe, gratuitement, de TOUS les objets en jeu
// de son contrôleur, y compris ceux que portent ses autres créatures. Objets
// en main : non concernés.
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
  it("prend TOUS les objets en jeu, même portés par un allié, sans payer", () => {
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
  it("en fin de tour : récupère aussi un objet posé APRÈS son arrivée", () => {
    const s = table();
    const m = maitre("end_of_turn");
    s.players[0].board.push(m);
    s.players[0].items!.push(objet("Heaume", 0, 1));
    const apres = applyAction(s, { type: "end_turn" } as GameAction);
    for (const nom of ["Épée", "Bouclier", "Heaume"]) expect(porteur(apres, nom)).toBe(m.instanceId);
  });
});

describe("règle « un objet par créature »", () => {
  it("un Maître d'arme accepte un objet de plus à la main ; une créature ordinaire non", () => {
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
    // Le Soldat porte déjà l'Épée : la Hache ne peut pas l'y rejoindre.
    const soldat = sur(st, "Soldat");
    const refuse = applyAction(st, { type: "equip_item", itemInstanceId: hache.instanceId, targetInstanceId: soldat.instanceId } as GameAction);
    expect(porteur(refuse, "Hache")).toBe(m.instanceId);
  });
});
