// SYNERGIE X — à son arrivée en jeu, le joueur choisit une capacité. Chaque
// déclenchement de cette capacité — chez l'un ou l'autre joueur, quels que
// soient le mode et la source — donne +X/+X permanent à la créature, une fois
// par source et par tour.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { CAPACITES_SYNERGISABLES, REACTIVES_SYNERGISABLES } from "./abilities";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameAction, GameState, Keyword, KeywordInstance, SpellKeywordInstance } from "./types";

const synergique = (x = 2, extra: { kws?: string[]; insts?: KeywordInstance[]; caps?: Capability[] } = {}) => mkInstance(mkCard({
  name: "Tisseuse", mana_cost: 0, attack: 1, health: 3,
  keywords: ["synergie", ...(extra.kws ?? [])] as unknown as Keyword[],
  keyword_instances: [{ id: "synergie" as Keyword, x }, ...(extra.insts ?? [])] as KeywordInstance[],
  capabilities: extra.caps ?? null,
}));
const unite = (name: string, kws: string[] = [], insts: KeywordInstance[] = []) => {
  const u = mkInstance(mkCard({ name, mana_cost: 0, attack: 2, health: 6, keywords: kws as unknown as Keyword[], keyword_instances: insts.length ? insts : null }));
  u.hasSummoningSickness = false;
  return u;
};
const impactAction = (nom = "Trait") => mkInstance(mkCard({
  name: nom, card_type: "spell", mana_cost: 0, attack: null, health: null,
  keywords: ["impact"] as never, keyword_instances: [{ id: "impact", x: 1 } as never],
  spell_keywords: [{ id: "impact", amount: 1 }] as SpellKeywordInstance[],
}));

function etat(): GameState {
  const s = mkState();
  for (const p of s.players) { p.mana = 10; for (let i = 0; i < 12; i++) p.deck.push(mkInstance(mkCard({ name: `Pioche ${i}`, mana_cost: 9 }))); }
  return s;
}
function jouer(s: GameState, carte: CardInstance, extra: Partial<GameAction> = {}, joueur: 0 | 1 = 0): GameState {
  s.players[joueur].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, ...extra } as GameAction);
}
/** Pose la Tisseuse chez P0 et choisit `abilityId`. */
function poserEtChoisir(s: GameState, t: CardInstance, abilityId: string): GameState {
  let st = jouer(s, t);
  const choix = st.pendingTriggers?.find((p) => p.kw === "synergie");
  expect(choix?.controllerId).toBe(st.players[0].id);
  st = applyAction(st, { type: "resolve_pending_trigger", triggerId: choix!.id, abilityId } as GameAction);
  expect(tisseuse(st).synergieAbilityId).toBe(abilityId);
  return st;
}
const tisseuse = (st: GameState) => st.players[0].board.find((c) => c.card.name === "Tisseuse")!;
const stats = (st: GameState) => [tisseuse(st).currentAttack, tisseuse(st).currentHealth];
const finDeTour = (st: GameState) => applyAction(st, { type: "end_turn" } as GameAction);

describe("Synergie — le choix", () => {
  it("carte jouée : un choix en attente pour son propriétaire, puis la capacité est gravée", () => {
    const st = poserEtChoisir(etat(), synergique(), "impact");
    expect(st.pendingTriggers ?? []).toHaveLength(0);
  });

  it("créature arrivée sans être jouée (posée par un effet) : le choix s'ouvre quand même", () => {
    const s = etat();
    s.players[0].board.push(synergique());
    const st = jouer(s, impactAction(), { targetMap: { kw_0: "enemy_hero" } });
    expect(st.pendingTriggers?.some((p) => p.kw === "synergie")).toBe(true);
  });

  it("capacité hors liste ou réponse absente : tirage semé, reproductible", () => {
    const un = () => {
      const s = etat();
      s.players[1].board.push(unite("Archer", ["impact"], [{ id: "impact" as Keyword, x: 1, mode: "end_of_turn" }]));
      let st = jouer(s, synergique());
      const id = st.pendingTriggers!.find((p) => p.kw === "synergie")!.id;
      st = applyAction(st, { type: "resolve_pending_trigger", triggerId: id, abilityId: "armure" } as GameAction);
      return tisseuse(st).synergieAbilityId;
    };
    expect(un()).toBe("impact"); // seule capacité synergisable en jeu
    expect(un()).toBe(un());
    expect(CAPACITES_SYNERGISABLES.has("armure")).toBe(false);
    expect(CAPACITES_SYNERGISABLES.has("synergie")).toBe(false);
  });

  it("un seul choix par créature ; aucun gain tant qu'elle n'a rien choisi", () => {
    const s = etat();
    let st = jouer(s, synergique());
    st = jouer(st, impactAction(), { targetMap: { kw_0: "enemy_hero" } });
    expect(stats(st)).toEqual([1, 3]);
    expect(st.pendingTriggers?.filter((p) => p.kw === "synergie")).toHaveLength(1);
  });
});

