// Tactique X — les capacités transmises sont TIRÉES AU HASARD, et seulement les
// PERMANENTES.
//
// Avant : le joueur désignait lui-même les capacités dans une modale, et le
// moteur n'en transmettait de toute façon qu'UNE SEULE quel que soit le X saisi
// (`slice(0, 1)`), le X de la modale étant recalculé côté client à partir du
// coût en mana. Trois choses sont donc verrouillées ici : le hasard, le respect
// du X de la carte, et le filtre « icône blanche ».
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { composedIcon, describeComposedCap } from "./composed-display";
import { KEYWORD_SYMBOLS } from "./keyword-labels";
import type { GameState, Keyword } from "./types";

/** Porteuse de Tactique X, avec ses propres capacités à partager. */
function tacticienne(x: number, partage: Keyword[]) {
  return mkInstance(mkCard({
    name: "Colonne", attack: 2, health: 2,
    keywords: ["tactique", ...partage] as never,
    keyword_instances: [{ id: "tactique", x }] as never,
  }));
}

/** Joue la tacticienne sur l'allié déjà en place, avec la graine `seed`. */
function partager(source: ReturnType<typeof tacticienne>, seed = 1, allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 5 }))) {
  const s: GameState = { ...mkState(), rngState: seed };
  s.players[0].deck.push(mkInstance(mkCard({})));
  s.players[0].board.push(allie);
  s.players[0].hand.push(source);
  const apres = applyAction(s, {
    type: "play_card",
    cardInstanceId: source.instanceId,
    targetInstanceId: allie.instanceId,
  });
  const cible = apres.players[0].board.find((c) => c.instanceId === allie.instanceId)!;
  return cible.card.keywords as unknown as string[];
}

describe("Tactique X — tirage au hasard", () => {
  it("transmet EXACTEMENT X capacités (et plus une seule, comme avant)", () => {
    const recues = partager(tacticienne(2, ["taunt", "ranged", "premiere_frappe", "esquive"]));
    expect(recues).toHaveLength(2);
    for (const kw of recues) expect(["taunt", "ranged", "premiere_frappe", "esquive"]).toContain(kw);
  });

  it("ne transmet jamais Tactique elle-même", () => {
    expect(partager(tacticienne(3, ["taunt", "ranged", "premiere_frappe"]))).not.toContain("tactique");
  });

  it("le tirage dépend de la graine — c'est bien du hasard", () => {
    const pool: Keyword[] = ["taunt", "ranged", "premiere_frappe", "esquive", "celerite"] as never;
    const tirages = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      tirages.add([...partager(tacticienne(1, pool), seed)].sort().join("|"));
    }
    expect(tirages.size).toBeGreaterThan(1);
  });

  it("à graine égale, les deux clients tirent la MÊME chose (anti-désynchro)", () => {
    const pool: Keyword[] = ["taunt", "ranged", "premiere_frappe", "esquive", "celerite"] as never;
    expect(partager(tacticienne(2, pool), 7)).toEqual(partager(tacticienne(2, pool), 7));
  });
});

describe("Tactique X — capacités PERMANENTES seulement (icône blanche)", () => {
  it("écarte les capacités à déclencheur : une Invocation X n'est jamais transmise", () => {
    // Invocation X part « à l'entrée en jeu » (icône jaune) : la donner à une
    // unité DÉJÀ en jeu ne déclencherait jamais rien.
    expect(partager(tacticienne(2, ["invocation", "taunt"] as never))).toEqual(["taunt"]);
  });

  it("écarte aussi une permanente REDÉCLENCHÉE par son instance (icône colorée)", () => {
    const source = mkInstance(mkCard({
      name: "Colonne", attack: 2, health: 2,
      keywords: ["tactique", "renforcement", "taunt"] as never,
      keyword_instances: [
        { id: "tactique", x: 2 },
        { id: "renforcement", mode: "tap", x: 1, y: 1 },
      ] as never,
    }));
    expect(partager(source)).toEqual(["taunt"]);
  });

  it("aucune permanente à donner : la cible ne reçoit rien", () => {
    expect(partager(tacticienne(2, ["invocation"] as never))).toEqual([]);
  });

  it("ne redonne pas ce que la cible possède déjà", () => {
    const allie = mkInstance(mkCard({ name: "Allié", attack: 1, health: 5, keywords: ["taunt"] as never }));
    const recues = partager(tacticienne(1, ["taunt", "ranged"]), 3, allie);
    expect(recues).toEqual(["taunt", "ranged"]); // « taunt » d'origine + le seul tirable
  });
});

