import { describe, expect, it } from "vitest";
import { harmoniserNoms, sansValeur, type NomsCapacites } from "./noms";

const fr: NomsCapacites = new Map([
  ["gloire", "Gloire"], ["commandement", "Commandement"], ["ombre", "Ombre"], ["charge", "Traque"],
  ["divine_shield", "Bouclier"], ["force_des_ancetres", "Force des ancêtres"], ["silence", "Silence"],
  ["renforcement", "Renforcement"], ["esquive", "Esquive"],
]);
const en: NomsCapacites = new Map([
  ["gloire", "Glory"], ["commandement", "Command"], ["ombre", "Shadow"], ["charge", "Charge"],
  ["divine_shield", "Divine Shield"], ["force_des_ancetres", "Ancestral Strength"], ["silence", "Silence"],
  ["renforcement", "Strengthen"], ["esquive", "Dodge"],
]);

describe("sansValeur", () => {
  it("retire la valeur d'un nom de capacité", () => {
    expect(sansValeur("Résistance X")).toBe("Résistance");
    expect(sansValeur("Renforcement +X/+Y")).toBe("Renforcement");
    expect(sansValeur("Affaiblissement -X/-Y")).toBe("Affaiblissement");
    expect(sansValeur("Déchainement X/Y")).toBe("Déchainement");
    expect(sansValeur("Provocation")).toBe("Provocation");
  });
});

describe("harmoniserNoms", () => {
  // Le cas signalé : réponse en français, noms pris dans l'interface anglaise.
  it("remet en français les noms anglais d'une réponse française", () => {
    const reponse = "Elle garde ses bonus (Glory, etc.) et perd les auras comme Command et Ancestral Strength. Bouclier, Dodge et Shadow se réarment.";
    expect(harmoniserNoms(reponse, fr, [en])).toBe(
      "Elle garde ses bonus (Gloire, etc.) et perd les auras comme Commandement et Force des ancêtres. Bouclier, Esquive et Ombre se réarment.",
    );
  });

  it("met en anglais les noms français d'une réponse anglaise", () => {
    expect(harmoniserNoms("Only Traque lets it attack; Bouclier absorbs the first hit.", en, [fr]))
      .toBe("Only Charge lets it attack; Divine Shield absorbs the first hit.");
  });

  it("ne touche qu'aux mots entiers, majuscule comprise", () => {
    // « commander » n'est pas « Command », et « ombre » sans majuscule est un mot ordinaire.
    expect(harmoniserNoms("Le Commander avance dans l'ombre.", fr, [en])).toBe("Le Commander avance dans l'ombre.");
    expect(harmoniserNoms("Glory 2, puis Glory.", fr, [en])).toBe("Gloire 2, puis Gloire.");
  });

  it("laisse un nom identique dans les deux langues, et un texte déjà juste", () => {
    expect(harmoniserNoms("Seul Silence efface les gains.", fr, [en])).toBe("Seul Silence efface les gains.");
    expect(harmoniserNoms("Gloire et Ombre.", fr, [en])).toBe("Gloire et Ombre.");
  });

  it("ne remplace pas en chaîne", () => {
    // « Charge » (anglais) devient « Traque » ; rien ne doit ensuite retraduire le résultat.
    expect(harmoniserNoms("Charge et Traque.", fr, [en, fr])).toBe("Traque et Traque.");
  });

  it("sans noms pour la langue cible, rend le texte tel quel", () => {
    expect(harmoniserNoms("Glory.", new Map(), [en])).toBe("Glory.");
  });
});
