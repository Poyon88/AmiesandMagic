import { describe, expect, it } from "vitest";
import type { CardInstance } from "./types";
import { cimetieresDuChoix } from "./target-scope";

const c = (instanceId: string) => ({ instanceId }) as CardInstance;
const ids = (cartes: CardInstance[]) => cartes.map(x => x.instanceId);

describe("cimetières affichés pour un choix", () => {
  const mien = [c("m1"), c("m2")];
  const adverse = [c("a1"), c("a2")];

  it("n'affiche que le cimetière adverse quand les cibles y sont toutes", () => {
    expect(ids(cimetieresDuChoix(mien, adverse, ["a2"]))).toEqual(["a1", "a2"]);
  });

  it("n'affiche que mon cimetière quand les cibles y sont toutes", () => {
    expect(ids(cimetieresDuChoix(mien, adverse, ["m1"]))).toEqual(["m1", "m2"]);
  });

  it("affiche les deux quand chacun contient une cible", () => {
    expect(ids(cimetieresDuChoix(mien, adverse, ["m1", "a1"]))).toEqual(["m1", "m2", "a1", "a2"]);
  });

  it("retombe sur mon cimetière sans aucune cible", () => {
    expect(ids(cimetieresDuChoix(mien, adverse, []))).toEqual(["m1", "m2"]);
  });
});
