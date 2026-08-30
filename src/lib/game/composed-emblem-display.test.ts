// La description d'un EMBLÈME doit dire qu'il subsiste.
//
// Défaut constaté sur « Druide de la Sève ancienne » : la carte affichait
// « Guérison (Entrée) — Soigne 2 PV à toutes les unités et au héros alliés »,
// exactement ce qu'aurait affiché un soin d'entrée en jeu ponctuel. Ni la
// PERSISTANCE, ni le camp où l'emblème est rangé, ni la cadence à laquelle il
// reparle n'apparaissaient nulle part. Or à l'arrivée de la carte, un emblème
// ne soigne personne : il se pose, et parlera aux entrées SUIVANTES.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { composedBadge, describeComposedCap, emblemCadence } from "./composed-display";
import type { Capability } from "./types";

const CIBLE = { entity: "both", side: "ally", count: "all", location: "board", designation: "automatic" };

const emb = (p: Record<string, unknown> = {}): Capability => ({
  uid: "cx_0", trigger: "on_play", effectKind: "emblem", abilityId: "_composed",
  composed: { content: "heal", magnitude: { x: 2 }, target: CIBLE },
  ...p,
} as unknown as Capability);

describe("en-tête d'emblème", () => {
  it("annonce l'emblème, sa permanence ET ce à quoi il réagit", () => {
    expect(describeComposedCap(emb())).toBe(
      "Emblème (permanent). Chaque fois qu'une de vos créatures entre en jeu : soigne 2 PV à toutes les unités et au héros alliés.",
    );
  });

  it("dit le camp — c'est ce qui distingue une malédiction", () => {
    // Rangé chez l'adversaire, l'emblème surveille SES créatures. Le possessif
    // est le seul endroit du texte où cette bascule se voit.
    const texte = describeComposedCap(emb({ side: "opponent" }));
    expect(texte).toContain("chez l'adversaire");
    expect(texte).toContain("une de ses créatures");
  });

  it("dit la durée quand l'emblème est éphémère", () => {
    expect(describeComposedCap(emb({ duration: 3 }))).toContain("(3 tours)");
    expect(describeComposedCap(emb({ duration: 1 }))).toContain("(1 tour)");
    // Une durée nulle est traitée comme absente par le moteur (pas d'emblème
    // mort-né) : le texte doit dire la même chose que lui.
    expect(describeComposedCap(emb({ duration: 0 }))).toContain("(permanent)");
  });

  it("couvre chaque cadence, y compris celle par défaut", () => {
    expect(describeComposedCap(emb({ trigger: "on_death" }))).toContain("créatures meurt");
    expect(describeComposedCap(emb({ trigger: "on_attack" }))).toContain("créatures attaque");
    expect(describeComposedCap(emb({ trigger: "on_return" }))).toContain("revient en main");
    expect(describeComposedCap(emb({ trigger: "on_activation" }))).toContain("s'active");
    expect(describeComposedCap(emb({ trigger: "on_end_of_turn" }))).toContain("À la fin de votre tour");
    expect(describeComposedCap(emb({ trigger: "on_low_hp" }))).toContain("votre héros passe sous 15 PV");
    // `trigger` absent ⇒ fin de tour, comme le lit `fireEmblemsForEvent`.
    expect(describeComposedCap(emb({ trigger: undefined }))).toContain("À la fin de votre tour");
  });

  it("laisse une capacité ORDINAIRE strictement inchangée", () => {
    expect(describeComposedCap(emb({ effectKind: "immediate" }))).toBe(
      "Soigne 2 PV à toutes les unités et au héros alliés.",
    );
  });
});

describe("badge", () => {
  it("dit « Emblème » plutôt que « Entrée »", () => {
    // « (Entrée) » donnait à lire un effet qui se produit à l'arrivée. Rien ne
    // s'y produit : l'emblème est posé, et c'est tout.
    expect(composedBadge(emb())?.label).toBe("Emblème");
  });

  it("garde la COULEUR du déclencheur : le code couleur du jeu reste lisible", () => {
    const embleme = composedBadge(emb({ trigger: "on_death" }));
    const ordinaire = composedBadge(emb({ trigger: "on_death", effectKind: "immediate" }));
    expect(embleme?.color).toBe(ordinaire?.color);
    expect(embleme?.label).not.toBe(ordinaire?.label);
  });

  it("rend le badge de déclencheur habituel hors emblème", () => {
    expect(composedBadge(emb({ effectKind: "immediate" }))?.label).toBe("Entrée");
  });
});

describe("cadence isolée — la bande d'emblèmes en jeu", () => {
  // La bande disait déjà ce que l'emblème FAIT et combien de temps il vit,
  // jamais QUAND il parle. Un emblème « à chaque mort » y était indiscernable
  // d'un emblème de fin de tour, alors que c'est ce qui décide s'il faut
  // échanger maintenant.

  it("accorde le possessif au PORTEUR, pas au lecteur", () => {
    expect(emblemCadence("on_play", "self")).toBe("Chaque fois qu'une de vos créatures entre en jeu");
    expect(emblemCadence("on_play", "opponent")).toBe("Chaque fois qu'une de ses créatures entre en jeu");
    expect(emblemCadence("on_low_hp", "self")).toBe("Chaque fois que votre héros passe sous 15 PV");
    expect(emblemCadence("on_low_hp", "opponent")).toBe("Chaque fois que son héros passe sous 15 PV");
    expect(emblemCadence("on_end_of_turn", "opponent")).toBe("À la fin de son tour");
  });

  it("sans déclencheur, dit la fin de tour — ce que lit le moteur", () => {
    expect(emblemCadence(undefined, "self")).toBe("À la fin de votre tour");
  });

  it("commence par une capitale, y compris sur un accent", () => {
    expect(emblemCadence("on_end_of_turn", "self").startsWith("À")).toBe(true);
  });
});

describe("câblage de la bande", () => {
  const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

  it("chaque bande déclare son PORTEUR", () => {
    // Le risque que ce test verrouille : `align` et `porteur` corrèlent
    // aujourd'hui (gauche = adversaire). Faire porter le sens à une valeur de
    // mise en page suffirait, jusqu'au jour où l'on retourne le plateau — la
    // bande annoncerait alors les créatures du mauvais camp, en silence.
    const src = lire("src/components/game/GameBoard.tsx");
    const bandes = src.match(/<EmblemStrip[^>]*\/>/g) ?? [];
    expect(bandes.length).toBeGreaterThan(0);
    for (const b of bandes) expect(b, b).toContain("porteur=");
    // Et le porteur suit bien la source des emblèmes, pas l'alignement.
    for (const b of bandes) {
      expect(b, b).toContain(b.includes("myPlayer.emblems") ? 'porteur="self"' : 'porteur="opponent"');
    }
  });
});
