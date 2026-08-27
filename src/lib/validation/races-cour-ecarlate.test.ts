// Les quatre races ajoutées à « La Cour Écarlate » (faction d'id `Morts-Vivants`,
// affichée « La Nécropole ») le 2026-08-27 : Homuncules de Sang, Gargouilles,
// Dhampirs, Chiroptères. Le clan passe de UNE à CINQ races — le plus peuplé du
// jeu — et devient le second à céder ses `statWeights` à ses races.
//
// Le fichier est nommé d'après le CLAN, pas la faction : c'est le clan qui porte
// l'arbitrage, et les six autres races de la Nécropole n'y touchent pas.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  getAllClanNames,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { validateRace, validateFactionClan } from "./faction-clan";

const NOUVELLES = ["Homuncules de Sang", "Gargouilles", "Dhampirs", "Chiroptères"] as const;
const TOUTES = ["Vampires", ...NOUVELLES] as const;
const def = () => FACTIONS["Morts-Vivants"];
const cour = () => def().clanProfiles?.["La Cour Écarlate"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement des quatre races", () => {
  it("chacune appartient à la Nécropole", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Morts-Vivants");
    }
  });

  it("chacune n'ouvre QUE La Cour Écarlate", () => {
    // La Nécropole n'a aucun groupe `appliesTo: "all"` : sans ce contrôle, une
    // race pourrait s'ouvrir en silence aux quatre clans (le piège des Nagas).
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Morts-Vivants", r), r).toEqual(["La Cour Écarlate"]);
    }
  });

  it("La Cour Écarlate compte désormais cinq races, Vampires en tête", () => {
    expect(getRacesForClan("La Cour Écarlate")).toEqual([...TOUTES]);
  });

  it("n'ouvre aucun clan supplémentaire à la faction", () => {
    expect(getAllClanNames("Morts-Vivants")).toEqual([
      "Les Rangs Silencieux",
      "Le Voile Hurlant",
      "La Cour Écarlate",
      "Le Cénacle Nécromant",
    ]);
  });

  it("passe la validation serveur, race et clan", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Morts-Vivants"), r).toEqual({ ok: true, race: r });
      // La validation du clan reste au niveau de la FACTION (getAllClanNames) :
      // comportement préexistant, déjà signalé pour les Nagas.
      expect(validateFactionClan("Morts-Vivants", "La Cour Écarlate").ok, r).toBe(true);
    }
  });

  it("n'est assignable dans aucune autre faction", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Elfes").ok, r).toBe(false);
    }
  });
});

describe("La Cour Écarlate CÈDE ses stats à ses cinq races", () => {
  // La cascade du générateur est `clanStatW ?? raceStatW ?? faction` : un choix
  // d'OBJET ENTIER. Tant que le clan déclarait des `statWeights`, les quatre
  // nouvelles races auraient reçu le corps du Vampire — sans le moindre
  // avertissement. L'omission est donc load-bearing.
  it("ne déclare AUCUN statWeights", () => {
    expect(cour().statWeights).toBeUndefined();
  });

  it("chacune des cinq races porte le sien", () => {
    for (const r of TOUTES) expect(prof(r).statWeights, r).toBeDefined();
  });

  it("les cinq gabarits sont réellement distincts", () => {
    const vus = TOUTES.map((r) => `${prof(r).statWeights!.atk}/${prof(r).statWeights!.def}`);
    expect(new Set(vus).size).toBe(TOUTES.length);
  });

  it("les Vampires gardent EXACTEMENT le corps que le clan portait", () => {
    // 1.25/0.90 : la reprise est le prix de l'arbitrage. Le changer ici
    // déplacerait toutes les cartes Vampire à venir sans que rien ne le dise.
    expect(prof("Vampires").statWeights).toEqual({ atk: 1.25, def: 0.90 });
  });

  it("la Gargouille est le mur, le Chiroptère le corps le plus fragile", () => {
    const g = prof("Gargouilles").statWeights!;
    const c = prof("Chiroptères").statWeights!;
    expect(g.def).toBeGreaterThan(prof("Vampires").statWeights!.def);
    expect(g.atk).toBeLessThan(c.atk);
    for (const r of TOUTES) expect(c.def, r).toBeLessThanOrEqual(prof(r).statWeights!.def);
  });
});

