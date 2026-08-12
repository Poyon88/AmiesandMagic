// Les deux listes du ciblage de créature doivent rester d'accord.
//
// Le ciblage à l'entrée en jeu repose sur DEUX inventaires distincts :
//
//   * `getCreatureTargets` — un `switch` qui sait bâtir la liste de cibles d'un
//     mot-clé ;
//   * `CREATURE_TARGETING_KEYWORDS` — le tableau que lit `creatureNeedsTarget`
//     pour décider d'ouvrir le picker.
//
// Un mot-clé présent dans le premier et absent du second est une capacité qui
// ne demande JAMAIS sa cible : le moteur applique son repli — tirage au sort ou
// camp adverse d'office — et rien ne le signale. Trois fois que ça arrive :
// Dévoration (dévorait un allié au hasard), puis Incinération (recyclait
// toujours le cimetière adverse) et Retour différé (renvoyait une unité au
// hasard), les deux trouvés dans la même passe.
//
// On ne peut pas dériver l'un de l'autre : le `switch` est du code, pas une
// donnée. On lit donc le SOURCE du moteur — même méthode que
// `xy-editor-coverage.test.ts`, et même raison : le couplage est réel, il n'est
// simplement pas typable.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/lib/game/engine.ts"),
  "utf8",
);

/** Contenu du tableau `CREATURE_TARGETING_KEYWORDS`. */
function listeDuPicker(): string[] {
  const m = /const CREATURE_TARGETING_KEYWORDS:\s*Keyword\[\]\s*=\s*\[([\s\S]*?)\];/.exec(SOURCE);
  if (!m) throw new Error("CREATURE_TARGETING_KEYWORDS introuvable — le test doit être remis à jour");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

/** Mots-clés traités par le `switch` sur `card.keywords` de `getCreatureTargets`.
 *  On s'arrête au `// Repli` qui clôt la boucle, pour ne pas ramasser les `case`
 *  d'éventuels switch voisins. */
function casesDeGetCreatureTargets(): string[] {
  const debut = SOURCE.indexOf("export function getCreatureTargets");
  if (debut === -1) throw new Error("getCreatureTargets introuvable — le test doit être remis à jour");
  const boucle = SOURCE.indexOf("for (const kw of card.keywords)", debut);
  const fin = SOURCE.indexOf("// Repli", boucle);
  if (boucle === -1 || fin === -1) {
    throw new Error("structure de getCreatureTargets modifiée — le test doit être remis à jour");
  }
  const corps = SOURCE.slice(boucle, fin);
  return [...new Set([...corps.matchAll(/case "([a-z_]+)":/g)].map((x) => x[1]))];
}

describe("cohérence des deux listes de ciblage de créature", () => {
  const picker = listeDuPicker();
  const cibles = casesDeGetCreatureTargets();

  it("les deux listes ont bien été extraites (le test ne tourne pas à vide)", () => {
    expect(picker.length).toBeGreaterThan(10);
    expect(cibles.length).toBeGreaterThan(10);
    // Les trois cas qui ont motivé ce fichier.
    expect(cibles).toContain("devoration");
    expect(cibles).toContain("incineration");
    expect(cibles).toContain("retour_differe");
  });

  it.each(casesDeGetCreatureTargets())(
    "« %s » sait se faire cibler ET ouvre bien le picker",
    (kw) => {
      expect(
        picker,
        `${kw} figure dans getCreatureTargets mais pas dans CREATURE_TARGETING_KEYWORDS : `
          + `le picker ne s'ouvrira jamais et le moteur appliquera son repli en silence`,
      ).toContain(kw);
    },
  );

  it("aucun mot-clé du picker n'est sans liste de cibles", () => {
    // Sens inverse : ouvrir un picker sans savoir quoi proposer donnerait une
    // modale vide. `conferer` est la seule exception légitime — ses cibles sont
    // bâties par le repli composé en fin de fonction, pas par le `switch`.
    const sansCibles = picker.filter((kw) => !cibles.includes(kw) && kw !== "conferer");
    expect(sansCibles, `mots-clés sans branche dans getCreatureTargets : ${sansCibles.join(", ")}`).toEqual([]);
  });
});
