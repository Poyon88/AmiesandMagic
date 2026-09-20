// OBJETS, LOT 4b — le plateau.
//
// Ces tests portent sur le FLUX CLIENT, pas sur le rendu : ce que le magasin
// arme, ce qu'il propose comme cibles, et ce qu'il dispatche. Le moteur est
// déjà couvert par `items-equipement.test.ts` ; ici on vérifie qu'on peut
// l'atteindre à la souris, et qu'on ne peut PAS l'atteindre quand il refuserait.
//
// La règle « un objet par créature » est tenue par le moteur, qui refuse
// l'action. La refléter dans `validTargets` n'est pas une redondance : sans
// cela, le joueur viserait une créature déjà équipée, le moteur refuserait, et
// rien à l'écran n'expliquerait pourquoi son clic n'a rien fait.
import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { useGameStore } from "./gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import type { Card, CardInstance, GameState } from "@/lib/game/types";

// Environnement `node` : on rend un document vide, `getElementCenter` retombe
// alors sur sa sentinelle. Même convention que death-wave-order.test.ts — le
// magasin planifie des animations et interroge le DOM au dispatch.
if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = {
    querySelectorAll: () => [] as unknown as NodeListOf<Element>,
    querySelector: () => null,
  };
}

const objet = (name: string, equipCost = 0, over: Partial<Card> = {}): CardInstance =>
  mkInstance(mkCard({
    name, card_type: "item", mana_cost: 0, attack: 2, health: 1,
    faction: "Humains", equip_cost: equipCost, ...over,
  }));

const creature = (name: string): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: 1, health: 3, faction: "Humains" }));

/** Installe une partie où c'est à P1 de jouer, avec ses objets et ses unités. */
function table(items: CardInstance[], board: CardInstance[], mana = 10): GameState {
  const s = mkState();
  s.players[0].board = board;
  s.players[0].items = items;
  s.players[0].mana = mana;
  return s;
}

const poser = (s: GameState) =>
  useGameStore.setState({ gameState: s, localPlayerId: s.players[0].id, isAnimating: false });

describe("Armer l'équipement", () => {
  beforeEach(() => {
    useGameStore.setState({ targetingMode: "none", validTargets: [], pendingEquipItemId: null });
  });

  it("le clic sur un objet arme le ciblage et propose les alliées LIBRES", () => {
    const epee = objet("Épée");
    const a = creature("Soldat"), b = creature("Garde");
    poser(table([epee], [a, b]));

    useGameStore.getState().startEquipItem(epee.instanceId);

    const s = useGameStore.getState();
    expect(s.targetingMode).toBe("equip");
    expect(s.pendingEquipItemId).toBe(epee.instanceId);
    expect(s.validTargets.sort()).toEqual([a.instanceId, b.instanceId].sort());
  });

  it("une créature DÉJÀ équipée n'est pas proposée", () => {
    const epee = objet("Épée"), bouclier = objet("Bouclier");
    const a = creature("Soldat"), b = creature("Garde");
    epee.equippedToInstanceId = a.instanceId;
    poser(table([epee, bouclier], [a, b]));

    useGameStore.getState().startEquipItem(bouclier.instanceId);
    expect(useGameStore.getState().validTargets).toEqual([b.instanceId]);
  });

  it("un objet introuvable n'arme rien", () => {
    poser(table([objet("Épée")], [creature("Soldat")]));
    useGameStore.getState().startEquipItem("fantome");
    expect(useGameStore.getState().targetingMode).toBe("none");
  });

  it("armer l'équipement abandonne une sélection en cours", () => {
    // Les modes de ciblage sont exclusifs : laisser un attaquant sélectionné
    // ferait résoudre la branche d'attaque au clic suivant.
    const epee = objet("Épée");
    const a = creature("Soldat");
    poser(table([epee], [a]));
    useGameStore.setState({ selectedAttackerInstanceId: a.instanceId });

    useGameStore.getState().startEquipItem(epee.instanceId);
    expect(useGameStore.getState().selectedAttackerInstanceId).toBeNull();
  });
});

