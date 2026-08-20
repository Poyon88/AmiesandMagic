// Les REMISES À ZÉRO de la forge doivent couvrir TOUS les champs de saisie.
//
// Deux défauts de la même famille, signalés le 2026-08-20 :
//
//  * après l'ajout d'une carte, coller un nouveau prompt dans le champ de droite
//    laissait le champ central afficher celui de la carte PRÉCÉDENTE. Le centre
//    n'est pas un miroir : il porte une édition manuelle qui masquait la source
//    tant qu'on ne la remettait pas à null — et `resetCardForm` l'oubliait ;
//  * le coût de REPLI, ajouté le même jour, manquait aux deux remises à zéro :
//    il se serait reporté en silence sur la carte suivante.
//
// L'édition du prompt est désormais liée à SA source et se périme d'elle-même,
// ce qui règle le premier cas par construction. Ce fichier garde le second :
// chaque `setManualXxx` de la forge doit apparaître dans les deux remises à
// zéro, faute de quoi le champ suivant qu'on ajoutera fuitera à son tour.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(
  path.join(process.cwd(), "src/components/card-forge/CardForge.tsx"),
  "utf8",
);

/** Corps d'une fonction déclarée `const nom = useCallback((…) => {` … `}, [])`. */
function corpsDe(nom: string): string {
  const debut = SRC.indexOf(`const ${nom} = useCallback(`);
  expect(debut, `${nom} introuvable`).toBeGreaterThan(-1);
  // Le corps s'arrête à la fermeture du useCallback, repérée par sa liste de
  // dépendances en fin de ligne.
  const fin = SRC.indexOf("}, [", debut);
  expect(fin, `fin de ${nom} introuvable`).toBeGreaterThan(debut);
  return SRC.slice(debut, fin);
}

/** Tous les états de saisie manuelle déclarés dans la forge. */
function setteursManuels(): string[] {
  const trouves = new Set<string>();
  for (const m of SRC.matchAll(/const \[manual\w+, (setManual\w+)\] = useState/g)) {
    trouves.add(m[1]);
  }
  return [...trouves].sort();
}

describe("les champs de saisie de la forge", () => {
  it("sont assez nombreux pour que le relevé ait un sens", () => {
    // Garde-fou du test lui-même : si la déclaration des états change de forme,
    // le relevé se viderait et tous les cas ci-dessous passeraient à vide.
    expect(setteursManuels().length).toBeGreaterThan(10);
  });

  for (const nomReset of ["resetManualForm", "resetCardForm"]) {
    it(`sont TOUS remis à zéro par ${nomReset}`, () => {
      const corps = corpsDe(nomReset);
      const oublies = setteursManuels().filter(s => !corps.includes(s));

      expect(oublies, `${nomReset} oublie : ${oublies.join(", ")}`).toEqual([]);
    });
  }
});

describe("l'édition du prompt d'illustration", () => {
  it("est liée à sa source, et non gardée comme simple texte", () => {
    // C'est cette liaison qui fait expirer l'édition dès que la source change :
    // revenir à un `string | null` ramènerait le défaut signalé.
    expect(SRC).toContain("useState<{ source: string; texte: string } | null>(null)");
  });

  it("n'est retenue que si sa source est TOUJOURS celle d'origine", () => {
    expect(SRC).toContain("editedPrompt.source === basePrompt");
  });

  it("est aussi vidée par la remise à zéro d'après-création", () => {
    // Ceinture et bretelles : la péremption suffirait, mais laisser une édition
    // périmée dans l'état après un reset serait un piège pour la suite.
    expect(corpsDe("resetCardForm")).toContain("setEditedPrompt(null)");
  });
});
