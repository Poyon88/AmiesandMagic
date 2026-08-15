// En mode MANUEL, la forge propose TOUTES les capacités de créature.
//
// La liste était filtrée par le palier de rareté (`minTier`) et par les
// interdits de la faction. Ces deux garde-fous appartiennent au GÉNÉRATEUR :
// ils existent pour qu'un tirage aléatoire reste cohérent avec le profil d'une
// faction. Appliqués à la main, ils retiraient des capacités de l'écran sans
// dire lesquelles ni pourquoi — sur une carte Commune, 10 sur 117 restaient.
//
// Un auteur qui pose délibérément une carte n'a pas à être protégé de son
// propre choix. Ce test empêche le filtre de revenir « par prudence ».
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { KEYWORDS, FACTIONS, RARITY_MAP } from "@/lib/card-engine/constants";

const SRC = fs.readFileSync(
  path.join(process.cwd(), "src/components/card-forge/CardForge.tsx"),
  "utf8",
);

/** La déclaration de la palette manuelle, jusqu'à son point-virgule. */
function declarationPalette(): string {
  const i = SRC.indexOf("const availableManualKeywords");
  expect(i, "la palette manuelle a été renommée").toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf(";", i));
}

describe("Palette manuelle", () => {
  it("part du registre ENTIER", () => {
    expect(declarationPalette()).toContain("Object.entries(KEYWORDS)");
  });

  it("ne filtre rien — ni palier, ni interdits de faction", () => {
    const d = declarationPalette();
    expect(d).not.toContain(".filter(");
    expect(d).not.toContain("minTier");
    expect(d).not.toContain("forbiddenKeywords");
  });

  it("n'introduit pas de filtre par race ou par clan", () => {
    // Ils n'ont jamais filtré cette liste ; la demande était explicitement
    // qu'ils ne le fassent pas non plus à l'avenir.
    const d = declarationPalette();
    for (const champ of ["race", "clan", "rarity"]) expect(d).not.toContain(champ);
  });
});

describe("Ce que le filtre coûtait", () => {
  const total = Object.keys(KEYWORDS).length;

  it("cachait la grande majorité des capacités sur une carte Commune", () => {
    // Le chiffre exact bougera avec le registre ; ce qui compte est l'ordre de
    // grandeur, qui justifie la levée.
    const tier = RARITY_MAP["Commune"]?.tier ?? 0;
    const visibles = Object.values(KEYWORDS).filter((k) => k.minTier <= tier).length;
    expect(visibles).toBeLessThan(total / 4);
  });

  it("retirait en plus les interdits de CHAQUE faction", () => {
    const avecInterdits = Object.values(FACTIONS).filter(
      (f) => (f.forbiddenKeywords ?? []).length > 0,
    );
    expect(avecInterdits.length).toBe(Object.keys(FACTIONS).length);
  });
});

describe("Rien ne re-filtre en aval", () => {
  it("les deux consommateurs ne rajoutent pas de garde", () => {
    // La palette sert à deux endroits : les puces et le sélecteur « ajouter une
    // capacité ». Le second écarte seulement ce qui est DÉJÀ posé.
    const lignes = SRC.split("\n").filter((l) => l.includes("availableManualKeywords"));
    expect(lignes.length).toBeGreaterThanOrEqual(3); // déclaration + 2 usages
    for (const l of lignes) {
      if (!l.includes("availableManualKeywords.filter")) continue;
      expect(l, `garde inattendue : ${l.trim()}`).toContain("manualKeywords.includes");
    }
  });

  it("la route de sauvegarde ne valide pas les capacités contre le profil", () => {
    // Une liste blanche côté serveur écarterait en SILENCE la capacité qu'on
    // vient de rendre accessible — le piège maison. Elle ne porte que sur les
    // colonnes, pas sur les valeurs.
    const route = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/cards/save/route.ts"),
      "utf8",
    );
    expect(route).not.toContain("forbiddenKeywords");
    expect(route).not.toContain("minTier");
  });
});
