// PV de départ par héros — et plafond de TOUS les soins du héros à ce maximum.
import { describe, expect, it } from "vitest";
import { applyAction, initializeGame } from "./engine";
import { HERO_MAX_HP } from "./constants";
import { pvDeDepart, pvDeDepartValides } from "./hero-hp";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, HeroDefinition, Keyword } from "./types";

const heros = (startingHp?: number | null): HeroDefinition => ({
  id: 1, name: "H", race: "humans", powerName: "P", powerCost: 2,
  powerEffect: {} as HeroDefinition["powerEffect"], powerDescription: "", startingHp,
});
const deck = () => [{ card: mkCard({ name: "D" }), quantity: 20 }];

describe("PV de départ par héros", () => {
  it("héros sans valeur, ou sans héros : 30, la valeur historique", () => {
    const s = initializeGame("a", "b", deck(), deck(), 0, 1, heros(), null);
    expect(s.players.map(p => [p.hero.hp, p.hero.maxHp])).toEqual([[HERO_MAX_HP, HERO_MAX_HP], [HERO_MAX_HP, HERO_MAX_HP]]);
  });

  it("chaque héros démarre à SES PV, qui sont aussi son maximum", () => {
    const s = initializeGame("a", "b", deck(), deck(), 0, 1, heros(25), heros(36));
    expect([s.players[0].hero.hp, s.players[0].hero.maxHp]).toEqual([25, 25]);
    expect([s.players[1].hero.hp, s.players[1].hero.maxHp]).toEqual([36, 36]);
  });

  it("une valeur hors bornes retombe sur 30", () => {
    expect(pvDeDepart(heros(12))).toBe(HERO_MAX_HP);
    expect(pvDeDepart(heros(41))).toBe(HERO_MAX_HP);
    expect(pvDeDepart(heros(27.5))).toBe(HERO_MAX_HP);
    expect([20, 40].every(pvDeDepartValides)).toBe(true);
  });
});

describe("soins du héros plafonnés à son maximum", () => {
  it("Drain de vie ne fait pas dépasser les PV de départ", () => {
    const s = mkState();
    s.players[0].hero.maxHp = 25;
    s.players[0].hero.hp = 23;
    const vampire = mkInstance(mkCard({
      name: "Vampire", attack: 5, health: 5,
      keywords: ["drain_de_vie"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "drain_de_vie" as Keyword }],
    }));
    s.players[0].board.push(vampire);
    const next = applyAction(s, { type: "attack", attackerInstanceId: vampire.instanceId, targetInstanceId: "enemy_hero" } as GameAction);
    expect(next.players[1].hero.hp, "l'attaque a porté").toBe(s.players[1].hero.hp - 5);
    expect(next.players[0].hero.hp).toBe(25);
  });
});
