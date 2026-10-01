// Invention +X/+Y : chaque Invention ajoute +X/+Y et, au choix, une capacité
// (avec son déclencheur) à la MACHINE du contrôleur. Un clic la met en main ;
// la construction suivante repart d'une machine vierge 0/1.
import { describe, expect, it } from "vitest";
import { applyAction, takeMachine } from "./engine";
import { appliquerInvention, buildMachineCard, machineVierge, type InventionPart } from "./machine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { MAX_HAND_SIZE, MAX_INVENTIONS_MACHINE } from "./constants";
import { getCapabilities } from "./capability-adapter";
import type { CardInstance, GameState, KeywordInstance, KeywordMode, MachineState } from "./types";

/** Unité dont l'arrivée en jeu ajoute une pièce à la machine. */
function inventeur(part: Partial<InventionPart>, mode?: KeywordMode): CardInstance {
  const inst: KeywordInstance = {
    id: "invention", ...(mode ? { mode } : {}), x: part.attack ?? 0, y: part.health ?? 0,
    ...(part.grantAbilityId ? { grantAbilityId: part.grantAbilityId } : {}),
    ...(part.grantX != null ? { grantX: part.grantX } : {}),
    ...(part.grantY != null ? { grantY: part.grantY } : {}),
    ...(part.grantMode ? { grantMode: part.grantMode } : {}),
  };
  return mkInstance(mkCard({
    name: "Inventeur gnome", mana_cost: 1, attack: 1, health: 1,
    keywords: ["invention"], keyword_instances: [inst],
  }));
}

/** Sort qui ajoute une pièce à la machine. */
function planDAtelier(part: Partial<InventionPart>): CardInstance {
  return mkInstance(mkCard({
    name: "Plan d'atelier", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "invention", attack: part.attack ?? 0, health: part.health ?? 0,
      grantAbilityId: part.grantAbilityId, grantX: part.grantX, grantY: part.grantY, grantMode: part.grantMode }],
  }));
}

function jouer(s: GameState, inst: CardInstance, targetInstanceId?: string): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId, ...(targetInstanceId ? { targetInstanceId } : {}) });
}

const machine = (s: GameState): MachineState | null => s.players[0].machine ?? null;
const instancesDe = (m: MachineState | null, id: string) => (m?.keyword_instances ?? []).filter((k) => k.id === id);

describe("Invention — construction de la machine", () => {
  it("n'existe pas tant qu'aucune Invention n'a été jouée", () => {
    expect(machine(mkState())).toBeNull();
  });

  it("part d'une 0/1 : +2/+1 avec Impact 1 donne une 2/2 Impact 1, coût 1", () => {
    const s = jouer(mkState(), inventeur({ attack: 2, health: 1, grantAbilityId: "impact", grantX: 1 }));
    const m = machine(s)!;
    expect([m.attack, m.health, m.inventions]).toEqual([2, 2, 1]);
    expect(m.keywords).toEqual(["impact"]);
    expect(instancesDe(m, "impact")).toEqual([{ id: "impact", x: 1 }]);
  });

  it("l'exemple de Fab : +2/+1 Impact 1 puis +1/+0 Vol donne une 3/2 Vol, Impact 1, coût 2", () => {
    let s = jouer(mkState(), inventeur({ attack: 2, health: 1, grantAbilityId: "impact", grantX: 1 }));
    s = jouer(s, inventeur({ attack: 1, health: 0, grantAbilityId: "ranged" }));
    const m = machine(s)!;
    expect([m.attack, m.health]).toEqual([3, 2]);
    expect(m.keywords.sort()).toEqual(["impact", "ranged"]);
    expect(buildMachineCard(m, null).mana_cost).toBe(2);
  });

  it("additionne les X d'une même capacité au même déclencheur (Impact 1 + 1 = Impact 2)", () => {
    let m = appliquerInvention(null, { attack: 0, health: 0, grantAbilityId: "impact", grantX: 1 });
    m = appliquerInvention(m, { attack: 0, health: 0, grantAbilityId: "impact", grantX: 1 });
    expect(instancesDe(m, "impact")).toEqual([{ id: "impact", x: 2 }]);
  });

  it("additionne aussi les Y d'une capacité à couple", () => {
    let m = appliquerInvention(null, { attack: 0, health: 0, grantAbilityId: "renforcement", grantX: 1, grantY: 2, grantMode: "end_of_turn" });
    m = appliquerInvention(m, { attack: 0, health: 0, grantAbilityId: "renforcement", grantX: 2, grantY: 1, grantMode: "end_of_turn" });
    expect(instancesDe(m, "renforcement")).toEqual([{ id: "renforcement", mode: "end_of_turn", x: 3, y: 3 }]);
  });

  it("garde deux capacités distinctes pour deux déclencheurs différents", () => {
    let m = appliquerInvention(null, { attack: 0, health: 0, grantAbilityId: "impact", grantX: 1 });
    m = appliquerInvention(m, { attack: 0, health: 0, grantAbilityId: "impact", grantX: 2, grantMode: "death" });
    expect(instancesDe(m, "impact")).toEqual([{ id: "impact", x: 1 }, { id: "impact", mode: "death", x: 2 }]);
    expect(m.keywords).toEqual(["impact"]);
  });

  it("ne double jamais une capacité permanente sans X (Vol + Vol = Vol)", () => {
    let m = appliquerInvention(null, { attack: 1, health: 0, grantAbilityId: "ranged", grantX: 1 });
    m = appliquerInvention(m, { attack: 1, health: 0, grantAbilityId: "ranged", grantMode: "death" });
    expect(m.keywords).toEqual(["ranged"]);
    expect(m.keyword_instances).toEqual([]);
    expect(m.attack).toBe(2);
  });

  it("accepte une Invention sans capacité (stats seules)", () => {
    const m = appliquerInvention(null, { attack: 1, health: 1 });
    expect([m.attack, m.health, m.inventions]).toEqual([1, 2, 1]);
    expect(m.keywords).toEqual([]);
  });

  it(`ignore EN ENTIER la ${MAX_INVENTIONS_MACHINE + 1}e Invention (machine complète)`, () => {
    let m: MachineState | null = null;
    for (let i = 0; i < MAX_INVENTIONS_MACHINE; i++) m = appliquerInvention(m, { attack: 1, health: 1 });
    const pleine = m!;
    const apres = appliquerInvention(pleine, { attack: 5, health: 5, grantAbilityId: "ranged" });
    expect(apres).toEqual(pleine);
    expect(buildMachineCard(apres, null).mana_cost).toBe(MAX_INVENTIONS_MACHINE);
  });

  it("ne modifie pas la machine reçue (aucune mutation)", () => {
    const avant = appliquerInvention(null, { attack: 1, health: 0, grantAbilityId: "impact", grantX: 1 });
    const copie = JSON.parse(JSON.stringify(avant));
    appliquerInvention(avant, { attack: 1, health: 1, grantAbilityId: "impact", grantX: 1 });
    expect(avant).toEqual(copie);
  });

  it("est alimentée par un SORT", () => {
    const s = jouer(mkState(), planDAtelier({ attack: 1, health: 2, grantAbilityId: "ranged" }));
    const m = machine(s)!;
    expect([m.attack, m.health, m.inventions]).toEqual([1, 3, 1]);
    expect(m.keywords).toEqual(["ranged"]);
  });

  it("se déclenche aussi à la MORT de l'inventeur", () => {
    let s = mkState();
    const insecte = inventeur({ attack: 1, health: 1 }, "death");
    insecte.currentHealth = 1;
    s.players[0].board.push(insecte);
    const tueur = mkInstance(mkCard({
      name: "Éclair", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "impact", amount: 3 }],
    }));
    s = jouer(s, tueur, insecte.instanceId);
    expect(machine(s)?.inventions).toBe(1);
  });

  it("n'alimente que la machine du joueur qui déclenche", () => {
    const s = jouer(mkState(), inventeur({ attack: 1, health: 1 }));
    expect(s.players[1].machine ?? null).toBeNull();
  });
});

