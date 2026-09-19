// « OU » — le contrôleur choisit LAQUELLE des branches d'une carte se résout.
//
// Modèle : les capacités composées marquées `alternative` forment l'unique
// groupe de choix de la carte. Toutes leurs frames sont poussées sur la pile ;
// au moment de résoudre la première, la pile SUSPEND et pose la question. La
// réponse ne résout rien elle-même : elle retire les branches perdantes, et la
// gagnante se résout à sa place dans l'ordre d'auteur.
//
// Ce qui est verrouillé ici : rien ne se résout avant la réponse, une seule
// branche se résout après, le repli au hasard quand personne ne peut répondre,
// et la dégradation propre quand une seule branche est marquée.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, ComposedEffect, GameState } from "./types";

/** Deux branches observables sans ambiguïté : +3 mana OU piocher 2. */
const MANA: ComposedEffect = { content: "gain_mana", magnitude: { x: 3 } };
const PIOCHE: ComposedEffect = { content: "draw_cards", magnitude: { x: 2 } };

function cap(uid: string, composed: ComposedEffect, alternative = true): Capability {
  return {
    uid, trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
    composed, ...(alternative ? { alternative: true } : {}),
  };
}

function sort(caps: Capability[], nom = "Carrefour"): CardInstance {
  return mkInstance(mkCard({ name: nom, card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}

function lancer(s: GameState, inst: CardInstance): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId });
}

/** Deck fourni : la pioche doit pouvoir se distinguer de la fatigue. */
function etat(): GameState {
  const s = mkState();
  s.players[0].mana = 0;
  for (let i = 0; i < 10; i++) s.players[0].deck.push(mkInstance(mkCard({ name: `D${i}` })));
  for (let i = 0; i < 10; i++) s.players[1].deck.push(mkInstance(mkCard({ name: `E${i}` })));
  return s;
}

const mana = (s: GameState) => s.players[0].mana;
const mainSansLeSort = (s: GameState) => s.players[0].hand.length;

describe("OU — la question", () => {
  it("rien ne se résout tant que le joueur n'a pas répondu", () => {
    const s = etat();
    const apres = lancer(s, sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)]));
    expect(mana(apres)).toBe(0);
    expect(mainSansLeSort(apres)).toBe(0);
    // La pile reste suspendue dans l'état, la question est en file.
    expect(apres.effectStack?.length).toBe(2);
    expect(apres.pendingTriggers).toHaveLength(1);
  });

  it("le déclencheur porte les DEUX branches, effet compris", () => {
    const s = etat();
    const apres = lancer(s, sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)]));
    const options = apres.pendingTriggers![0].alternativeOptions!;
    expect(options.map((o) => o.capUid)).toEqual(["cx_0", "cx_1"]);
    expect(options.map((o) => o.composed.content)).toEqual(["gain_mana", "draw_cards"]);
  });
});

describe("OU — la réponse", () => {
  const repondre = (s: GameState, capUid: string) =>
    applyAction(s, { type: "resolve_pending_trigger", triggerId: s.pendingTriggers![0].id, alternativeCapUid: capUid });

  it("la branche choisie se résout, l'autre est abandonnée", () => {
    const apres = repondre(lancer(etat(), sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)])), "cx_0");
    expect(mana(apres)).toBe(3);
    expect(mainSansLeSort(apres)).toBe(0);
    expect(apres.effectStack ?? []).toEqual([]);
    expect(apres.pendingTriggers ?? []).toEqual([]);
  });

  it("l'autre branche, et c'est bien l'autre qui se résout", () => {
    const apres = repondre(lancer(etat(), sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)])), "cx_1");
    expect(mana(apres)).toBe(0);
    expect(mainSansLeSort(apres)).toBe(2);
  });

  it("trois branches : une seule passe", () => {
    const trois = sort([
      cap("cx_0", MANA),
      cap("cx_1", PIOCHE),
      cap("cx_2", { content: "gain_mana", magnitude: { x: 7 } }),
    ]);
    const suspendu = lancer(etat(), trois);
    expect(suspendu.pendingTriggers![0].alternativeOptions).toHaveLength(3);
    const apres = repondre(suspendu, "cx_2");
    expect(mana(apres)).toBe(7);
    expect(mainSansLeSort(apres)).toBe(0);
  });
});

