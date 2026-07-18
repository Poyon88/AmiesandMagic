// Tests des gardes d'entrée serveur (card save / boards / heroes). Fonctions
// pures validées contre la constante FACTIONS réelle.
import { describe, expect, it } from "vitest";
import { validateFactionClan, validateRace } from "./faction-clan";

// Valeurs stables de FACTIONS (cf. card-engine/constants.ts, post-refonte) :
//   Hommes-Bêtes — races: Hommes-Loups, Hommes-Ours, Hommes-Félins, Centaures,
//                         Mimis, Hommes-Chiens, Hommes-Renards, Hommes-Cerfs
//                  clans: Cour Pourpre, Enfants de la Lune, Pacte des Griffes,
//                         Harde Sauvage (Les Mignons = clan bonus inerte, non listé)
describe("validateFactionClan", () => {
  it("accepte faction + clan valides", () => {
    expect(validateFactionClan("Hommes-Bêtes", "Le Pacte des Griffes")).toEqual({ ok: true, faction: "Hommes-Bêtes", clan: "Le Pacte des Griffes" });
  });

  it("rejette une faction inconnue", () => {
    expect(validateFactionClan("Atlantes", null)).toEqual({ ok: false, error: "Faction invalide" });
  });

  it("rejette un clan sans faction", () => {
    expect(validateFactionClan(null, "Forêt")).toEqual({ ok: false, error: "Clan sans faction" });
  });

  it("rejette un clan invalide pour la faction", () => {
    expect(validateFactionClan("Hommes-Bêtes", "ClanBidon")).toEqual({ ok: false, error: "Clan invalide pour cette faction" });
  });

  it("traite faction/clan null comme absence", () => {
    expect(validateFactionClan(null, null)).toEqual({ ok: true, faction: null, clan: null });
  });

  it("traite les chaînes vides / blanches comme absence", () => {
    expect(validateFactionClan("", "")).toEqual({ ok: true, faction: null, clan: null });
    expect(validateFactionClan("   ", null)).toEqual({ ok: true, faction: null, clan: null });
  });
});

describe("validateRace", () => {
  it("accepte une race de la faction (dont la race ajoutée « Mimis »)", () => {
    expect(validateRace("Centaures", "Hommes-Bêtes")).toEqual({ ok: true, race: "Centaures" });
    expect(validateRace("Mimis", "Hommes-Bêtes")).toEqual({ ok: true, race: "Mimis" });
  });

  it("rejette une race n'appartenant pas à la faction donnée", () => {
    expect(validateRace("Centaures", "Élémentaires")).toEqual({ ok: false, error: "Race invalide pour cette faction" });
  });

  it("sans faction : accepte une race existant dans une faction quelconque", () => {
    expect(validateRace("Centaures", null)).toEqual({ ok: true, race: "Centaures" });
  });

  it("sans faction : rejette une race inconnue partout", () => {
    expect(validateRace("Atlante", null)).toEqual({ ok: false, error: "Race inconnue" });
  });

  it("traite null / chaîne vide comme absence de race", () => {
    expect(validateRace(null, "Hommes-Bêtes")).toEqual({ ok: true, race: null });
    expect(validateRace("", "Hommes-Bêtes")).toEqual({ ok: true, race: null });
  });

  it("rejette une valeur non-string", () => {
    expect(validateRace(123, null)).toEqual({ ok: false, error: "Race invalide" });
  });
});

// Refonte factions & clans (Phase A) : nouvelles factions, factions absorbées,
// nouvelles races et race libre.
describe("refonte factions & clans", () => {
  it("les factions absorbées ne sont plus valides", () => {
    expect(validateFactionClan("Orcs", null)).toEqual({ ok: false, error: "Faction invalide" });
    expect(validateFactionClan("Hobbits", null)).toEqual({ ok: false, error: "Faction invalide" });
  });

  it("accepte les nouvelles factions humaines et leurs clans", () => {
    expect(validateFactionClan("EmpireDuMilieu", "Les Lames de l'Ombre")).toEqual({ ok: true, faction: "EmpireDuMilieu", clan: "Les Lames de l'Ombre" });
    expect(validateFactionClan("RoyaumesDuSoleil", "Les Enfants du Soleil")).toEqual({ ok: true, faction: "RoyaumesDuSoleil", clan: "Les Enfants du Soleil" });
  });

  it("accepte les nouveaux clans des factions refondues", () => {
    expect(validateFactionClan("Elfes", "Les Hobbits").ok).toBe(true);
    expect(validateFactionClan("Elfes Noirs", "Les Cohortes Sanglantes").ok).toBe(true);
    expect(validateFactionClan("Nains", "La Guilde des Ingénieurs").ok).toBe(true);
  });

  it("Les Mignons (clan bonus inerte) n'est pas un clan valide", () => {
    expect(validateFactionClan("Hommes-Bêtes", "Les Mignons")).toEqual({ ok: false, error: "Clan invalide pour cette faction" });
  });

  it("rattache les races absorbées et les nouvelles races à leur faction", () => {
    expect(validateRace("Orcs", "Elfes Noirs")).toEqual({ ok: true, race: "Orcs" });
    expect(validateRace("Hobbits", "Elfes")).toEqual({ ok: true, race: "Hobbits" });
    expect(validateRace("Gnomes", "Nains")).toEqual({ ok: true, race: "Gnomes" });
    expect(validateRace("Guerriers du Chaos", "Elfes Noirs")).toEqual({ ok: true, race: "Guerriers du Chaos" });
  });
});
