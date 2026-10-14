import { describe, expect, it } from "vitest";
import { candidatesVoix, priseMoinsUtilisee, repliquesVoix, repliqueVoix, type VoixCandidate } from "./voice-match";

let n = 0;
const v = (race: string, clan: string | null, gender: "M" | "F" | "N", fichier: string): VoixCandidate => ({
  id: ++n, race, clan, gender, source_filename: fichier, file_path: `p/${fichier}`, file_url: `u/${n}`,
});

const forgeM = v("Nains", "La Forge Ardente", "M", "Let_them_come_3.mp3");
const forgeM2 = v("Nains", "La Forge Ardente", "M", "Let_them_come_4.mp3");
const forgeF = v("Nains", "La Forge Ardente", "F", "For the forge 1.mp3");
const nainsN = v("Nains", null, "N", "Stone and steel.mp3");
const nainsM = v("Nains", null, "M", "Hold the line.mp3");
const toutes = [forgeM, forgeM2, forgeF, nainsN, nainsM];

describe("candidatesVoix", () => {
  it("préfère le clan et le genre de la carte", () => {
    expect(candidatesVoix({ race: "Nains", clan: "La Forge Ardente", gender: "homme" }, toutes)).toEqual([forgeM, forgeM2]);
  });
  it("sans voix du clan, prend les voix communes à la race", () => {
    expect(candidatesVoix({ race: "Nains", clan: "Clan des Premiers Géants", gender: "homme" }, toutes)).toEqual([nainsM]);
  });
  it("sans voix du genre, se replie sur le neutre", () => {
    expect(candidatesVoix({ race: "Nains", clan: null, gender: "femme" }, toutes)).toEqual([nainsN]);
  });
  it("genre inconnu : toutes les voix du niveau", () => {
    expect(candidatesVoix({ race: "Nains", clan: "La Forge Ardente", gender: null }, toutes)).toEqual([forgeM, forgeM2, forgeF]);
  });
  it("autre race ou sans race : rien", () => {
    expect(candidatesVoix({ race: "Elfes", clan: null, gender: "homme" }, toutes)).toEqual([]);
    expect(candidatesVoix({ race: null, clan: null, gender: "homme" }, toutes)).toEqual([]);
  });
});

describe("répliques", () => {
  it("lit le texte dans le nom du fichier, sans le numéro de prise", () => {
    expect(repliqueVoix(forgeM)).toBe("Let them come");
    expect(repliqueVoix(forgeF)).toBe("For the forge");
  });
  it("regroupe les prises d'une même réplique et prend la moins utilisée", () => {
    const r = repliquesVoix([forgeM, forgeM2, forgeF]);
    expect(r.map((x) => [x.texte, x.gender])).toEqual([["Let them come", "M"], ["For the forge", "F"]]);
    expect(priseMoinsUtilisee(r[0].prises, new Map([[forgeM.file_url, 2]]))).toBe(forgeM2);
    expect(priseMoinsUtilisee(r[0].prises, new Map())).toBe(forgeM);
  });
});
