// Riposte X : « Quand cette unité subit des dégâts, inflige X dégâts à la source
// de l'attaque (unité OU héros). » Désormais centralisé dans
// dealDamageToCreature → se déclenche sur TOUTE source (combat, sort, zone,
// souffle), plus seulement le combat. On vérifie le combat, les sorts (source =
// héros lanceur), le souffle de feu (zone), et l'absence de boucle riposte↔riposte.
import { describe, expect, it } from "vitest";
import { applyAction, attack, playCard } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

// riposteX est normalement fixé à l'invocation (playCard). Les tests posent les
// créatures directement sur le plateau, donc on le règle à la main.
function riposter(name: string, atk: number, health: number, x: number) {
  const c = mkInstance(mkCard({ name, attack: atk, health, keywords: ["riposte"] as never }));
  c.riposteX = x;
  return c;
}

describe("Riposte — déclenchement sur toutes les sources de dégât", () => {
  it("COMBAT : l'attaquant subit la riposte EN PLUS de la contre-attaque normale, une seule fois", () => {
    const s = mkState();
    const atk = mkInstance(mkCard({ name: "Attaquant", attack: 4, health: 10 }));
    atk.hasSummoningSickness = false;
    const rip = riposter("Épineux", 2, 10, 3);
    s.players[0].board.push(atk);
    s.players[1].board.push(rip);

    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: rip.instanceId });

    const atkAfter = next.players[0].board.find((c) => c.instanceId === atk.instanceId)!;
    const ripAfter = next.players[1].board.find((c) => c.instanceId === rip.instanceId)!;
    // Attaquant : 10 - contre-attaque(2) - riposte(3) = 5.
    expect(atkAfter.currentHealth).toBe(5);
    // Défenseur : 10 - attaque(4) = 6.
    expect(ripAfter.currentHealth).toBe(6);
  });

  it("SORT : une créature avec Riposte touchée par un sort renvoie X au HÉROS lanceur", () => {
    const s = mkState();
    const rip = riposter("Épineux", 0, 5, 3);
    s.players[1].board.push(rip); // créature ennemie

    const spell = mkInstance(mkCard({
      name: "Éclair", card_type: "spell", attack: null, health: null,
      spell_effect: { type: "deal_damage", target: "any_creature", amount: 2 } as never,
    }));
    s.players[0].hand.push(spell);

    const heroBefore = s.players[0].hero.hp; // héros lanceur = P1 (index 0)
    const next = playCard(s, {
      type: "play_card", cardInstanceId: spell.instanceId, targetInstanceId: rip.instanceId,
    });

    // La cible a bien pris 2 dégâts…
    const ripAfter = next.players[1].board.find((c) => c.instanceId === rip.instanceId)!;
    expect(ripAfter.currentHealth).toBe(3);
    // …et le héros lanceur a encaissé la riposte (3).
    expect(heroBefore - next.players[0].hero.hp).toBe(3);
  });

  it("SOUFFLE DE FEU (zone) : la riposte frappe l'attaquant, même en attaquant le héros", () => {
    const s = mkState();
    // mana_cost 4 → souffle X = max(1, floor(4/2)) = 2.
    const atk = mkInstance(mkCard({ name: "Dragon", attack: 5, health: 10, mana_cost: 4, keywords: ["souffle_de_feu"] as never }));
    atk.hasSummoningSickness = false;
    const rip = riposter("Épineux", 0, 10, 3);
    s.players[0].board.push(atk);
    s.players[1].board.push(rip);

    const heroBefore = s.players[1].hero.hp;
    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: "enemy_hero" });

    const atkAfter = next.players[0].board.find((c) => c.instanceId === atk.instanceId)!;
    const ripAfter = next.players[1].board.find((c) => c.instanceId === rip.instanceId)!;
    // L'attaquant a pris la riposte (3) déclenchée par le souffle de zone.
    expect(atkAfter.currentHealth).toBe(7);
    // La créature ennemie a pris le souffle (2).
    expect(ripAfter.currentHealth).toBe(8);
    // Le héros a bien pris l'attaque directe (5).
    expect(heroBefore - next.players[1].hero.hp).toBe(5);
  });

  it("SORT COMPOSÉ (scatter) : la source est un sort → la riposte vise le héros lanceur", () => {
    const s = mkState();
    s.rngState = 1;
    // Un seul ennemi (la créature Riposte) : les 2 points de scatter tombent
    // forcément dessus → 2 instances de dégât → 2 ripostes de 3 = 6 au héros.
    const rip = riposter("Épineux", 0, 5, 3);
    s.players[1].board.push(rip);
    const spell = mkInstance(mkCard({
      name: "Pluie", mana_cost: 1, card_type: "spell", attack: null, health: null,
      capabilities: [{
        uid: "sk_0", trigger: "spell_resolution", abilityId: "_composed", effectKind: "immediate",
        composed: {
          target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "scatter" },
          content: "deal_damage", magnitude: { x: 2 },
        },
      }] as never,
    }));
    s.players[0].hand.push(spell);

    const heroBefore = s.players[0].hero.hp;
    const next = applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });

    const ripAfter = next.players[1].board.find((c) => c.instanceId === rip.instanceId)!;
    expect(5 - ripAfter.currentHealth).toBe(2);            // a pris les 2 points
    expect(heroBefore - next.players[0].hero.hp).toBe(6);  // 2 ripostes de 3
  });

  it("Riposte vs Riposte : pas de boucle infinie, dégâts bornés (contre-riposte non re-déclenchée)", () => {
    const s = mkState();
    const atk = riposter("Attaquant", 3, 10, 2);
    atk.hasSummoningSickness = false;
    const def = riposter("Défenseur", 1, 10, 2);
    s.players[0].board.push(atk);
    s.players[1].board.push(def);

    const next = attack(s, { type: "attack", attackerInstanceId: atk.instanceId, targetInstanceId: def.instanceId });

    const atkAfter = next.players[0].board.find((c) => c.instanceId === atk.instanceId)!;
    const defAfter = next.players[1].board.find((c) => c.instanceId === def.instanceId)!;
    // atk : 10 - contre-attaque(1) - riposte-de-def(2) = 7.
    expect(atkAfter.currentHealth).toBe(7);
    // def : 10 - attaque(3) - riposte-de-atk(2) = 5.
    expect(defAfter.currentHealth).toBe(5);
  });
});
