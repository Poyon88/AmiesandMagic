// Toute capacité à COUPLE +X/+Y doit être saisissable dans les DEUX formulaires
// qui produisent des capacités de créature : l'onglet Édition et la Forge.
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
import { GAME_TO_FORGE_KEYWORD, buildKeywordInstances } from "@/lib/card-forge/keyword-instances";

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

  // La FORGE est le second formulaire, et il avait exactement la même faille :
  // Pureté et Seuil Sacrificiel n'y montraient qu'un seul nombre, et
  // `buildKeywordInstances` les faisait tomber dans la branche générique — celle
  // qui n'émet PAS de `y`. On ne vérifie plus la présence d'un bloc écrit à la
  // main (il n'y en a plus besoin), mais le contrat de sortie : l'instance
  // construite porte un `y` égal à la saisie.
  it.each(ids)("« %s » persiste son Y depuis la forge", (id) => {
    const label = GAME_TO_FORGE_KEYWORD[id];
    expect(label, `libellé forge de ${id}`).toBeTruthy();
    const [instance] = buildKeywordInstances({
      labels: [label],
      xValues: { [label]: 4 },
      yValues: { [label]: 7 },
      extras: { rmY: 7, afY: 7, rfY: 7, dcY: 7, glY: 7, fdaY: 7 },
    });
    expect(instance, `instance construite pour ${label}`).toBeTruthy();
    expect(instance.id).toBe(id);
    expect(instance.y, `y persisté pour ${label}`).toBe(7);
  });

});
