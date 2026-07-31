// Le filtre « Mot-clé… » de l'éditeur de cartes interroge DEUX colonnes
// (`keywords` et `spell_keywords`), mais sa liste d'options ne proposait que
// les mots-clés de créature : les mécaniques réservées aux sorts — Guérison en
// tête — étaient introuvables, alors que le filtre savait les traiter.
//
// Ce test verrouille l'invariant : toute mécanique interrogeable par le filtre
// doit être proposable dans sa liste.
import { describe, expect, it } from "vitest";
import { ALL_KEYWORDS, KEYWORD_LABELS } from "./keyword-labels";
import { ALL_SPELL_KEYWORDS, SPELL_KEYWORD_LABELS } from "./spell-keywords";

/** Réplique de FILTER_KEYWORDS (CardEditor.tsx). */
function buildFilterKeywords(): { id: string; label: string }[] {
  const byId = new Map<string, string>();
  for (const kw of ALL_KEYWORDS) byId.set(kw, KEYWORD_LABELS[kw]);
  for (const id of ALL_SPELL_KEYWORDS) {
    if (!byId.has(id)) byId.set(id, SPELL_KEYWORD_LABELS[id] ?? id);
  }
  return [...byId]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

describe("filtre « Mot-clé… » de l'éditeur", () => {
  const options = buildFilterKeywords();
  const ids = new Set(options.map((o) => o.id));

  it("propose Guérison, réservée aux sorts (le cas signalé)", () => {
    expect(ids.has("guerison")).toBe(true);
    expect(options.find((o) => o.id === "guerison")?.label).toBe("Guérison X");
  });

  it("propose TOUTES les mécaniques de sort", () => {
    const manquantes = ALL_SPELL_KEYWORDS.filter((id) => !ids.has(id));
    expect(manquantes).toEqual([]);
  });

  it("propose TOUS les mots-clés de créature", () => {
    const manquants = ALL_KEYWORDS.filter((kw) => !ids.has(kw));
    expect(manquants).toEqual([]);
  });

  it("ne propose aucun doublon (les polymorphes n'apparaissent qu'une fois)", () => {
    expect(ids.size).toBe(options.length);
    // Impact existe des deux côtés : une seule entrée attendue.
    expect(options.filter((o) => o.id === "impact")).toHaveLength(1);
  });

  it("n'affiche jamais un identifiant brut faute de libellé", () => {
    const bruts = options.filter((o) => o.label === o.id);
    expect(bruts).toEqual([]);
  });

  it("est trié par libellé français", () => {
    const labels = options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "fr")));
  });
});
