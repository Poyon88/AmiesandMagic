// ORDRE D'AUTEUR entre mots-clés et effets composés (composed-position.ts).
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { getCapabilities } from "./capability-adapter";
import { orderCapabilitiesByAuthor, composedDisplayOrder, keywordDisplayOrder, spellKeywordDisplayOrder, POWER_ORDER_LAST } from "./composed-position";
import { sanitizeComposed } from "../cards/composedCapabilities";
import { movePowerUnified, unifiedPowerList } from "../card-forge/power-order";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, GameState, Keyword, SpellKeywordInstance } from "./types";

const compose = (uid: string, position: number | undefined, trigger: Capability["trigger"] = "on_play", content = "draw_cards"): Capability => ({
  uid, trigger, effectKind: "immediate", abilityId: "_composed",
  composed: { content: content as never, magnitude: { x: 1 } },
  ...(position != null ? { position } : {}),
});
const ids = (caps: Capability[]) => caps.map((c) => (c.composed ? c.uid : c.abilityId));

describe("orderCapabilitiesByAuthor", () => {
  it("sans position, un composé reste en queue (aucune carte existante ne bouge)", () => {
    const card = mkCard({ keywords: ["divination", "inspiration"] as never, capabilities: null });
    const caps = [compose("cx_0", undefined), ...getCapabilities(card)];
    expect(ids(orderCapabilitiesByAuthor(card, caps))).toEqual(["divination", "inspiration", "cx_0"]);
  });
  it("position 0 : devant tous les mots-clés ; position 1 : entre le 1er et le 2e", () => {
    const card = mkCard({ keywords: ["divination", "inspiration"] as never, capabilities: null });
    const base = getCapabilities(card);
    expect(ids(orderCapabilitiesByAuthor(card, [...base, compose("cx_0", 0)]))).toEqual(["cx_0", "divination", "inspiration"]);
    expect(ids(orderCapabilitiesByAuthor(card, [...base, compose("cx_0", 1)]))).toEqual(["divination", "cx_0", "inspiration"]);
    expect(ids(orderCapabilitiesByAuthor(card, [...base, compose("cx_0", 7)]))).toEqual(["divination", "inspiration", "cx_0"]);
  });
  it("deux composés de même position gardent leur ordre relatif", () => {
    const card = mkCard({ keywords: ["divination"] as never, capabilities: null });
    const out = orderCapabilitiesByAuthor(card, [...getCapabilities(card), compose("cx_0", 0), compose("cx_1", 0)]);
    expect(ids(out)).toEqual(["cx_0", "cx_1", "divination"]);
  });
  it("sort : positionné devant la mécanique `p` (index de spell_keywords)", () => {
    const card = mkCard({
      card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "impact", amount: 1 }, { id: "guerison", amount: 1 }] as SpellKeywordInstance[],
      capabilities: null,
    });
    const base = getCapabilities(card);
    expect(ids(orderCapabilitiesByAuthor(card, [...base, compose("cx_0", 1, "spell_resolution")]))).toEqual(["impact", "cx_0", "guerison"]);
  });
  it("getCapabilities applique l'ordre d'auteur aux capacités PERSISTÉES", () => {
    const card = mkCard({ keywords: ["divination"] as never });
    const persisted = [...getCapabilities({ ...card, capabilities: null } as Card), compose("cx_0", 0)];
    const carte = mkCard({ keywords: ["divination"] as never, capabilities: persisted });
    expect(ids(getCapabilities(carte))).toEqual(["cx_0", "divination"]);
  });
  it("`order` CSS : composé positionné en p AVANT le mot-clé p, tout sous POWER_ORDER_LAST", () => {
    const card = { keywords: ["divination", "inspiration"] as unknown as Keyword[] };
    expect(composedDisplayOrder(compose("c", 1))).toBeLessThan(keywordDisplayOrder(card, "inspiration"));
    expect(composedDisplayOrder(compose("c", 1))).toBeGreaterThan(keywordDisplayOrder(card, "divination"));
    expect(composedDisplayOrder(compose("c", undefined))).toBeGreaterThan(keywordDisplayOrder(card, "inspiration"));
    expect(composedDisplayOrder(compose("c", undefined))).toBeLessThan(POWER_ORDER_LAST);
    expect(spellKeywordDisplayOrder(0)).toBeLessThan(spellKeywordDisplayOrder(1));
  });
});

describe("sanitizeComposed conserve la position", () => {
  it("entier ≥ 0 conservé, le reste écarté", () => {
    const base = { trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed: { content: "draw_cards", magnitude: { x: 1 } } };
    expect(sanitizeComposed([{ ...base, uid: "a", position: 2 }])[0].position).toBe(2);
    expect(sanitizeComposed([{ ...base, uid: "a", position: -1 }])[0].position).toBeUndefined();
    expect(sanitizeComposed([{ ...base, uid: "a", position: 1.5 }])[0].position).toBeUndefined();
    expect(sanitizeComposed([{ ...base, uid: "a" }])[0].position).toBeUndefined();
  });
});

