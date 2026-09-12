"use client";

// Banc d'essai des compteurs héraldiques : la même carte dans les neuf cas du
// brief (§10.3), plus la série en vignette 118 px. Rendu par le VRAI GameCard,
// avec des cartes construites sur place (aucune lecture en base).
import GameCard from "@/components/cards/GameCard";
import { CostShield, StatShields } from "@/components/card/CardCounters";
import type { Card } from "@/lib/game/types";

const ART = "https://hndskftqdudknsvdunjc.supabase.co/storage/v1/object/public/card-images/forge_1787753041580_z3ma.jpeg";

let seq = 1;
function carte(over: Partial<Card>): Card {
  return {
    id: 900000 + seq++, name: "Haut Elfe", mana_cost: 3, card_type: "creature", attack: 3, health: 2,
    effect_text: "", keywords: ["ranged", "taunt", "charge"] as never, spell_keywords: null, spell_effects: null,
    image_url: ART, faction: "Elfes", rarity: "Commune", set_id: 1,
    life_cost: 0, discard_cost: 0, sacrifice_cost: 0, exile_cost: 0, topdeck_cost: 0, eveil_cost: 0,
    ...over,
  } as Card;
}

const CAS: { titre: string; card: Card; eveil?: { total: number; paid: number }; count?: number }[] = [
  { titre: "3 / 3 / 2", card: carte({}) },
  { titre: "10 / 12 / 11", card: carte({ name: "Phénix de l'Aube Immémoriale", mana_cost: 10, attack: 12, health: 11 }) },
  { titre: "Sort sans stats", card: carte({ name: "Vision aux Mille Issues", card_type: "spell", attack: null, health: null, mana_cost: 4, keywords: [] as never }) },
  { titre: "Vie 3", card: carte({ name: "Pacte de sang", life_cost: 3 }) },
  { titre: "Défausse 1", card: carte({ name: "Démon des Ombres", discard_cost: 1, mana_cost: 1, attack: 2, health: 1 }) },
  { titre: "Sacrifice 2", card: carte({ name: "Autel noir", sacrifice_cost: 2 }) },
  { titre: "Exil 3", card: carte({ name: "Portail scellé", exile_cost: 3 }) },
  { titre: "Repli 2", card: carte({ name: "Retraite ordonnée", topdeck_cost: 2 }) },
  { titre: "Éveil 4 / 7 (3 restants)", card: carte({ name: "Titan endormi", eveil_cost: 7, mana_cost: 9 }), eveil: { total: 7, paid: 4 } },
  { titre: "Éveil + défausse empilés", card: carte({ name: "Serment double", eveil_cost: 5, discard_cost: 1 }), eveil: { total: 5, paid: 1 } },
  { titre: "Badge ×3 sous un jeton", card: carte({ name: "Exemplaires", life_cost: 2 }), count: 3 },
];

export default function CardLab() {
  return (
    <div style={{ minHeight: "100vh", background: "#12131c", color: "#ddd", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontFamily: "var(--font-cinzel), serif", color: "#d8b25a" }}>Card lab — compteurs héraldiques</h1>

      <h2 style={{ fontSize: 14, color: "#999" }}>Les neuf cas, taille « md » (260 px)</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
        {CAS.map((c) => (
          <div key={c.titre}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{c.titre}</div>
            <GameCard card={c.card} size="md" eveil={c.eveil} count={c.count} disableHoverZoom />
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 14, color: "#999", marginTop: 32 }}>Tons du chiffre (buff, dégâts, coût réduit) — écus seuls</h2>
      <div style={{ display: "flex", gap: 20 }}>
        {[
          { l: "neutre", atk: "neutral", hp: "neutral", cheap: false },
          { l: "ATK buffée", atk: "buff", hp: "neutral", cheap: false },
          { l: "PV endommagés", atk: "neutral", hp: "debuff", cheap: false },
          { l: "coût réduit", atk: "neutral", hp: "neutral", cheap: true },
        ].map((t) => (
          <div key={t.l}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>{t.l}</div>
            <div style={{ position: "relative", width: 210, aspectRatio: "552 / 766", containerType: "inline-size", borderRadius: "3.4%", overflow: "hidden", background: "#1a1a2e" }}>
              <CostShield value={4} discounted={t.cheap} />
              <StatShields atk={5} hp={2} atkTone={t.atk as "buff"} hpTone={t.hp as "debuff"} />
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 14, color: "#999", marginTop: 32 }}>Vignette 118 px (série)</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        {CAS.map((c) => (
          <div key={`v-${c.titre}`} style={{ zoom: 118 / 180 }}>
            <GameCard card={c.card} size="sm" eveil={c.eveil} count={c.count} disableHoverZoom />
          </div>
        ))}
      </div>
    </div>
  );
}
