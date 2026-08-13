// Incinération : désigner le camp en cliquant une carte DANS le cimetière.
//
// Constaté en partie avec « Lame consacrée » (Impact 2 · Précision ·
// Incinération 1) : au second créneau de cible, le joueur ouvre son cimetière et
// clique la carte — il ne se passe rien, la flèche de ciblage reste accrochée.
//
// La cible d'Incinération désigne un CAMP, pas une carte (« remet X cartes AU
// HASARD du cimetière ciblé ») : le moteur n'attendait qu'un héros ou une unité.
// Mais cliquer un héros pour recycler une pile de cartes ne va pas de soi, et le
// visualiseur de cimetière — une modale de CONSULTATION — recouvre justement les
// cibles qu'il faudrait cliquer.
//
// Deux pièces : `incinerationVictim` lit désormais aussi les cimetières (via
// `graveyardOwnerOf`, qui existait déjà pour le seul chemin composé), et
// `getSpellSlotTargets` ajoute les cartes des deux cimetières aux cibles valides
// du créneau. Les héros et les unités restent proposés.
import { describe, expect, it } from "vitest";
import { applyAction, creatureNeedsTarget, creatureTargetsIncinerationCamp, getCreatureTargets, getSpellSlotTargets, getSpellTargetSlots, isIncinerationSlot } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

/** « Lame consacrée » telle qu'elle est en base : trois capacités héritées, dont
 *  deux réclament une cible → créneaux kw_0 (Impact) et kw_2 (Incinération). */
const lameConsacree = () => mkInstance(mkCard({
  name: "Lame consacrée", mana_cost: 2, card_type: "spell", attack: null, health: null,
  spell_keywords: [
    { id: "impact", amount: 2 },
    { id: "precision" },
    { id: "incineration", amount: 1 },
  ] as never,
  capabilities: [
    { uid: "sk_0", params: { x: 2 }, targets: [{ type: "any", label: "Impact X" }], trigger: "spell_resolution", abilityId: "impact", effectKind: "immediate" },
    { uid: "sk_1", targets: [], trigger: "spell_resolution", abilityId: "precision", effectKind: "immediate" },
    { uid: "sk_2", params: { x: 1 }, targets: [{ type: "any", label: "Incinération X" }], trigger: "spell_resolution", abilityId: "incineration", effectKind: "immediate" },
  ] as unknown as Capability[],
}));

function table() {
  const s: GameState = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  s.players[0].graveyard.push(mkInstance(mkCard({ name: "MonMort" })));
  s.players[1].graveyard.push(mkInstance(mkCard({ name: "SonMort" })));
  s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));
  return s;
}

describe("Repérage du créneau d'Incinération", () => {
  it("kw_2 est bien le créneau d'Incinération, kw_0 celui d'Impact", () => {
    const card = lameConsacree().card;
    const slots = getSpellTargetSlots(card);
    const ids = slots.map((sl) => sl.slot);
    expect(ids).toEqual(["kw_0", "kw_2"]); // Précision ne réclame pas de cible
    expect(isIncinerationSlot(card, slots[0])).toBe(false);
    expect(isIncinerationSlot(card, slots[1])).toBe(true);
  });

  it("le repérage lit l'id du mot-clé, pas le libellé (qui est localisé)", () => {
    const card = lameConsacree().card;
    const slots = getSpellTargetSlots(card);
    const menteur = { ...slots[0], label: "Incinération X" };
    expect(isIncinerationSlot(card, menteur)).toBe(false);
  });
});

describe("Cibles du créneau", () => {
  it("le créneau d'Incinération propose les DEUX cimetières, en plus des héros et unités", () => {
    const s = table();
    const card = lameConsacree().card;
    const slots = getSpellTargetSlots(card);
    const cibles = getSpellSlotTargets(s, card, slots[1]);

    expect(cibles).toContain(s.players[0].graveyard[0].instanceId);
    expect(cibles).toContain(s.players[1].graveyard[0].instanceId);
    // Les gestes d'avant restent valides.
    expect(cibles).toContain("friendly_hero");
    expect(cibles).toContain("enemy_hero");
    expect(cibles).toContain(s.players[1].board[0].instanceId);
  });

  it("le créneau d'Impact, lui, n'ouvre PAS les cimetières", () => {
    const s = table();
    const card = lameConsacree().card;
    const slots = getSpellTargetSlots(card);
    const cibles = getSpellSlotTargets(s, card, slots[0]);

    expect(cibles).not.toContain(s.players[0].graveyard[0].instanceId);
    expect(cibles).not.toContain(s.players[1].graveyard[0].instanceId);
  });
});

