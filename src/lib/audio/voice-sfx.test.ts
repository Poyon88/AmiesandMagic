import { describe, expect, it } from "vitest";
import { cheminVoix, clanPourNom, clansPourRace, extensionFichier, nomVoix, raceSingulier, tousLesClans } from "./voice-sfx";

describe("nomVoix", () => {
  it("préfixe le clan (sans article) et suffixe le genre, sans la race", () => {
    expect(nomVoix("Nains", "La Forge Ardente", "M", "Let_them_come_3.mp3")).toBe("Forge_Ardente_Let_them_come_3_M");
    expect(nomVoix("Humains", "L'Ordre de l'Aube", "F", "Glory to the light.wav")).toBe("Ordre_de_lAube_Glory_to_the_light_F");
  });

  it("sans clan : le fichier seul + le genre", () => {
    expect(nomVoix("Nains", null, "M", "Let_them_come_3.mp3")).toBe("Let_them_come_3_M");
  });

  it("n'ajoute pas le clan si le fichier le porte déjà (seul ou après la race)", () => {
    expect(nomVoix("Humains", "L'Ordre de l'Aube", "M", "Humains_Ordre_de_laube_Ho_We_keep_the_old_vow 4.mp3"))
      .toBe("Humains_Ordre_de_laube_Ho_We_keep_the_old_vow_4_M");
    expect(nomVoix("Nains", "La Forge Ardente", "M", "Forge_ardente_Charge.mp3")).toBe("Forge_ardente_Charge_M");
    expect(nomVoix("Nains", "La Forge Ardente", "M", "Nain_Forge_Ardente_Charge.mp3")).toBe("Nain_Forge_Ardente_Charge_M");
  });

  it("ignore le dossier et les espaces superflus", () => {
    expect(nomVoix("Kobolds", null, "M", "voices/Kobolds/Homme/  Shiny  things _.mp3")).toBe("Shiny_things_M");
  });

  it("singulier de repli pour une race sans forme connue", () => {
    expect(raceSingulier("Inconnus")).toBe("Inconnu");
  });
});

describe("clans", () => {
  it("forme du clan dans un nom", () => {
    expect(clanPourNom("L'Ordre de l'Aube")).toBe("Ordre_de_lAube");
    expect(clanPourNom("Les Hauts-Elfes")).toBe("Hauts-Elfes");
    expect(clanPourNom("Clan des Mille Tunnels")).toBe("Clan_des_Mille_Tunnels");
  });

  it("clans déclarés de la race, toutes factions", () => {
    const h = clansPourRace("Humains");
    expect(h).toContain("L'Ordre de l'Aube");
    expect(h).toContain("L'Empire de Jade");
    expect(clansPourRace("Nains")).toEqual(["La Forge Ardente"]);
    expect(tousLesClans()).toContain("La Cour Écarlate");
  });
});

describe("stockage", () => {
  it("chemin ASCII rangé par race, clan et genre", () => {
    expect(cheminVoix("Aigles Géants", null, "N", "Skyward_N", "mp3")).toBe("voices/Aigles_Geants/N/Skyward_N.mp3");
    expect(cheminVoix("Humains", "L'Ordre de l'Aube", "M", "Ordre_de_lAube_X_M", "mp3")).toBe("voices/Humains/Ordre_de_lAube/M/Ordre_de_lAube_X_M.mp3");
  });

  it("n'accepte que les extensions audio", () => {
    expect(extensionFichier("a.MP3")).toBe("mp3");
    expect(extensionFichier("a.m4a")).toBe("m4a");
    expect(extensionFichier("a.txt")).toBeNull();
  });
});
