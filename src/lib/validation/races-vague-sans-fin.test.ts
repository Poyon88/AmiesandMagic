// Les trois races d'eau ajoutées à « La Vague Sans Fin » (faction `Élémentaires`,
// affichée « Les Primordiaux ») le 2026-08-28 : Ondins, Sirènes, Léviathans.
//
// Ce lot prend l'arbitrage INVERSE des trois lots de la Nécropole : le clan
// GARDE ses `statWeights`. La raison est structurelle et propre à cette faction
// — voir le describe dédié, qui la verrouille.
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
import { validateRace } from "./faction-clan";

const NOUVELLES = ["Ondins", "Sirènes", "Léviathans"] as const;
const TOUS_LES_CLANS = [
  "La Colère des Flammes",
  "Le Socle du Monde",
  "La Vague Sans Fin",
  "Le Souffle des Cimes",
] as const;
const def = () => FACTIONS["Élémentaires"];
const clan = () => def().clanProfiles?.["La Vague Sans Fin"] ?? {};
const prof = (r: string) => def().raceProfiles?.[r] ?? {};

describe("rattachement — le groupe transversal a dû être scindé", () => {
  it("chacune appartient aux Primordiaux", () => {
    for (const r of NOUVELLES) {
      expect(def().races, r).toContain(r);
      expect(getFactionForRace(r), r).toBe("Élémentaires");
    }
  });

  it("chacune n'ouvre QUE La Vague Sans Fin", () => {
    for (const r of NOUVELLES) {
      expect(getClanNamesForRace("Élémentaires", r), r).toEqual(["La Vague Sans Fin"]);
    }
  });

  it("la faction ne déclare plus AUCUN groupe transversal", () => {
    // C'est ce qui rend le rattachement effectif : un seul `appliesTo: "all"`
    // résiduel rouvrirait les quatre clans aux trois races d'eau, en silence —
    // `getRacesForClan` traitant "all" comme « toutes les races de la faction ».
    expect((def().clans ?? []).filter((g) => g.appliesTo === "all")).toEqual([]);
  });

  it("« Élémentaire » conserve ses quatre clans", () => {
    // La contrepartie de la scission ne doit pas amputer la race historique.
    expect(getClanNamesForRace("Élémentaires", "Élémentaire")).toEqual([...TOUS_LES_CLANS]);
  });

  it("le feu, la terre et l'air ne reçoivent aucune race d'eau", () => {
    // Formulé en « aucune FUITE d'eau » plutôt qu'en « ces clans n'ont qu'une
    // race » : Le Socle du Monde a reçu ses propres races le même jour, et une
    // liste close aurait cassé à chaque ajout ailleurs dans la faction.
    for (const c of ["La Colère des Flammes", "Le Socle du Monde", "Le Souffle des Cimes"]) {
      for (const r of NOUVELLES) expect(getRacesForClan(c), `${c} / ${r}`).not.toContain(r);
      expect(getRacesForClan(c), c).toContain("Élémentaire");
    }
    expect(getRacesForClan("La Vague Sans Fin")).toEqual(["Élémentaire", ...NOUVELLES]);
  });

  it("n'ouvre aucun clan supplémentaire à la faction", () => {
    expect(getAllClanNames("Élémentaires")).toEqual([...TOUS_LES_CLANS]);
  });

  it("passe la validation serveur, et seulement dans sa faction", () => {
    for (const r of NOUVELLES) {
      expect(validateRace(r, "Élémentaires"), r).toEqual({ ok: true, race: r });
      expect(validateRace(r, "Morts-Vivants").ok, r).toBe(false);
    }
  });

  it("l'Ondin s'élide, la Sirène est féminine", () => {
    expect(RACE_FORMS_FR["Ondins"].def).toBe("l'Ondin");
    expect(RACE_FORMS_FR["Ondins"].de).toBe("de l'Ondin");
    expect(RACE_FORMS_FR["Sirènes"].def).toBe("la Sirène");
    expect(RACE_FORMS_FR["Léviathans"].def).toBe("le Léviathan");
  });
});

