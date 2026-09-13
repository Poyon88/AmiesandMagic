// Forme CURÉE de Tuteur (mot-clé créature ET sort, cartes liées comme
// Compagnons) : les cartes désignées à la création rejoignent la MAIN du
// contrôleur, doublons compris, à l'entrée en jeu, à la résolution d'un sort,
// et sur les autres déclencheurs curés.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { ALL_KEYWORDS, KEYWORD_LABELS, KEYWORD_SYMBOLS } from "./keyword-labels";
import { ABILITIES, CURATED_MULTIMODE_IDS, TOKEN_UNSUPPORTED_IDS } from "./abilities";
import { ALL_SPELL_KEYWORDS } from "./spell-keywords";
import { buildKeywordInstances } from "@/lib/card-forge/keyword-instances";
import type { Card, CardInstance, GameState } from "./types";

const poolCard = (name: string, id: number): Card =>
  mkCard({ id, name, faction: "Mercenaires", rarity: "Commune", mana_cost: 2, attack: 1, health: 1 });

function precepteur(linked: number[], mode?: string): CardInstance {
  return mkInstance(mkCard({
    name: "Précepteur", attack: 1, health: 3,
    keywords: ["tuteur"] as never,
    keyword_instances: [{ id: "tuteur", linkedCardIds: linked, ...(mode ? { mode } : {}) }] as never,
  }));
}
function lecon(linked: number[]): CardInstance {
  return mkInstance(mkCard({
    name: "Leçon", card_type: "spell", attack: null, health: null,
    spell_keywords: [{ id: "tuteur", linkedCardIds: linked }] as never,
  }));
}
function jouer(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}
const main = (s: GameState) => s.players[0].hand.map((c) => c.card.name);

afterEach(() => vi.restoreAllMocks());

describe("Tuteur curé — créature", () => {
  it("à l'entrée en jeu, ajoute les cartes liées en main, dans l'ordre, doublons compris", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Alpha", 9401), poolCard("Bêta", 9402)];

    const apres = jouer(s, precepteur([9402, 9401, 9402]));

    expect(apres.players[0].board.map((c) => c.card.name)).toEqual(["Précepteur"]);
    expect(main(apres)).toEqual(["Bêta", "Alpha", "Bêta"]);
    expect(new Set(apres.players[0].hand.map((c) => c.instanceId)).size).toBe(3);
  });

  it("sans carte liée : rien, et un warn le dit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = mkState();
    s.factionCardPool = [poolCard("Alpha", 9401)];
    expect(main(jouer(s, precepteur([])))).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("aucune carte désignée"));
  });
});

describe("Tuteur curé — sort", () => {
  it("à la résolution, ajoute les cartes liées en main (sorts compris)", () => {
    const s = mkState();
    s.factionCardPool = [poolCard("Alpha", 9401)];
    s.allSpellsPool = [mkCard({ id: 9403, name: "Sortilège", card_type: "spell", attack: null, health: null, faction: "Mercenaires" })];

    const apres = jouer(s, lecon([9403, 9401]));

    expect(main(apres)).toEqual(["Sortilège", "Alpha"]);
  });
});

describe("inscription dans les listes parallèles", () => {
  it("registre, libellés, symboles, liste de l'éditeur, mots-clés de sort", () => {
    expect(ABILITIES.tuteur.applicable_to).toEqual(["creature", "spell"]);
    expect(ALL_KEYWORDS as unknown as string[]).toContain("tuteur");
    expect(KEYWORD_LABELS.tuteur).toBe("Tuteur");
    expect(KEYWORD_SYMBOLS.tuteur).toBe("🎓");
    expect(ALL_SPELL_KEYWORDS).toContain("tuteur");
  });

  it("tous les déclencheurs curés, mais pas sur un token (annexe sans champ)", () => {
    expect(CURATED_MULTIMODE_IDS.has("tuteur")).toBe(true);
    expect(TOKEN_UNSUPPORTED_IDS.has("tuteur")).toBe(true);
  });

  it("la forge émet l'instance avec les cartes liées (créature)", () => {
    const inst = buildKeywordInstances({
      labels: ["Tuteur"], xValues: {}, modes: {}, grantScopes: {}, isSpellCard: false, singulier: {}, randomX: {},
      extras: { tuteurCardIds: [9401, 9401] },
    } as never) as { id: string; linkedCardIds?: number[] }[];
    expect(inst.find((i) => i.id === "tuteur")?.linkedCardIds).toEqual([9401, 9401]);
  });
});
