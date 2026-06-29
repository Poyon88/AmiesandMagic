// Conservation des bonus à travers les zones (main & cimetière). Quand une
// créature boostée est renvoyée en main (Remontée) ou récupérée du cimetière
// (Rappel / Exhumation / Résurrection), elle CONSERVE ses bonus permanents
// accumulés (au lieu d'être recréée à neuf), revient soignée à ses PV max
// boostés, et ses bonus d'aura/temporaires sont relâchés (recalculés sur le
// plateau). Voir returnInstanceToPlay dans engine.ts.
import { describe, expect, it } from "vitest";
import { playCard, attack } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

describe("Conservation des bonus — Remontée (bounce en main)", () => {
  it("garde les bonus permanents et revient à PV max boostés (soin complet)", () => {
    const s = mkState();
    const victim = mkInstance(mkCard({ name: "Veteran", attack: 3, health: 4 }));
    victim.necrophagieATKBonus = 2; // +2 ATK accumulé
    victim.necrophagiePVBonus = 2;  // +2 PV accumulé
    victim.currentHealth = 1;        // blessée avant le bounce
    s.players[0].board.push(victim);

    const bouncer = mkInstance(mkCard({ name: "Bouncer", mana_cost: 0, keywords: ["remontee"] }));
    s.players[0].hand.push(bouncer);

    const next = playCard(s, {
      type: "play_card", cardInstanceId: bouncer.instanceId, targetInstanceId: victim.instanceId,
    });

    const inHand = next.players[0].hand.find((c) => c.card.name === "Veteran")!;
    expect(inHand).toBeDefined();
    expect(inHand.necrophagieATKBonus).toBe(2);   // bonus conservé
    expect(inHand.necrophagiePVBonus).toBe(2);
    expect(inHand.currentAttack).toBe(5);          // 3 base + 2
    expect(inHand.maxHealth).toBe(6);              // 4 base + 2
    expect(inHand.currentHealth).toBe(6);          // soin complet
    // n'est plus sur le plateau
    expect(next.players[0].board.find((c) => c.card.name === "Veteran")).toBeUndefined();
  });

  it("relâche les bonus d'aura (non gelés dans la main)", () => {
    const s = mkState();
    const victim = mkInstance(mkCard({ name: "Aura", attack: 2, health: 2 }));
    victim.auraHealthBonus = 3;   // +3 PV venant d'une aura (Commandement)
    victim.maxHealth = 5;
    victim.currentHealth = 5;
    s.players[0].board.push(victim);

    const bouncer = mkInstance(mkCard({ name: "Bouncer", mana_cost: 0, keywords: ["remontee"] }));
    s.players[0].hand.push(bouncer);

    const next = playCard(s, {
      type: "play_card", cardInstanceId: bouncer.instanceId, targetInstanceId: victim.instanceId,
    });

    const inHand = next.players[0].hand.find((c) => c.card.name === "Aura")!;
    expect(inHand.auraHealthBonus).toBe(0);  // aura relâchée
    expect(inHand.maxHealth).toBe(2);        // base seule (pas l'aura gelée)
  });
});

describe("Conservation des bonus — Exhumation (cimetière → plateau)", () => {
  it("ressuscite avec ses bonus permanents et à PV pleins", () => {
    const s = mkState();
    const dead = mkInstance(mkCard({ name: "Goule", attack: 2, health: 2, mana_cost: 1 }));
    dead.necrophagieATKBonus = 3;
    dead.necrophagiePVBonus = 3;
    dead.grantedKeywordX = { fureur: 1 }; // mot-clé accordé à l'exécution
    dead.currentHealth = 0;               // morte
    s.players[0].graveyard.push(dead);

    // Exhumation X : x = max(1, mana_cost - 1) = 2 ≥ coût de la goule (1)
    const exhumer = mkInstance(mkCard({ name: "Necro", mana_cost: 3, keywords: ["exhumation"] }));
    s.players[0].hand.push(exhumer);

    const next = playCard(s, { type: "play_card", cardInstanceId: exhumer.instanceId });

    const revived = next.players[0].board.find((c) => c.card.name === "Goule")!;
    expect(revived).toBeDefined();
    expect(revived.necrophagieATKBonus).toBe(3);
    expect(revived.currentAttack).toBe(5);   // 2 + 3
    expect(revived.maxHealth).toBe(5);        // 2 + 3
    expect(revived.currentHealth).toBe(5);    // PV pleins
    expect(revived.grantedKeywordX.fureur).toBe(1); // mot-clé accordé conservé
    expect(next.players[0].graveyard.find((c) => c.card.name === "Goule")).toBeUndefined();
  });
});

