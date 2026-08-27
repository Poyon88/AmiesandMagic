// Les trois races ajoutées au « Cénacle Nécromant » (faction d'id `Morts-Vivants`,
// affichée « La Nécropole ») le 2026-08-27 : Momies, Chimères nécrotiques,
// Vermines mortuaires. Le clan passe de UNE à QUATRE races et devient le
// TROISIÈME du jeu à céder ses `statWeights`, après le Clan des Premiers Géants
// et La Cour Écarlate.
//
// Le fichier est nommé d'après le CLAN, pas la faction : c'est lui qui porte
// l'arbitrage, et les dix autres races de la Nécropole n'y touchent pas.
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

const NOUVELLES = ["Momies", "Chimères nécrotiques", "Vermines mortuaires"] as const;
const TOUTES = ["Lich", ...NOUVELLES] as const;
const def = () => FACTIONS["Morts-Vivants"];
const clan = () => def().clanProfiles?.["Le Cénacle Nécromant"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement des trois races", () => {
  it("chacune appartient à la Nécropole", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Morts-Vivants");
    }
  });

  it("chacune n'ouvre QUE Le Cénacle Nécromant", () => {
    // La Nécropole n'a aucun groupe `appliesTo: "all"` : sans ce contrôle, une
    // race pourrait s'ouvrir en silence aux quatre clans (le piège des Nagas).
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Morts-Vivants", r), r).toEqual(["Le Cénacle Nécromant"]);
    }
  });

  it("le clan compte désormais quatre races, Lich en tête", () => {
    expect(getRacesForClan("Le Cénacle Nécromant")).toEqual([...TOUTES]);
  });

  it("n'ouvre aucun clan supplémentaire à la faction", () => {
    expect(getAllClanNames("Morts-Vivants")).toEqual([
      "Les Rangs Silencieux",
      "Le Voile Hurlant",
      "La Cour Écarlate",
      "Le Cénacle Nécromant",
    ]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Morts-Vivants"), r).toEqual({ ok: true, race: r });
      expect(validateRace(r, "Elfes").ok, r).toBe(false);
      // La validation du clan reste au niveau de la FACTION (getAllClanNames) :
      // comportement préexistant, déjà signalé pour les Nagas.
      expect(validateFactionClan("Morts-Vivants", "Le Cénacle Nécromant").ok, r).toBe(true);
    }
  });

  it("chacune se décline au féminin en français", () => {
    for (const r of NOUVELLES) expect(RACE_FORMS_FR[r], r).toBeDefined();
    expect(RACE_FORMS_FR["Momies"].def).toBe("la Momie");
    expect(RACE_FORMS_FR["Chimères nécrotiques"].def).toBe("la Chimère nécrotique");
    expect(RACE_FORMS_FR["Vermines mortuaires"].def).toBe("la Vermine mortuaire");
  });
});

describe("le clan CÈDE ses stats — chaque race porte son corps", () => {
  it("le clan ne déclare plus AUCUN statWeights", () => {
    // La cascade est `clanStatW ?? raceStatW` : un choix d'OBJET ENTIER. Tant
    // que le clan en déclarait, les trois nouvelles auraient été mort-nées.
    expect(clan().statWeights).toBeUndefined();
  });

  it("les quatre races en déclarent chacune un, et tous distincts", () => {
    for (const r of TOUTES) expect(prof(r).statWeights, r).toBeDefined();
    const vus = TOUTES.map((r) => `${prof(r).statWeights!.atk}/${prof(r).statWeights!.def}`);
    expect(new Set(vus).size).toBe(TOUTES.length);
  });

  it("Lich reprend au bit près ce que le clan portait", () => {
    // C'est la contrepartie du don : sans ce report, la liche serait retombée
    // sur l'ombrelle de faction (1.05/0.95) — la régression silencieuse que le
    // critère des Ghoules cherche à éviter.
    expect(prof("Lich").statWeights).toEqual({ atk: 0.85, def: 1.00 });
    expect(prof("Lich").likelyKeywords).toEqual({
      "Savant": 0.45, "Canalisation": 0.45, "Divination": 0.35,
    });
  });

  it("la momie tient, la chimère frappe, la vermine ne fait ni l'un ni l'autre", () => {
    const m = prof("Momies").statWeights!;
    const c = prof("Chimères nécrotiques").statWeights!;
    const v = prof("Vermines mortuaires").statWeights!;
    expect(m.def).toBeGreaterThan(c.def);
    expect(c.atk).toBeGreaterThan(m.atk);
    for (const r of TOUTES) expect(v.def, r).toBeLessThanOrEqual(prof(r).statWeights!.def);
  });

  it("la génération sépare bien les corps", () => {
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 80; i++) {
        t += generateCardStats("Morts-Vivants", "Unité", "Rare", 5, race, "Le Cénacle Nécromant")[champ] ?? 0;
      }
      return t / 80;
    };
    expect(moy("Chimères nécrotiques", "attack")).toBeGreaterThan(moy("Momies", "attack"));
    expect(moy("Momies", "defense")).toBeGreaterThan(moy("Vermines mortuaires", "defense"));
  });
});

describe("tables de pouvoirs — ce qui distingue les trois", () => {
  it("le clan est ramené au noyau nécromantique commun aux quatre", () => {
    // Savant / Canalisation / Divination n'appartenaient qu'à la liche : les
    // laisser au clan aurait fait de la vermine une érudite, le poids de clan
    // gagnant pouvoir par pouvoir.
    expect(Object.keys(clan().likelyKeywords ?? {}).sort()).toEqual([
      "Domination", "Héritage du cimetière", "Ombre du passé", "Résurrection",
    ]);
  });

  it("chacune joue son propre registre", () => {
    expect(Object.keys(prof("Momies").likelyKeywords ?? {})).toContain("Armure");
    expect(Object.keys(prof("Momies").likelyKeywords ?? {})).toContain("Malédiction");
    expect(Object.keys(prof("Chimères nécrotiques").likelyKeywords ?? {})).toContain("Double Attaque");
    expect(Object.keys(prof("Vermines mortuaires").likelyKeywords ?? {})).toContain("Instinct de meute X");
  });

  it("aucune ne double un pouvoir du clan", () => {
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => duClan.has(k)), r).toEqual([]);
    }
  });

  it("dépasse l'ombrelle de faction partout où elle la recoupe", () => {
    // Un poids égal à celui de la faction n'ajouterait rien : la ligne serait
    // morte. C'est ce qui monte Poison à 0.70, Nécrophagie à 0.60,
    // Convocation X à 0.55 et Régénération à 0.55.
    const faction = def().likelyKeywords;
    for (const r of TOUTES) {
      for (const [kw, poids] of Object.entries(prof(r).likelyKeywords ?? {})) {
        if (faction[kw] !== undefined) expect(poids, `${r} / ${kw}`).toBeGreaterThan(faction[kw]);
      }
    }
  });

  it("aucune ne sollicite un pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    for (const r of TOUTES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => interdits.has(k)), r).toEqual([]);
    }
  });
});
