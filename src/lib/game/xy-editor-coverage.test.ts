// Toute capacité à COUPLE +X/+Y doit être saisissable dans l'onglet Édition.
//
// `CardEditor` traite chaque paire par un bloc écrit à la main — un `useState`,
// une branche de chargement, une branche de sauvegarde et un champ de saisie.
// Quatre morceaux, aucun vérifié par le compilateur. Seuil Sacrificiel n'en
// avait AUCUN : le panneau générique « Valeurs X » n'affichait qu'un nombre, et
// toute carte passée par cet éditeur repartait avec le défaut moteur `y = 1`,
// en silence.
//
// On ne peut pas typer ce couplage, alors on le teste : chaque id de
// `XY_ABILITY_IDS` (dérivé du libellé « X/Y » du registre, donc automatiquement
// à jour) doit apparaître dans les quatre morceaux du composant.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { XY_ABILITY_IDS } from "./abilities";

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/components/admin/CardEditor.tsx"),
  "utf8",
);

/** Capacités X/Y que l'éditeur n'a pas à savoir saisir, avec leur raison. */
const HORS_EDITEUR: Record<string, string> = {
  // Couple porté par un SORT (X sorts de coût Y) : il vit dans le bloc
  // spell_keywords, pas dans les mots-clés de créature. Le bloc créature
  // existe bien (dcY) — cette entrée ne sert qu'à documenter le cas mixte.
};

describe("couverture des capacités +X/+Y dans l'éditeur", () => {
  const ids = [...XY_ABILITY_IDS].filter((id) => !(id in HORS_EDITEUR));

  it("le registre en déclare bien plusieurs (le test ne tourne pas à vide)", () => {
    expect(ids.length).toBeGreaterThan(3);
    // Le cas qui a motivé ce fichier.
    expect(ids).toContain("seuil_sacrificiel");
  });

  it.each(ids)("« %s » a un champ Y dans CardEditor", (id) => {
    // Chargement : la valeur enregistrée doit être relue…
    expect(SOURCE, `chargement de ${id}`).toContain(`inst.id === "${id}"`);
    // …et sauvegarde : la branche doit émettre un `y`.
    const brancheSauvegarde = new RegExp(
      `id === "${id}"[\\s\\S]{0,400}?y:\\s*\\w+`,
    );
    expect(brancheSauvegarde.test(SOURCE), `sauvegarde du y de ${id}`).toBe(true);
  });
});