describe("OU — les effets NON marqués ne sont pas concernés", () => {
  it("un effet ordinaire de la même carte se résout sans rien demander", () => {
    const s = etat();
    const carte = sort([
      cap("cx_0", { content: "gain_mana", magnitude: { x: 1 } }, false), // ordinaire
      cap("cx_1", MANA),
      cap("cx_2", PIOCHE),
    ]);
    const apres = lancer(s, carte);
    // L'ordinaire est passé (il précède le groupe dans l'ordre d'auteur), le
    // groupe attend.
    expect(mana(apres)).toBe(1);
    expect(apres.pendingTriggers).toHaveLength(1);
  });

  it("une SEULE branche marquée : aucune question, l'effet se résout", () => {
    const apres = lancer(etat(), sort([cap("cx_0", MANA), cap("cx_1", PIOCHE, false)]));
    expect(mana(apres)).toBe(3);
    expect(mainSansLeSort(apres)).toBe(2);
    expect(apres.pendingTriggers ?? []).toEqual([]);
  });
});

describe("OU — quand personne ne peut répondre", () => {
  it("expiration du chrono : une branche au hasard, jamais les deux", () => {
    const suspendu = lancer(etat(), sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)]));
    initRNG(7);
    const apres = applyAction(suspendu, { type: "auto_resolve_pending_triggers" });
    const uneSeule = (mana(apres) === 3 && mainSansLeSort(apres) === 0)
      || (mana(apres) === 0 && mainSansLeSort(apres) >= 2);
    expect(uneSeule).toBe(true);
    expect(apres.effectStack ?? []).toEqual([]);
  });

  it("le déclencheur « OU » n'est jamais purgé comme insoluble", () => {
    const suspendu = lancer(etat(), sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)]));
    // Une action quelconque du joueur re-balaie la file : la question doit
    // survivre, sans quoi la pile resterait suspendue pour toujours.
    const apres = applyAction(suspendu, { type: "resolve_pending_trigger", triggerId: "inconnu" });
    expect(apres.pendingTriggers).toHaveLength(1);
  });

  it("réponse sans branche désignée : on tranche au hasard plutôt que de bloquer", () => {
    const suspendu = lancer(etat(), sort([cap("cx_0", MANA), cap("cx_1", PIOCHE)]));
    initRNG(3);
    const apres = applyAction(suspendu, { type: "resolve_pending_trigger", triggerId: suspendu.pendingTriggers![0].id });
    expect(apres.effectStack ?? []).toEqual([]);
    expect(mana(apres) === 3 || mainSansLeSort(apres) === 2).toBe(true);
  });
});

describe("OU — ce que la carte montre", () => {
  it("chaque branche annonce « Au choix » dans sa description", async () => {
    const { describeComposedCap } = await import("./composed-display");
    expect(describeComposedCap(cap("cx_0", MANA))).toBe("Au choix : gagnez 3 mana ce tour.");
    // Un effet ordinaire garde sa phrase telle quelle.
    expect(describeComposedCap(cap("cx_0", MANA, false))).toBe("Gagnez 3 mana ce tour.");
  });

  it("le « / » sépare les branches, jamais après la dernière", async () => {
    const { alternativeSuivieDunSlash } = await import("./composed-display");
    const caps = [cap("cx_0", MANA), cap("cx_1", PIOCHE), cap("cx_2", MANA, false)];
    expect(alternativeSuivieDunSlash(caps, caps[0])).toBe(true);
    expect(alternativeSuivieDunSlash(caps, caps[1])).toBe(false); // dernière branche
    expect(alternativeSuivieDunSlash(caps, caps[2])).toBe(false); // pas une branche
  });

  it("une branche isolée n'affiche pas de séparateur", async () => {
    const { alternativeSuivieDunSlash } = await import("./composed-display");
    const caps = [cap("cx_0", MANA), cap("cx_1", PIOCHE, false)];
    expect(alternativeSuivieDunSlash(caps, caps[0])).toBe(false);
  });
});

describe("OU — persistance", () => {
  it("le drapeau survit à l'enregistrement, en booléen STRICT", async () => {
    const { sanitizeComposed } = await import("@/lib/cards/composedCapabilities");
    const sorti = sanitizeComposed([
      { uid: "x", abilityId: "_composed", effectKind: "immediate", trigger: "spell_resolution", composed: MANA, alternative: true },
      { uid: "y", abilityId: "_composed", effectKind: "immediate", trigger: "spell_resolution", composed: PIOCHE, alternative: "oui" },
    ]);
    expect(sorti[0].alternative).toBe(true);
    expect(sorti[1].alternative).toBeUndefined(); // valeur exotique → rien en base
  });
});
