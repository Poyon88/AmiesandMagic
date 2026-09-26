// SILENCE et DÉCHAINEMENT en contenus composés.
//
// Les deux existaient en mécanique de SORT uniquement, et le catalogue les
// rangeait parmi les « singulières sans équivalent composé ». Les ouvrir aux
// effets composés leur donne ce que la forme curée n'a jamais eu : tous les
// déclencheurs (dont une créature à l'entrée, à la mort, à l'activation) et,
// pour le Silence, une CIBLE déclarée — « toutes les unités ennemies »,
// « une au hasard » — là où le sort n'en visait qu'une, au choix.
//
// Ce qui est verrouillé : le corps du Silence est bien le même que celui du
// sort (une seule fonction, pas deux copies qui divergeront), et Déchainement
// lit son couple X/Y dans l'amplitude composée.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, ComposedEffect, GameState } from "./types";

function porteuse(composed: ComposedEffect, nom = "Porteuse"): CardInstance {
  const caps: Capability[] = [{
    uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed", composed,
  }];
  return mkInstance(mkCard({ name: nom, attack: 1, health: 3, capabilities: caps as never }));
}

function jouer(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

/** Cible richement dotée : tout doit disparaître d'un coup. */
function cibleDotee(): CardInstance {
  const c = mkInstance(mkCard({
    name: "Champion", attack: 3, health: 5,
    keywords: ["taunt", "divine_shield", "premiere_frappe"] as never,
    keyword_instances: [{ id: "resistance", x: 2 }] as never,
    capabilities: [{ uid: "cw_0", trigger: "automatic", effectKind: "immediate", abilityId: "taunt" }] as never,
  }));
  c.hasDivineShield = true;
  c.isParalyzed = true;
  c.fureurActive = true;
  c.fureurATKBonus = 2;
  // Gains cuits dans la carte (Gloire, Renforcement) : le Silence les reprend.
  c.card = { ...c.card, attack: 6, health: 9 };
  c.currentAttack = 8;
  c.currentHealth = 9;
  c.maxHealth = 9;
  c.baseAttack = 3;
  c.baseHealth = 5;
  return c;
}

describe("Silence composé", () => {
  const silence = (side: "ally" | "enemy" | "any", count: number | "all" = 1): ComposedEffect => ({
    content: "silence",
    target: { entity: "unit", side, count, location: "board", designation: count === "all" ? "automatic" : "random" },
  });

  it("retire les pouvoirs, les états et les gains de stats", () => {
    const s = mkState();
    const champion = cibleDotee();
    s.players[1].board.push(champion);
    const apres = jouer(s, porteuse(silence("enemy")));
    const muet = apres.players[1].board.find((c) => c.instanceId === champion.instanceId)!;
    expect(muet.card.keywords).toEqual([]);
    expect(muet.card.keyword_instances).toBeNull();
    expect(muet.card.capabilities).toBeNull();
    expect(muet.hasDivineShield).toBe(false);
    expect(muet.isParalyzed).toBe(false);
    expect(muet.fureurActive).toBe(false);
    expect(muet.fureurATKBonus).toBe(0);
  });

  it("ramène les stats aux valeurs IMPRIMÉES", () => {
    const s = mkState();
    const champion = cibleDotee();
    s.players[1].board.push(champion);
    const muet = jouer(s, porteuse(silence("enemy"))).players[1].board[0];
    expect(muet.currentAttack).toBe(3);
    expect(muet.maxHealth).toBe(5);
  });

  it("frappe TOUT un camp quand la cible le dit — ce que le sort ne savait pas faire", () => {
    const s = mkState();
    for (const nom of ["A", "B", "C"]) {
      s.players[1].board.push(mkInstance(mkCard({ name: nom, attack: 2, health: 2, keywords: ["taunt"] as never })));
    }
    const apres = jouer(s, porteuse(silence("enemy", "all")));
    for (const c of apres.players[1].board) expect(c.card.keywords).toEqual([]);
  });

  it("le camp ALLIÉ est atteignable aussi (la cible est déclarée, pas imposée)", () => {
    const s = mkState();
    const allie = mkInstance(mkCard({ name: "Allié", attack: 2, health: 2, keywords: ["taunt"] as never }));
    s.players[0].board.push(allie);
    const apres = jouer(s, porteuse(silence("ally", "all")));
    const muet = apres.players[0].board.find((c) => c.instanceId === allie.instanceId)!;
    expect(muet.card.keywords).toEqual([]);
  });
});

describe("Déchainement composé", () => {
  /** Collection de sorts à coût connu : chacun inflige 1 dégât au héros adverse. */
  function collectionDeSorts(cout: number, n = 6): Card[] {
    return Array.from({ length: n }, (_, i) => mkCard({
      id: 9500 + i, name: `Éclair${i}`, card_type: "spell", attack: null, health: null,
      mana_cost: cout, faction: "Mercenaires", rarity: "Commune",
      spell_keywords: [{ id: "pillage", amount: 1 }] as never,
    }));
  }

  it("lance X sorts du coût demandé", () => {
    const s = mkState();
    s.allSpellsPool = collectionDeSorts(3);
    s.players[1].hand = Array.from({ length: 5 }, (_, i) => mkInstance(mkCard({ name: `Main${i}` })));
    initRNG(11);
    const apres = jouer(s, porteuse({ content: "dechainement", magnitude: { x: 3, y: 3 } }));
    // Pillage 1 fait défausser l'adversaire : trois actions ⇒ trois cartes.
    expect(5 - apres.players[1].hand.length).toBe(3);
  });

  it("aucun sort au coût demandé : rien ne se passe, en silence", () => {
    const s = mkState();
    s.allSpellsPool = collectionDeSorts(3);
    s.players[0].hero.hp = 30;
    const apres = jouer(s, porteuse({ content: "dechainement", magnitude: { x: 2, y: 7 } }));
    expect(apres.players[0].hero.hp).toBe(30);
  });

  it("X = 0 ne déchaine rien", () => {
    const s = mkState();
    s.allSpellsPool = collectionDeSorts(3);
    s.players[0].hero.hp = 30;
    const apres = jouer(s, porteuse({ content: "dechainement", magnitude: { x: 0, y: 3 } }));
    expect(apres.players[0].hero.hp).toBe(30);
  });
});

describe("Ce que les cartes annoncent", () => {
  it("Silence et Déchainement se décrivent en français", async () => {
    const { describeComposedCap, composedValueText } = await import("./composed-display");
    const capDe = (composed: ComposedEffect) => ({
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed", composed,
    } as never);

    expect(describeComposedCap(capDe({
      content: "silence",
      target: { entity: "unit", side: "enemy", count: "all", location: "board", designation: "automatic" },
    }))).toBe("Réduit au silence toutes les unités ennemies.");

    expect(describeComposedCap(capDe({ content: "dechainement", magnitude: { x: 2, y: 3 } })))
      .toBe("Joue 2 actions aléatoires de coût 3.");

    // « ? » sur Y : le coût devient un plafond, le texte doit le dire.
    expect(describeComposedCap(capDe({ content: "dechainement", magnitude: { x: 2, y: 4, randomY: true } })))
      .toBe("Joue 2 actions aléatoires de coût 1 à 4.");

    // Couple NEUTRE peint « 2/3 », jamais « +2/+3 ».
    expect(composedValueText(capDe({ content: "dechainement", magnitude: { x: 2, y: 3 } }))).toBe("2/3");
  });
});
