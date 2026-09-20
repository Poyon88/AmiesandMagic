// Races « Pégases » et « Sphinx », ajoutées aux **Guerrières du Vent** (faction
// d'id `Humains`, « Les Royaumes Libres ») le 2026-09-20 — le bestiaire du mythe
// grec pour l'ancien clan des Amazones.
//
// Deux faits verrouillés ici :
//   1. le groupe de clans transversal de la faction a dû être SCINDÉ (une entrée
//      par race) : avec `appliesTo: "all"`, déclarer ces deux races les aurait
//      ouvertes aux quatre clans en silence. Humains, Griffons et Faucons
//      gardent EXACTEMENT ce qu'ils avaient ;
//   2. arbitrage des Nagas : « Humains » étant partagée par les quatre clans, le
//      clan GARDE son corps 1.15/0.85 et les deux races n'en déclarent aucun —
//      c'est la table de pouvoirs qui les distingue.
import { describe, expect, it } from "vitest";
import {
  FACTIONS,
  KEYWORDS,
  getAllClanNames,
  getClanNamesForRace,
  getFactionForRace,
  getRacesForClan,
} from "@/lib/card-engine/constants";
import { generateCardStats } from "@/lib/card-engine/generator";
import { RACE_FORMS_FR } from "@/lib/card-engine/race-forms";
import { validateRace } from "./faction-clan";

const CLAN = "Les Guerrières du Vent";
const NOUVELLES = ["Pégases", "Sphinx"] as const;

const def = () => FACTIONS["Humains"];
const clan = () => def().clanProfiles?.[CLAN] ?? {};
const profil = (race: string) => def().raceProfiles?.[race] ?? {};
const pouvoirs = (race: string) => Object.keys(profil(race).likelyKeywords ?? {});

describe("rattachement", () => {
  it.each(NOUVELLES)("%s appartient aux Royaumes Libres, sans ambiguïté", (race) => {
    expect(def().races).toContain(race);
    expect(getFactionForRace(race)).toBe("Humains");
  });

  it.each(NOUVELLES)("%s n'ouvre QUE Les Guerrières du Vent", (race) => {
    expect(getClanNamesForRace("Humains", race)).toEqual([CLAN]);
  });

  it("porte le clan à cinq races, les trois autres clans restent à trois", () => {
    expect(getRacesForClan(CLAN).sort()).toEqual(["Faucons", "Griffons", "Humains", "Pégases", "Sphinx"]);
    for (const c of ["Le Royaume du Nord", "L'Ordre de l'Aube", "La Sublime Porte"]) {
      expect(getRacesForClan(c).sort(), c).toEqual(["Faucons", "Griffons", "Humains"]);
    }
  });

  it.each(NOUVELLES)("%s passe la validation serveur, et seulement dans sa faction", (race) => {
    expect(validateRace(race, "Humains")).toEqual({ ok: true, race });
    expect(validateRace(race, "Elfes").ok).toBe(false);
  });
});

describe("scission du groupe transversal — rien ne bouge pour les races en place", () => {
  it("la faction ne déclare plus AUCUN groupe « all »", () => {
    // C'est lui qui aurait ouvert les quatre clans aux deux nouvelles races.
    expect((def().clans ?? []).some((g) => g.appliesTo === "all" || !g.appliesTo)).toBe(false);
  });

  it.each(["Humains", "Griffons", "Faucons"])("%s garde ses quatre clans, dans l'ordre", (race) => {
    expect(getClanNamesForRace("Humains", race)).toEqual([
      "Le Royaume du Nord", "L'Ordre de l'Aube", CLAN, "La Sublime Porte",
    ]);
    expect(getClanNamesForRace("Humains", race)).toEqual(getAllClanNames("Humains"));
  });

  it("chaque race déclarée a bien son groupe — aucune n'est orpheline de clan", () => {
    // Le piège INVERSE : sans groupe « all », une race ajoutée à `races` sans
    // entrée dans `clans` n'ouvrirait plus aucun clan, en silence elle aussi.
    for (const race of def().races) {
      expect(getClanNamesForRace("Humains", race).length, race).toBeGreaterThan(0);
    }
  });
});

describe("le clan GARDE ses stats — les deux races n'en déclarent aucune", () => {
  it.each(NOUVELLES)("%s ne déclare AUCUN statWeights", (race) => {
    // La cascade est `clanStatW ?? raceStatW` : un choix d'OBJET ENTIER. Le clan
    // déclarant les siens, tout gabarit posé ici serait mort-né sans le moindre
    // avertissement. L'omission est la façon de le DIRE.
    expect(profil(race).statWeights).toBeUndefined();
  });

  it("le clan, lui, garde bien les siens", () => {
    expect(clan().statWeights).toEqual({ atk: 1.15, def: 0.85 });
    expect(def().raceProfiles?.["Humains"]).toBeUndefined();
  });
});

