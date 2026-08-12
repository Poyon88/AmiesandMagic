// « Se renvoie en main » (composé : content `bounce` + `entity: "self"`) doit
// partir sur TOUS ses déclencheurs, pas seulement à la mort.
//
// Constaté en partie avec « Louve kiptchake » (Impact 1 + Ombre + Remontée sur
// on_attack) : la capacité ne se déclenchait jamais. Le chemin composé route un
// `bounce` vers `resolveRemontee`, dont le filtre `canBeRemonteed` ÉCARTE la
// source — un garde-fou écrit pour l'autre intention (« je renvoie une AUTRE
// créature »). La cible étant ici la source elle-même, la liste était vide et
// l'effet un no-op silencieux. Le cas avait déjà été repéré pour `on_death`
// (wantsSelfReturnOnDeath) mais pour lui seul.
//
// La Louve cumulait d'ailleurs deux causes de rejet : elle est aussi Ombre, et
// `canBeRemonteed` exclut une Ombre non révélée.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

/** Capacité telle qu'elle est réellement persistée par la forge (relevé en base
 *  sur la carte Louve kiptchake) : `side: "enemy"` y est incohérent avec
 *  `entity: "self"`, mais le moteur traite `self` avant de lire `side` — le test
 *  garde la donnée réelle pour rester fidèle au bug rapporté. */
const autoRenvoiSurAttaque = (): Capability[] => ([
  {
    uid: "cx_0", trigger: "on_attack", abilityId: "_composed", effectKind: "immediate",
    composed: {
      content: "bounce",
      magnitude: { x: 1 },
      target: { side: "enemy", count: 1, entity: "self", location: "board", designation: "automatic" },
    },
  },
] as unknown as Capability[]);

const louve = () => mkInstance(mkCard({
  name: "Louve kiptchake", mana_cost: 2, attack: 2, health: 1,
  keywords: ["impact", "ombre"] as never,
  capabilities: autoRenvoiSurAttaque(),
}));

/** Louve prête à attaquer, face à une créature ennemie assez grosse pour la tuer
 *  si le combat avait lieu — c'est tout l'intérêt de la capacité. */
function table() {
  const s: GameState = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  const l = louve();
  l.hasSummoningSickness = false;
  s.players[0].board.push(l);
  s.players[1].board.push(mkInstance(mkCard({ name: "Colosse", attack: 5, health: 8 })));
  return { s, louve: l, colosse: s.players[1].board[0] };
}

describe("Auto-renvoi à l'attaque", () => {
  it("la Louve quitte le plateau et revient en main", () => {
    const { s, louve: l, colosse } = table();

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: l.instanceId, targetInstanceId: colosse.instanceId,
    });

    expect(st.players[0].board.map((c) => c.card.name)).not.toContain("Louve kiptchake");
    expect(st.players[0].hand.map((c) => c.card.name)).toContain("Louve kiptchake");
  });

  it("elle part AVANT les dégâts : elle ne subit pas la riposte du Colosse", () => {
    const { s, louve: l, colosse } = table();

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: l.instanceId, targetInstanceId: colosse.instanceId,
    });

    // 1 PV face à 5 d'attaque : si le combat avait eu lieu, elle serait au
    // cimetière et non en main.
    expect(st.players[0].graveyard.map((c) => c.card.name)).not.toContain("Louve kiptchake");
    const enMain = st.players[0].hand.find((c) => c.card.name === "Louve kiptchake")!;
    expect(enMain.currentHealth).toBe(1);
    // Et le Colosse n'a rien pris non plus : l'attaquante n'était plus là.
    expect(st.players[1].board[0].currentHealth).toBe(8);
  });

  it("Ombre non révélée n'empêche pas l'auto-renvoi", () => {
    // C'est l'un des deux motifs de rejet de canBeRemonteed. On force l'état
    // « non révélée » pour vérifier que le nouveau chemin ne le consulte plus.
    const { s, louve: l, colosse } = table();
    l.ombreRevealed = false;

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: l.instanceId, targetInstanceId: colosse.instanceId,
    });

    expect(st.players[0].hand.map((c) => c.card.name)).toContain("Louve kiptchake");
  });

  it("Ancré, lui, retient la créature : la capacité ne la déplace pas", () => {
    const { s, colosse } = table();
    // Assez endurante pour SURVIVRE aux 5 dégâts du Colosse : sinon elle
    // quitterait le plateau par le combat, et le test ne dirait rien d'Ancré.
    const ancree = mkInstance(mkCard({
      name: "Ancrée", mana_cost: 2, attack: 2, health: 9,
      keywords: ["ancre"] as never,
      capabilities: autoRenvoiSurAttaque(),
    }));
    ancree.hasSummoningSickness = false;
    s.players[0].board.push(ancree);

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: ancree.instanceId, targetInstanceId: colosse.instanceId,
    });

    expect(st.players[0].hand.map((c) => c.card.name)).not.toContain("Ancrée");
    expect(st.players[0].board.map((c) => c.card.name)).toContain("Ancrée");
  });
});

describe("Auto-renvoi — les autres intentions du `bounce` sont préservées", () => {
  it("un bounce visant une AUTRE unité continue d'exclure la source", () => {
    // `entity: "unit"`, désignation automatique, côté ennemi : la source ne doit
    // pas se renvoyer elle-même par ce chemin.
    const s: GameState = mkState();
    s.players[0].id = "MOI";
    s.players[1].id = "LUI";
    const lanceur = mkInstance(mkCard({
      name: "Lanceur", mana_cost: 3, attack: 2, health: 3,
      capabilities: [{
        uid: "cx_0", trigger: "on_attack", abilityId: "_composed", effectKind: "immediate",
        composed: {
          content: "bounce",
          target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "automatic" },
        },
      }] as unknown as Capability[],
    }));
    lanceur.hasSummoningSickness = false;
    s.players[0].board.push(lanceur);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 6 }));
    s.players[1].board.push(cible);

    const st = applyAction(s, {
      type: "attack", attackerInstanceId: lanceur.instanceId, targetInstanceId: cible.instanceId,
    });

    // C'est la cible ENNEMIE qui remonte, pas le lanceur.
    expect(st.players[1].hand.map((c) => c.card.name)).toContain("Cible");
    expect(st.players[0].board.map((c) => c.card.name)).toContain("Lanceur");
    expect(st.players[0].hand.map((c) => c.card.name)).not.toContain("Lanceur");
  });
});
