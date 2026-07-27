// Un SORT qui confère un mot-clé (effectKind "grant") doit garder son
// déclencheur `spell_resolution` à la lecture des capacités.
//
// Régression : le réalignement des triggers périmés de getCapabilities prend le
// `mode` de keyword_instances comme autorité. Sur un sort, l'instance d'un
// mot-clé conféré porte x/y/grantScope mais AUCUN mode → le trigger était
// réaligné sur celui du mot-clé côté créature (« automatic » pour un passif),
// et la phase de don de playCard, qui filtre sur `spell_resolution`, ne trouvait
// plus rien. Tout sort conférant un mot-clé passif était silencieusement sans
// effet (cas vu en partie : « Éveil des Premiers-Nés », carte 522).
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

/** Sort conférant un mot-clé à tous les alliés, tel que la forge l'enregistre. */
function grantSpell(abilityId: string, x: number, y: number, scope: "all_allies" | "target" = "all_allies"): CardInstance {
  return mkInstance(mkCard({
    name: "Éveil", card_type: "spell", attack: null, health: null, mana_cost: 4,
    keywords: [abilityId] as never,
    keyword_instances: [{ id: abilityId, x, y, ...(scope === "all_allies" ? { grantScope: scope } : {}) }] as never,
    capabilities: [{
      uid: "grant_0", params: { x, y }, targets: [],
      trigger: "spell_resolution", abilityId, effectKind: "grant",
      ...(scope === "all_allies" ? { grantScope: scope } : {}),
    }] as never,
  }));
}

function cast(s: GameState, spell: CardInstance, targetMap?: Record<string, string>): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, targetMap });
}

describe("Sort conférant un mot-clé", () => {
  it("garde son déclencheur spell_resolution à la lecture", () => {
    const spell = grantSpell("force_des_ancetres", 3, 3);
    const caps = getCapabilities(spell.card);
    expect(caps[0].trigger).toBe("spell_resolution");
  });

  it("confère bien le mot-clé à tous les alliés, avec X et Y", () => {
    const s = mkState();
    const a = mkInstance(mkCard({ name: "Aigles", attack: 1, health: 1 }));
    const b = mkInstance(mkCard({ name: "Loups", attack: 2, health: 1 }));
    s.players[0].board.push(a, b);

    const next = cast(s, grantSpell("force_des_ancetres", 3, 3));

    for (const c of next.players[0].board) {
      expect(c.card.keywords as unknown as string[]).toContain("force_des_ancetres");
      expect(c.grantedKeywordX["force_des_ancetres"]).toBe(3);
      expect(c.grantedKeywordY?.["force_des_ancetres"]).toBe(3);
    }
  });

  it("le bonus conditionnel s'applique quand sa condition est remplie", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(mkCard({ name: "Aigles", attack: 1, health: 1 })));
    // Force des ancêtres : actif à partir de 5 créatures au cimetière.
    for (let i = 0; i < 6; i++) s.players[0].graveyard.push(mkInstance(mkCard({ name: `Mort${i}` })));

    const next = cast(s, grantSpell("force_des_ancetres", 3, 3));
    const a = next.players[0].board[0];
    expect([a.currentAttack, a.currentHealth]).toEqual([4, 4]);
  });

  it("Gloire conférée transporte aussi son couple X/Y", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(mkCard({ name: "Aigles", attack: 1, health: 1 })));

    const next = cast(s, grantSpell("gloire", 2, 1));
    const a = next.players[0].board[0];
    expect(a.card.keywords as unknown as string[]).toContain("gloire");
    expect(a.grantedKeywordX["gloire"]).toBe(2);
    expect(a.grantedKeywordY?.["gloire"]).toBe(1);
  });
});
