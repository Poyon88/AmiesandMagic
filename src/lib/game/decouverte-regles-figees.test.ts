// Partie figée à la première découverte (2026-11-20) : chaque navigateur lisait
// la variante de découverte dans le drapeau de SA build. Deux onglets servis
// par deux déploiements calculaient deux offres ; le choix de l'un, absent de
// l'offre de l'autre, y était refusé en silence, et plus aucune action ne
// passait. Les règles sont désormais figées par le serveur et reprises telles
// quelles par les deux clients et par le rejeu.
import { afterEach, describe, expect, it, vi } from "vitest";
import { lireRegles, reglesDeCetteBuild, reglesInitiales } from "./decouverte";
import { reglesDuSnapshot } from "./match-setup";
import { useGameStore } from "@/lib/store/gameStore";
import { mkCard } from "./test-harness";

const drapeau = (v: string | undefined) => vi.stubEnv("NEXT_PUBLIC_REGLE_DECOUVERTE", v as string);
afterEach(() => vi.unstubAllEnvs());

describe("règles de découverte figées avec la partie", () => {
  it("la capture enregistre la variante de la build qui fige", () => {
    drapeau("2");
    expect(reglesDeCetteBuild()).toEqual({ decouverteAlternee: true, decouverteVariante: 2 });
    drapeau("1");
    expect(reglesDeCetteBuild()).toEqual({ decouverteAlternee: true });
    drapeau("");
    expect(reglesDeCetteBuild()).toEqual({ decouverteAlternee: false });
  });

  it("une capture d'avant le correctif se relit en variante 1", () => {
    expect(reglesDuSnapshot({ decouverteAlternee: true })).toEqual({ decouverteAlternee: true });
    expect(reglesDuSnapshot({ decouverteAlternee: true, decouverteVariante: 2 })).toEqual({ decouverteAlternee: true, decouverteVariante: 2 });
    expect(reglesDuSnapshot({ decouverteAlternee: false, decouverteVariante: 2 })).toEqual({ decouverteAlternee: false });
  });

  it("ne lit que des règles bien formées", () => {
    expect(lireRegles(undefined)).toBeNull();
    expect(lireRegles({})).toBeNull();
    expect(lireRegles({ decouverteAlternee: "oui" })).toBeNull();
    expect(lireRegles({ decouverteAlternee: true, decouverteVariante: 3 })).toEqual({ decouverteAlternee: true });
  });

  it("la variante 1 garde l'état d'avant (pas de champ decouverteVariante)", () => {
    expect(reglesInitiales({ decouverteAlternee: true })).toEqual({ decouverteAlternee: true });
    expect(reglesInitiales({ decouverteAlternee: false })).toBeUndefined();
  });

  // Le cas de la partie figée : la build locale dit 1, le serveur a figé 2.
  it("le client initialise la partie avec les règles reçues, pas avec son drapeau", () => {
    const deck = [{ card: mkCard({ id: 1, name: "Commune", rarity: "Commune", card_type: "creature", attack: 1, health: 1 }), quantity: 50 }];
    const init = useGameStore.getState().initGame;

    drapeau("1");
    init("a", "b", deck, deck, 0, 7, null, null, [], [], null, { decouverteAlternee: true, decouverteVariante: 2 });
    expect(useGameStore.getState().gameState?.regles).toMatchObject({ decouverteAlternee: true, decouverteVariante: 2 });

    drapeau("2");
    init("a", "b", deck, deck, 0, 7, null, null, [], [], null, { decouverteAlternee: true });
    expect(useGameStore.getState().gameState?.regles?.decouverteVariante).toBeUndefined();
    expect(useGameStore.getState().gameState?.regles?.decouverteAlternee).toBe(true);
  });
});