describe("Conservation des bonus — Rappel (cimetière → main)", () => {
  it("remet en main en conservant les bonus permanents", () => {
    const s = mkState();
    const dead = mkInstance(mkCard({ name: "Revenant", attack: 1, health: 1 }));
    dead.summonBonusATK = 4;
    dead.necrophagiePVBonus = 2;
    s.players[0].graveyard.push(dead);

    const recaller = mkInstance(mkCard({ name: "Caller", mana_cost: 2, keywords: ["rappel"] }));
    s.players[0].hand.push(recaller);

    const next = playCard(s, { type: "play_card", cardInstanceId: recaller.instanceId });

    const inHand = next.players[0].hand.find((c) => c.card.name === "Revenant")!;
    expect(inHand).toBeDefined();
    expect(inHand.summonBonusATK).toBe(4);
    expect(inHand.currentAttack).toBe(5);  // 1 + 4
    expect(inHand.maxHealth).toBe(3);      // 1 + 2
    expect(inHand.currentHealth).toBe(3);
  });
});

describe("Remontée en mode mort — auto-renvoi en main (pas au cimetière)", () => {
  it("la créature qui meurt remonte ELLE-MÊME en main, bonus conservés, soin complet", () => {
    const s = mkState();
    const champ = mkInstance(mkCard({
      name: "Spectre", attack: 5, health: 5,
      keyword_instances: [{ id: "remontee", mode: "death" }],
    }));
    champ.necrophagieATKBonus = 2; // +2 ATK accumulé
    champ.necrophagiePVBonus = 2;  // +2 PV accumulé
    champ.currentHealth = 1;        // mourra de la riposte
    champ.hasSummoningSickness = false;
    s.players[0].board.push(champ);

    const blocker = mkInstance(mkCard({ name: "Blocker", attack: 3, health: 5 }));
    s.players[1].board.push(blocker);

    // Le Spectre attaque : 3 (riposte) avec 1 PV → meurt → remontée mode mort.
    const next = attack(s, {
      type: "attack", attackerInstanceId: champ.instanceId, targetInstanceId: blocker.instanceId,
    });

    const inHand = next.players[0].hand.find((c) => c.card.name === "Spectre")!;
    expect(inHand).toBeDefined();                 // bien revenu en main
    expect(inHand.necrophagieATKBonus).toBe(2);   // bonus conservé
    expect(inHand.currentAttack).toBe(7);          // 5 base + 2
    expect(inHand.maxHealth).toBe(7);              // 5 base + 2
    expect(inHand.currentHealth).toBe(7);          // soin complet
    // ni sur le plateau, ni au cimetière
    expect(next.players[0].board.find((c) => c.card.name === "Spectre")).toBeUndefined();
    expect(next.players[0].graveyard.find((c) => c.card.name === "Spectre")).toBeUndefined();
  });
});

describe("Remontée en mode mort — capacité composée bounce/self (cf. Ombre Insaisissable)", () => {
  it("la créature sacrifiée/morte remonte en main via un bounce composé on_death ciblant self", () => {
    const s = mkState();
    // Modèle « capabilities » : bounce de soi-même au déclencheur mort.
    const ombre = mkInstance(mkCard({
      name: "Ombre", attack: 1, health: 3,
      capabilities: [{
        uid: "cx_2", trigger: "on_death", abilityId: "_composed", effectKind: "immediate",
        composed: {
          target: { side: "enemy", count: 1, entity: "self", location: "board", designation: "choice" },
          content: "bounce", magnitude: { x: 1 },
        },
      }],
    } as Parameters<typeof mkCard>[0]));
    ombre.currentHealth = 1;        // mourra de la riposte
    ombre.hasSummoningSickness = false;
    s.players[0].board.push(ombre);

    const blocker = mkInstance(mkCard({ name: "Blocker", attack: 3, health: 5 }));
    s.players[1].board.push(blocker);

    const next = attack(s, {
      type: "attack", attackerInstanceId: ombre.instanceId, targetInstanceId: blocker.instanceId,
    });

    // Revenue en main, pas restée au cimetière.
    expect(next.players[0].hand.find((c) => c.card.name === "Ombre")).toBeDefined();
    expect(next.players[0].board.find((c) => c.card.name === "Ombre")).toBeUndefined();
    expect(next.players[0].graveyard.find((c) => c.card.name === "Ombre")).toBeUndefined();
  });
});