describe("Résolution : le camp vient du cimetière cliqué", () => {
  const jouer = (s: GameState, cibleIncineration: string) => {
    const sort = lameConsacree();
    s.players[0].hand.push(sort);
    s.players[0].mana = 10;
    return applyAction(s, {
      type: "play_card",
      cardInstanceId: sort.instanceId,
      targetMap: { kw_0: "enemy_hero", kw_2: cibleIncineration },
    });
  };

  it("cliquer une carte de MON cimetière recycle MON cimetière", () => {
    const s = table();
    const st = jouer(s, s.players[0].graveyard[0].instanceId);

    // MonMort quitte mon cimetière pour le dessous de mon deck…
    expect(st.players[0].deck.map((c) => c.card.name)).toContain("MonMort");
    // …et le cimetière adverse est intact (c'était le repli fautif : « adversaire »).
    expect(st.players[1].deck.map((c) => c.card.name)).not.toContain("SonMort");
    expect(st.players[1].graveyard.map((c) => c.card.name)).toContain("SonMort");
  });

  it("cliquer une carte du cimetière ADVERSE recycle le sien", () => {
    const s = table();
    const st = jouer(s, s.players[1].graveyard[0].instanceId);

    expect(st.players[1].deck.map((c) => c.card.name)).toContain("SonMort");
    // Mon propre mort ne bouge pas — sauf la carte que le sort vient d'y mettre.
    expect(st.players[0].deck.map((c) => c.card.name)).not.toContain("MonMort");
  });

  it("le geste par HÉROS continue de fonctionner", () => {
    const s = table();
    const st = jouer(s, "friendly_hero");
    expect(st.players[0].deck.map((c) => c.card.name)).toContain("MonMort");
    expect(st.players[1].graveyard.map((c) => c.card.name)).toContain("SonMort");
  });

  it("le geste par UNITÉ vise le cimetière de son contrôleur", () => {
    const s = table();
    const st = jouer(s, s.players[1].board[0].instanceId);
    expect(st.players[1].deck.map((c) => c.card.name)).toContain("SonMort");
    expect(st.players[0].graveyard.map((c) => c.card.name)).toContain("MonMort");
  });
});

// ─── Forme CRÉATURE ────────────────────────────────────────────────────────
// « Porte-flamme du Matin » (1 mana, Incinération 3 à l'entrée en jeu). Même
// impasse que sur le sort, signalée séparément : la flèche de ciblage
// s'affichait, mais les cartes du cimetière restaient inertes. Elle avait été
// laissée de côté au premier correctif — la voici alignée.
describe("Incinération, forme créature — le cimetière est cliquable aussi", () => {
  const porteFlamme = () => mkInstance(mkCard({
    name: "Porte-flamme du Matin", mana_cost: 1, attack: 2, health: 1,
    keywords: ["incineration"] as never,
    capabilities: [
      { uid: "cw_0", params: { x: 3 }, targets: [], trigger: "on_play", abilityId: "incineration", effectKind: "immediate" },
    ] as unknown as Capability[],
  }));

  it("la créature réclame une cible, et le prédicat de l'UI la reconnaît", () => {
    expect(creatureNeedsTarget(porteFlamme().card)).toBe(true);
    expect(creatureTargetsIncinerationCamp(porteFlamme().card)).toBe(true);
  });

  it("les deux cimetières figurent dans les cibles, en plus des héros", () => {
    const s = table();
    const ids = getCreatureTargets(s, porteFlamme().card);
    expect(ids).toContain("friendly_hero");
    expect(ids).toContain("enemy_hero");
    expect(ids).toContain(s.players[0].graveyard[0].instanceId);
    expect(ids).toContain(s.players[1].graveyard[0].instanceId);
  });

  it("cliquer une carte de MON cimetière recycle MON cimetière", () => {
    const s = table();
    const c = porteFlamme();
    s.players[0].hand.push(c);
    const cible = s.players[0].graveyard[0].instanceId;

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: c.instanceId, targetInstanceId: cible,
    });

    // Incinération 3 sur un cimetière qui n'a qu'une carte : il est vidé…
    expect(st.players[0].graveyard).toHaveLength(0);
    expect(st.players[0].deck.map((x) => x.card.name)).toContain("MonMort");
    // …et celui d'en face n'a pas bougé.
    expect(st.players[1].graveyard).toHaveLength(1);
  });

  it("cliquer une carte du cimetière ADVERSE recycle le sien", () => {
    const s = table();
    const c = porteFlamme();
    s.players[0].hand.push(c);

    const st = applyAction(s, {
      type: "play_card", cardInstanceId: c.instanceId,
      targetInstanceId: s.players[1].graveyard[0].instanceId,
    });

    expect(st.players[1].graveyard).toHaveLength(0);
    expect(st.players[1].deck.map((x) => x.card.name)).toContain("SonMort");
    expect(st.players[0].graveyard).toHaveLength(1);
  });

  it("un prédicat d'UI faux sur une créature sans Incinération", () => {
    const banal = mkInstance(mkCard({ name: "Banal", attack: 1, health: 1 }));
    expect(creatureTargetsIncinerationCamp(banal.card)).toBe(false);
  });
});
