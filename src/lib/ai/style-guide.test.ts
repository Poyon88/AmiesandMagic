// Charte graphique d'un clan → bloc de direction artistique des prompts.
import { describe, expect, it } from "vitest";
import { elementsCharte, formatStyleGuideForPrompt, STYLE_GUIDE_FIELDS } from "./style-guide";
import { buildHeroPortraitPrompt } from "./hero-portrait-prompt";

const charte = {
  clan: "La Forge Ardente",
  palette: "Noir de roche, bronze, braises",
  lighting: "Lueur de forge",
  art_style: null,
  environments: "  ",
  materials: "Plates sombres",
  motifs: "Runes gravées",
  avoid: "Pas de steampunk",
  notes: null,
};

describe("formatStyleGuideForPrompt", () => {
  it("omet les champs vides et garde l'ordre des champs", () => {
    const bloc = formatStyleGuideForPrompt(charte)!;
    const lignes = bloc.split("\n").slice(1);
    expect(lignes).toEqual([
      "- Palette: Noir de roche, bronze, braises",
      "- Lighting & mood: Lueur de forge",
      "- Materials, costume & gear: Plates sombres",
      "- Motifs & emblems: Runes gravées",
      "- Avoid: Pas de steampunk",
    ]);
    expect(bloc).toContain('clan "La Forge Ardente"');
  });

  it("rend null sans charte ou sans contenu", () => {
    expect(formatStyleGuideForPrompt(null)).toBeNull();
    const videC = { clan: "X", ...Object.fromEntries(STYLE_GUIDE_FIELDS.map((f) => [f.key, ""])) };
    expect(formatStyleGuideForPrompt(videC as never)).toBeNull();
  });
});

describe("portrait de héros", () => {
  it("n'injecte de la charte que le costume (pas le décor), à la place de l'accent de clan", () => {
    const p = buildHeroPortraitPrompt({ race: "Nains", faction: "Nains", clan: "La Forge Ardente", clanStyle: charte });
    expect(p).toContain("Clan art direction (La Forge Ardente");
    expect(p).toContain("Plates sombres");
    expect(p).not.toContain("Lueur de forge");
  });
});

describe("formatStyleGuideForPrompt — mode répertoire (cartes)", () => {
  it("n'impose que le style et les interdits ; la palette en accents, la lumière au répertoire", () => {
    const bloc = formatStyleGuideForPrompt(charte, { mode: "repertoire" })!;
    const [avant, reste] = bloc.split("CLAN COLOURS");
    const [accents, apres] = reste.split("REPERTOIRE");
    expect(avant).toContain("MANDATORY");
    expect(avant).toContain("Pas de steampunk");
    expect(avant).not.toContain("Noir de roche");
    expect(avant).not.toContain("Lueur de forge");
    expect(accents).toContain("Noir de roche");
    expect(apres).toContain("Lueur de forge");
    expect(apres).toContain("Plates sombres");
    expect(apres).toContain("Runes gravées");
  });

  it("le mode par défaut reste un bloc unique", () => {
    expect(formatStyleGuideForPrompt(charte)).not.toContain("REPERTOIRE");
  });

  it("avec un tirage, réduit chaque champ du répertoire à quelques éléments", () => {
    const riche = { ...charte, environments: "plage noire, forêt de lehua (fougères, mousses), village de pêcheurs ; champ de taro, volcan au loin." };
    const bloc = formatStyleGuideForPrompt(riche, { mode: "repertoire", tirage: () => 0, parChamp: 2 })!;
    const ligne = bloc.split("\n").find((l) => l.startsWith("- Environments"))!;
    expect(ligne.split(" ; ")).toHaveLength(2);
    // Le style et la palette ne sont jamais tronqués.
    expect(bloc).toContain("Noir de roche, bronze, braises");
  });
});

describe("elementsCharte", () => {
  it("coupe aux virgules et points-virgules hors parenthèses", () => {
    expect(elementsCharte("a, b (c, d) ; e.")).toEqual(["a", "b (c, d)", "e"]);
  });
});