describe("Invention — prise en main", () => {
  const avecMachine = (): GameState => {
    let s = jouer(mkState(), inventeur({ attack: 2, health: 1, grantAbilityId: "impact", grantX: 1 }));
    s = jouer(s, inventeur({ attack: 1, health: 0, grantAbilityId: "ranged" }));
    return s;
  };

  it("met la machine en main et repart d'une machine vierge, compteur visible", () => {
    const s = avecMachine();
    const next = applyAction(s, { type: "take_machine" });
    const carte = next.players[0].hand.at(-1)!.card;
    expect(carte.machine).toBe(true);
    expect([carte.attack, carte.health, carte.mana_cost]).toEqual([3, 2, 2]);
    expect(next.players[0].machine).toEqual(machineVierge());
  });

  it("la carte reçue porte ses capacités : Vol permanent, Impact à l'arrivée", () => {
    const next = applyAction(avecMachine(), { type: "take_machine" });
    const caps = getCapabilities(next.players[0].hand.at(-1)!.card);
    expect(caps.find((c) => c.abilityId === "ranged")?.trigger).toBe("automatic");
    const impact = caps.find((c) => c.abilityId === "impact");
    expect(impact?.trigger).toBe("on_play");
    expect(impact?.params?.x).toBe(1);
  });

  it("jouée, la machine résout son Impact 1 et garde Vol sur le plateau", () => {
    let s = applyAction(avecMachine(), { type: "take_machine" });
    const cible = mkInstance(mkCard({ name: "Cible", attack: 0, health: 3 }));
    s.players[1].board.push(cible);
    const carte = s.players[0].hand.at(-1)!;
    s.players[0].mana = 10;
    s = applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: cible.instanceId });
    expect(s.players[1].board.find((c) => c.instanceId === cible.instanceId)?.currentHealth).toBe(2);
    const posee = s.players[0].board.find((c) => c.card.machine);
    expect(posee?.card.keywords).toContain("ranged");
    expect([posee?.currentAttack, posee?.currentHealth]).toEqual([3, 2]);
  });

  describe("gardes (le moteur rejoue chez l'adversaire)", () => {
    it("refuse sans machine, ou machine vierge", () => {
      const s = mkState();
      expect(takeMachine(s, { type: "take_machine" })).toBe(s);
      s.players[0].machine = machineVierge();
      expect(takeMachine(s, { type: "take_machine" })).toBe(s);
    });

    it("refuse main pleine SANS perdre la machine", () => {
      const s = avecMachine();
      while (s.players[0].hand.length < MAX_HAND_SIZE) s.players[0].hand.push(mkInstance(mkCard({})));
      expect(takeMachine(s, { type: "take_machine" })).toBe(s);
      expect(s.players[0].machine?.inventions).toBe(2);
    });
  });

  it("est déterministe : même état, même instance en main", () => {
    const a = applyAction(avecMachine(), { type: "take_machine" });
    const b = applyAction(avecMachine(), { type: "take_machine" });
    expect(a.players[0].hand.at(-1)!.card).toEqual(b.players[0].hand.at(-1)!.card);
  });
});
