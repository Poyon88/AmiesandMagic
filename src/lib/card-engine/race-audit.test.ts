import { describe, expect, it } from "vitest";
import { auditCoherence, capacitesTypiques, labelsDeCarte } from "./race-audit";
import { FORGE_TO_GAME_KEYWORD } from "@/lib/card-forge/keyword-instances";

const id = (label: string) => FORGE_TO_GAME_KEYWORD[label];
const unite = (over: Record<string, unknown>) => ({
  card_type: "creature", faction: "Nains", race: "Nains", clan: null, rarity: "Commune", keywords: [] as string[], ...over,
});

describe("auditCoherence", () => {
  it("Fée qui piétine : rouge (interdit)", () => {
    const a = auditCoherence(unite({ faction: "Elfes", race: "Fées", keywords: [id("Vol"), id("Piétinement")] }))!;
    expect(a.niveau).toBe("rouge");
    expect(a.interdits).toEqual(["Piétinement"]);
  });

  it("Gargouille sans Vol : rouge (manquant)", () => {
    const a = auditCoherence(unite({ faction: "Morts-Vivants", race: "Gargouilles", clan: "La Cour Écarlate", keywords: [id("Armure")] }))!;
    expect(a.niveau).toBe("rouge");
    expect(a.manquants).toEqual(["Vol"]);
  });

  it("l'alias historique ranged compte comme Vol", () => {
    expect(labelsDeCarte({ keywords: ["ranged"] })).toEqual(["Vol"]);
    const a = auditCoherence(unite({ faction: "Morts-Vivants", race: "Gargouilles", keywords: ["ranged", id("Armure")] }))!;
    expect(a.manquants).toEqual([]);
  });

  it("Nain en armure et résistant : ok", () => {
    const a = auditCoherence(unite({ keywords: [id("Armure"), id("Résistance X")] }))!;
    expect(a.niveau).toBe("ok");
    expect(a.note).toBe(100);
  });

  it("aucune capacité typique sur 3 ou plus : orange ; un mélange reste ok", () => {
    const typiques = new Set(capacitesTypiques(unite({}), 100));
    const atypiques = ["Corruption", "Nécrophagie", "Mimique", "Pillage X", "Liaison de vie"].filter((l) => !typiques.has(l) && id(l));
    const a = auditCoherence(unite({ keywords: atypiques.slice(0, 3).map(id) }))!;
    expect(a.niveau).toBe("orange");
    expect(a.note).toBeLessThan(100);
    const melange = auditCoherence(unite({ keywords: [id("Armure"), ...atypiques.slice(0, 2).map(id)] }))!;
    expect(melange.niveau).toBe("ok");
    expect(auditCoherence(unite({ keywords: atypiques.slice(0, 2).map(id) }))!.niveau).toBe("ok");
  });

  it("Action, Objet ou faction inconnue : pas de note", () => {
    expect(auditCoherence(unite({ card_type: "spell" }))).toBeNull();
    expect(auditCoherence(unite({ card_type: "item" }))).toBeNull();
    expect(auditCoherence(unite({ faction: "Inconnue" }))).toBeNull();
    expect(auditCoherence(unite({ faction: null }))).toBeNull();
  });
});
