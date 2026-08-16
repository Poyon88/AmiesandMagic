// STATISTIQUE D'INITIATIVE — « commencer, est-ce un avantage ? »
//
// Ce qu'il faut verrouiller, et pourquoi :
//
//   1. La DÉRIVATION du premier joueur. Elle n'est stockée nulle part : elle se
//      recalcule depuis l'uuid de la partie. Si elle changeait, l'ordre de jeu
//      de toutes les parties PASSÉES serait réécrit — et la statistique avec.
//      C'est la même fonction qui pilote la partie en direct : la casser
//      désynchroniserait les deux clients.
//   2. Le rattachement joueur → camp. Se tromper de camp inverse silencieusement
//      la statistique, ce qui est pire que de ne rien afficher.
//   3. Le comptage de ce qu'on ÉCARTE. Une mesure d'équilibrage qui tait ses
//      trous laisse conclure sur du vide.
import { describe, expect, it } from "vitest";
import { seedForMatch, firstPlayerIndexForMatch, didPlayerStart } from "@/lib/game/first-player";
import { aggregateByTurnOrder, type MatchSides } from "@/lib/admin/analytics";
import type { DeckSnapshot } from "@/lib/admin/analytics";

/** uuid dont les 8 premiers caractères hex sont imposés — c'est tout ce dont
 *  la dérivation se sert. */
const uuid = (prefix8: string) => `${prefix8.slice(0, 8)}-0000-4000-8000-000000000000`;

const PAIR = uuid("00000002");   // 2 → pair   → joueur 1 commence
const IMPAIR = uuid("00000003"); // 3 → impair → joueur 2 commence

function snap(matchId: string, playerId: string, isWinner: boolean): DeckSnapshot {
  return {
    id: Math.random(), match_id: matchId, player_id: playerId,
    deck_id: null, hero_id: null, is_winner: isWinner,
    cards: [], primary_faction: null, created_at: new Date(0).toISOString(),
  };
}

const match = (id: string): MatchSides => ({ id, player1_id: "P1", player2_id: "P2" });

// ───────────────────────────────────────────────────────────────────────────

describe("dérivation du premier joueur", () => {
  it("la graine est la lecture hexadécimale des 8 premiers caractères", () => {
    expect(seedForMatch(uuid("0000000a"))).toBe(10);
    expect(seedForMatch(uuid("000000ff"))).toBe(255);
    // Les tirets sont retirés AVANT le découpage : la fenêtre porte sur les 8
    // premiers chiffres HEXADÉCIMAUX, où que soient les tirets. Découper avant
    // de les retirer décalerait la fenêtre et réécrirait l'ordre de jeu de
    // toutes les parties passées.
    expect(seedForMatch("00000002-0000-4000-8000-000000000000"))
      .toBe(seedForMatch("0000-0002-0000-4000-8000-000000000000"));
  });

  it("graine paire ⇒ joueur 1 commence ; impaire ⇒ joueur 2", () => {
    expect(firstPlayerIndexForMatch(PAIR)).toBe(0);
    expect(firstPlayerIndexForMatch(IMPAIR)).toBe(1);
  });

  it("elle ne dépend QUE de l'identifiant — même entrée, même sortie", () => {
    // Elle pilote aussi la partie en direct : une once de non-déterminisme ici
    // et les deux clients ne joueraient pas dans le même ordre.
    for (const id of [PAIR, IMPAIR, uuid("deadbeef"), uuid("12345678")]) {
      expect(firstPlayerIndexForMatch(id)).toBe(firstPlayerIndexForMatch(id));
    }
  });

  it("répartit les parties sans biais grossier", () => {
    // Pas une preuve d'uniformité, un garde-fou : une dérivation qui renverrait
    // toujours 0 passerait tous les tests précédents.
    let premiers = 0;
    for (let i = 0; i < 256; i++) {
      if (firstPlayerIndexForMatch(uuid(i.toString(16).padStart(8, "0"))) === 0) premiers++;
    }
    expect(premiers).toBe(128);
  });
});

