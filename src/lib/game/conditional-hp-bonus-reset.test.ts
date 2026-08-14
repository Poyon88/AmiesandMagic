// Les bonus de PV CONDITIONNELS doivent repartir de zéro quand l'unité quitte le
// plateau.
//
// Signalé en partie sur « Inquisiteur de l'Aube » (3/4, Pureté +2/+2) : posé il
// affichait 5/6 ; remonté en main puis reposé avec un cimetière vide, il
// n'affichait plus que 5/4 — l'ATK boostée, les PV non.
//
// Force des ancêtres, Pureté et Seuil Sacrificiel tiennent une comptabilité par
// DIFFÉRENTIEL dans recalculateAuras : le champ `*HealthBonus` mémorise ce qui est
// déjà intégré aux PV max, et seul l'ÉCART est appliqué. `returnInstanceToPlay`
// remettait bien les PV max à la base — `persistentStats` exclut ces bonus — mais
// laissait les champs garnis. Le champ mentait alors, avec deux symptômes selon
// l'état de la condition au retour :
//   * condition toujours remplie ⇒ écart nul ⇒ bonus JAMAIS réintégré (5/4) ;
//   * condition devenue fausse ⇒ écart négatif ⇒ PV PERDUS qu'elle n'avait pas.
//
// Le second est le plus grave, et n'avait pas été remarqué.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameState, KeywordInstance } from "./types";

/** Unité 3/4 portant une capacité conditionnelle +2/+2. */
function unite(kw: "purete" | "force_des_ancetres" | "seuil_sacrificiel"): CardInstance {
  return mkInstance(mkCard({
    name: "Inquisiteur", mana_cost: 4, attack: 3, health: 4,
    keywords: [kw] as never,
    keyword_instances: [{ x: 2, y: 2, id: kw }] as unknown as KeywordInstance[],
    capabilities: [
      { uid: "cw_0", params: { x: 2, y: 2 }, targets: [], trigger: "automatic", abilityId: kw, effectKind: "immediate" },
    ] as unknown as Capability[],
  }));
}

/** Sort renvoyant une unité ciblée en main. */
const sortRetour = () => mkInstance(mkCard({
  name: "Retour", card_type: "spell", attack: null, health: null, mana_cost: 1,
  spell_keywords: [{ id: "remontee" }] as never,
}));

const surPlateau = (st: GameState) => st.players[0].board.find((c) => c.card.name === "Inquisiteur")!;

/** Pose l'unité, la renvoie en main, la repose. `cimetiereVide` décide de l'état
 *  de la condition de Pureté au moment du retour. */
function poserRetourReposer(kw: Parameters<typeof unite>[0], cimetiereVide: boolean): GameState {
  const s = mkState();
  s.players[0].mana = 20;
  // Deck garni : Seuil Sacrificiel ne doit pas s'activer par accident.
  for (let i = 0; i < 30; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `D${i}` })));
  const u = unite(kw);
  s.players[0].hand.push(u);

  let st = applyAction(s, { type: "play_card", cardInstanceId: u.instanceId });
  const retour = sortRetour();
  st.players[0].hand.push(retour);
  st.players[0].mana = 20;
  st = applyAction(st, {
    type: "play_card", cardInstanceId: retour.instanceId,
    targetMap: { kw_0: surPlateau(st).instanceId },
  });

  const enMain = st.players[0].hand.find((c) => c.card.name === "Inquisiteur")!;
  st.players[0].mana = 20;
  st = applyAction(st, { type: "play_card", cardInstanceId: enMain.instanceId });
  if (cimetiereVide) {
    // Le sort de retour a garni le cimetière : on le vide pour retrouver la
    // situation rapportée, puis on force un recalcul.
    st.players[0].graveyard = [];
    st = applyAction(st, { type: "end_turn" });
  }
  return st;
}

describe("Pureté — le bonus revient intégralement après un aller-retour", () => {
  it("cimetière VIDE au retour : 5/6, PV compris (le cas rapporté)", () => {
    const st = poserRetourReposer("purete", true);
    const u = surPlateau(st);
    expect([u.currentAttack, u.currentHealth, u.maxHealth]).toEqual([5, 6, 6]);
  });

  it("cimetière NON vide au retour : 3/4, sans PV fantômes en moins", () => {
    // Le défaut faisait descendre à 3/2 — deux PV retirés pour un bonus que
    // l'unité n'avait plus.
    const st = poserRetourReposer("purete", false);
    const u = surPlateau(st);
    expect([u.currentAttack, u.currentHealth, u.maxHealth]).toEqual([3, 4, 4]);
  });

  it("le champ de comptabilité est remis à zéro en main", () => {
    const s = mkState();
    s.players[0].mana = 20;
    const u = unite("purete");
    s.players[0].hand.push(u);
    let st = applyAction(s, { type: "play_card", cardInstanceId: u.instanceId });
    expect(surPlateau(st).pureteHealthBonus).toBe(2);

    const retour = sortRetour();
    st.players[0].hand.push(retour);
    st.players[0].mana = 20;
    st = applyAction(st, {
      type: "play_card", cardInstanceId: retour.instanceId,
      targetMap: { kw_0: surPlateau(st).instanceId },
    });

    const enMain = st.players[0].hand.find((c) => c.card.name === "Inquisiteur")!;
    // Le champ doit suivre les PV max : ceux-ci sont revenus à la base, lui aussi.
    expect(enMain.maxHealth).toBe(4);
    expect(enMain.pureteHealthBonus ?? 0).toBe(0);
  });
});

describe("Les capacités SŒURS partagent le mécanisme — et le correctif", () => {
  it("Force des ancêtres : champ remis à zéro au retour en main", () => {
    const s = mkState();
    s.players[0].mana = 20;
    const u = unite("force_des_ancetres");
    s.players[0].hand.push(u);
    let st = applyAction(s, { type: "play_card", cardInstanceId: u.instanceId });

    const retour = sortRetour();
    st.players[0].hand.push(retour);
    st.players[0].mana = 20;
    st = applyAction(st, {
      type: "play_card", cardInstanceId: retour.instanceId,
      targetMap: { kw_0: surPlateau(st).instanceId },
    });

    const enMain = st.players[0].hand.find((c) => c.card.name === "Inquisiteur")!;
    expect(enMain.forceAncetresHealthBonus ?? 0).toBe(0);
    expect(enMain.maxHealth).toBe(4);
  });

  it("Seuil Sacrificiel : idem", () => {
    const s = mkState();
    s.players[0].mana = 20;
    const u = unite("seuil_sacrificiel");
    s.players[0].hand.push(u);
    let st = applyAction(s, { type: "play_card", cardInstanceId: u.instanceId });

    const retour = sortRetour();
    st.players[0].hand.push(retour);
    st.players[0].mana = 20;
    st = applyAction(st, {
      type: "play_card", cardInstanceId: retour.instanceId,
      targetMap: { kw_0: surPlateau(st).instanceId },
    });

    const enMain = st.players[0].hand.find((c) => c.card.name === "Inquisiteur")!;
    expect(enMain.seuilSacrificielHealthBonus ?? 0).toBe(0);
    expect(enMain.maxHealth).toBe(4);
  });
});
