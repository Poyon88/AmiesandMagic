// Charte graphique d'un clan → bloc de direction artistique des prompts.
import { describe, expect, it } from "vitest";
import { formatStyleGuideForPrompt, STYLE_GUIDE_FIELDS } from "./style-guide";
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