// Deck [A, B, C, D]. Divination (index 2) garde C sur le dessus et renvoie A, B
// au fond ; l'effet composé pioche 1. Composé APRÈS : la pioche prend C.
// Composé AVANT : la pioche prend A, puis Divination voit [B, C, D].
describe("moteur — créature : composé avant ou après la cascade des mots-clés", () => {
  function jouer(position: number | undefined): GameState {
    const s = mkState();
    s.players[0].deck = ["A", "B", "C", "D"].map((n) => mkInstance(mkCard({ name: n })));
    const ci = mkInstance(mkCard({
      name: "Devin", attack: 1, health: 1,
      keywords: ["divination"] as never,
      capabilities: [...getCapabilities(mkCard({ keywords: ["divination"] as never, capabilities: null })), compose("cx_0", position)],
    }));
    s.players[0].hand.push(ci);
    initRNG(3);
    return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, deckChoiceIndices: { divination: 2 } });
  }
  const main = (st: GameState) => st.players[0].hand.map((c) => c.card.name);
  it("sans position : après la cascade (ancien comportement)", () => {
    expect(main(jouer(undefined))).toEqual(["C"]);
  });
  it("position 0 : avant la cascade", () => {
    const st = jouer(0);
    expect(main(st)).toEqual(["A"]);
    expect(st.players[0].deck.map((c) => c.card.name)).toEqual(["D", "B", "C"]);
  });
});

describe("moteur — sort : composé intercalé entre les mécaniques", () => {
  function lancer(position: number | undefined): GameState {
    const s = mkState();
    s.players[0].deck = ["A", "B", "C", "D"].map((n) => mkInstance(mkCard({ name: n })));
    const base = mkCard({
      name: "Lecture", card_type: "spell", attack: null, health: null, mana_cost: 1,
      spell_keywords: [{ id: "divination" }] as SpellKeywordInstance[], capabilities: null,
    });
    const ci = mkInstance({ ...base, capabilities: [...getCapabilities(base), compose("cx_0", position, "spell_resolution")] });
    s.players[0].hand.push(ci);
    initRNG(3);
    return applyAction(s, { type: "play_card", cardInstanceId: ci.instanceId, deckChoiceIndices: { divination: 2 } });
  }
  const main = (st: GameState) => st.players[0].hand.filter((c) => c.card.card_type !== "spell").map((c) => c.card.name);
  it("sans position : après les mécaniques", () => expect(main(lancer(undefined))).toEqual(["C"]));
  it("position 0 : avant Divination", () => expect(main(lancer(0))).toEqual(["A"]));
  it("position ≥ nombre de mécaniques : après", () => expect(main(lancer(5))).toEqual(["C"]));
});

describe("éditeurs — liste unifiée et déplacement", () => {
  const kws = ["armure", "divination", "inspiration"]; // armure = passif, hors panneau
  const visible = ["divination", "inspiration"];
  it("liste : composé sans position en queue, positionné à sa place", () => {
    expect(unifiedPowerList(kws, visible, [compose("c", undefined)]).map((p) => p.kind === "keyword" ? p.id : p.uid)).toEqual(["divination", "inspiration", "c"]);
    expect(unifiedPowerList(kws, visible, [compose("c", 1)]).map((p) => p.kind === "keyword" ? p.id : p.uid)).toEqual(["c", "divination", "inspiration"]);
    expect(unifiedPowerList(kws, visible, [compose("c", 2)]).map((p) => p.kind === "keyword" ? p.id : p.uid)).toEqual(["divination", "c", "inspiration"]);
  });
  it("monter un composé au-dessus d'un mot-clé → position = index du mot-clé (passifs comptés)", () => {
    const r = movePowerUnified(kws, visible, [compose("c", undefined)], { kind: "composed", uid: "c" }, -1);
    expect(r.composed[0].position).toBe(2); // devant inspiration (index 2 dans keywords)
    const r2 = movePowerUnified(kws, visible, r.composed.length ? [r.composed[0]] : [], { kind: "composed", uid: "c" }, -1);
    expect(r2.composed[0].position).toBe(1); // devant divination
    expect(r2.keywords).toEqual(kws); // les mots-clés ne bougent pas
  });
  it("descendre un mot-clé sous un composé = le composé remonte devant lui", () => {
    const r = movePowerUnified(kws, visible, [compose("c", 2)], { kind: "keyword", id: "divination" }, 1);
    expect(r.composed[0].position).toBe(1);
    expect(r.keywords).toEqual(kws);
  });
  it("mot-clé ↔ mot-clé : échange dans keywords, passif préservé", () => {
    const r = movePowerUnified(kws, visible, [], { kind: "keyword", id: "inspiration" }, -1);
    expect(r.keywords).toEqual(["armure", "inspiration", "divination"]);
  });
  it("composé ↔ composé : échange d'ordre et de position", () => {
    const r = movePowerUnified(kws, visible, [compose("a", 0), compose("b", 0)], { kind: "composed", uid: "b" }, -1);
    expect(r.composed.map((c) => c.uid)).toEqual(["b", "a"]);
  });
  it("en bout de liste : inchangé", () => {
    const r = movePowerUnified(kws, visible, [compose("c", undefined)], { kind: "composed", uid: "c" }, 1);
    expect(r.composed[0].position).toBeUndefined();
  });
});
