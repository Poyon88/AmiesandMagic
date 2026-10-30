// AURAS CONDITIONNELLES À PORTÉE — Pureté, Force des ancêtres, Seuil
// Sacrificiel. Arbitrage de l'auteur (2026-10-30) : traitées comme Renforcement
// pour le bénéficiaire, mais restent des AURAS (le bonus va et vient avec la
// condition) :
//   • défaut, marqueur « S » : la porteuse elle-même (comportement d'avant) ;
//   • portée « toutes » (« A ») : toutes les AUTRES unités alliées ;
//   • pas d'« autre unité désignée » — une aura n'a pas de cible durable.
import { describe, expect, it } from "vitest";
import { recalculateAuras } from "./engine";
import { describeKeyword } from "./keyword-display";
import { kwInstanceSoi, kwInstanceScope } from "./target-scope";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState, Keyword, KeywordInstance, TargetScope } from "./types";

const porteuse = (kw: Keyword, targetScope?: TargetScope, name = "Porteuse") => mkInstance(mkCard({
  name, attack: 1, health: 1, keywords: [kw],
  keyword_instances: [{ id: kw, x: 2, y: 3, ...(targetScope ? { targetScope } : {}) } as KeywordInstance],
}));
const allie = (name: string) => mkInstance(mkCard({ name, attack: 1, health: 1 }));
const stats = (c: CardInstance) => [c.currentAttack, c.maxHealth];

/** Plateau où la condition de `kw` est remplie (ou non) pour P1. */
function etat(kw: Keyword, remplie: boolean): GameState {
  const s = mkState();
  const p = s.players[0];
  if (kw === "purete" && !remplie) p.graveyard.push(allie("Mort"));
  if (kw === "force_des_ancetres" && remplie) for (let i = 0; i < 7; i++) p.graveyard.push(allie(`Ancêtre ${i}`));
  if (kw === "seuil_sacrificiel" && !remplie) for (let i = 0; i < 26; i++) p.deck.push(allie(`Carte ${i}`));
  return s;
}

const AURAS: Keyword[] = ["purete", "force_des_ancetres", "seuil_sacrificiel"];

describe.each(AURAS)("%s — portée", (kw) => {
  it("défaut « S » : la porteuse seule en profite (comportement inchangé)", () => {
    const s = etat(kw, true);
    const [p, a] = [porteuse(kw), allie("Alliée")];
    s.players[0].board.push(p, a);
    recalculateAuras(s.players[0], s.players[1]);
    expect(stats(p)).toEqual([3, 4]);
    expect(stats(a)).toEqual([1, 1]);
  });

  it("« A » : toutes les AUTRES alliées, pas la porteuse ni l'ennemie", () => {
    const s = etat(kw, true);
    const [p, a, b, e] = [porteuse(kw, "all_allies"), allie("A"), allie("B"), allie("Ennemie")];
    s.players[0].board.push(p, a, b);
    s.players[1].board.push(e);
    recalculateAuras(s.players[0], s.players[1]);
    expect(stats(a)).toEqual([3, 4]);
    expect(stats(b)).toEqual([3, 4]);
    expect(stats(p)).toEqual([1, 1]);
    expect(stats(e)).toEqual([1, 1]);
  });

  it("« A » : condition rompue ⇒ rien, et le bonus retombe quand elle se rompt", () => {
    const s = etat(kw, true);
    const [p, a] = [porteuse(kw, "all_allies"), allie("A")];
    s.players[0].board.push(p, a);
    recalculateAuras(s.players[0], s.players[1]);
    expect(stats(a)).toEqual([3, 4]);
    // On rompt la condition.
    const pl = s.players[0];
    if (kw === "purete") pl.graveyard.push(allie("Mort"));
    if (kw === "force_des_ancetres") pl.graveyard = [];
    if (kw === "seuil_sacrificiel") for (let i = 0; i < 26; i++) pl.deck.push(allie(`Carte ${i}`));
    recalculateAuras(s.players[0], s.players[1]);
    expect(stats(a)).toEqual([1, 1]);
  });

  it("deux sources « A » s'additionnent, et chacune profite de l'autre", () => {
    const s = etat(kw, true);
    const [p1, p2, a] = [porteuse(kw, "all_allies", "P1"), porteuse(kw, "all_allies", "P2"), allie("A")];
    s.players[0].board.push(p1, p2, a);
    recalculateAuras(s.players[0], s.players[1]);
    expect(stats(a)).toEqual([5, 7]);
    expect(stats(p1)).toEqual([3, 4]);
  });

  it("recalculs répétés : pas d'empilement", () => {
    const s = etat(kw, true);
    const [p, a] = [porteuse(kw, "all_allies"), allie("A")];
    s.players[0].board.push(p, a);
    for (let i = 0; i < 4; i++) recalculateAuras(s.players[0], s.players[1]);
    expect(stats(a)).toEqual([3, 4]);
  });

  it("marqueurs : « S » par défaut, « A » en portée toutes", () => {
    expect(kwInstanceSoi({ id: kw } as KeywordInstance)).toBe(true);
    expect(kwInstanceSoi({ id: kw, targetScope: "all_allies" } as KeywordInstance)).toBe(false);
    expect(kwInstanceScope({ id: kw, targetScope: "all_allies" } as KeywordInstance)).toBe("all_allies");
  });

  it("description « toutes les autres unités alliées » en portée A", () => {
    const d = describeKeyword(kw, { x: 2, instance: { y: 3, targetScope: "all_allies" } as KeywordInstance });
    expect(d).toContain("toutes les autres unités alliées gagnent +2 ATK et +3 PV");
  });
});
