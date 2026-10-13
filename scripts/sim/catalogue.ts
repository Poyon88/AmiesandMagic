// Catalogue exporté (export-catalog.mjs) → pools du moteur + decks mono-clan aléatoires.
import { readFileSync } from "node:fs";
import { DECK_SIZE } from "@/lib/game/constants";
import { getAllClanNames } from "@/lib/card-engine/constants";
import type { Card, HeroDefinition, Race, TokenTemplate } from "@/lib/game/types";
import { pick, type Rand } from "@/lib/sim/random-bot";
import type { DeckSim } from "@/lib/sim/simulate";

interface HeroRow { id: number; name: string; race: string; faction?: string | null; clan?: string | null; power_name: string; power_cost: number; power_effect: HeroDefinition["powerEffect"]; power_description: string; power_usage_limit?: number | null }

export function chargerCatalogue(fichier: string) {
  const cat = JSON.parse(readFileSync(fichier, "utf8")) as { cards: Card[]; tokens: TokenTemplate[]; heroes: HeroRow[]; sets: { id: number; type: string }[] };
  const speciaux = new Set(cat.sets.filter((s) => s.type === "special").map((s) => s.id));
  const cartes = cat.cards.filter((c) => !c.set_id || !speciaux.has(c.set_id));
  const jouables = cartes.filter((c) => c.card_type !== "item");

  const hero = (r: HeroRow): HeroDefinition => ({
    id: r.id, name: r.name, race: r.race as Race, faction: r.faction ?? null, clan: r.clan ?? null,
    powerName: r.power_name, powerCost: r.power_cost, powerEffect: r.power_effect, powerDescription: r.power_description,
    powerUsageLimit: r.power_usage_limit ?? null, glbUrl: null, thumbnailUrl: null, powerImageUrl: null, powerSfxUrl: null,
  });

  // Decks mono-clan : cartes du clan + cartes sans clan de la faction, 2 ex. max.
  const clans: { faction: string; clan: string; pool: Card[] }[] = [];
  for (const f of [...new Set(jouables.map((c) => c.faction).filter(Boolean))] as string[]) {
    for (const clan of getAllClanNames(f)) {
      const pool = jouables.filter((c) => c.faction === f && (c.clan === clan || !c.clan));
      if (pool.length >= DECK_SIZE / 2) clans.push({ faction: f, clan, pool });
    }
  }

  function deck(rand: Rand, c = pick(rand, clans)!): DeckSim {
    const qte = new Map<number, number>();
    const ordre = [...c.pool].sort(() => rand() - 0.5);
    let total = 0;
    for (let tour = 0; total < DECK_SIZE && tour < 2; tour++) {
      for (const card of ordre) { if (total >= DECK_SIZE) break; qte.set(card.id, (qte.get(card.id) ?? 0) + 1); total++; }
    }
    const h = cat.heroes.filter((x) => x.faction === c.faction && (!x.clan || x.clan === c.clan));
    return {
      label: `${c.faction} / ${c.clan}`,
      cards: [...qte].map(([id, quantity]) => ({ card: c.pool.find((x) => x.id === id)!, quantity })),
      hero: h.length ? hero(pick(rand, h)!) : null,
    };
  }

  const pools = { factionCardPool: cartes, allSpellsPool: cartes.filter((c) => c.card_type === "spell"), tokens: cat.tokens };
  return { cartes, clans, deck, pools };
}

/** Coupe les journaux du moteur pendant la simulation ; rend la fonction pour les rétablir. */
export function silence(): () => void {
  const { log, warn, info } = console;
  console.log = () => {}; console.warn = () => {}; console.info = () => {};
  return () => { console.log = log; console.warn = warn; console.info = info; };
}