describe("Boucle self-bounce + auto-debuff — mort définitive à 0 PV (cf. Ombre Insaisissable)", () => {
  // Carte type Ombre Insaisissable : à la mort elle remonte en main (bounce
  // self), et au retour elle gagne +1 ATK et perd 1 PV permanent.
  const ombreCaps = [
    { uid: "d0", trigger: "on_death", abilityId: "_composed", effectKind: "immediate",
      composed: { target: { side: "enemy", count: 1, entity: "self", location: "board", designation: "choice" }, content: "bounce", magnitude: { x: 1 } } },
    { uid: "r0", trigger: "on_return", abilityId: "_composed", effectKind: "immediate",
      composed: { target: { side: "ally", count: 1, entity: "self", location: "board", designation: "choice" }, content: "buff", magnitude: { x: 1, y: 0 } } },
    { uid: "r1", trigger: "on_return", abilityId: "_composed", effectKind: "immediate",
      composed: { target: { side: "ally", count: 1, entity: "self", location: "board", designation: "choice" }, content: "debuff", magnitude: { x: 0, y: 1 } } },
  ];

  function killReturning(baseAtk: number, baseHp: number) {
    const s = mkState();
    const ombre = mkInstance(mkCard({ name: "Ombre", attack: baseAtk, health: baseHp, capabilities: ombreCaps } as Parameters<typeof mkCard>[0]));
    ombre.currentHealth = 1;        // mourra de la riposte
    ombre.hasSummoningSickness = false;
    s.players[0].board.push(ombre);
    const blocker = mkInstance(mkCard({ name: "Blocker", attack: 3, health: 5 }));
    s.players[1].board.push(blocker);
    return attack(s, { type: "attack", attackerInstanceId: ombre.instanceId, targetInstanceId: blocker.instanceId });
  }

  it("retour non terminal : 1/3 → 2/2 en main (PV permanente > 0, reste)", () => {
    const next = killReturning(1, 3);
    const inHand = next.players[0].hand.find((c) => c.card.name === "Ombre")!;
    expect(inHand).toBeDefined();
    expect(inHand.card.attack).toBe(2);  // +1 ATK
    expect(inHand.card.health).toBe(2);  // -1 PV cuit dans card
    expect(next.players[0].graveyard.find((c) => c.card.name === "Ombre")).toBeUndefined();
  });

  it("retour terminal : à 0 PV après le debuff, elle MEURT (cimetière, pas en main, pas de boucle)", () => {
    // Base 1/1 : retour → soin à 1 PV → buff +1 ATK → debuff -1 PV → 0 PV → mort.
    const next = killReturning(1, 1);
    expect(next.players[0].hand.find((c) => c.card.name === "Ombre")).toBeUndefined();
    expect(next.players[0].graveyard.find((c) => c.card.name === "Ombre")).toBeDefined();
    // Pas restée sur le plateau non plus.
    expect(next.players[0].board.find((c) => c.card.name === "Ombre")).toBeUndefined();
  });
});

describe("Conservation des bonus — Résurrection (revient à 1 PV)", () => {
  it("conserve l'ATK boostée mais revient à 1 PV (règle du mot-clé)", () => {
    const s = mkState();
    const champ = mkInstance(mkCard({
      name: "Phenix", attack: 5, health: 5, keywords: ["resurrection"],
    }));
    champ.necrophagieATKBonus = 2; // +2 ATK accumulé
    champ.currentHealth = 1;        // mourra de la riposte
    champ.hasSummoningSickness = false;
    s.players[0].board.push(champ);

    const blocker = mkInstance(mkCard({ name: "Blocker", attack: 3, health: 5 }));
    s.players[1].board.push(blocker);

    // Le Phénix attaque : il subit 3 (riposte) avec 1 PV → meurt → Résurrection.
    const next = attack(s, {
      type: "attack", attackerInstanceId: champ.instanceId, targetInstanceId: blocker.instanceId,
    });

    const revived = next.players[0].board.find((c) => c.card.name === "Phenix")!;
    expect(revived).toBeDefined();
    expect(revived.currentHealth).toBe(1);              // règle Résurrection : 1 PV
    expect(revived.necrophagieATKBonus).toBe(2);        // bonus conservé
    expect(revived.currentAttack).toBe(7);              // 5 base + 2
    expect(revived.card.keywords).not.toContain("resurrection"); // ne ressuscite qu'une fois
  });
});
