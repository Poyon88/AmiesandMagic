import { describe, expect, it } from "vitest";
import { deriveCapabilities, getCapabilities } from "./capability-adapter";
import {
  ABILITIES,
  AUTOMATIC_ABILITY_IDS,
  CURATED_MULTIMODE_IDS,
  creatureEngineId,
} from "./abilities";
import type { Card, Capability, KeywordInstance, SpellKeywordInstance } from "./types";

// Fabrique de carte minimale — seuls les champs lus par l'adaptateur comptent.
function card(partial: Partial<Card>): Card {
  return {
    id: 1,
    name: "Test",
    mana_cost: 1,
    card_type: "creature",
    attack: 1,
    health: 1,
    effect_text: "",
    keywords: [],
    spell_keywords: null,
    spell_effects: null,
    image_url: null,
    ...partial,
  } as Card;
}

describe("deriveCapabilities — sorts", () => {
  it("traduit un spell_keyword ciblé en capacité spell_resolution/immediate avec slot de cible", () => {
    const c = card({
      card_type: "spell",
      attack: null,
      health: null,
      spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
    });
    const caps = deriveCapabilities(c);
    expect(caps).toHaveLength(1);
    expect(caps[0]).toMatchObject({
      uid: "sk_0",
      trigger: "spell_resolution",
      effectKind: "immediate",
      abilityId: "impact",
      params: { x: 3 },
    });
    // Le label du slot reprend le label du spell keyword, comme getSpellTargetSlots.
    expect(caps[0].targets).toEqual([{ type: "any", label: "Impact X" }]);
  });

  it("un spell_keyword sans cible n'a pas de slot", () => {
    const c = card({
      card_type: "spell",
      spell_keywords: [{ id: "deferlement", amount: 2 }] as SpellKeywordInstance[],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.targets).toEqual([]);
    expect(cap.params).toEqual({ x: 2 });
  });

  it("renforcement (spell) reporte attack/health", () => {
    const c = card({
      card_type: "spell",
      spell_keywords: [{ id: "renforcement", attack: 2, health: 3 }] as SpellKeywordInstance[],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.params).toEqual({ attack: 2, health: 3 });
    expect(cap.targets).toEqual([{ type: "friendly_creature", label: "Renforcement +X/+Y" }]);
  });

  it("invocation (spell) reporte token_id, attack/health et race", () => {
    const c = card({
      card_type: "spell",
      spell_keywords: [
        { id: "invocation", attack: 2, health: 2, race: "orcs", token_id: 7 },
      ] as SpellKeywordInstance[],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap).toMatchObject({ abilityId: "invocation", tokenId: 7, race: "orcs" });
    expect(cap.params).toEqual({ attack: 2, health: 2 });
  });

  it("un sort qui confère un keyword créature → effectKind grant + slot de don (scope target)", () => {
    const c = card({
      card_type: "spell",
      keywords: ["berserk"] as Card["keywords"],
    });
    const caps = deriveCapabilities(c);
    expect(caps).toHaveLength(1);
    expect(caps[0]).toMatchObject({
      uid: "grant_0",
      trigger: "spell_resolution",
      effectKind: "grant",
      abilityId: "berserk",
      grantScope: "target",
    });
    expect(caps[0].targets).toEqual([{ type: "friendly_creature", label: "Cible du don" }]);
  });

  it("grant scope all_allies → pas de slot de cible", () => {
    const c = card({
      card_type: "spell",
      keywords: ["berserk"] as Card["keywords"],
      keyword_instances: [{ id: "berserk", grantScope: "all_allies" }] as KeywordInstance[],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.grantScope).toBe("all_allies");
    expect(cap.targets).toEqual([]);
  });

  it("shadowing polymorphe : convocations_multiples ombragé par invocation_multiple → pas de grant fantôme", () => {
    const c = card({
      card_type: "spell",
      keywords: ["convocations_multiples"] as Card["keywords"],
      spell_keywords: [{ id: "invocation_multiple" }] as SpellKeywordInstance[],
    });
    const caps = deriveCapabilities(c);
    // Seule la capacité spell_keyword subsiste ; le don est supprimé.
    expect(caps).toHaveLength(1);
    expect(caps[0].abilityId).toBe("invocation_multiple");
    expect(caps[0].effectKind).toBe("immediate");
  });
});

describe("deriveCapabilities — créatures", () => {
  it("keyword legacy sans instance → on_play immédiat", () => {
    const c = card({ keywords: ["loyaute"] as Card["keywords"] });
    const caps = deriveCapabilities(c);
    expect(caps).toEqual([
      expect.objectContaining({
        uid: "cw_0",
        trigger: "on_play",
        effectKind: "immediate",
        abilityId: "loyaute",
      }),
    ]);
  });

  it("X repris de effect_text en mode défaut (façon getKwX)", () => {
    const c = card({
      keywords: ["convocation"] as Card["keywords"],
      effect_text: "Invocation : crée un token [Convocation 4].",
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.params).toEqual({ x: 4 });
    expect(cap.trigger).toBe("on_play");
  });

  it("inst.x prioritaire sur effect_text", () => {
    const c = card({
      keywords: ["convocation"] as Card["keywords"],
      keyword_instances: [{ id: "convocation", x: 2 }] as KeywordInstance[],
      effect_text: "[Convocation 4]",
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.params).toEqual({ x: 2 });
  });

  it("curated en mode death → on_death ; en mode tap → on_activation", () => {
    const c = card({
      keywords: ["convocation"] as Card["keywords"],
      keyword_instances: [
        { id: "convocation", mode: "death", x: 1 },
        { id: "convocation", mode: "tap", x: 3 },
      ] as KeywordInstance[],
    });
    const caps = deriveCapabilities(c);
    expect(caps.map((c2) => c2.trigger)).toEqual(["on_death", "on_activation"]);
    expect(caps.map((c2) => c2.params?.x)).toEqual([1, 3]);
  });

  it("curated on_play + tap (deux instances) → deux capacités distinctes", () => {
    const c = card({
      keywords: ["convocation"] as Card["keywords"],
      keyword_instances: [
        { id: "convocation", x: 2 },
        { id: "convocation", mode: "tap", x: 2 },
      ] as KeywordInstance[],
    });
    const caps = deriveCapabilities(c);
    expect(caps.map((c2) => c2.trigger)).toEqual(["on_play", "on_activation"]);
  });

  it("keyword_instances présentes mais un keyword[] sans instance → synthèse on_play", () => {
    const c = card({
      keywords: ["convocation", "loyaute"] as Card["keywords"],
      keyword_instances: [{ id: "convocation", mode: "tap", x: 1 }] as KeywordInstance[],
    });
    const caps = deriveCapabilities(c);
    const ids = caps.map((c2) => [c2.abilityId, c2.trigger]);
    // convocation tap (instance) + loyaute on_play (synthétisé)
    expect(ids).toContainEqual(["convocation", "on_activation"]);
    expect(ids).toContainEqual(["loyaute", "on_play"]);
    expect(caps).toHaveLength(2);
  });

  it("renforcement_multiple : x→attack, y→health, race/clan reportés", () => {
    const c = card({
      keywords: ["renforcement_multiple"] as Card["keywords"],
      keyword_instances: [
        { id: "renforcement_multiple", x: 2, y: 3, race: "elfes", clan: "sylvains" },
      ] as KeywordInstance[],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.params).toEqual({ attack: 2, health: 3 });
    expect(cap.race).toBe("elfes");
    expect(cap.clan).toBe("sylvains");
  });

  it("entraide : race lue depuis card.entraide_race", () => {
    const c = card({
      keywords: ["entraide"] as Card["keywords"],
      entraide_race: "nains",
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.race).toBe("nains");
  });

  it("convocation : tokenId + tokens reportés", () => {
    const c = card({
      keywords: ["convocation"] as Card["keywords"],
      convocation_token_id: 12,
      convocation_tokens: [{ token_id: 12, attack: 1, health: 1 }],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.tokenId).toBe(12);
    expect(cap.tokens).toEqual([{ token_id: 12, attack: 1, health: 1 }]);
  });

  it("lycanthropie : tokenId depuis lycanthropie_token_id", () => {
    const c = card({
      keywords: ["lycanthropie"] as Card["keywords"],
      lycanthropie_token_id: 9,
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.tokenId).toBe(9);
  });

  it("automatique (terreur, augure) → trigger automatic", () => {
    const c = card({ keywords: ["terreur", "augure"] as Card["keywords"] });
    const caps = deriveCapabilities(c);
    expect(caps.every((c2) => c2.trigger === "automatic")).toBe(true);
  });

  it("mort-intrinsèque (carnage) en mode défaut → on_death", () => {
    const c = card({
      keywords: ["carnage"] as Card["keywords"],
      effect_text: "[Carnage 3]",
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.trigger).toBe("on_death");
    expect(cap.params).toEqual({ x: 3 });
  });

  it("douleur sur créature → on_play immédiat (pas automatic)", () => {
    const c = card({
      keywords: ["douleur"] as Card["keywords"],
      keyword_instances: [{ id: "douleur", x: 2 }] as KeywordInstance[],
    });
    const [cap] = deriveCapabilities(c);
    expect(cap.trigger).toBe("on_play");
    expect(cap.params).toEqual({ x: 2 });
  });
});

describe("getCapabilities", () => {
  it("retourne card.capabilities quand présent (carte backfillée)", () => {
    const existing: Capability[] = [
      { uid: "x", trigger: "on_play", effectKind: "immediate", abilityId: "loyaute" },
    ];
    const c = card({ keywords: ["terreur"] as Card["keywords"], capabilities: existing });
    expect(getCapabilities(c)).toBe(existing);
  });

  it("dérive depuis le legacy quand capabilities est null", () => {
    const c = card({ keywords: ["loyaute"] as Card["keywords"], capabilities: null });
    expect(getCapabilities(c)[0].abilityId).toBe("loyaute");
  });
});

describe("registre — métadonnées de taxonomie", () => {
  it("chaque ability a une taxonomie dérivée", () => {
    for (const a of Object.values(ABILITIES)) {
      expect(a.triggers, a.id).toBeDefined();
      expect(a.triggers!.effectKinds.length).toBeGreaterThan(0);
    }
  });

  it("les abilities applicables aux sorts ont spellTriggers = [spell_resolution]", () => {
    for (const a of Object.values(ABILITIES)) {
      if (a.applicable_to.includes("spell")) {
        expect(a.triggers!.spellTriggers, a.id).toEqual(["spell_resolution"]);
      }
    }
  });

  it("les ids curés exposent les 4 déclencheurs unité et le flag curatedMultiMode", () => {
    for (const a of Object.values(ABILITIES)) {
      if (CURATED_MULTIMODE_IDS.has(creatureEngineId(a))) {
        expect(a.triggers!.curatedMultiMode, a.id).toBe(true);
        expect(a.triggers!.creatureTriggers).toEqual([
          "on_play",
          "on_death",
          "on_activation",
          "on_return",
        ]);
      }
    }
  });

  it("les ids automatiques sont marqués automatic + grantable et exposent le trigger automatic", () => {
    for (const a of Object.values(ABILITIES)) {
      if (AUTOMATIC_ABILITY_IDS.has(creatureEngineId(a)) && a.applicable_to.includes("creature")) {
        expect(a.triggers!.automatic, a.id).toBe(true);
        expect(a.triggers!.grantable, a.id).toBe(true);
        expect(a.triggers!.creatureTriggers, a.id).toEqual(["automatic"]);
        expect(a.triggers!.effectKinds, a.id).toContain("grant");
      }
    }
  });

  it("aucun id n'est à la fois curé et automatique (classes disjointes)", () => {
    for (const id of CURATED_MULTIMODE_IDS) {
      expect(AUTOMATIC_ABILITY_IDS.has(id), id).toBe(false);
    }
  });
});
