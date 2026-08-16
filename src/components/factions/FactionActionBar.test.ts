// Ce que la page d'une faction doit PROPOSER, selon qui la regarde.
//
// L'enjeu n'est pas cosmétique : la même page sert de vitrine publique, d'écran
// de choix gratuit et d'écran d'achat. Se tromper de proposition, c'est soit
// vendre à un joueur ce à quoi il a droit gratuitement, soit lui offrir une
// faction qu'il devrait payer.
import { describe, expect, it } from "vitest";
import { situationPour } from "./FactionActionBar";

type Etat = Parameters<typeof situationPour>[0];

const etat = (p: Partial<NonNullable<Etat>> = {}): NonNullable<Etat> => ({
  factionPrice: 1200,
  bundlePrice: 2300,
  balance: 5000,
  goldDebt: 0,
  ownsBundle: false,
  starterFaction: "Nains",
  factions: [
    { id: "Nains", owned: true, isStarter: true },
    { id: "Elfes", owned: false, isStarter: false },
  ],
  ...p,
});

describe("situationPour", () => {
  it("un visiteur sans compte est invité à s'inscrire, jamais à payer", () => {
    expect(situationPour(null, "Elfes", true)).toEqual({ quoi: "visiteur" });
  });

  it("l'anonymat prime même si un état traîne", () => {
    expect(situationPour(etat(), "Elfes", true).quoi).toBe("visiteur");
  });

  it("sans faction de départ, la faction est OFFERTE — jamais vendue", () => {
    // La règle load-bearing : proposer 1200 or à quelqu'un qui a droit à une
    // faction gratuite, ce serait lui vendre ce qu'on lui doit.
    const s = situationPour(etat({ starterFaction: null }), "Elfes", false);
    expect(s.quoi).toBe("offrable");
  });

  it("l'or abondant ne transforme pas une faction offerte en faction vendue", () => {
    const s = situationPour(etat({ starterFaction: null, balance: 999_999 }), "Elfes", false);
    expect(s.quoi).toBe("offrable");
  });

  it("la faction de départ est reconnue comme telle", () => {
    const s = situationPour(etat(), "Nains", false);
    expect(s).toEqual({ quoi: "possedee", parLeForfait: false, deDepart: true });
  });

  it("une faction achetée est possédée sans être celle de départ", () => {
    const s = situationPour(
      etat({ factions: [{ id: "Elfes", owned: true, isStarter: false }] }),
      "Elfes", false,
    );
    expect(s).toEqual({ quoi: "possedee", parLeForfait: false, deDepart: false });
  });

  it("le forfait rend TOUTE faction possédée, y compris absente de la liste", () => {
    const s = situationPour(etat({ ownsBundle: true, factions: [] }), "Orcs", false);
    expect(s).toEqual({ quoi: "possedee", parLeForfait: true, deDepart: false });
  });

  it("faction manquante et départ déjà fait ⇒ elle est à vendre", () => {
    const s = situationPour(etat(), "Elfes", false);
    // Une seule faction manquante dans l'état par défaut : pas de forfait.
    expect(s).toEqual({ quoi: "achetable", prix: 1200, solde: 5000, dette: 0, forfait: null });
  });

  it("le forfait est rappelé dès qu'il manque PLUSIEURS factions", () => {
    // Sans ce rappel, le forfait n'existerait que dans la boutique : qui
    // navigue de faction en faction ne le découvrirait jamais.
    const s = situationPour(
      etat({
        factions: [
          { id: "Nains", owned: true, isStarter: true },
          { id: "Elfes", owned: false, isStarter: false },
          { id: "Orcs", owned: false, isStarter: false },
        ],
      }),
      "Elfes", false,
    );
    expect(s).toMatchObject({ forfait: { prix: 2300, manquantes: 2 } });
  });

  it("une SEULE faction manquante ⇒ pas de forfait : il coûterait plus cher", () => {
    const s = situationPour(etat(), "Elfes", false);
    expect(s).toMatchObject({ forfait: null });
  });

  it("sans tarif de forfait, aucun rappel", () => {
    const s = situationPour(
      etat({
        bundlePrice: null,
        factions: [
          { id: "Elfes", owned: false, isStarter: false },
          { id: "Orcs", owned: false, isStarter: false },
        ],
      }),
      "Elfes", false,
    );
    expect(s).toMatchObject({ forfait: null });
  });

  it("l'or insuffisant reste une proposition d'achat — c'est l'écran qui la grise", () => {
    // Masquer l'offre cacherait au joueur ce qu'il lui manque, et pourquoi.
    const s = situationPour(etat({ balance: 10 }), "Elfes", false);
    expect(s.quoi).toBe("achetable");
    expect(s).toMatchObject({ solde: 10 });
  });

  it("la dette est transmise pour être expliquée, pas pour masquer l'offre", () => {
    const s = situationPour(etat({ goldDebt: 300 }), "Elfes", false);
    expect(s).toMatchObject({ quoi: "achetable", dette: 300 });
  });

  it("sans tarif (migration non appliquée), rien n'est proposé", () => {
    const s = situationPour(etat({ factionPrice: null }), "Elfes", false);
    expect(s.quoi).toBe("chargement");
  });

  it("mais une faction POSSÉDÉE se signale même sans tarif", () => {
    // Le déploiement partiel ne doit pas faire disparaître ce que le joueur a.
    const s = situationPour(etat({ factionPrice: null }), "Nains", false);
    expect(s.quoi).toBe("possedee");
  });

  it("tant que l'état n'est pas arrivé, on n'affirme rien", () => {
    expect(situationPour(null, "Elfes", false).quoi).toBe("chargement");
  });
});