describe("Conclure l'équipement", () => {
  beforeEach(() => {
    useGameStore.setState({ targetingMode: "none", validTargets: [], pendingEquipItemId: null });
  });

  it("le clic sur la cible dispatche l'action et désarme", () => {
    const epee = objet("Épée", 2);
    const a = creature("Soldat");
    poser(table([epee], [a]));

    useGameStore.getState().startEquipItem(epee.instanceId);
    const action = useGameStore.getState().selectTarget(a.instanceId);

    expect(action).toMatchObject({
      type: "equip_item", itemInstanceId: epee.instanceId, targetInstanceId: a.instanceId,
    });
    const apres = useGameStore.getState();
    expect(apres.targetingMode).toBe("none");
    expect(apres.pendingEquipItemId).toBeNull();
    expect(apres.validTargets).toEqual([]);
  });

  it("l'état du jeu reflète l'équipement", () => {
    // `dispatchAction` PLANIFIE l'état final derrière ses phases d'animation :
    // le lire tout de suite rend l'état d'AVANT. Faux temps + `runAllTimers`,
    // comme death-wave-order.test.ts.
    vi.useFakeTimers();
    const epee = objet("Épée", 2);
    const a = creature("Soldat");
    poser(table([epee], [a]));

    useGameStore.getState().startEquipItem(epee.instanceId);
    useGameStore.getState().selectTarget(a.instanceId);
    vi.runAllTimers();

    const gs = useGameStore.getState().gameState!;
    expect(gs.players[0].items![0].equippedToInstanceId).toBe(a.instanceId);
    expect(gs.players[0].board[0].currentAttack).toBe(1 + 2);
    expect(gs.players[0].mana).toBe(8);
    vi.useRealTimers();
  });

  it("l'équipement s'ANNULE librement — rien n'a été révélé", () => {
    const epee = objet("Épée");
    poser(table([epee], [creature("Soldat")]));

    useGameStore.getState().startEquipItem(epee.instanceId);
    useGameStore.getState().clearSelection();

    const s = useGameStore.getState();
    expect(s.targetingMode).toBe("none");
    expect(s.pendingEquipItemId).toBeNull();
  });
});

describe("Sacrifier depuis le plateau", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("l'objet part au cimetière et libère sa place", () => {
    const epee = objet("Épée");
    poser(table([epee], [creature("Soldat")]));

    const action = useGameStore.getState().sacrificeItem(epee.instanceId);
    expect(action).toMatchObject({ type: "sacrifice_item", itemInstanceId: epee.instanceId });
    vi.runAllTimers();

    const gs = useGameStore.getState().gameState!;
    expect(gs.players[0].items ?? []).toHaveLength(0);
    expect(gs.players[0].graveyard.map(c => c.card.name)).toEqual(["Épée"]);
  });
});

describe("Le sacrifice ne doit PAS être à portée de réflexe", () => {
  const SRC = fs.readFileSync(
    path.join(process.cwd(), "src/components/game/BoardItem.tsx"), "utf8");

  it("aucun clic droit sur la vignette d'objet", () => {
    // Le sacrifice y était, et c'était une faute : le clic droit a déjà deux
    // sens dans le jeu — annuler un ciblage (GameBoard) et afficher le détail
    // d'une carte (GameCard). Un joueur qui armait l'équipement puis se ravisait
    // faisait clic droit pour annuler, curseur encore sur l'objet, et le
    // détruisait. Irréversible, gratuit, sans confirmation. Signalé en partie.
    expect(SRC).not.toContain("onContextMenu");
  });

  it("le sacrifice se confirme en DEUX temps", () => {
    // Une action irréversible ne part pas au premier clic. L'armement se
    // désarme seul (minuteur) et au départ du curseur, sinon une question
    // oubliée resterait en embuscade.
    expect(SRC).toContain("Sûr ?");
    expect(SRC).toMatch(/if \(arme\)[^\n]*onSacrifice/);
    expect(SRC).toContain("setTimeout(() => setArme(false)");
    expect(SRC).toContain("onMouseLeave");
  });

  it("la croix n'arme jamais l'équipement au passage", () => {
    // Elle est POSÉE SUR la vignette, dont le clic équipe : sans
    // `stopPropagation`, sacrifier commencerait par ouvrir un ciblage.
    expect(SRC).toContain("e.stopPropagation()");
  });
});
