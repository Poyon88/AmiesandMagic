// Race « Ghoules », ajoutée aux **Rangs Silencieux** (faction d'id `Morts-Vivants`,
// « La Nécropole ») le 2026-08-27 — le clan passe de deux à trois races.
//
// Arbitrage INVERSE de celui de La Cour Écarlate, prise le même jour, et
// identique à celui des Nagas : le clan GARDE ses `statWeights`, la race n'en
// déclare aucun. Raison : Squelettes et Zombies n'ont aucun profil de race, et
// leur céder le gabarit du clan les aurait renvoyés à l'ombrelle de faction.
// C'est donc la table de pouvoirs — qui se comble pouvoir par pouvoir — qui
// porte toute la différence.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { validateRace } from "./faction-clan";

const def = () => FACTIONS["Morts-Vivants"];
const clan = () => def().clanProfiles?.["Les Rangs Silencieux"] ?? {};
const ghoules = () => def().raceProfiles?.["Ghoules"] ?? {};

describe("rattachement", () => {
  it("appartient à la Nécropole, sans ambiguïté", () => {
    expect(def().races).toContain("Ghoules");
    expect(getFactionForRace("Ghoules")).toBe("Morts-Vivants");
  });

  it("n'ouvre QUE Les Rangs Silencieux", () => {
    // La Nécropole n'a aucun groupe `appliesTo: "all"` : sans son propre groupe,
    // la race n'aurait ouvert AUCUN clan (et non les quatre — piège inverse de
    // celui des Nagas, mais tout aussi silencieux).
    expect(getClanNamesForRace("Morts-Vivants", "Ghoules")).toEqual(["Les Rangs Silencieux"]);
  });

  it("porte le clan à trois races, rangée avec ses voisines", () => {
    expect(getRacesForClan("Les Rangs Silencieux")).toEqual(["Squelettes", "Zombies", "Ghoules"]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    expect(validateRace("Ghoules", "Morts-Vivants")).toEqual({ ok: true, race: "Ghoules" });
    expect(validateRace("Ghoules", "Elfes").ok).toBe(false);
  });
});

describe("le clan GARDE ses stats — la race n'en déclare aucune", () => {
  it("les Ghoules ne déclarent AUCUN statWeights", () => {
    // La cascade est `clanStatW ?? raceStatW` : un choix d'OBJET ENTIER. Le clan
    // déclarant les siens, tout gabarit posé ici serait mort-né sans le moindre
    // avertissement. L'omission est la façon de le DIRE.
    expect(ghoules().statWeights).toBeUndefined();
  });

  it("le clan, lui, garde bien les siens", () => {
    // Les céder aurait renvoyé Squelettes et Zombies — qui n'ont aucun profil de
    // race — à l'ombrelle de faction (1.05/0.95 au lieu de 1.00/0.90).
    expect(clan().statWeights).toEqual({ atk: 1.00, def: 0.90 });
  });

  it("ne change donc RIEN pour les Squelettes ni les Zombies", () => {
    for (const r of ["Squelettes", "Zombies"]) {
      expect(def().raceProfiles?.[r], r).toBeUndefined();
    }
  });

  it("les trois races partagent le même corps — c'est l'arbitrage assumé", () => {
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 80; i++) {
        t += generateCardStats("Morts-Vivants", "Unité", "Rare", 5, race, "Les Rangs Silencieux")[champ] ?? 0;
      }
      return t / 80;
    };
    const zom = moy("Zombies", "attack") + moy("Zombies", "defense");
    const gho = moy("Ghoules", "attack") + moy("Ghoules", "defense");
    expect(Math.abs(gho - zom)).toBeLessThan(1.5);
  });
});

describe("table de pouvoirs — c'est elle qui distingue la goule", () => {
  it("court, fige et dévore", () => {
    const kws = Object.keys(ghoules().likelyKeywords ?? {});
    expect(kws).toContain("Célérité");
    expect(kws).toContain("Paralysie");
    expect(kws).toContain("Dévoration");
  });

  it("ne double AUCUN pouvoir du clan", () => {
    // Le poids de clan gagne pouvoir par pouvoir : un doublon serait une ligne
    // morte. Nécrophagie en est l'exemple — signature évidente de la goule, mais
    // déjà premier poids du clan (0.55), d'où elle lui vient.
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Nécrophagie")).toBe(true);
    expect(Object.keys(ghoules().likelyKeywords ?? {}).filter((k) => duClan.has(k))).toEqual([]);
  });

  it("ne recoupe l'ombrelle de faction sur aucun pouvoir", () => {
    // Là où elle la recouperait, le poids devrait la DÉPASSER pour valoir
    // quelque chose ; ici le registre est entièrement neuf, donc la question ne
    // se pose pas — et ce test le verrouille.
    const faction = def().likelyKeywords;
    for (const [kw, poids] of Object.entries(ghoules().likelyKeywords ?? {})) {
      if (faction[kw] !== undefined) expect(poids, kw).toBeGreaterThan(faction[kw]);
    }
  });

  it("ne sollicite aucun pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    expect(Object.keys(ghoules().likelyKeywords ?? {}).filter((k) => interdits.has(k))).toEqual([]);
  });

  it("joue un registre que ni les Rangs Silencieux ni la Cour Écarlate ne jouent", () => {
    // Célérité appartient aussi aux Vampires et aux Chiroptères : c'est le seul
    // recoupement, et il est voulu (trois corps rapides). Paralysie et Dévoration
    // n'appartiennent qu'à elle dans toute la Nécropole.
    const ailleurs = new Set(
      Object.entries(def().raceProfiles ?? {})
        .filter(([r]) => r !== "Ghoules")
        .flatMap(([, p]) => Object.keys(p.likelyKeywords ?? {})),
    );
    expect(ailleurs.has("Paralysie")).toBe(false);
    expect(ailleurs.has("Dévoration")).toBe(false);
  });
});

describe("génération et formes", () => {
  it("renvoie bien la race et des stats non nulles", () => {
    const c = generateCardStats("Morts-Vivants", "Unité", "Rare", 4, "Ghoules", "Les Rangs Silencieux");
    expect(c.race).toBe("Ghoules");
    expect((c.attack ?? 0) + (c.defense ?? 0)).toBeGreaterThan(0);
  });

  it("ne vole jamais par construction — rien ne la met dans la liste garantie", () => {
    // Le contraire du Chiroptère, ajouté ce jour-là à la liste en dur.
    let volantes = 0;
    for (let i = 0; i < 60; i++) {
      const c = generateCardStats("Morts-Vivants", "Unité", "Commune", 3, "Ghoules", "Les Rangs Silencieux");
      if (c.keywords?.includes("Vol")) volantes++;
    }
    expect(volantes).toBe(0);
  });

  it("est déclinée en français — féminine, sans élision", () => {
    // « la Ghoule », pas « l'Ghoule » : l'élision ne se dérive pas de la
    // première lettre, d'où des formes explicites.
    expect(RACE_FORMS_FR["Ghoules"]).toEqual({
      def: "la Ghoule", bare: "Ghoule", de: "de la Ghoule",
    });
  });
});
