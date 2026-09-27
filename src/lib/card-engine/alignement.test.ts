// Alignement ENREGISTRÉ : celui de la faction, libre pour les seuls Mercenaires.
import { describe, expect, it } from "vitest";
import { alignementAEnregistrer } from "./constants";

describe("alignementAEnregistrer", () => {
  it("impose l'alignement de la faction, quel que soit le choix envoyé", () => {
    expect(alignementAEnregistrer("Elfes", "neutre")).toBe("bon");
    expect(alignementAEnregistrer("Nains", null)).toBe("bon");
    expect(alignementAEnregistrer("Humains", undefined)).toBe("neutre");
    expect(alignementAEnregistrer("Morts-Vivants", "bon")).toBe("maléfique");
  });
  it("Mercenaires : choix de l'auteur, neutre par défaut ou si invalide", () => {
    expect(alignementAEnregistrer("Mercenaires", "maléfique")).toBe("maléfique");
    expect(alignementAEnregistrer("Mercenaires", null)).toBe("neutre");
    expect(alignementAEnregistrer("Mercenaires", "lumiere")).toBe("neutre");
  });
  it("faction inconnue : le choix est conservé", () => {
    expect(alignementAEnregistrer("Inconnue", "bon")).toBe("bon");
    expect(alignementAEnregistrer(null, null)).toBeNull();
  });
});
