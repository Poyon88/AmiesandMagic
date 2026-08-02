// Constructeur PARTAGÉ des `keyword_instances` (forge cartes + éditeur tokens).
//
// Ce fichier existe surtout comme filet de non-régression de l'EXTRACTION : la
// logique vivait en ligne dans CardForge, et la sortie doit rester identique au
// bit près pour les cartes déjà en base. Les cas ci-dessous couvrent les trois
// familles : le générique (rien à stocker), les couples X/Y, et les capacités à
// donnée annexe.
import { describe, expect, it } from "vitest";
import { buildKeywordInstances, FORGE_TO_GAME_KEYWORD, GAME_TO_FORGE_KEYWORD } from "./keyword-instances";
import { CREATURE_LABEL_TO_ENGINE_ID } from "@/lib/game/abilities";

describe("buildKeywordInstances — cas générique", () => {
  it("un mot-clé à l'invocation sans X ne produit AUCUNE instance", () => {
    // Le mot-clé reste décrit par le seul `keywords[]` ; l'adaptateur lui
    // donnera son déclencheur naturel. Stocker une instance vide serait du bruit.
    expect(buildKeywordInstances({ labels: ["Provocation"] })).toEqual([]);
  });

  it("un X seul suffit à produire une instance", () => {
    expect(buildKeywordInstances({ labels: ["Résistance X"], xValues: { "Résistance X": 3 } }))
      .toEqual([{ id: "resistance", x: 3 }]);
  });

  it("un mode seul suffit à produire une instance", () => {
    expect(buildKeywordInstances({ labels: ["Rappel"], modes: { "Rappel": "death" } }))
      .toEqual([{ id: "rappel", mode: "death" }]);
  });

  it("un libellé inconnu est ignoré au lieu de produire une instance sans id", () => {
    expect(buildKeywordInstances({ labels: ["Capacité Fantôme"], xValues: { "Capacité Fantôme": 2 } }))
      .toEqual([]);
  });

  it("la portée n'est persistée que sur un SORT (ignorée côté créature)", () => {
    const scopes = { "Provocation": "all_allies" as const };
    expect(buildKeywordInstances({ labels: ["Provocation"], grantScopes: scopes, isSpellCard: true }))
      .toEqual([{ id: "taunt", grantScope: "all_allies" }]);
    expect(buildKeywordInstances({ labels: ["Provocation"], grantScopes: scopes, isSpellCard: false }))
      .toEqual([]);
  });
});

describe("buildKeywordInstances — couples X/Y", () => {
  it("Gloire porte X et Y, et est émise même sans saisie", () => {
    expect(buildKeywordInstances({ labels: ["Gloire +X/+Y"], xValues: { "Gloire +X/+Y": 2 }, extras: { glY: 3 } }))
      .toEqual([{ id: "gloire", x: 2, y: 3 }]);
    // Sans extras : émise quand même (sinon le moteur retomberait sur son repli
    // sans que la forge puisse jamais exprimer un 0).
    expect(buildKeywordInstances({ labels: ["Gloire +X/+Y"] })).toEqual([{ id: "gloire", x: 0, y: 0 }]);
  });

  it("Force des ancêtres retombe sur 1/1 quand rien n'est saisi", () => {
    expect(buildKeywordInstances({ labels: ["Force des ancêtres +X/+Y"] }))
      .toEqual([{ id: "force_des_ancetres", x: 1, y: 1 }]);
  });

  it("Renforcement multiple porte race et clan quand ils sont fournis", () => {
    expect(buildKeywordInstances({
      labels: ["Renforcement multiple"],
      xValues: { "Renforcement multiple": 1 },
      extras: { rmY: 2, rmRace: "elves", rmClan: "Combe Verte" },
    })).toEqual([{ id: "renforcement_multiple", x: 1, y: 2, race: "elves", clan: "Combe Verte" }]);
  });

  it("côté SORT, Renforcement passe par la branche générique (pas de Y forcé)", () => {
    // La branche dédiée est gardée par `!isSpellCard` : sur un sort, le +Y
    // vient de spell_keywords, pas de l'instance.
    expect(buildKeywordInstances({ labels: ["Renforcement +X/+Y"], isSpellCard: true, extras: { rfY: 5 } }))
      .toEqual([]);
  });
});

describe("buildKeywordInstances — données annexes", () => {
  it("Conférer porte la capacité donnée, et son Y seulement si elle est à couple", () => {
    expect(buildKeywordInstances({ labels: ["Conférer"], extras: { conferAbilityId: "gloire", conferX: 2, conferY: 3 } }))
      .toEqual([{ id: "conferer", grantAbilityId: "gloire", x: 2, y: 3 }]);
    // Capacité à simple X → pas de Y stocké (une valeur sans signification).
    expect(buildKeywordInstances({ labels: ["Conférer"], extras: { conferAbilityId: "taunt", conferX: 1, conferY: 3 } }))
      .toEqual([{ id: "conferer", grantAbilityId: "taunt", x: 1 }]);
  });

  it("Invocations multiples porte ses coûts et sa restriction de pool", () => {
    expect(buildKeywordInstances({ labels: ["Invocations multiples"], extras: { invocCosts: [3, 5], invocFaction: "Elfes" } }))
      .toEqual([{ id: "invocations_multiples", costs: [3, 5], faction: "Elfes" }]);
  });
});

describe("table libellé ↔ id", () => {
  it("couvre TOUT le registre créature (exhaustive par construction)", () => {
    const manquants = Object.keys(CREATURE_LABEL_TO_ENGINE_ID).filter(l => !FORGE_TO_GAME_KEYWORD[l]);
    expect(manquants).toEqual([]);
  });

  it("les alias legacy l'emportent sur la base dérivée", () => {
    // « Vol » est resté mappé sur l'id legacy `ranged` : le changer casserait
    // les cartes déjà en base.
    expect(FORGE_TO_GAME_KEYWORD["Vol"]).toBe("ranged");
    expect(FORGE_TO_GAME_KEYWORD["Traque"]).toBe("charge");
    expect(FORGE_TO_GAME_KEYWORD["Berserk"]).toBe("gloire");
  });

  it("la réciproque ramène un libellé pour tout id du registre, sauf le doublon `vol`", () => {
    // `vol` est l'id de registre de Vol, mais les cartes stockent son doublon
    // legacy `ranged` (cf. CAPABILITY_LIMIT_EXEMPT) — et l'alias « Vol » →
    // `ranged` l'emporte volontairement. L'id `vol` n'est donc JAMAIS produit
    // par la forge et n'a pas de libellé retour ; l'aller-retour d'un token
    // passe bien par `ranged` → « Vol ».
    const shadowed = new Set(["vol"]);
    for (const id of Object.values(CREATURE_LABEL_TO_ENGINE_ID)) {
      if (shadowed.has(id)) continue;
      expect(GAME_TO_FORGE_KEYWORD[id], `id sans libellé : ${id}`).toBeTruthy();
    }
    expect(GAME_TO_FORGE_KEYWORD["ranged"]).toBe("Vol");
  });
});
