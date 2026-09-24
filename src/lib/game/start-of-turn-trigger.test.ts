// Déclencheur « DÉBUT DE TOUR » (on_start_of_turn / mode start_of_turn) : les
// effets partent au début du tour du CONTRÔLEUR de l'unité, à chaque tour, une
// fois la pioche faite, le plateau réveillé et le Poison réglé. Même file
// ordonnée que la fin de tour ; une cible « au choix » suspend la séquence et
// ouvre le sélecteur au joueur ENTRANT (la bascule est déjà faite).
// Voir startTurn / advanceTurnPhase / finalizeStartOfTurn / resolvePendingTrigger.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";
import { composedBadge, composedTriggerMode, describeComposedCap } from "./composed-display";
import { keywordModeColor, keywordModeFilter } from "./keyword-labels";
import { isEmblemCadence, isItemFiringTrigger, isTokenFiringTrigger, modeForCreatureTrigger } from "./capability-adapter";
import { CURATED_KEYWORD_MODES } from "@/lib/card-engine/constants";
import { TOKEN_FIRING_MODES } from "./abilities";

function composedCap(trigger: Capability["trigger"], composed: ComposedEffect, uid = `cap_${Math.random().toString(36).slice(2, 8)}`): Capability {
  return { uid, trigger, effectKind: "immediate", abilityId: "_composed", composed };
}

const SELF_BUFF: ComposedEffect = {
  content: "buff", magnitude: { x: 1, y: 1 }, target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
};
const DEGATS_AU_CHOIX: ComposedEffect = {
  content: "deal_damage", magnitude: { x: 3 }, target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
};

/** Decks non vides des deux côtés : la fatigue fausserait les PV des héros. */
function etat() {
  const s = mkState();
  for (let i = 0; i < 3; i++) {
    s.players[0].deck.push(mkInstance(mkCard({ name: "Pioche0" })));
    s.players[1].deck.push(mkInstance(mkCard({ name: "Pioche1" })));
  }
  return s;
}
const trouve = (st: ReturnType<typeof mkState>, p: 0 | 1, id: string) => st.players[p].board.find((x) => x.instanceId === id)!;

describe("Début de tour — non interactif", () => {
  it("part au DÉBUT du tour du contrôleur (pas à la fin du sien, pas au tour adverse)", () => {
    const s = etat();
    const c = mkInstance(mkCard({ attack: 2, health: 2, capabilities: [composedCap("on_start_of_turn", SELF_BUFF)] }));
    s.players[0].board.push(c);

    const s1 = applyAction(s, { type: "end_turn" }); // fin P0 → début P1 : rien pour l'unité de P0
    expect(trouve(s1, 0, c.instanceId).currentAttack).toBe(2);
    expect(s1.currentPlayerIndex).toBe(1);

    const s2 = applyAction(s1, { type: "end_turn" }); // fin P1 → DÉBUT P0 : +1/+1
    expect(trouve(s2, 0, c.instanceId).currentAttack).toBe(3);
    expect(trouve(s2, 0, c.instanceId).maxHealth).toBe(3);
    expect(s2.currentPlayerIndex).toBe(0);
    expect(s2.startOfTurnQueue).toBeUndefined();
    expect(s2.pendingTriggers?.length ?? 0).toBe(0);

    const s3 = applyAction(s2, { type: "end_turn" });
    const s4 = applyAction(s3, { type: "end_turn" }); // début P0 à nouveau
    expect(trouve(s4, 0, c.instanceId).currentAttack).toBe(4);
  });

  it("frappe une cible automatique (héros adverse) au début du tour", () => {
    const s = etat();
    const c = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", {
      content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" },
    })] }));
    s.players[0].board.push(c);
    const hp0 = s.players[1].hero.hp;

    const s1 = applyAction(s, { type: "end_turn" });
    expect(s1.players[1].hero.hp).toBe(hp0); // début du tour de P1 : l'unité de P0 se tait
    const s2 = applyAction(s1, { type: "end_turn" });
    expect(s2.players[1].hero.hp).toBe(hp0 - 2); // début du tour de P0
  });

  it("se joue APRÈS la pioche, le réveil et le tic de Poison : une empoisonnée à 1 PV ne parle plus", () => {
    const s = etat();
    const c = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", {
      content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" },
    })] }));
    c.isPoisoned = true;
    s.players[0].board.push(c);
    const hp0 = s.players[1].hero.hp;
    const s1 = applyAction(s, { type: "end_turn" });
    const s2 = applyAction(s1, { type: "end_turn" }); // début P0 : le poison la tue AVANT la file
    expect(s2.players[0].board.find((x) => x.instanceId === c.instanceId)).toBeUndefined();
    expect(s2.players[1].hero.hp).toBe(hp0);
  });

  it("une créature réveillée et détapée au début du tour parle bien (mal d'invocation levé avant la file)", () => {
    const s = etat();
    const c = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", SELF_BUFF)] }));
    c.hasSummoningSickness = true; c.tapped = true;
    s.players[0].board.push(c);
    const s2 = applyAction(applyAction(s, { type: "end_turn" }), { type: "end_turn" });
    const apres = trouve(s2, 0, c.instanceId);
    expect(apres.currentAttack).toBe(2);
    expect(apres.hasSummoningSickness).toBe(false);
    expect(apres.tapped).toBe(false);
  });
});