describe("rattachement joueur → camp", () => {
  it("désigne le bon joueur selon la parité", () => {
    expect(didPlayerStart(PAIR, "P1", "P1", "P2")).toBe(true);
    expect(didPlayerStart(PAIR, "P2", "P1", "P2")).toBe(false);
    expect(didPlayerStart(IMPAIR, "P1", "P1", "P2")).toBe(false);
    expect(didPlayerStart(IMPAIR, "P2", "P1", "P2")).toBe(true);
  });

  it("un joueur étranger à la partie renvoie `null`, pas `false`", () => {
    // `false` voudrait dire « il a joué en second », ce qui est faux et
    // fausserait la statistique. L'absence de réponse est la seule honnête.
    expect(didPlayerStart(PAIR, "P3", "P1", "P2")).toBeNull();
  });
});

describe("agrégation", () => {
  it("compte victoires et défaites du bon côté", () => {
    // Une partie sur PAIR : P1 commence et gagne.
    const r = aggregateByTurnOrder(
      [snap(PAIR, "P1", true), snap(PAIR, "P2", false)],
      [match(PAIR)],
    );
    expect(r.stats.find((s) => s.key === "first")).toMatchObject({ wins: 1, losses: 0, winrate: 1 });
    expect(r.stats.find((s) => s.key === "second")).toMatchObject({ wins: 0, losses: 1, winrate: 0 });
    expect(r.total_matches).toBe(1);
  });

  it("l'ordre suit la partie, pas le camp — P2 peut être celui qui commence", () => {
    // Le piège : compter « player1 » comme « celui qui commence ». La moitié
    // des parties serait alors classée à l'envers, et le winrate tendrait vers
    // 50 % en effaçant précisément l'effet qu'on cherche à mesurer.
    const r = aggregateByTurnOrder(
      [snap(IMPAIR, "P2", true), snap(IMPAIR, "P1", false)],
      [match(IMPAIR)],
    );
    expect(r.stats.find((s) => s.key === "first")).toMatchObject({ wins: 1, losses: 0 });
    expect(r.stats.find((s) => s.key === "second")).toMatchObject({ wins: 0, losses: 1 });
  });

  it("mesure un vrai déséquilibre sur plusieurs parties", () => {
    const snaps: DeckSnapshot[] = [];
    const matches: MatchSides[] = [];
    // 10 parties : celui qui commence gagne 7 fois.
    for (let i = 0; i < 10; i++) {
      const id = uuid((i * 2).toString(16).padStart(8, "0")); // toutes paires ⇒ P1 commence
      matches.push(match(id));
      const premierGagne = i < 7;
      snaps.push(snap(id, "P1", premierGagne), snap(id, "P2", !premierGagne));
    }
    const r = aggregateByTurnOrder(snaps, matches);
    expect(r.total_matches).toBe(10);
    expect(r.stats.find((s) => s.key === "first")!.winrate).toBeCloseTo(0.7);
    expect(r.stats.find((s) => s.key === "second")!.winrate).toBeCloseTo(0.3);
  });

  it("écarte — et COMPTE — les instantanés sans partie correspondante", () => {
    const r = aggregateByTurnOrder(
      [snap(PAIR, "P1", true), snap(uuid("00000009"), "P1", true)],
      [match(PAIR)],
    );
    expect(r.skipped_snapshots).toBe(1);
    expect(r.total_matches).toBe(1);
  });

  it("écarte un joueur qui n'appartient à aucun des deux camps", () => {
    const r = aggregateByTurnOrder([snap(PAIR, "INTRUS", true)], [match(PAIR)]);
    expect(r.skipped_snapshots).toBe(1);
    expect(r.stats.every((s) => s.games_count === 0)).toBe(true);
  });

  it("sans aucune donnée, un winrate de 0 et non une division par zéro", () => {
    const r = aggregateByTurnOrder([], []);
    expect(r.stats.map((s) => s.winrate)).toEqual([0, 0]);
    expect(r.total_matches).toBe(0);
  });

  it("les deux camps totalisent le même nombre de parties", () => {
    // Invariant de conservation : chaque partie fournit exactement un
    // commençant et un second. Un écart signalerait un instantané orphelin
    // compté d'un seul côté.
    const snaps: DeckSnapshot[] = [];
    const matches: MatchSides[] = [];
    for (let i = 0; i < 20; i++) {
      const id = uuid(i.toString(16).padStart(8, "0"));
      matches.push(match(id));
      snaps.push(snap(id, "P1", i % 3 === 0), snap(id, "P2", i % 3 !== 0));
    }
    const r = aggregateByTurnOrder(snaps, matches);
    const [a, b] = r.stats;
    expect(a.games_count).toBe(b.games_count);
    expect(a.games_count).toBe(r.total_matches);
  });
});
