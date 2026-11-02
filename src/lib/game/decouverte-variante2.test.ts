// DÉCOUVERTE — VARIANTE 2 (essai du 2026-11-02, arbitrages de l'auteur) :
//   • 1 Commune du clan à C, 1 d'un AUTRE clan de la faction à C, 1 d'une
//     AUTRE FACTION à C+1 ;
//   • autre faction : même alignement que le deck ou neutre (deck neutre :
//     autres neutres seulement), panier tiré à pile ou face ; jamais de
//     Mercenaires, jamais la faction du deck ;
//   • faction à un seul clan : la case « autre clan » devient une 2e carte du
//     clan ;
//   • la variante 1 reste inchangée tant que `decouverteVariante` est absent.
import { describe, expect, it } from "vitest";
import { coutDeDecouverte, offreDecouverte } from "./engine";
import { coutAutreFaction } from "./decouverte";
import { FACTIONS } from "@/lib/card-engine/constants";
import { mkCard, mkState } from "./test-harness";
import type { Card, GameState } from "./types";

let id = 40000;
const commune = (faction: string, clan: string | null, cout: number) =>
  mkCard({ id: id++, name: `${faction}-${clan}-${cout}-${id}`, faction, clan, rarity: "Commune", mana_cost: cout, attack: 1, health: 1 } as Partial<Card>);

/** 3 Communes par coût 1-10 pour chaque (faction, clan) donné. */
function vivier(groupes: Array<[string, string | null]>): Card[] {
  const out: Card[] = [];
  for (const [f, clan] of groupes) for (let c = 1; c <= 10; c++) out.push(commune(f, clan, c), commune(f, clan, c), commune(f, clan, c));
  return out;
}

// Deck BON (Elfes) : autre bonne = Nains ; neutres = Humains, Hommes-Bêtes ;
// présents mais interdits : Morts-Vivants (maléfique), Mercenaires.
const POOL_BON = vivier([
  ["Elfes", "Sylve"], ["Elfes", "Lune"],
  ["Nains", "Forge"],
  ["Humains", "Aube"], ["Hommes-Bêtes", "Meute"],
  ["Morts-Vivants", "Crypte"], ["Mercenaires", null],
]);

function etat(pool: Card[], identites: Array<{ faction: string; clan: string | null }>, turnNumber = 4, graine = 7, variante2 = true): GameState {
  const s = mkState();
  s.turnNumber = turnNumber;
  s.regles = { decouverteAlternee: true, graineDecouverte: graine, ...(variante2 ? { decouverteVariante: 2 as const } : {}) };
  s.factionCardPool = pool;
  s.players[0].identite = identites[0];
  s.players[1].identite = identites[1] ?? identites[0];
  return s;
}

