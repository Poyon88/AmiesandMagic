// L'ordre d'affichage des formats et le format présélectionné doivent venir de la
// MÊME source.
//
// Ils étaient dissociés : la liste suivait le `id` de la table, la sélection était
// codée en dur sur `expert-standard` dans MatchmakingQueue. Le premier bouton et
// celui qui était coché pouvaient donc différer — c'est ce qu'on voyait à l'écran.
import { describe, expect, it } from "vitest";
import { FEATURED_FORMAT_CODE, defaultFormatId, orderFormatsForPlay } from "./format-order";
import type { GameFormat } from "./types";

const fmt = (id: number, code: string): GameFormat =>
  ({ id, code, name: code, description: null, is_active: true }) as GameFormat;

/** Les quatre formats dans l'ordre de la table (id croissant). */
const parId = [
  fmt(1, "expert-standard"),
  fmt(2, "expert-etendu"),
  fmt(3, "classique-etendu"),
  fmt(4, "classique-standard"),
];

describe("orderFormatsForPlay", () => {
  it("place le format mis en avant en TÊTE", () => {
    expect(orderFormatsForPlay(parId).map((f) => f.code)).toEqual([
      "classique-standard", "expert-standard", "expert-etendu", "classique-etendu",
    ]);
  });

  it("conserve l'ordre de la base pour les autres", () => {
    const reste = orderFormatsForPlay(parId).slice(1).map((f) => f.id);
    expect(reste).toEqual([1, 2, 3]);
  });

  it("ne filtre RIEN : la diffusion est décidée par is_active, pas ici", () => {
    expect(orderFormatsForPlay(parId)).toHaveLength(parId.length);
  });

  it("liste vide : rend une liste vide, sans lever", () => {
    expect(orderFormatsForPlay([])).toEqual([]);
  });
});

describe("defaultFormatId", () => {
  it("présélectionne le format mis en avant", () => {
    expect(defaultFormatId(parId)).toBe(4);
  });

  it("retombe sur le premier diffusé quand le format mis en avant est MASQUÉ", () => {
    // Cas réel : l'admin désactive Classique · Standard depuis la forge.
    const sansMisEnAvant = parId.filter((f) => f.code !== FEATURED_FORMAT_CODE);
    expect(defaultFormatId(sansMisEnAvant)).toBe(1);
  });

  it("aucun format diffusé : null, pas une erreur", () => {
    expect(defaultFormatId([])).toBeNull();
  });

  it("le défaut est TOUJOURS le premier de la liste affichée", () => {
    // C'est l'invariant qui manquait : les deux dérivent désormais l'un de l'autre.
    for (const liste of [parId, parId.slice(1), parId.slice(2), []]) {
      expect(defaultFormatId(liste)).toBe(orderFormatsForPlay(liste)[0]?.id ?? null);
    }
  });
});
