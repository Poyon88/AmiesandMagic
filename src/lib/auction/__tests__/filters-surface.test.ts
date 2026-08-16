// Le filtre par CAPACITÉ interpole une valeur venue du client dans une chaîne
// de requête PostgREST :
//
//     .or(`keywords.cs.{${ability}},spell_keywords.cs.[{"id":"${ability}"}]`)
//
// C'est le seul endroit du filtrage où une valeur libre entre dans la syntaxe
// d'une requête plutôt que dans un paramètre lié. Une virgule ou une parenthèse
// bien placée y réécrirait la condition. La garde est de VALIDER la valeur
// contre le registre des capacités avant de l'interpoler — ce test vérifie que
// la garde précède toujours l'interpolation.
//
// Ce n'est pas une vérification théorique : le refus a été constaté en direct
// (`ability=nimporte` → 400 « Capacité inconnue »).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_KEYWORDS } from "@/lib/game/keyword-labels";

const SRC = readFileSync(join(process.cwd(), "src/app/api/auctions/route.ts"), "utf8");

describe("filtre par capacité", () => {
  it("valide la capacité contre le registre AVANT de l'interpoler", () => {
    const garde = SRC.indexOf("ALL_KEYWORDS.includes");
    const interpolation = SRC.indexOf("keywords.cs.{");
    expect(garde, "aucune validation contre le registre").toBeGreaterThan(-1);
    expect(interpolation, "aucune interpolation trouvée").toBeGreaterThan(-1);
    expect(garde, "la validation doit précéder l'interpolation").toBeLessThan(interpolation);
  });

  it("refuse par un 400, sans se rabattre sur une valeur par défaut", () => {
    // Un repli silencieux (ignorer le filtre inconnu) rendrait TOUTES les
    // enchères, ce qui donnerait au demandeur l'illusion d'un résultat filtré.
    expect(SRC).toMatch(/Capacité inconnue[\s\S]{0,120}status:\s*400/);
  });

  it("le registre qui sert de liste blanche n'est pas vide", () => {
    // Une liste blanche vide refuserait tout — le filtre paraîtrait cassé
    // plutôt que protégé.
    expect(ALL_KEYWORDS.length).toBeGreaterThan(50);
    expect(ALL_KEYWORDS).toContain("commandement");
  });
});

describe("les autres filtres passent par des paramètres liés", () => {
  it("clan et numéro d'exemplaire ne sont jamais interpolés dans une requête", () => {
    // `.eq()` lie la valeur ; seule la branche `.or()` de la capacité
    // construit du texte de requête. Si un futur filtre se met à interpoler,
    // ce test tombe et rappelle qu'il faut une liste blanche.
    const interpolations = SRC.match(/\.or\(`[^`]*\$\{/g) ?? [];
    expect(interpolations.length, "une seule interpolation attendue (la capacité)").toBe(1);
  });

  it("le numéro d'exemplaire est converti en entier et borné", () => {
    expect(SRC).toMatch(/parseInt\(printNumber, 10\)/);
    expect(SRC).toMatch(/Number\.isFinite\(n\)/);
  });
});
