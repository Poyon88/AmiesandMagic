// Sélection magique en EFFET COMPOSÉ, au même titre que Sélection et Sélection
// Royale. Le pool est restreint aux SORTS : `ComposedPoolFilter` ne sait pas
// exprimer un type de carte, d'où un contenu distinct plutôt qu'un filtre.
import { describe, expect, it } from "vitest";
import { buildSpellEffectCatalog } from "@/lib/card-forge/spell-effect-catalog";
import { ALL_SPELL_KEYWORDS } from "./spell-keywords";
import { describeComposedCap } from "./composed-display";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, ComposedEffect, GameState } from "./types";

const catalog = buildSpellEffectCatalog(ALL_SPELL_KEYWORDS);

describe("Sélection magique — entrée du catalogue", () => {
  it("est un effet COMPOSÉ, plus une mécanique curée", () => {
    const e = catalog.find((x) => x.id === "selection_magique");
    expect(e).toBeDefined();
    expect(e!.kind).toBe("composed");
  });

  it("expose le même preset que ses deux sœurs", () => {
    const preset = (id: string) => {
      const e = catalog.find((x) => x.id === id);
      return e?.kind === "composed" ? e.preset : null;
    };
    expect(preset("selection_magique")).toEqual({
      content: "selection_magique",
      magnitude: { x: 1 },
    });
    // Même forme que Sélection : X = plafond de coût, aucune cible en jeu.
    expect(preset("selection_magique")!.target).toBeUndefined();
    expect(preset("selection")!.magnitude).toEqual(preset("selection_magique")!.magnitude);
  });

  it("les trois Sélections sont toutes composées", () => {
    for (const id of ["selection", "selection_magique", "renfort_royal"]) {
      expect(catalog.find((x) => x.id === id)?.kind).toBe("composed");
    }
  });
});

describe("Sélection magique — description", () => {
  const cap = (over: Partial<ComposedEffect> = {}): Capability => ({
    uid: "cx_0",
    abilityId: "_composed",
    effectKind: "immediate",
    trigger: "spell_resolution",
    composed: { content: "selection_magique", magnitude: { x: 3 }, ...over },
  } as Capability);

  it("annonce des SORTS, et non des cartes", () => {
    const txt = describeComposedCap(cap());
    expect(txt).toContain("sorts");
    expect(txt).toContain("3");
  });

  it("ne retombe jamais sur l'identifiant brut", () => {
    expect(describeComposedCap(cap())).not.toBe("selection_magique");
  });

  it("reprend le filtre de pool dans le texte, sous le NOM de la faction", () => {
    // « Nains » est l'id, stable en code et en base ; le joueur lit « Les Armées
    // des Montagnes ». Imprimer l'id faisait dire à une carte « de la faction
    // Nains » juste au-dessus de son propre bandeau de faction.
    const txt = describeComposedCap(cap({ pool: { faction: "Nains" } }));
    expect(txt).toContain("Les Armées des Montagnes");
    expect(txt).not.toContain("faction Nains");
  });
});

describe("Sélection magique composée — résolution moteur", () => {
  const mkSpell = (name: string, mana: number): Card => mkCard({
    name, card_type: "spell", attack: null, health: null, mana_cost: mana,
    rarity: "Commune", faction: "Nains", card_alignment: "neutre",
  });
  const mkCreature = (name: string, mana: number): Card => mkCard({
    name, card_type: "creature", attack: 2, health: 2, mana_cost: mana,
    rarity: "Commune", faction: "Nains", card_alignment: "neutre",
  });

  function stateAvecPool(): GameState {
    const s = mkState();
    s.allSpellsPool = [
      mkSpell("Sort A", 1), mkSpell("Sort B", 2), mkSpell("Sort C", 3),
      mkSpell("Sort D", 2), mkSpell("Sort E", 1),
      // Pièges : des créatures dans le pool ne doivent JAMAIS être révélées.
      mkCreature("Créature X", 1), mkCreature("Créature Y", 2),
    ];
    return s;
  }

  it("ne propose JAMAIS une créature, seulement des sorts", () => {
    const s = stateAvecPool();
    const porteur = mkInstance(mkCard({
      name: "Grimoire", card_type: "spell", attack: null, health: null,
      mana_cost: 2, faction: "Nains", card_alignment: "neutre",
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
        trigger: "spell_resolution",
        composed: { content: "selection_magique", magnitude: { x: 3 } },
      }] as unknown as Capability[],
    }));
    s.players[0].hand.push(porteur);

    const next = applyAction(s, { type: "play_card", cardInstanceId: porteur.instanceId });

    // Le sort suspend sur la modale « 1 parmi 3 » : c'est l'OFFRE qu'on inspecte
    // (rien ne rejoint la main avant le choix du joueur).
    const trig = (next.pendingTriggers ?? []).find((t) => t.selectionType === "selection_magique");
    expect(trig).toBeDefined();
    const byId = new Map((s.allSpellsPool ?? []).map((c) => [c.id, c] as const));
    const offerts = (trig!.selectionOptionIds ?? []).map((id) => byId.get(id)!);
    expect(offerts.length).toBeGreaterThan(0);
    expect(offerts.every((c) => c.card_type === "spell")).toBe(true);
    expect(offerts.some((c) => c.name.startsWith("Créature "))).toBe(false);
    // Le plafond X=3 est respecté : tous les sorts du pool y satisfont ici.
    expect(offerts.every((c) => c.mana_cost <= 3)).toBe(true);
    expect(next.players[0].hand).toHaveLength(0);
  });
});
