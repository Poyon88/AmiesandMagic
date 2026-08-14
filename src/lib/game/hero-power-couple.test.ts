// Un couple de stats de pouvoir héroïque n'a qu'UN encodage à l'écran.
//
// Signalé sur « Orghun, Khan des Trois Frontières » (pouvoir Fortifier +X/+Y) :
// l'éditeur montrait QUATRE champs — « +ATK (X) / +PV (Y) » et
// « Attaque (+X) / PV (+Y) » — pour un seul couple, et l'aperçu annonçait
// « Fortifier +0/+0 » pendant que la description disait +1/+1.
//
// Deux encodages coexistent dans `params` :
//   * `amount` / `amountY`  → lus par le DON et par l'AURA ;
//   * `attack` / `health`   → lus par le DÉCLENCHEMENT de sort.
//
// Quatre capacités déclarent les deux. Ce fichier fixe la règle de sélection,
// pour que l'éditeur et l'aperçu lisent la même source que le moteur.
import { describe, expect, it } from "vitest";
import { ABILITIES, XY_ABILITY_IDS } from "./abilities";

/** Reproduit la décision de HeroManager : quel encodage le mode lit-il ? */
function encodageDuCouple(abilityId: string, mode: string) {
  const ability = ABILITIES[abilityId];
  const ww = ability?.spell?.params ?? [];
  const brutAmount = ww.includes("amount") || !!ability?.creature?.scalable || mode === "aura";
  const brutAmountY = XY_ABILITY_IDS.has(abilityId);
  const brutAttack = ww.includes("attack");
  const brutHealth = ww.includes("health");
  const doublon = (brutAmount || brutAmountY) && brutAttack && brutHealth;
  const viaAttackHealth = doublon ? mode === "spell_trigger" : brutAttack && brutHealth;
  return {
    doublon,
    champs: [
      brutAmount && !(doublon && viaAttackHealth) && "amount",
      brutAmountY && !(doublon && viaAttackHealth) && "amountY",
      brutAttack && (!doublon || viaAttackHealth) && "attack",
      brutHealth && (!doublon || viaAttackHealth) && "health",
    ].filter(Boolean) as string[],
  };
}

/** Les capacités qui déclarent les DEUX encodages. */
const A_DOUBLE_ENCODAGE = ["renforcement", "affaiblissement", "renforcement_multiple", "fortifier"];

describe("Encodage du couple selon le mode", () => {
  it.each(A_DOUBLE_ENCODAGE)("« %s » est bien à double encodage", (id) => {
    expect(encodageDuCouple(id, "spell_trigger").doublon).toBe(true);
  });

  it.each(A_DOUBLE_ENCODAGE)("« %s » — déclenchement de sort : attack/health SEULS", (id) => {
    expect(encodageDuCouple(id, "spell_trigger").champs).toEqual(["attack", "health"]);
  });

  it.each(A_DOUBLE_ENCODAGE)("« %s » — don : pas d'attack/health", (id) => {
    const c = encodageDuCouple(id, "grant_keyword").champs;
    expect(c).toContain("amount");
    expect(c).not.toContain("attack");
    expect(c).not.toContain("health");
  });

  it.each(A_DOUBLE_ENCODAGE)("« %s » — aura : pas d'attack/health", (id) => {
    const c = encodageDuCouple(id, "aura").champs;
    expect(c).toContain("amount");
    expect(c).not.toContain("attack");
    expect(c).not.toContain("health");
  });

  it("Renforcement multiple n'expose pas de Y hors déclenchement de sort", () => {
    // Asymétrie PRÉEXISTANTE, pas introduite ici : XY_ABILITY_IDS se déduit du
    // marqueur « +X/+Y » du libellé, et « Renforcement multiple » n'en porte pas
    // alors qu'il est bien une paire. En mode don ou aura, son +PV reste donc
    // hors de portée de l'éditeur de héros. Consigné plutôt que corrigé au
    // passage : c'est un autre sujet, avec ses propres effets de bord.
    expect(encodageDuCouple("renforcement_multiple", "grant_keyword").champs).toEqual(["amount"]);
    expect(encodageDuCouple("renforcement_multiple", "spell_trigger").champs).toEqual(["attack", "health"]);
  });

  it("jamais quatre champs, quel que soit le mode", () => {
    for (const id of A_DOUBLE_ENCODAGE) {
      for (const mode of ["spell_trigger", "grant_keyword", "aura", "composed"]) {
        expect(encodageDuCouple(id, mode).champs.length, `${id} / ${mode}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("Les capacités à encodage UNIQUE gardent leurs champs", () => {
  it("une capacité à X simple garde son « Quantité »", () => {
    // Résistance X : scalable côté créature, aucun attack/health.
    const r = encodageDuCouple("resistance", "grant_keyword");
    expect(r.doublon).toBe(false);
    expect(r.champs).toContain("amount");
    expect(r.champs).not.toContain("attack");
  });

  it("une capacité à couple SANS attack/health garde amount/amountY", () => {
    // Gloire +X/+Y : couple, mais pas d'encodage attack/health côté sort.
    const g = encodageDuCouple("gloire", "spell_trigger");
    expect(g.doublon).toBe(false);
    expect(g.champs).toEqual(["amount", "amountY"]);
  });
});