describe("le clan GARDE ses stats — et il ne peut pas faire autrement", () => {
  it("aucune des trois races ne déclare de statWeights", () => {
    for (const r of NOUVELLES) expect(prof(r).statWeights, r).toBeUndefined();
  });

  it("le clan, lui, garde bien les siens", () => {
    expect(clan().statWeights).toEqual({ atk: 0.90, def: 1.10 });
  });

  it("« Élémentaire » n'a AUCUN profil de race, et ne doit jamais en avoir", () => {
    // LA règle du lot : la race appartient aux QUATRE clans, donc son corps
    // dépend du clan. Un `statWeights` posé ici vaudrait pour les quatre et
    // donnerait le corps de l'EAU à un élémentaire sans clan (1.10/1.10
    // aujourd'hui). C'est ce qui interdit à ce clan de céder.
    expect(def().raceProfiles?.["Élémentaire"]).toBeUndefined();
  });

  it("un élémentaire SANS clan garde l'ombrelle de faction", () => {
    expect(def().statWeights).toEqual({ atk: 1.10, def: 1.10 });
  });

  it("les quatre races d'eau partagent le corps du clan", () => {
      // Mesuré à 10 manas et sur 200 tirages, PAS à 5 sur 80 : le générateur
      // écrête la dispersion (`maxRatio` 2.5), et sur un petit total de stats
      // cet écrêtage comprime l'écart voulu sous le bruit — ces comparaisons
      // devenaient instables (deux d'entre elles ont échoué au hasard des
      // exécutions). Plus le total est grand, plus le ratio s'exprime.
    const moy = (race: string, champ: "attack" | "defense") => {
      let t = 0;
      for (let i = 0; i < 200; i++) {
        t += generateCardStats("Élémentaires", "Unité", "Rare", 10, race, "La Vague Sans Fin")[champ] ?? 0;
      }
      return t / 200;
    };
    const base = moy("Élémentaire", "attack") + moy("Élémentaire", "defense");
    for (const r of NOUVELLES) {
      expect(Math.abs(moy(r, "attack") + moy(r, "defense") - base), r).toBeLessThan(1.5);
    }
  });

  it("le Léviathan reste un colosse : la taille vient du mana, pas des poids", () => {
    // `statTotal = mana*2+1 (+ bonus de rareté)` — les poids ne décident que du
    // PARTAGE. C'est ce qui rend le corps partagé acceptable pour lui.
    const petit = generateCardStats("Élémentaires", "Unité", "Rare", 2, "Léviathans", "La Vague Sans Fin");
    const grand = generateCardStats("Élémentaires", "Unité", "Rare", 10, "Léviathans", "La Vague Sans Fin");
    const somme = (c: { attack: number | null; defense: number | null }) => (c.attack ?? 0) + (c.defense ?? 0);
    expect(somme(grand)).toBeGreaterThan(somme(petit) * 2);
  });
});

describe("tables de pouvoirs — c'est elles qui séparent les trois", () => {
  it("chacune joue son propre registre", () => {
    expect(Object.keys(prof("Ondins").likelyKeywords ?? {})).toContain("Riposte X");
    expect(Object.keys(prof("Sirènes").likelyKeywords ?? {})).toContain("Domination");
    expect(Object.keys(prof("Léviathans").likelyKeywords ?? {})).toContain("Piétinement");
  });

  it("aucune ne double un pouvoir du clan", () => {
    // Le poids de clan gagne pouvoir par pouvoir : un doublon serait une ligne
    // morte. Régénération et Drain de vie, les évidences aquatiques, viennent
    // toutes deux du clan.
    const duClan = new Set(Object.keys(clan().likelyKeywords ?? {}));
    expect(duClan.has("Régénération")).toBe(true);
    for (const r of NOUVELLES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => duClan.has(k)), r).toEqual([]);
    }
  });

  it("dépasse l'ombrelle de faction partout où elle la recoupe", () => {
    const faction = def().likelyKeywords;
    for (const r of NOUVELLES) {
      for (const [kw, poids] of Object.entries(prof(r).likelyKeywords ?? {})) {
        if (faction[kw] !== undefined) expect(poids, `${r} / ${kw}`).toBeGreaterThan(faction[kw]);
      }
    }
  });

  it("aucune ne sollicite un pouvoir interdit de la faction", () => {
    const interdits = new Set(def().forbiddenKeywords);
    for (const r of NOUVELLES) {
      expect(Object.keys(prof(r).likelyKeywords ?? {}).filter((k) => interdits.has(k)), r).toEqual([]);
    }
  });
});
