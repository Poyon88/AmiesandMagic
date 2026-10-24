"use client";

// Banc de l'AURA des héros en ÉDITION LIMITÉE (halo + reflet, teinte de la
// rareté), retenue après comparaison : le numéro d'exemplaire a été écarté.
// Vrais portraits, rareté SIMULÉE.
import HeroPortrait from "@/components/game/HeroPortrait";
import type { HeroDefinition, HeroState } from "@/lib/game/types";

const PORTRAITS = {
  turlin: "https://hndskftqdudknsvdunjc.supabase.co/storage/v1/object/public/hero-models/hero_thumb_1791034601581_yel3.webp",
  asteria: "https://hndskftqdudknsvdunjc.supabase.co/storage/v1/object/public/hero-models/hero_thumb_1787322233573_m6sh.webp",
  vaelkor: "https://hndskftqdudknsvdunjc.supabase.co/storage/v1/object/public/hero-models/hero_thumb_1782585364021_jeve.webp",
};

const heros = (nom: string, url: string, rarity: string): HeroState => ({
  hp: 30, maxHp: 30, armor: 0, heroPowerUsedThisTurn: false, heroPowerActivationsUsed: 0,
  heroDefinition: { id: 0, name: nom, race: "", thumbnailUrl: url, rarity } as unknown as HeroDefinition,
});

const CAS: { titre: string; nom: string; url: string; rarete: string }[] = [
  { titre: "Commune (sans aura)", nom: "Turlin", url: PORTRAITS.turlin, rarete: "Commune" },
  { titre: "Peu Commune", nom: "Turlin", url: PORTRAITS.turlin, rarete: "Peu Commune" },
  { titre: "Rare", nom: "Asteria", url: PORTRAITS.asteria, rarete: "Rare" },
  { titre: "Épique", nom: "Vaelkor", url: PORTRAITS.vaelkor, rarete: "Épique" },
  { titre: "Légendaire", nom: "Asteria", url: PORTRAITS.asteria, rarete: "Légendaire" },
];

export default function AuraLab() {
  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 14, color: "#999" }}>Aura des héros en édition limitée — portrait de partie (HeroPortrait)</h2>
      <div style={{ display: "flex", gap: 56, flexWrap: "wrap", padding: "40px 24px 56px", background: "#14110c", borderRadius: 8 }}>
        {CAS.map((c) => (
          <div key={`${c.titre}-${c.nom}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
            <div style={{ fontSize: 12, color: "#bbb" }}>{c.titre} · {c.nom}</div>
            <HeroPortrait hero={heros(c.nom, c.url, c.rarete)} isOpponent={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
