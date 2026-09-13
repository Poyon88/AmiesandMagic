// La liste du gestionnaire d'icônes doit inclure les icônes PROPRES aux contenus
// composés (clé renvoyée par composedIcon), pas seulement les mots-clés.
import { describe, expect, it } from "vitest";
import { ICON_ENTRIES } from "./KeywordIconManager";
import { composedIcon } from "@/lib/game/composed-display";

describe("gestionnaire d'icônes", () => {
  it("propose Tuteur, sous la clé que l'affichage des cartes utilise", () => {
    const cle = composedIcon({ uid: "x", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed: { content: "tuteur", cardIds: [1] } }).keyword;
    expect(cle).toBe("tuteur");
    const entree = ICON_ENTRIES.find((e) => e.key === cle);
    expect(entree).toBeDefined();
    expect(entree!.kind).toBe("both");
    expect(entree!.label).toBe("Tuteur");
  });
});
