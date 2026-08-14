// Le PORTILLON d'animation : `hasAnything`.
//
// Le store a deux chemins. Si `hasAnything` est faux, l'action est commitée
// d'un bloc, sans jouer une seule phase — donc sans aucune animation. Ce
// drapeau est une énumération manuelle des événements « visibles », et c'est
// exactement le motif qui dérive en silence dans ce dépôt : on ajoute un
// événement, on écrit sa phase, on branche son overlay, et on oublie le
// portillon. L'animation ne rate pas — elle n'est jamais lancée.
//
// C'est ce qui est arrivé à COMPAGNONS. La capacité ne touche que le deck : sur
// une créature vanille, ni overlay, ni dégât, ni mort, ni invocation, ni pioche
// ne lèvent. Le drapeau restait faux, l'événement était calculé puis jeté.
//
// Ce test relit la source et exige que TOUT événement posé par une phase soit
// atteignable depuis le portillon.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(
  path.join(process.cwd(), "src/lib/store/gameStore.ts"),
  "utf8",
);

/** L'expression du portillon, plus les drapeaux intermédiaires qu'elle agrège
 *  (`hasOverlay`, `hasImpacts`, …) : un événement peut être couvert par l'un
 *  d'eux plutôt que cité directement. */
function porteeDuPortillon(): string {
  const portillon = SRC.match(/const hasAnything = .*/)?.[0];
  expect(portillon, "hasAnything introuvable — le portillon a été renommé").toBeTruthy();
  const drapeaux = SRC.match(/const has[A-Z]\w* = .*/g) ?? [];
  return [portillon, ...drapeaux].join("\n");
}

/** Les événements posés « si présents » par une phase : `...(xEvent ? {…} : {})`. */
function evenementsPoses(): string[] {
  return [...new Set(
    [...SRC.matchAll(/\.\.\.\((\w+Event)\s*\?\s*\{/g)].map((m) => m[1]),
  )].sort();
}

describe("Portillon d'animation", () => {
  it("pose au moins une poignée d'événements — le scan n'est pas à vide", () => {
    // Sans ça, un renommage du motif de pose rendrait le test vert et muet.
    expect(evenementsPoses().length).toBeGreaterThanOrEqual(5);
  });

  it.each(evenementsPoses())(
    "%s ouvre le portillon (sinon il est calculé puis jeté)",
    (evenement) => {
      expect(porteeDuPortillon()).toContain(evenement);
    },
  );

  it("Compagnons y figure NOMMÉMENT — rien d'autre ne le couvre", () => {
    // Cycle éternel s'en tire par `hasDeaths` : il accompagne toujours une mort.
    // Compagnons n'a aucun tel filet — il ne déplace que des cartes vers le
    // deck, une zone dont aucun drapeau ne surveille la taille.
    expect(SRC.match(/const hasAnything = .*/)?.[0]).toContain("!!compagnonsEvent");
  });
});
