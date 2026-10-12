import { describe, expect, it } from "vitest";
import { cheminVoix, extensionFichier, nomVoix, raceSingulier } from "./voice-sfx";

describe("nomVoix", () => {
  it("préfixe la race au singulier et suffixe le genre", () => {
    expect(nomVoix("Nains", "M", "Let_them_come_3.mp3")).toBe("Nain_Let_them_come_3_M");
    expect(nomVoix("Elfes Corrompus", "F", "Glory to the light.wav")).toBe("Elfe_Corrompu_Glory_to_the_light_F");
    expect(nomVoix("Aigles Géants", "N", "Skyward.m4a")).toBe("Aigle_Géant_Skyward_N");
  });

  it("ignore le dossier et les espaces superflus", () => {
    expect(nomVoix("Kobolds", "M", "voices/Kobolds/Homme/  Shiny  things _.mp3")).toBe("Kobold_Shiny_things_M");
  });

  it("singulier de repli pour une race sans forme connue", () => {
    expect(raceSingulier("Inconnus")).toBe("Inconnu");
  });
});

describe("stockage", () => {
  it("chemin ASCII rangé par race et genre", () => {
    expect(cheminVoix("Aigles Géants", "N", "Aigle_Géant_Skyward_N", "mp3")).toBe("voices/Aigles_Geants/N/Aigle_Geant_Skyward_N.mp3");
  });

  it("n'accepte que les extensions audio", () => {
    expect(extensionFichier("a.MP3")).toBe("mp3");
    expect(extensionFichier("a.m4a")).toBe("m4a");
    expect(extensionFichier("a.txt")).toBeNull();
  });
});
