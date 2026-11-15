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
import { capabilityLimitViolations, creatureCapabilityCounts, namedCreatureCapabilityIds } from "./deck-rules";
import { ABILITIES } from "./abilities";
import { mkCard } from "./test-harness";

describe("capabilityLimitFor — point de passage unique", () => {
  it("Chant n'a plus de plafond : exemptée, comme Vol", () => {
    expect(CAPABILITY_LIMIT_EXEMPT.has("chant")).toBe(true);
    expect(CAPABILITY_LIMIT_OVERRIDES.has("chant")).toBe(false);
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
  it("une capacité ordinaire reste en faute au-delà de 12", () => {
    expect(capabilityLimitViolations(new Map([["taunt", 12]]))).toEqual([]);
    const [v] = capabilityLimitViolations(new Map([["taunt", 13]]));
    expect(v.max).toBe(MAX_SAME_CAPABILITY);
  });
});

describe("périmètre du décompte — unités, objets ET actions", () => {
  const creature = mkCard({ name: "Chanteuse", card_type: "creature", attack: 1, health: 1, keywords: ["chant"] as never });
  const sort = mkCard({ name: "Hymne", card_type: "spell", attack: null, health: null, spell_keywords: [{ id: "chant", amount: 2 }] as never });
  const garde = mkCard({ name: "Garde", card_type: "creature", attack: 1, health: 1, keywords: ["taunt"] as never });

  it("Chant est reconnue sur les unités comme sur les actions", () => {
    expect(namedCreatureCapabilityIds(creature)).toContain("chant");
    expect(namedCreatureCapabilityIds(sort)).toEqual(["chant"]);
  });

  it("un deck ENTIER de cartes Chant n'est jamais en faute", () => {
    const counts = creatureCapabilityCounts([{ card: creature, quantity: 25 }, { card: sort, quantity: 25 }]);
    expect(counts.has("chant")).toBe(false);
    expect(capabilityLimitViolations(counts)).toEqual([]);
  });

  it("une capacité ordinaire reste comptée et plafonnée", () => {
    const counts = creatureCapabilityCounts([{ card: garde, quantity: 13 }]);
    expect(counts.get("taunt")).toBe(13);
    expect(capabilityLimitViolations(counts)).toHaveLength(1);
  });
});