describe("tables de pouvoirs", () => {
  it("le pégase vole, fond sur sa proie et vit en harde", () => {
    expect(pouvoirs("Pégases")).toEqual(expect.arrayContaining(["Vol", "Raid", "Loyauté"]));
  });

  it("la sphinx pose l'énigme, lit l'avenir et condamne — sans voler", () => {
    expect(pouvoirs("Sphinx")).toEqual(expect.arrayContaining(["Présage", "Divination", "Malédiction"]));
    expect(pouvoirs("Sphinx")).not.toContain("Vol");
  });

  it("les deux registres ne se recoupent sur AUCUN pouvoir", () => {
    const sphinx = new Set(pouvoirs("Sphinx"));
    expect(pouvoirs("Pégases").filter((k) => sphinx.has(k))).toEqual([]);
  });

  it.each(NOUVELLES)("%s ne double AUCUN pouvoir du clan", (race) => {
    // Le poids de clan gagne pouvoir par pouvoir : un doublon serait une ligne
    // morte. Célérité, évidente pour un coursier, lui vient donc du clan.
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Célérité")).toBe(true);
    expect(pouvoirs(race).filter((k) => duClan.has(k))).toEqual([]);
  });

  it.each(NOUVELLES)("%s dépasse l'ombrelle de faction là où il la recoupe", (race) => {
    const faction = def().likelyKeywords;
    for (const [kw, poids] of Object.entries(profil(race).likelyKeywords ?? {})) {
      if (faction[kw] !== undefined) expect(poids, kw).toBeGreaterThan(faction[kw]);
    }
  });

  it("les recoupements avec l'ombrelle sont bien ceux qu'on croit", () => {
    const f = def().likelyKeywords;
    expect(pouvoirs("Pégases").filter((k) => f[k] !== undefined).sort()).toEqual(["Bénédiction", "Loyauté"]);
    expect(pouvoirs("Sphinx").filter((k) => f[k] !== undefined)).toEqual(["Provocation"]);
  });

  it.each(NOUVELLES)("%s ne sollicite aucun pouvoir interdit de la faction", (race) => {
    const interdits = new Set(def().forbiddenKeywords);
    expect(pouvoirs(race).filter((k) => interdits.has(k))).toEqual([]);
  });

  it.each(NOUVELLES)("%s ne cite que des pouvoirs qui EXISTENT", (race) => {
    // Un libellé mal orthographié ne lève aucune erreur : la ligne est morte.
    expect(pouvoirs(race).filter((k) => !(k in KEYWORDS))).toEqual([]);
  });
});

describe("génération et formes", () => {
  it.each(NOUVELLES)("%s : la génération renvoie la race et des stats non nulles", (race) => {
    const c = generateCardStats("Humains", "Unité", "Rare", 4, race, CLAN);
    expect(c.race).toBe(race);
    expect((c.attack ?? 0) + (c.defense ?? 0)).toBeGreaterThan(0);
  });

  it("le pégase vole TOUJOURS, la sphinx jamais par construction", () => {
    // Garanti par la liste en dur du générateur : les poids étant RELATIFS entre
    // ~130 mots-clés, « Vol: 0.90 » seul ne ferait presque jamais voler (mesuré
    // sur le Tengu : un sur quatre-vingts).
    for (let i = 0; i < 60; i++) {
      expect(generateCardStats("Humains", "Unité", "Commune", 3, "Pégases", CLAN).keywords).toContain("Vol");
    }
    // La sphinx peut tirer Vol comme n'importe quel mot-clé au poids de fond,
    // mais rien ne le lui GARANTIT : sur des Communes à bas coût, jamais deux
    // fois de suite sur tout l'échantillon.
    let volantes = 0;
    for (let i = 0; i < 60; i++) {
      if (generateCardStats("Humains", "Unité", "Commune", 3, "Sphinx", CLAN).keywords?.includes("Vol")) volantes++;
    }
    expect(volantes).toBeLessThan(10);
  });

  it("sont déclinées en français", () => {
    expect(RACE_FORMS_FR["Pégases"]).toEqual({ def: "le Pégase", bare: "Pégase", de: "du Pégase" });
    // Invariable : pas de « Sphin ».
    expect(RACE_FORMS_FR["Sphinx"]).toEqual({ def: "le Sphinx", bare: "Sphinx", de: "du Sphinx" });
  });
});
