// Le contrat de SORTIE des capacités composées vers la base.
//
// Ce module a été extrait d'un fichier de route précisément parce qu'une
// fonction enfermée là n'est pas importable, donc pas testable — et c'est ce qui
// a laissé vivre le défaut que ces tests verrouillent : l'`effectKind` était
// forcé à `immediate` pour TOUTE capacité composée, y compris les emblèmes.
//
// Conséquence, invisible et totale : la case « Effet permanent posé sur un
// joueur » partait en base en effet ordinaire, aucun emblème porté par une carte
// ne se posait jamais, et l'effet se résolvait au contraire sur-le-champ en
// réclamant une cible. Vu en partie sur « Disparition sous les branches », qui
// devait déposer un emblème et lançait un Ombre ciblé.
import { describe, expect, it } from "vitest";
import { sanitizeComposed } from "./composedCapabilities";
import type { Capability } from "@/lib/game/types";

const cap = (over: Record<string, unknown> = {}): Capability => ({
  uid: "peu-importe", trigger: "spell_resolution", effectKind: "immediate",
  abilityId: "_composed",
  composed: { content: "grant_keyword", grantAbilityId: "ombre" },
  ...over,
} as unknown as Capability);

describe("effectKind", () => {
  it("PRÉSERVE l'emblème — le défaut réparé", () => {
    const [out] = sanitizeComposed([cap({ effectKind: "emblem" })]);
    expect(out.effectKind).toBe("emblem");
  });

  it("préserve aussi le camp et la durée de l'emblème", () => {
    // Ils voyageaient déjà par le spread, mais ne servaient à rien tant que
    // l'effectKind tombait : autant les verrouiller ensemble.
    const [out] = sanitizeComposed([cap({ effectKind: "emblem", side: "opponent", duration: 3 })]);
    expect(out.side).toBe("opponent");
    expect(out.duration).toBe(3);
  });

  it("RABAT tout le reste sur `immediate`", () => {
    // `grant` et les autres types n'ont pas de sens sur une capacité composée :
    // les laisser passer ouvrirait des états que le moteur ne sait pas exécuter.
    for (const k of ["grant", "automatic", "n'importe quoi", undefined]) {
      expect(sanitizeComposed([cap({ effectKind: k })])[0].effectKind).toBe("immediate");
    }
  });
});

describe("normalisation", () => {
  it("réassigne des uid stables, préfixés cx_", () => {
    const out = sanitizeComposed([cap(), cap(), cap()]);
    expect(out.map((c) => c.uid)).toEqual(["cx_0", "cx_1", "cx_2"]);
  });

  it("écarte ce qui ne porte pas d'effet composé", () => {
    expect(sanitizeComposed([{ uid: "x", trigger: "on_play" } as unknown as Capability])).toEqual([]);
    expect(sanitizeComposed([null, undefined, 3, "x"])).toEqual([]);
    expect(sanitizeComposed(null)).toEqual([]);
    expect(sanitizeComposed({})).toEqual([]);
  });

  it("complète les amplitudes +X/+Y partielles", () => {
    const [out] = sanitizeComposed([cap({ composed: { content: "buff", magnitude: { x: 2 } } })]);
    expect(out.composed!.magnitude).toEqual({ x: 2, y: 0 });
  });

  it("garde les drapeaux d'amplitude aléatoire", () => {
    const [out] = sanitizeComposed([cap({ composed: { content: "buff", magnitude: { x: 2, randomX: true } } })]);
    expect(out.composed!.magnitude!.randomX).toBe(true);
  });

  it("donne un abilityId de repli aux effets purement composés", () => {
    expect(sanitizeComposed([cap({ abilityId: "" })])[0].abilityId).toBe("_composed");
  });
});
