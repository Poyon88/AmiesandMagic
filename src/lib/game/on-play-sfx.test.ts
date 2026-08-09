// Chaîne sonore d'ENTRÉE EN JEU, calculée côté client.
//
// Les choix d'une capacité d'entrée (cible, Creuser, Sélection…) sont collectés
// AVANT que l'action ne parte au moteur. Attendre le signal du moteur ferait donc
// sonner l'arrivée de la créature APRÈS la fermeture de la fenêtre de choix —
// très loin de ce que le son est censé accompagner. D'où ce calcul anticipé, qui
// doit produire exactement ce que le moteur produirait.
import { describe, expect, it } from "vitest";
import { onPlaySfxChain } from "./on-play-sfx";
import { mkCard } from "./test-harness";
import type { Capability, Card } from "./types";

const URLS = { creuser: "creuser.mp3", epargne: "epargne.mp3", impact: "impact.mp3" };

describe("ordre de la chaîne", () => {
  it("l'arrivée D'ABORD, l'effet ENSUITE", () => {
    const card = mkCard({
      name: "Gardien", attack: 2, health: 5,
      keywords: ["creuser"] as never,
      keyword_instances: [{ id: "creuser", x: 5 }] as never,
    });
    expect(onPlaySfxChain(card, URLS, "pose.mp3")).toEqual(["pose.mp3", "creuser.mp3"]);
  });

  it("le son PROPRE à la carte prime sur le son générique de pose", () => {
    const card = mkCard({
      name: "Gardien", attack: 2, health: 5, sfx_play_url: "gardien.mp3",
      keywords: ["creuser"] as never,
      keyword_instances: [{ id: "creuser", x: 5 }] as never,
    } as Partial<Card>);
    expect(onPlaySfxChain(card, URLS, "pose.mp3")).toEqual(["gardien.mp3", "creuser.mp3"]);
  });
});

describe("ce qui n'entre PAS dans la chaîne", () => {
  it("une capacité réglée sur un AUTRE déclencheur (tap, mort…) ne sonne pas à la pose", () => {
    const card = mkCard({
      name: "Coffre", attack: 1, health: 1,
      keywords: ["epargne"] as never,
      keyword_instances: [{ id: "epargne", x: 2, mode: "death" }] as never,
    });
    expect(onPlaySfxChain(card, URLS, "pose.mp3")).toEqual(["pose.mp3"]);
  });

  it("un effet composé sur mesure n'a pas d'ability nommée — même règle que le moteur", () => {
    const card = mkCard({
      name: "Sur mesure", attack: 1, health: 1,
      capabilities: [{
        uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
        composed: { content: "deal_damage", magnitude: { x: 2 } },
      }] as unknown as Capability[],
    });
    expect(onPlaySfxChain(card, URLS, "pose.mp3")).toEqual(["pose.mp3"]);
  });

  it("une capacité sans bruitage configuré est simplement sautée", () => {
    const card = mkCard({
      name: "Muette", attack: 1, health: 1,
      keywords: ["taunt"] as never,
    });
    expect(onPlaySfxChain(card, URLS, "pose.mp3")).toEqual(["pose.mp3"]);
  });

  it("aucun son du tout ⇒ chaîne vide (rien à jouer, pas de silence artificiel)", () => {
    const card = mkCard({ name: "Nue", attack: 1, health: 1 });
    expect(onPlaySfxChain(card, {}, undefined)).toEqual([]);
  });
});

describe("plusieurs capacités", () => {
  it("chaque capacité d'entrée ajoute son maillon, sans doublon d'URL", () => {
    const card = mkCard({
      name: "Double", attack: 1, health: 1,
      keywords: ["creuser", "epargne"] as never,
      keyword_instances: [{ id: "creuser", x: 2 }, { id: "epargne", x: 1 }] as never,
    });
    const chain = onPlaySfxChain(card, URLS, "pose.mp3");
    expect(chain[0]).toBe("pose.mp3");
    expect(chain.slice(1).sort()).toEqual(["creuser.mp3", "epargne.mp3"]);

    // Deux capacités partageant le MÊME fichier ne le jouent qu'une fois.
    const memeSon = onPlaySfxChain(card, { creuser: "x.mp3", epargne: "x.mp3" }, "pose.mp3");
    expect(memeSon).toEqual(["pose.mp3", "x.mp3"]);
  });
});
