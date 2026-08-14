// Le catalogue du sélecteur de Compagnons doit repartir de zéro après une
// création, une modification ou une suppression de carte.
//
// Signalé : « Mila, Bouclier Dévoué », créée puis cherchée dans la foulée,
// n'apparaissait pas dans le sélecteur. Le catalogue est mis en cache au NIVEAU
// DU MODULE (une requête par session de forge, partagée entre les instances du
// picker) : il survit au démontage du composant et n'était jamais invalidé. Seul
// un rechargement complet de la page le rafraîchissait.
//
// Ce test ne monte pas le composant — il vérifie le CÂBLAGE dans le source : que
// l'invalidation est exportée, et appelée aux trois endroits où le catalogue
// devient périmé.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const PICKER = lire("src/components/card-forge/LinkedCardsPicker.tsx");
const FORGE = lire("src/components/card-forge/CardForge.tsx");
const EDITEUR = lire("src/components/admin/CardEditor.tsx");

describe("Invalidation du catalogue des cartes liées", () => {
  it("le picker exporte de quoi vider son cache", () => {
    expect(PICKER).toMatch(/export function invalidateLinkedCardsCatalog\(\): void/);
  });

  it("vider le cache remet À LA FOIS le résultat et la promesse en cours", () => {
    // Oublier `catalogPromise` laisserait une requête en vol resservir l'ancien
    // catalogue juste après l'invalidation.
    const corps = /export function invalidateLinkedCardsCatalog\(\): void \{([\s\S]*?)\n\}/.exec(PICKER)?.[1] ?? "";
    expect(corps).toContain("catalogCache = null");
    expect(corps).toContain("catalogPromise = null");
  });

  it("la forge invalide après la CRÉATION d'une carte", () => {
    expect(FORGE).toContain("invalidateLinkedCardsCatalog()");
    // Juste avant le message de succès de la création.
    expect(FORGE).toMatch(/invalidateLinkedCardsCatalog\(\);\s*\n\s*setSaveResult\(\{ ok: true, msg: tf\('card_added'/);
  });

  it("l'éditeur invalide après une MISE À JOUR et après une SUPPRESSION", () => {
    expect(EDITEUR).toMatch(/invalidateLinkedCardsCatalog\(\);\s*\n\s*setSaveResult\(\{ ok: true, msg: "Carte mise à jour" \}\)/);
    expect(EDITEUR).toMatch(/invalidateLinkedCardsCatalog\(\);\s*\n\s*setSaveResult\(\{ ok: true, msg: "Carte supprimée" \}\)/);
  });
});

describe("Le sélecteur ne filtre PAS par rareté", () => {
  it("aucune restriction de rareté dans le picker", () => {
    // Vérifié à l'occasion de ce signalement : la rareté n'entre nulle part dans
    // la sélection des cartes liables. Une légendaire est liable comme une
    // commune — le seul obstacle était le cache.
    expect(PICKER).not.toMatch(/rarity/i);
  });
});
