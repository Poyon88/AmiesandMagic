// PLANCHER DE MISE PAR RARETÉ, et interdiction des communes.
//
// Deux règles arbitrées avec l'auteur :
//   · 50 / 100 / 150 / 200 pour Peu Commune / Rare / Épique / Légendaire ;
//   · les COMMUNES ne sont jamais mises en vente — ce n'est pas un plancher
//     bas, c'est une interdiction.
//
// Ce que ce fichier garde en priorité : le **refus** doit rester un refus. Une
// fonction qui retomberait sur un plancher par défaut pour une rareté inconnue
// rouvrirait précisément la vente qu'on ferme.
import { describe, expect, it } from "vitest";
import {
  MIN_STARTING_BID,
  AUCTIONABLE_RARITIES,
  isAuctionableRarity,
  minStartingBidForLot,
  forbiddenRarities,
} from "../pricing";
import { RARITIES } from "@/lib/card-engine/constants";

describe("la grille", () => {
  it("porte exactement les montants demandés", () => {
    expect(MIN_STARTING_BID).toEqual({
      "Peu Commune": 50,
      "Rare": 100,
      "Épique": 150,
      "Légendaire": 200,
    });
  });

  it("ses clés sont de VRAIES raretés du jeu", () => {
    // Une faute de frappe (« Epique » sans accent) rendrait la carte
    // invendable sans que rien ne le signale : la grille ne matcherait
    // simplement jamais.
    const connues = RARITIES.map((r) => r.id);
    for (const r of AUCTIONABLE_RARITIES) {
      expect(connues, `« ${r} » n'est pas une rareté du jeu`).toContain(r);
    }
  });

  it("couvre toutes les raretés SAUF Commune", () => {
    const connues = RARITIES.map((r) => r.id);
    const manquantes = connues.filter((r) => !AUCTIONABLE_RARITIES.includes(r));
    expect(manquantes).toEqual(["Commune"]);
  });

  it("croît avec la rareté", () => {
    // Un plancher qui n'ordonnerait pas les raretés serait un bug de saisie.
    const parTier = RARITIES.filter((r) => r.id in MIN_STARTING_BID)
      .sort((a, b) => a.tier - b.tier)
      .map((r) => MIN_STARTING_BID[r.id]);
    for (let i = 1; i < parTier.length; i++) {
      expect(parTier[i]).toBeGreaterThan(parTier[i - 1]);
    }
  });
});

describe("ce qui est vendable", () => {
  it("les quatre raretés de la grille le sont", () => {
    for (const r of AUCTIONABLE_RARITIES) expect(isAuctionableRarity(r)).toBe(true);
  });

  it("la commune ne l'est PAS", () => {
    expect(isAuctionableRarity("Commune")).toBe(false);
  });

  it("ni le vide, ni l'inconnu, ni la casse approximative", () => {
    // `null` arrive d'une carte sans rareté en base ; « rare » minuscule d'une
    // saisie approximative. Les deux doivent être refusés, pas devinés.
    expect(isAuctionableRarity(null)).toBe(false);
    expect(isAuctionableRarity(undefined)).toBe(false);
    expect(isAuctionableRarity("")).toBe(false);
    expect(isAuctionableRarity("Mythique")).toBe(false);
    expect(isAuctionableRarity("rare")).toBe(false);
  });
});

describe("plancher d'un lot — la rareté la PLUS ÉLEVÉE décide", () => {
  it("une seule carte : son propre plancher", () => {
    expect(minStartingBidForLot(["Peu Commune"])).toBe(50);
    expect(minStartingBidForLot(["Rare"])).toBe(100);
    expect(minStartingBidForLot(["Épique"])).toBe(150);
    expect(minStartingBidForLot(["Légendaire"])).toBe(200);
  });

  it("lot mélangé : la meilleure carte impose le plancher", () => {
    expect(minStartingBidForLot(["Légendaire", "Peu Commune", "Peu Commune"])).toBe(200);
    expect(minStartingBidForLot(["Peu Commune", "Rare"])).toBe(100);
  });

  it("l'ordre des cartes n'y change rien", () => {
    expect(minStartingBidForLot(["Peu Commune", "Légendaire"]))
      .toBe(minStartingBidForLot(["Légendaire", "Peu Commune"]));
  });

  it("ce n'est PAS la somme — c'est le choix qui a été fait", () => {
    // Dix légendaires démarrent à 200, pas à 2 000. Contrepartie assumée :
    // la somme aurait rendu les gros lots invendables.
    expect(minStartingBidForLot(Array(10).fill("Légendaire"))).toBe(200);
  });

  it("un lot contenant une COMMUNE est refusé, pas escompté", () => {
    // Le piège : renvoyer 200 en ignorant la commune, ce qui autoriserait la
    // vente qu'on interdit.
    expect(minStartingBidForLot(["Légendaire", "Commune"])).toBeNull();
    expect(minStartingBidForLot(["Commune"])).toBeNull();
  });

  it("une rareté inconnue ou absente est refusée, jamais remplacée par un défaut", () => {
    expect(minStartingBidForLot(["Rare", null])).toBeNull();
    expect(minStartingBidForLot([undefined])).toBeNull();
    expect(minStartingBidForLot(["Mythique"])).toBeNull();
  });

  it("un lot vide est refusé", () => {
    expect(minStartingBidForLot([])).toBeNull();
  });
});

describe("nommer le refus", () => {
  it("liste les raretés fautives, sans doublon", () => {
    expect(forbiddenRarities(["Légendaire", "Commune", "Commune", "Rare"])).toEqual(["Commune"]);
  });

  it("nomme « inconnue » ce qui n'a pas de rareté", () => {
    expect(forbiddenRarities(["Rare", null, undefined])).toEqual(["inconnue"]);
  });

  it("ne signale rien quand tout est vendable", () => {
    expect(forbiddenRarities(["Rare", "Épique"])).toEqual([]);
  });
});