describe("Synergie — les déclenchements", () => {
  it("action du joueur, puis action de l'ADVERSAIRE : +X/+X à chaque fois", () => {
    let st = poserEtChoisir(etat(), synergique(2), "impact");
    st = jouer(st, impactAction(), { targetMap: { kw_0: "enemy_hero" } });
    expect(stats(st)).toEqual([3, 5]);
    st = finDeTour(st);
    st = jouer(st, impactAction("Riposte magique"), { targetMap: { kw_0: "enemy_hero" } }, 1);
    expect(stats(st)).toEqual([5, 7]);
  });

  it("créature : mot-clé déclenché en fin de tour ; une fois par source et par tour, de nouveau au tour suivant", () => {
    const s = etat();
    // Inspiration : sans cible, donc sans choix en attente qui suspendrait le tour.
    s.players[0].board.push(unite("Érudit", ["inspiration"], [{ id: "inspiration" as Keyword, x: 1, mode: "end_of_turn" }]));
    let st = poserEtChoisir(s, synergique(1), "inspiration");
    st = finDeTour(st);                       // fin du tour de P0 : l'Érudit pioche
    expect(stats(st)).toEqual([2, 4]);
    st = finDeTour(finDeTour(st));            // tour suivant de P0
    expect(stats(st)).toEqual([3, 5]);
  });

  it("deux sources le même tour comptent deux fois ; la même source, une seule", () => {
    let st = poserEtChoisir(etat(), synergique(1), "impact");
    st = jouer(st, impactAction("Un"), { targetMap: { kw_0: "enemy_hero" } });
    st = jouer(st, impactAction("Deux"), { targetMap: { kw_0: "enemy_hero" } });
    expect(stats(st)).toEqual([3, 5]);
    expect(tisseuse(st).synergieSourcesThisTurn).toHaveLength(2);
  });

  it("effet COMPOSÉ équivalent : « inflige X dégâts à une cible » compte pour Impact", () => {
    const degats: ComposedEffect = { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" } };
    const sort = mkInstance(mkCard({
      name: "Éclat", card_type: "spell", mana_cost: 0, attack: null, health: null,
      capabilities: [{ uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", targets: [], composed: degats }] as Capability[],
    }));
    let st = poserEtChoisir(etat(), synergique(2), "impact");
    st = jouer(st, sort);
    expect(stats(st)).toEqual([3, 5]);
  });

  it("capacité RÉACTIVE : Riposte, déclenchée quand la créature est blessée", () => {
    const s = etat();
    const garde = unite("Garde", ["riposte"]);
    garde.riposteX = 1;
    s.players[1].board.push(garde);
    const lame = unite("Lame");
    s.players[0].board.push(lame);
    let st = poserEtChoisir(s, synergique(2), "riposte");
    st = applyAction(st, { type: "attack", attackerInstanceId: lame.instanceId, targetInstanceId: garde.instanceId } as GameAction);
    expect(stats(st)).toEqual([3, 5]);
  });

  it("ses PROPRES déclenchements comptent", () => {
    const st0 = poserEtChoisir(etat(), synergique(1, { kws: ["impact"], insts: [{ id: "impact" as Keyword, x: 1, mode: "end_of_turn" }] }), "impact");
    expect(stats(finDeTour(st0))).toEqual([2, 4]);
  });

  it("une autre capacité que celle choisie ne donne rien ; deux Synergie se cumulent", () => {
    let st = poserEtChoisir(etat(), synergique(2), "guerison");
    st = jouer(st, impactAction(), { targetMap: { kw_0: "enemy_hero" } });
    expect(stats(st)).toEqual([1, 3]);

    const s = etat();
    const autre = synergique(3);
    autre.synergieAbilityId = "impact";
    autre.card = { ...autre.card, name: "Seconde" };
    s.players[0].board.push(autre);
    recalculateAuras(s.players[0], s.players[1]);
    st = poserEtChoisir(s, synergique(2), "impact");
    st = jouer(st, impactAction(), { targetMap: { kw_0: "enemy_hero" } });
    expect(stats(st)).toEqual([3, 5]);
    const seconde = st.players[0].board.find((c) => c.card.name === "Seconde")!;
    expect([seconde.currentAttack, seconde.currentHealth]).toEqual([4, 6]);
  });
});

describe("Synergie — remises à zéro et synchronisation", () => {
  it("Silence : le choix et la capacité disparaissent, plus aucun gain", () => {
    let st = poserEtChoisir(etat(), synergique(2), "impact");
    const silence = mkInstance(mkCard({ name: "Silence", card_type: "spell", mana_cost: 0, attack: null, health: null, spell_keywords: [{ id: "silence" }] as SpellKeywordInstance[] }));
    st = jouer(st, silence, { targetMap: { kw_0: tisseuse(st).instanceId } });
    expect(tisseuse(st).synergieAbilityId).toBeUndefined();
    st = jouer(st, impactAction(), { targetMap: { kw_0: "enemy_hero" } });
    expect(stats(st)).toEqual([1, 3]);
    expect(st.pendingTriggers?.some((p) => p.kw === "synergie") ?? false).toBe(false);
  });

  it("le choix fait partie de l'état haché", () => {
    const a = poserEtChoisir(etat(), synergique(2), "impact");
    const b = poserEtChoisir(etat(), synergique(2), "guerison");
    expect(syncHash(a)).not.toBe(syncHash(b));
  });
});

describe("Synergie — couverture du signal", () => {
  it("chaque capacité réactive synergisable a son appel dans le moteur", () => {
    const moteur = readFileSync("src/lib/game/engine.ts", "utf8");
    const sansAppel = REACTIVES_SYNERGISABLES.filter((id) => !moteur.includes(`noterDeclenchement("${id}"`));
    expect(sansAppel).toEqual([]);
  });

  it("les capacités passives ne sont pas proposées, les déclenchables le sont", () => {
    for (const id of ["armure", "taunt", "ranged", "etheree", "synergie", "conferer"]) expect(CAPACITES_SYNERGISABLES.has(id), id).toBe(false);
    for (const id of ["impact", "guerison", "riposte", "inspiration", "malediction", "gloire"]) expect(CAPACITES_SYNERGISABLES.has(id), id).toBe(true);
  });
});