describe("Tactique en effet COMPOSÉ", () => {
  const capTactique = (x: number, side: "ally" | "enemy" = "ally") => ({
    uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
    composed: {
      content: "tactique", magnitude: { x },
      target: { entity: "unit", side, count: "all", location: "board", designation: "automatic" },
    },
  });

  /** Joue `source` (qui porte la capacité composée) ; renvoie les capacités de chaque unité du bord visé. */
  function jouer(source: ReturnType<typeof mkInstance>, bord: 0 | 1 = 0, temoins = 1) {
    const s: GameState = { ...mkState(), rngState: 5 };
    s.players[0].deck.push(mkInstance(mkCard({})));
    const cibles = Array.from({ length: temoins }, (_, i) =>
      mkInstance(mkCard({ name: `Témoin${i}`, attack: 1, health: 5 })));
    for (const c of cibles) s.players[bord].board.push(c);
    s.players[0].hand.push(source);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: source.instanceId });
    return cibles.map((c) => {
      const vivante = apres.players[bord].board.find((b) => b.instanceId === c.instanceId)!;
      return vivante.card.keywords as unknown as string[];
    });
  }

  it("partage X capacités permanentes à TOUTES les unités visées", () => {
    const source = mkInstance(mkCard({
      name: "Stratège", attack: 2, health: 3,
      keywords: ["taunt", "ranged", "premiere_frappe"] as never,
      capabilities: [capTactique(2)] as never,
    }));
    const recues = jouer(source, 0, 2);
    expect(recues).toHaveLength(2);
    for (const kws of recues) {
      expect(kws).toHaveLength(2);
      for (const kw of kws) expect(["taunt", "ranged", "premiere_frappe"]).toContain(kw);
    }
  });

  it("filtre les permanentes comme la forme curée", () => {
    const source = mkInstance(mkCard({
      name: "Stratège", attack: 2, health: 3,
      keywords: ["invocation", "taunt"] as never,
      capabilities: [capTactique(2)] as never,
    }));
    expect(jouer(source)[0]).toEqual(["taunt"]);
  });

  it("se décrit en français sur la carte", () => {
    const cap = {
      uid: "cx_0", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "tactique", magnitude: { x: 2 },
        target: { entity: "unit", side: "ally", count: 1, location: "board", designation: "choice" },
      },
    } as never;
    expect(describeComposedCap(cap)).toBe(
      "Transmet au hasard 2 de ses capacités permanentes à une unité alliée au choix.",
    );
    expect(composedIcon(cap)).toEqual({ symbol: KEYWORD_SYMBOLS.tactique, keyword: "tactique" });
  });

  it("porté par un SORT, l'effet ne fait rien (rien à partager)", () => {
    const sort = mkInstance(mkCard({
      name: "Ordre de bataille", card_type: "spell", attack: null, health: null,
      // Les `keywords` d'un sort sont ce qu'il CONFÈRE : ce n'est pas à Tactique
      // de les redistribuer (grant_keyword est là pour ça).
      keywords: ["taunt", "ranged"] as never,
      capabilities: [capTactique(2)] as never,
    }));
    const s: GameState = { ...mkState(), rngState: 5 };
    s.players[0].deck.push(mkInstance(mkCard({})));
    const temoin = mkInstance(mkCard({ name: "Témoin", attack: 1, health: 5 }));
    s.players[0].board.push(temoin);
    s.players[0].hand.push(sort);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
    expect(apres.players[0].board.find((c) => c.instanceId === temoin.instanceId)!.card.keywords).toEqual([]);
  });

  it("la SOURCE ne se transmet rien à elle-même", () => {
    // Cible « toutes les unités alliées » : la source en fait partie une fois
    // posée. Elle doit ressortir avec ses capacités d'origine, ni plus ni moins.
    const source = mkInstance(mkCard({
      name: "Stratège", attack: 2, health: 3,
      keywords: ["taunt", "ranged"] as never,
      capabilities: [capTactique(1)] as never,
    }));
    const s: GameState = { ...mkState(), rngState: 5 };
    s.players[0].deck.push(mkInstance(mkCard({})));
    s.players[0].hand.push(source);
    const apres = applyAction(s, { type: "play_card", cardInstanceId: source.instanceId });
    const posee = apres.players[0].board.find((c) => c.instanceId === source.instanceId)!;
    expect(posee.card.keywords).toEqual(["taunt", "ranged"]);
  });
});
