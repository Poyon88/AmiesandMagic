"use client";

// Banc de l'ORBITE du héros : le cas extrême de la maquette (tous les
// compteurs, trois types d'emblèmes, une malédiction), un débordement, et
// l'orbite adverse en miroir. Rendu par les VRAIS composants, état construit
// sur place (aucune lecture en base).
import { useState } from "react";
import HeroPortrait from "@/components/game/HeroPortrait";
import HeroOrbit from "@/components/game/orbite/HeroOrbit";
import type { ComposedEffect, Emblem, HeroState } from "@/lib/game/types";

const hero = (hp: number, armor = 0): HeroState => ({
  hp, maxHp: 30, armor, heroDefinition: null, heroPowerUsedThisTurn: false, heroPowerActivationsUsed: 0,
});

const degats: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 1 },
  target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "automatic" },
} as ComposedEffect;

const EMBLEMES: Emblem[] = [
  { abilityId: "commandement", params: { amount: 1 }, stacks: 1, sourceName: "Bannière du Nord" },
  { composed: degats, trigger: "on_end_of_turn", duration: 3, stacks: 1, sourceName: "Pluie de braises" },
  { composed: degats, trigger: "on_attack", stacks: 2, sourceName: "Cor de guerre" },
];
const MALEDICTION: Emblem = { composed: degats, trigger: "on_death", stacks: 1, malediction: true, sourceName: "Mauvais œil" };

export default function OrbitLab() {
  const [fire, setFire] = useState<number | null>(null);
  const plein = {
    epargne: 5, foi: 7, conquete: 3, exploration: 1,
    machine: { attack: 4, health: 5, inventions: 3, keywords: [], keyword_instances: [] },
    contresort: 2,
  };
  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 14, color: "#999" }}>Orbite du héros</h2>
      <button type="button" onClick={() => setFire(Date.now())}
        style={{ margin: "8px 0", padding: "4px 10px", border: "1px solid #888", borderRadius: 4, color: "#ddd" }}>
        Faire agir l&apos;emblème 2 (pulse)
      </button>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap" }}>
        {/* Mon héros : bord droit, l'orbite s'ouvre vers la gauche. */}
        <div style={{ position: "relative", width: 560, height: 520, background: "#14110c", borderRadius: 8 }}>
          <div style={{ position: "absolute", right: 16, top: 140 }}>
            <HeroOrbit side="mine" porteur="self" emblems={[...EMBLEMES, MALEDICTION]} firedEmblems={[1]} fireKey={fire}
              {...plein} canSpendEpargne canSpendConquete singleton>
              <HeroPortrait hero={hero(30, 4)} isOpponent={false} />
            </HeroOrbit>
          </div>
        </div>
        {/* Adversaire : bord gauche, miroir, rien de cliquable. */}
        <div style={{ position: "relative", width: 560, height: 520, background: "#14110c", borderRadius: 8 }}>
          <div style={{ position: "absolute", left: 16, top: 140 }}>
            <HeroOrbit side="theirs" porteur="opponent" emblems={EMBLEMES} epargne={2} conquete={1}>
              <HeroPortrait hero={hero(8)} isOpponent />
            </HeroOrbit>
          </div>
        </div>
        {/* Débordement : 9 emblèmes ⇒ « +N ». */}
        <div style={{ position: "relative", width: 560, height: 520, background: "#14110c", borderRadius: 8 }}>
          <div style={{ position: "absolute", right: 16, top: 140 }}>
            <HeroOrbit side="mine" porteur="self" emblems={[...EMBLEMES, ...EMBLEMES, ...EMBLEMES]} foi={2}>
              <HeroPortrait hero={hero(17)} isOpponent={false} />
            </HeroOrbit>
          </div>
        </div>
      </div>
    </div>
  );
}