describe("Début de tour — ciblage interactif (le joueur ENTRANT choisit)", () => {
  it("suspend la séquence une fois la bascule faite, puis résout sur la cible choisie", () => {
    const s = etat();
    const src = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", DEGATS_AU_CHOIX)] }));
    s.players[1].board.push(src);
    const victim = mkInstance(mkCard({ name: "Cible", attack: 4, health: 5 }));
    const bystander = mkInstance(mkCard({ name: "Autre", attack: 4, health: 5 }));
    s.players[0].board.push(victim, bystander);

    // 1) Fin du tour de P0 : la bascule est FAITE (P1 joue), mais son début de
    //    tour est en pause sur un choix qui lui appartient.
    const paused = applyAction(s, { type: "end_turn" });
    expect(paused.currentPlayerIndex).toBe(1);
    expect(paused.endTurnPending ?? false).toBe(false);
    expect(paused.startOfTurnQueue).toBeDefined();
    expect(paused.pendingTriggers?.length).toBe(1);
    expect(paused.pendingTriggers![0].controllerId).toBe(s.players[1].id);
    // Le mana et la pioche de P1 sont déjà là : la pause vient après.
    expect(paused.players[1].hand.length).toBe(1);

    // 2) Un end_turn pendant la pause est IGNORÉ (rejeu / gap-recovery).
    const ignore = applyAction(paused, { type: "end_turn" });
    expect(ignore.currentPlayerIndex).toBe(1);
    expect(ignore.pendingTriggers?.length).toBe(1);

    // 3) P1 choisit → effet appliqué, file épuisée, le tour continue.
    const triggerId = paused.pendingTriggers![0].id;
    const resolved = applyAction(paused, { type: "resolve_pending_trigger", triggerId, targetInstanceId: victim.instanceId });
    expect(trouve(resolved, 0, victim.instanceId).currentHealth).toBe(2); // 5 - 3
    expect(trouve(resolved, 0, bystander.instanceId).currentHealth).toBe(5);
    expect(resolved.currentPlayerIndex).toBe(1);
    expect(resolved.startOfTurnQueue).toBeUndefined();
    expect(resolved.pendingTriggers?.length ?? 0).toBe(0);
  });

  it("le repli du chrono (auto_resolve) tranche au hasard et reprend la file", () => {
    const s = etat();
    const src = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [
      composedCap("on_start_of_turn", DEGATS_AU_CHOIX, "c_choix"),
      composedCap("on_start_of_turn", SELF_BUFF, "c_auto"), // situé APRÈS l'interactif
    ] }));
    s.players[1].board.push(src);
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 20 })));

    const paused = applyAction(s, { type: "end_turn" });
    expect(paused.pendingTriggers?.length).toBe(1);
    // L'automatique situé à DROITE de l'interactif attend son tour.
    expect(trouve(paused, 1, src.instanceId).currentAttack).toBe(1);

    const done = applyAction(paused, { type: "auto_resolve_pending_triggers" });
    expect(done.pendingTriggers?.length ?? 0).toBe(0);
    expect(done.startOfTurnQueue).toBeUndefined();
    expect(trouve(done, 0, s.players[0].board[0].instanceId).currentHealth).toBe(17);
    expect(trouve(done, 1, src.instanceId).currentAttack).toBe(2); // repris après le choix
  });

  it("sans cible éligible, l'effet « au choix » est sauté sans bloquer le joueur", () => {
    const s = etat();
    const src = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", DEGATS_AU_CHOIX)] }));
    s.players[1].board.push(src);
    const next = applyAction(s, { type: "end_turn" });
    expect(next.pendingTriggers?.length ?? 0).toBe(0);
    expect(next.startOfTurnQueue).toBeUndefined();
  });
});