describe("table de mots-clés — le clan garde le noyau, les races le reste", () => {
  it("le clan ne garde que le registre du sang", () => {
    expect(Object.keys(cour().likelyKeywords ?? {}).sort()).toEqual(
      ["Drain de vie", "Pacte de sang", "Vampirisme X"].sort(),
    );
  });

  it("les Vampires récupèrent à l'identique ce que le clan a lâché", () => {
    expect(prof("Vampires").likelyKeywords).toEqual({
      "Célérité": 0.45, "Régénération": 0.45, "Terreur": 0.35, "Vol": 0.30,
    });
  });

  it("aucune race ne double un mot-clé du clan", () => {
    // Le poids de clan gagne mot-clé par mot-clé : un doublon serait mort-né.
    const duClan = new Set(Object.keys(cour().likelyKeywords ?? {}));
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => duClan.has(k)), r).toEqual([]);
    }
  });

  it("aucune race ne sollicite un mot-clé interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => interdits.has(k)), r).toEqual([]);
    }
  });

  it("Vol : le clan ne le plafonne plus, les volants le portent vraiment", () => {
    // C'est la raison d'être du dégraissage du clan : à 0.30 côté clan, la
    // Gargouille et le Chiroptère n'auraient jamais pu voler plus souvent que
    // le Vampire.
    expect(cour().likelyKeywords?.["Vol"]).toBeUndefined();
    expect(prof("Chiroptères").likelyKeywords!["Vol"]).toBeGreaterThan(0.80);
    expect(prof("Gargouilles").likelyKeywords!["Vol"]).toBeGreaterThan(
      prof("Vampires").likelyKeywords!["Vol"],
    );
  });

  it("chaque race joue un registre que les quatre autres ne jouent pas", () => {
    const signatures: Record<string, string> = {
      "Gargouilles": "Armure",
      "Dhampirs": "Première Frappe",
      "Chiroptères": "Instinct de meute X",
      "Homuncules de Sang": "Sacrifice",
      // Pas « Célérité » : le Chiroptère la partage, et c'est voulu — deux
      // corps rapides. La signature doit être un registre RÉELLEMENT exclusif.
      "Vampires": "Régénération",
    };
    for (const [race, kw] of Object.entries(signatures)) {
      expect(Object.keys(prof(race).likelyKeywords ?? {}), race).toContain(kw);
      for (const autre of TOUTES) {
        if (autre === race) continue;
        expect(Object.keys(prof(autre).likelyKeywords ?? {}), `${autre} / ${kw}`).not.toContain(kw);
      }
    }
  });
});

describe("génération", () => {
  it("renvoie bien la race demandée et des stats non nulles", () => {
    for (const r of TOUTES) {
      const c = generateCardStats("Morts-Vivants", "Unité", "Rare", 5, r, "La Cour Écarlate");
      expect(c.race, r).toBe(r);
      expect((c.attack ?? 0) + (c.defense ?? 0), r).toBeGreaterThan(0);
    }
  });

  it("la Gargouille sort plus défensive que le Chiroptère, à coût égal", () => {
    // Vérifié sur une moyenne : la répartition atk/def est bruitée carte à carte.
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 60; i++) {
        t += generateCardStats("Morts-Vivants", "Unité", "Rare", 5, race, "La Cour Écarlate")[champ] ?? 0;
      }
      return t / 60;
    };
    expect(moy("Gargouilles", "defense")).toBeGreaterThan(moy("Chiroptères", "defense"));
    expect(moy("Chiroptères", "attack")).toBeGreaterThan(moy("Gargouilles", "attack"));
  });

  it("le Chiroptère vole TOUJOURS, même en Commune", () => {
    // Vol a minTier 1 : seul le passage garanti du générateur peut le poser sur
    // une Commune (même chemin que Faucons et Griffons).
    for (let i = 0; i < 20; i++) {
      const c = generateCardStats("Morts-Vivants", "Unité", "Commune", 3, "Chiroptères", "La Cour Écarlate");
      expect(c.keywords).toContain("Vol");
    }
  });

  it("la Gargouille, elle, reste au tirage — perchée n'est pas volante", () => {
    let volantes = 0;
    for (let i = 0; i < 60; i++) {
      const c = generateCardStats("Morts-Vivants", "Unité", "Rare", 5, "Gargouilles", "La Cour Écarlate");
      if (c.keywords?.includes("Vol")) volantes++;
    }
    expect(volantes).toBeLessThan(60);
  });
});

describe("formes fléchies françaises", () => {
  it("les quatre races sont déclinées", () => {
    expect(RACE_FORMS_FR["Homuncules de Sang"]).toEqual({
      def: "l'Homuncule de Sang", bare: "Homuncule de Sang", de: "de l'Homuncule de Sang",
    });
    expect(RACE_FORMS_FR["Gargouilles"]).toEqual({
      def: "la Gargouille", bare: "Gargouille", de: "de la Gargouille",
    });
    expect(RACE_FORMS_FR["Dhampirs"]).toEqual({
      def: "le Dhampir", bare: "Dhampir", de: "du Dhampir",
    });
    expect(RACE_FORMS_FR["Chiroptères"]).toEqual({
      def: "le Chiroptère", bare: "Chiroptère", de: "du Chiroptère",
    });
  });
});
