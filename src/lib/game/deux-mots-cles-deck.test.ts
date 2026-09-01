// DEUX mots-clés de deck sur la MÊME carte, à l'entrée en jeu.
//
// Signalé le 2026-09-01 sur « Veilleuse des Étoiles » (Divination + Présage) :
// une seule modale s'ouvrait — celle de Présage — et Divination n'était jamais
// proposée au joueur.
//
// Cause : `divinationChoiceIndex` est un champ d'action UNIQUE, partagé par
// Divination, Creuser et Présage. Le client, qui testait Présage avant
// Divination dans un ordre écrit en dur, n'ouvrait donc qu'une modale ; le
// moteur, lui, exécutait bien les DEUX effets, le second consommant en silence
// la réponse donnée pour le premier. La limitation était assumée en commentaire
// (« un sort ne porte jamais les deux »), jusqu'à ce qu'une carte les porte.
//
// `deckChoiceIndices` donne à chaque mot-clé son propre index ; le champ
// historique reste le repli des cartes qui n'en portent qu'un, et des actions
// déjà journalisées.
import { describe, expect, it } from "vitest";
import { applyAction, onPlayDeckPickers } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

const NOMS = ["A", "B", "C", "D", "E", "F"];

function etat() {
  const s = mkState();
  for (const n of NOMS) s.players[0].deck.push(mkInstance(mkCard({ name: n })));
  return s;
}

/** Veilleuse : Divination PUIS Présage, dans cet ordre d'auteur. */
const veilleuse = () => mkInstance(mkCard({
  name: "Veilleuse des Étoiles", mana_cost: 1, attack: 1, health: 1,
  keywords: ["divination", "presage"],
  capabilities: [
    { uid: "k1", trigger: "on_play", effectKind: "immediate", abilityId: "divination", params: {} },
    { uid: "k2", trigger: "on_play", effectKind: "immediate", abilityId: "presage", params: {} },
  ],
} as never));

const noms = (cards: { card: { name: string } }[]) => cards.map(c => c.card.name).join(",");

describe("L'interface sait quelles modales enchaîner", () => {
  it("onPlayDeckPickers rend les DEUX, dans l'ordre d'auteur", () => {
    expect(onPlayDeckPickers(veilleuse().card)).toEqual(["divination", "presage"]);
  });

  it("une carte sans mot-clé de deck n'en rend aucun", () => {
    expect(onPlayDeckPickers(mkCard({ name: "Ordinaire", attack: 1, health: 1 } as never))).toEqual([]);
  });

  it("un SORT lit ses mots-clés dans spell_keywords", () => {
    const sort = mkCard({
      name: "Sort double", card_type: "spell", mana_cost: 1, attack: null, health: null,
      spell_keywords: [{ id: "presage", amount: 1 }, { id: "creuser", amount: 2 }],
    } as never);
    expect(onPlayDeckPickers(sort)).toEqual(["presage", "creuser"]);
  });
});

describe("Chaque mot-clé consomme SON index", () => {
  it("deux réponses distinctes produisent un deck différent d'une réponse unique", () => {
    const s = etat();
    const v = veilleuse();
    s.players[0].hand.push(v);

    // Deux choix DIFFÉRENTS, un par mot-clé.
    const distincts = applyAction(etat0(s, v), {
      type: "play_card", cardInstanceId: v.instanceId,
      deckChoiceIndices: { divination: 0, presage: 2 },
    } as never);

    // Le même flux, mais avec le champ unique d'autrefois : les deux mots-clés
    // lisent le même nombre. C'est exactement ce que produisait le bug.
    const partage = applyAction(etat0(s, v), {
      type: "play_card", cardInstanceId: v.instanceId,
      divinationChoiceIndex: 2,
    } as never);

    expect(noms(distincts.players[0].deck)).not.toBe(noms(partage.players[0].deck));
  });

  it("le champ historique reste le REPLI d'un mot-clé sans index propre", () => {
    const s = etat();
    const v = veilleuse();
    s.players[0].hand.push(v);

    // Présage a le sien, Divination retombe sur `divinationChoiceIndex`.
    const repli = applyAction(etat0(s, v), {
      type: "play_card", cardInstanceId: v.instanceId,
      divinationChoiceIndex: 1, deckChoiceIndices: { presage: 2 },
    } as never);
    const explicite = applyAction(etat0(s, v), {
      type: "play_card", cardInstanceId: v.instanceId,
      deckChoiceIndices: { divination: 1, presage: 2 },
    } as never);

    expect(noms(repli.players[0].deck)).toBe(noms(explicite.players[0].deck));
  });

  it("une carte à UN SEUL mot-clé de deck est inchangée par la nouvelle table", () => {
    const s = etat();
    const seule = mkInstance(mkCard({
      name: "Divineresse", mana_cost: 1, attack: 1, health: 1,
      keywords: ["divination"],
      capabilities: [{ uid: "k1", trigger: "on_play", effectKind: "immediate", abilityId: "divination", params: {} }],
    } as never));
    s.players[0].hand.push(seule);

    const ancien = applyAction(etat0(s, seule), {
      type: "play_card", cardInstanceId: seule.instanceId, divinationChoiceIndex: 2,
    } as never);
    const nouveau = applyAction(etat0(s, seule), {
      type: "play_card", cardInstanceId: seule.instanceId, deckChoiceIndices: { divination: 2 },
    } as never);

    expect(noms(ancien.players[0].deck)).toBe(noms(nouveau.players[0].deck));
    // Et la carte désignée est bien remontée sur le dessus.
    expect(ancien.players[0].deck[0].card.name).toBe("C");
  });
});

/** État frais à chaque appel : `applyAction` clone, mais on repart d'un deck
 *  identique pour que deux résolutions soient comparables. */
function etat0(_modele: ReturnType<typeof mkState>, carte: ReturnType<typeof veilleuse>) {
  const s = mkState();
  for (const n of NOMS) s.players[0].deck.push(mkInstance(mkCard({ name: n })));
  s.players[0].hand.push(carte);
  return s;
}