describe("Début de tour — « en main », emblèmes, ordre", () => {
  it("« tant qu'elle est en main » se renforce à chaque début de tour de son contrôleur, dès le tout premier", () => {
    const capMain = composedCap("on_start_of_turn_in_hand", SELF_BUFF);
    const s = etat();
    const c = mkInstance(mkCard({ name: "Patiente", attack: 1, health: 1, capabilities: [capMain] }));
    s.players[0].hand.push(c);

    let st = applyAction(s, { type: "end_turn" }); // début P1 : rien pour P0
    let enMain = st.players[0].hand.find((k) => k.instanceId === c.instanceId)!;
    expect([enMain.currentAttack, enMain.maxHealth]).toEqual([1, 1]);
    st = applyAction(st, { type: "end_turn" }); // début P0 : +1/+1
    enMain = st.players[0].hand.find((k) => k.instanceId === c.instanceId)!;
    expect([enMain.currentAttack, enMain.maxHealth]).toEqual([2, 2]);
    // Posée : l'effet « en main » cesse, les gains sont emportés.
    st = applyAction(st, { type: "play_card", cardInstanceId: c.instanceId });
    st = applyAction(applyAction(st, { type: "end_turn" }), { type: "end_turn" });
    expect(trouve(st, 0, c.instanceId).currentAttack).toBe(2);
  });

  it("un emblème de cadence « début de tour » parle à chaque début de tour de son porteur, après les créatures", () => {
    const s = etat();
    const c = mkInstance(mkCard({ attack: 2, health: 2, capabilities: [composedCap("on_start_of_turn", SELF_BUFF)] }));
    s.players[1].board.push(c);
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 20 })));
    s.players[1].emblems = [{ composed: DEGATS_AU_CHOIX, stacks: 1, trigger: "on_start_of_turn" } as never];

    const pause = applyAction(s, { type: "end_turn" }); // début P1
    // La créature (automatique) a déjà parlé quand l'emblème suspend.
    expect(trouve(pause, 1, c.instanceId).currentAttack).toBe(3);
    expect(pause.pendingTriggers?.length).toBe(1);
    expect(pause.pendingTriggers![0].emblemIndex).toBe(0);
    expect(pause.pendingTriggers![0].id).toBe("emblem_0#sot");

    const done = applyAction(pause, { type: "resolve_pending_trigger", triggerId: "emblem_0#sot", targetInstanceId: s.players[0].board[0].instanceId });
    expect(trouve(done, 0, s.players[0].board[0].instanceId).currentHealth).toBe(17);
    expect(done.pendingTriggers?.length ?? 0).toBe(0);
  });

  it("un emblème « fin de tour » ne parle PAS au début du tour, et réciproquement", () => {
    const s = etat();
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 20 })));
    s.players[1].emblems = [
      { composed: { ...DEGATS_AU_CHOIX, target: { ...DEGATS_AU_CHOIX.target!, designation: "random" } }, stacks: 1, trigger: "on_end_of_turn" } as never,
    ];
    const debutP1 = applyAction(s, { type: "end_turn" });
    expect(trouve(debutP1, 0, s.players[0].board[0].instanceId).currentHealth).toBe(20);
    const finP1 = applyAction(debutP1, { type: "end_turn" });
    expect(trouve(finP1, 0, s.players[0].board[0].instanceId).currentHealth).toBe(17);
  });

  it("les créatures parlent de gauche à droite : l'automatique à gauche est appliqué quand celui de droite suspend", () => {
    const s = etat();
    const gauche = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", SELF_BUFF)] }));
    const droite = mkInstance(mkCard({ attack: 1, health: 1, capabilities: [composedCap("on_start_of_turn", DEGATS_AU_CHOIX)] }));
    s.players[1].board.push(gauche, droite);
    s.players[0].board.push(mkInstance(mkCard({ name: "Cible", attack: 0, health: 20 })));
    const pause = applyAction(s, { type: "end_turn" });
    expect(pause.pendingTriggers![0].sourceInstanceId).toBe(droite.instanceId);
    expect(trouve(pause, 1, gauche.instanceId).currentAttack).toBe(2);
  });
});