describe("découverte variante 2 — composition de l'offre", () => {
  it("clan à C, autre clan de la faction à C, autre faction à C+1 — dans cet ordre", () => {
    for (let g = 0; g < 60; g++) {
      const s = etat(POOL_BON, [{ faction: "Elfes", clan: "Sylve" }, { faction: "Elfes", clan: "Lune" }], 4 + 2 * (g % 5), g * 7919);
      const p = s.players[0];
      const c = coutDeDecouverte(s, p)!;
      const offre = offreDecouverte(s, p);

      expect(offre).toHaveLength(3);
      expect(offre[0]).toMatchObject({ faction: "Elfes", clan: "Sylve", mana_cost: c });
      expect(offre[1]).toMatchObject({ faction: "Elfes", clan: "Lune", mana_cost: c });
      expect(offre[2].faction).not.toBe("Elfes");
      expect(offre[2].mana_cost).toBe(coutAutreFaction(c));
    }
  });

  it("deck bon : la carte d'ailleurs est bonne ou neutre — jamais maléfique, jamais Mercenaire", () => {
    for (let g = 0; g < 200; g++) {
      const s = etat(POOL_BON, [{ faction: "Elfes", clan: "Sylve" }], 4 + 2 * (g % 5), g * 104729);
      const autre = offreDecouverte(s, s.players[0])[2];
      expect(autre.faction).not.toBe("Mercenaires");
      expect(["bon", "neutre"]).toContain(FACTIONS[autre.faction!].alignment);
    }
  });

  it("deck neutre : seulement d'AUTRES factions neutres", () => {
    const pool = vivier([
      ["Humains", "Aube"], ["Humains", "Nord"],
      ["EmpireDuMilieu", "Jade"], ["Élémentaires", "Flamme"],
      ["Elfes", "Sylve"], ["Morts-Vivants", "Crypte"], ["Mercenaires", null],
    ]);
    for (let g = 0; g < 200; g++) {
      const s = etat(pool, [{ faction: "Humains", clan: "Aube" }], 4 + 2 * (g % 5), g * 15485863);
      const autre = offreDecouverte(s, s.players[0])[2];
      expect(autre.faction).not.toBe("Humains");
      expect(FACTIONS[autre.faction!].alignment).toBe("neutre");
    }
  });

  it("pile ou face : environ la moitié des offres puisent dans le même alignement", () => {
    let meme = 0;
    const N = 400;
    for (let g = 0; g < N; g++) {
      // Le germe de l'offre dépend du TOUR (et du siège, de la RNG de partie),
      // pas de la graine des coûts : c'est le tour qu'on fait varier.
      const s = etat(POOL_BON, [{ faction: "Elfes", clan: "Sylve" }], 4 + 2 * g, 7);
      if (offreDecouverte(s, s.players[0])[2].faction === "Nains") meme++;
    }
    expect(meme / N).toBeGreaterThan(0.4);
    expect(meme / N).toBeLessThan(0.6);
  });

  it("faction à un seul clan : 2 cartes du clan à C, puis l'autre faction à C+1", () => {
    const pool = vivier([["Nains", "Forge"], ["Elfes", "Sylve"], ["Humains", "Aube"]]);
    const s = etat(pool, [{ faction: "Nains", clan: "Forge" }]);
    const c = coutDeDecouverte(s, s.players[0])!;
    const offre = offreDecouverte(s, s.players[0]);

    expect(offre).toHaveLength(3);
    expect(offre.slice(0, 2).every((x) => x.faction === "Nains" && x.clan === "Forge" && x.mana_cost === c)).toBe(true);
    expect(offre[2].faction).not.toBe("Nains");
    expect(offre[2].mana_cost).toBe(coutAutreFaction(c));
  });
});

describe("découverte variante 2 — coût et compatibilité", () => {
  it("même C pour les deux joueurs à la même découverte", () => {
    for (let g = 0; g < 50; g++) {
      const s = etat(POOL_BON, [{ faction: "Elfes", clan: "Sylve" }, { faction: "Elfes", clan: "Lune" }], 4, g * 31);
      expect(coutDeDecouverte(s, s.players[0])).toBe(coutDeDecouverte(s, s.players[1]));
    }
  });

  it("repli : un coût sans carte d'ailleurs à C+1 est écarté au profit du plus proche", () => {
    // Plus aucune carte hors Elfes au coût 6 : C = 5 ne tient plus.
    const pool = POOL_BON.filter((c) => c.faction === "Elfes" || c.mana_cost !== 6);
    for (let g = 0; g < 200; g++) {
      const s = etat(pool, [{ faction: "Elfes", clan: "Sylve" }], 4 + 2 * (g % 5), g * 7);
      expect(coutDeDecouverte(s, s.players[0])).not.toBe(5);
    }
  });

  it("variante 1 inchangée : sans `decouverteVariante`, aucune carte d'une autre faction", () => {
    for (let g = 0; g < 50; g++) {
      const s = etat(POOL_BON, [{ faction: "Elfes", clan: "Sylve" }], 4, g * 13, false);
      const offre = offreDecouverte(s, s.players[0]);
      expect(offre.every((x) => x.faction === "Elfes")).toBe(true);
      expect(offre.filter((x) => x.clan === "Sylve")).toHaveLength(2);
    }
  });
});
