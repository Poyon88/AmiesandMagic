// Plafond d'occurrences d'une capacité NOMMÉE dans un deck.
//
// Il était unique (MAX_SAME_CAPABILITY = 12) ; Chant y déroge à 24. Chant est la
// mécanique identitaire des Fils du Volcan et exige une créature chanteuse EN
// JEU pour que les sorts du deck se renforcent : le plafond commun étouffait le
// clan qu'il était censé équilibrer.
//
// Le point sensible n'est pas la valeur mais la COHÉRENCE : trois surfaces
// lisent ce plafond (validation live à l'ajout, validation de sauvegarde, badge
// de décompte). Si l'une garde 12 pendant que les autres passent à 24,
// l'interface refuse une carte qu'elle annonce pourtant comme légale.
import { describe, expect, it } from "vitest";
import {
  MAX_SAME_CAPABILITY,
  CAPABILITY_LIMIT_OVERRIDES,
  CAPABILITY_LIMIT_EXEMPT,
  capabilityLimitFor,
} from "./constants";
import { capabilityLimitViolations, namedCreatureCapabilityIds } from "./deck-rules";
import { ABILITIES } from "./abilities";
import { mkCard } from "./test-harness";

describe("capabilityLimitFor — point de passage unique", () => {
  it("Chant plafonne à 24", () => {
    expect(capabilityLimitFor("chant")).toBe(24);
  });

  it("les autres capacités gardent le plafond commun", () => {
    expect(capabilityLimitFor("taunt")).toBe(MAX_SAME_CAPABILITY);
    expect(capabilityLimitFor("resistance")).toBe(MAX_SAME_CAPABILITY);
    // Capacité inconnue : on ne relève surtout pas le plafond par accident.
    expect(capabilityLimitFor("id_inexistant")).toBe(MAX_SAME_CAPABILITY);
  });

  it("toute dérogation vise une capacité RÉELLE et relève le plafond", () => {
    for (const [id, max] of CAPABILITY_LIMIT_OVERRIDES) {
      expect(ABILITIES[id], `dérogation sur un id inconnu : ${id}`).toBeDefined();
      expect(max).toBeGreaterThan(MAX_SAME_CAPABILITY);
      // Une capacité exemptée n'a pas de plafond du tout : lui en donner un
      // serait contradictoire.
      expect(CAPABILITY_LIMIT_EXEMPT.has(id)).toBe(false);
    }
  });
});

describe("les violations citent le plafond RÉELLEMENT appliqué", () => {
  it("Chant n'est en faute qu'au-delà de 24", () => {
    expect(capabilityLimitViolations(new Map([["chant", 24]]))).toEqual([]);
    const [v] = capabilityLimitViolations(new Map([["chant", 25]]));
    expect(v.count).toBe(25);
    // Le message d'erreur affiche `max` : annoncer 12 là où 24 s'applique
    // serait un mensonge d'interface.
    expect(v.max).toBe(24);
  });

  it("une capacité ordinaire reste en faute au-delà de 12", () => {
    expect(capabilityLimitViolations(new Map([["taunt", 12]]))).toEqual([]);
    const [v] = capabilityLimitViolations(new Map([["taunt", 13]]));
    expect(v.max).toBe(MAX_SAME_CAPABILITY);
  });
});

describe("périmètre du décompte — inchangé", () => {
  it("seules les CRÉATURES comptent : un sort Chant n'entame pas le quota", () => {
    const creature = mkCard({
      name: "Chanteuse", card_type: "creature", attack: 1, health: 1,
      keywords: ["chant"] as never,
    });
    const sort = mkCard({
      name: "Hymne", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "chant", amount: 2 }] as never,
    });

    expect(namedCreatureCapabilityIds(creature)).toContain("chant");
    expect(namedCreatureCapabilityIds(sort)).toEqual([]);
  });
});
