// Un JETON qui porte la Traque doit pouvoir attaquer dès son arrivée.
//
// Signalé en partie avec « Chevauchée des Mille Sabots » (Déferlement 3 +
// Invocation multiple de deux jetons Humains 2/1 porteurs de `charge`) : les
// jetons arrivaient malades d'invocation et ne pouvaient pas attaquer.
//
// Cause : les chemins d'apparition de jetons posaient `hasSummoningSickness =
// true` EN DUR, juste après qu'`applyTokenTemplate` ait pourtant recopié les
// mots-clés du template — Traque comprise. Le mot-clé était donc écrasé une
// ligne après avoir été lu. Douze sites partageaient ce motif ; ils sont
// désormais tous alignés sur `!hasKw(token, "charge")`.
//
// Même famille que le correctif « Traque à l'entrée en jeu » (Invocation X,
// Appel du clan, Résurrection) : là aussi, l'invocation écrasait la Traque de la
// créature mise en jeu.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { applyAction, canAttack } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState, TokenTemplate } from "./types";

/** Le jeton 41 tel qu'il est en base : Humains 2/1, avec Traque. */
const GABARIT_TRAQUE = {
  id: 41, name: "Humains", attack: 2, health: 1,
  keywords: ["charge"], race: "Humains",
} as unknown as TokenTemplate;

/** Le même, SANS Traque, pour isoler la différence. */
const GABARIT_SANS = {
  id: 42, name: "Piétons", attack: 2, health: 1,
  keywords: [], race: "Humains",
} as unknown as TokenTemplate;

/** « Chevauchée des Mille Sabots » : invoque deux exemplaires du jeton donné. */
const chevauchee = (tokenId: number) => mkInstance(mkCard({
  name: "Chevauchée des Mille Sabots", card_type: "spell", attack: null, health: null, mana_cost: 8,
  spell_keywords: [{ id: "invocation_multiple" }] as never,
  convocation_tokens: [{ token_id: tokenId }, { token_id: tokenId }] as never,
  capabilities: [
    { uid: "sk_0", targets: [], trigger: "spell_resolution", abilityId: "invocation_multiple", effectKind: "immediate" },
  ] as unknown as Capability[],
}));

function table(): GameState {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.players[0].mana = 10;
  s.tokenTemplates = [GABARIT_TRAQUE, GABARIT_SANS] as never;
  return s;
}

describe("Invocation multiple — la Traque du jeton est respectée", () => {
  it("les jetons à Traque arrivent PRÊTS à attaquer", () => {
    const s = table();
    const sort = chevauchee(41);
    s.players[0].hand.push(sort);

    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });

    const jetons = st.players[0].board;
    expect(jetons).toHaveLength(2);
    for (const j of jetons) {
      expect(j.hasSummoningSickness, `jeton ${j.instanceId}`).toBe(false);
      expect(canAttack(st, j.instanceId)).toBe(true);
    }
  });

  it("un jeton SANS Traque reste malade d'invocation", () => {
    const s = table();
    const sort = chevauchee(42);
    s.players[0].hand.push(sort);

    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });

    expect(st.players[0].board).toHaveLength(2);
    for (const j of st.players[0].board) {
      expect(j.hasSummoningSickness).toBe(true);
      expect(canAttack(st, j.instanceId)).toBe(false);
    }
  });
});

// Garde-fou de motif. Douze sites d'apparition de jetons partageaient la même
// ligne fautive ; rien dans le typage n'empêche d'en réintroduire une treizième
// par copier-coller. On interdit donc la forme littérale dans le moteur.
describe("Aucun jeton ne se voit imposer le mal d'invocation en dur", () => {
  const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/lib/game/engine.ts"),
    "utf8",
  );

  it("plus aucun `token.hasSummoningSickness = true` littéral", () => {
    const fautifs = [...SOURCE.matchAll(/^\s*(tok|token|tokenS)\w*\.hasSummoningSickness = true;\s*$/gm)]
      .map((m) => m[0].trim());
    expect(
      fautifs,
      "un jeton doit lire sa Traque : `!hasKw(token, \"charge\")`, jamais `true`",
    ).toEqual([]);
  });

  it("le test ne tourne pas à vide : la forme CORRECTE est bien présente", () => {
    const bons = [...SOURCE.matchAll(/\w*\.hasSummoningSickness = !hasKw\(\w+, "charge"\);/g)];
    expect(bons.length).toBeGreaterThanOrEqual(12);
  });
});