describe("Début de tour — mot-clé curé en mode start_of_turn", () => {
  it("Renforcement +X/+Y en mode start_of_turn se résout au début du tour du contrôleur", () => {
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Sentinelle", attack: 1, health: 1, keywords: ["renforcement"],
      keyword_instances: [{ id: "renforcement", x: 2, y: 1, mode: "start_of_turn" }],
      effect_text: "Renforcement +2/+1",
    }));
    s.players[1].board.push(c);
    const avant = trouve(s, 1, c.instanceId).currentAttack;
    const debutP1 = applyAction(s, { type: "end_turn" });
    expect(trouve(debutP1, 1, c.instanceId).currentAttack).toBe(avant + 2);
  });
});

describe("Début de tour — affichage, adaptateur, forge", () => {
  it("argent bleuté #A9B8CC, distinct du blanc des passifs, avec une chaîne filter dédiée", () => {
    expect(keywordModeColor("start_of_turn")).toBe("#A9B8CC");
    expect(keywordModeColor(undefined)).toBeNull();
    expect(keywordModeFilter("start_of_turn")).toMatch(/hue-rotate\(175deg\)/);
    expect(composedTriggerMode(composedCap("on_start_of_turn", SELF_BUFF))).toBe("start_of_turn");
    expect(composedTriggerMode(composedCap("on_start_of_turn_in_hand", SELF_BUFF))).toBe("start_of_turn");
  });

  it("s'annonce « Début de tour » et « Début de tour · en main » ; le texte reste celui de l'effet", () => {
    const cap = composedCap("on_start_of_turn", SELF_BUFF);
    expect(composedBadge(cap)?.label).toBe("Début de tour");
    expect(composedBadge(cap)?.color).toBe("#A9B8CC");
    const enMain = composedCap("on_start_of_turn_in_hand", SELF_BUFF);
    expect(composedBadge(enMain)?.label).toBe("Début de tour · en main");
    expect(describeComposedCap(enMain)).toBe("S'octroie +1/+1.");
  });

  it("adaptateur : mode ↔ déclencheur, jetons, objets, emblèmes", () => {
    expect(modeForCreatureTrigger("on_start_of_turn")).toBe("start_of_turn");
    expect(modeForCreatureTrigger("on_start_of_turn_in_hand")).toBeUndefined();
    expect(TOKEN_FIRING_MODES.has("start_of_turn")).toBe(true);
    expect(isTokenFiringTrigger("on_start_of_turn")).toBe(true);
    expect(isItemFiringTrigger("on_start_of_turn")).toBe(true);
    expect(isItemFiringTrigger("on_start_of_turn_in_hand")).toBe(false);
    expect(isEmblemCadence("on_start_of_turn")).toBe(true);
    // Ouvert à TOUS les curés multi-mode, y compris ceux qui exigent la source en jeu.
    expect(CURATED_KEYWORD_MODES["Renforcement +X/+Y"].has("start_of_turn")).toBe(true);
    expect(CURATED_KEYWORD_MODES["Convocation X"].has("start_of_turn")).toBe(true);
  });
});
