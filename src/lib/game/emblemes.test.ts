// EMBLÈMES — effets permanents portés par un JOUEUR, et non par une carte.
//
// Nés du `mode: "aura"` des pouvoirs de héros, ils sont désormais posables par
// n'importe quelle carte via `effectKind: "emblem"`. Ce qui les définit, et que
// ces tests verrouillent : ils SURVIVENT à la disparition de leur source.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { syncHash } from "./stateHash";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

/** Emblème de REGISTRE : une capacité d'ABILITIES posée en permanence. */
function emblemeRegistre(
  trigger: Capability["trigger"],
  abilityId: string,
  opts?: { side?: "self" | "opponent"; x?: number; duration?: number },
): Capability {
  return {
    uid: `em_${abilityId}_${trigger}`,
    trigger,
    effectKind: "emblem",
    abilityId,
    ...(opts?.x != null ? { params: { x: opts.x } } : {}),
    ...(opts?.side ? { side: opts.side } : {}),
    ...(opts?.duration != null ? { duration: opts.duration } : {}),
  };
}

/** Emblème COMPOSÉ : résolu à chaque fin de tour de son porteur. */
function emblemeCompose(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: `em_cx_${trigger}`, trigger, effectKind: "emblem", abilityId: "_composed", composed };
}

const DEGATS_AU_HASARD: ComposedEffect = {
  content: "deal_damage",
  magnitude: { x: 2 },
  target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "random" },
};

const DEGATS_AU_CHOIX: ComposedEffect = {
  content: "deal_damage",
  magnitude: { x: 2 },
  target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
};

/** Deck adverse non vide : sinon la pioche inflige de la fatigue au héros et
 *  fausse toute lecture de ses PV. */
function etat() {
  const s = mkState();
  s.players[1].deck.push(mkInstance(mkCard({ name: "Pioche" })));
  return s;
}

describe("pose — à l'ARRIVÉE de la carte, quel que soit le déclencheur", () => {
  it("une créature pose ses emblèmes en entrant en jeu", () => {
    const s = etat();
    const c = mkInstance(mkCard({ name: "Porteur", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "vol")] }));
    s.players[0].hand.push(c);

    const next = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);

    expect(next.players[0].emblems).toHaveLength(1);
    expect(next.players[0].emblems[0]).toMatchObject({ abilityId: "vol", stacks: 1, sourceName: "Porteur" });
  });

  it("le déclencheur est CONSERVÉ sur l'emblème — il dit à quoi il réagira", () => {
    // Le point de bascule du modèle : `trigger` ne dit plus QUAND POSER (c'est
    // toujours à l'arrivée) mais à quoi l'emblème réagira, pour le reste de la
    // partie.
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Guetteur", mana_cost: 1,
      capabilities: [emblemeCompose("on_death", DEGATS_AU_HASARD)],
    }));
    s.players[0].hand.push(c);

    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);

    expect(st.players[0].emblems).toHaveLength(1);
    expect(st.players[0].emblems[0].trigger).toBe("on_death");
  });

  it("un sort pose les siens à sa résolution, sans source en jeu", () => {
    const s = etat();
    const sort = mkInstance(mkCard({
      name: "Décret", card_type: "spell", mana_cost: 1, attack: null, health: null,
      capabilities: [emblemeRegistre("spell_resolution", "vol")],
    }));
    s.players[0].hand.push(sort);

    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as never);

    expect(next.players[0].emblems).toHaveLength(1);
    expect(next.players[0].board).toHaveLength(0);
  });
});

describe("l'emblème SURVIT à sa source — c'est ce qui le définit", () => {
  it("le don reste actif sur le plateau après la mort du porteur", () => {
    const s = etat();
    const porteur = mkInstance(mkCard({ name: "Porteur", attack: 1, health: 1, capabilities: [emblemeRegistre("on_play", "vol")] }));
    s.players[0].hand.push(porteur);
    const allie = mkInstance(mkCard({ name: "Allié", attack: 2, health: 4 }));
    s.players[0].board.push(allie);

    let st = applyAction(s, { type: "play_card", cardInstanceId: porteur.instanceId } as never);
    expect(st.players[0].board.find(c => c.card.name === "Allié")!.card.keywords).toContain("vol");

    // Le porteur meurt.
    const tueur = mkInstance(mkCard({ name: "Tueur", attack: 9, health: 9 }));
    tueur.hasSummoningSickness = false;
    st.players[1].board.push(tueur);
    st = applyAction(st, { type: "end_turn" });
    const cible = st.players[0].board.find(c => c.card.name === "Porteur")!;
    st = applyAction(st, { type: "attack", attackerInstanceId: tueur.instanceId, targetInstanceId: cible.instanceId } as never);

    expect(st.players[0].board.some(c => c.card.name === "Porteur")).toBe(false);
    expect(st.players[0].emblems).toHaveLength(1);
    recalculateAuras(st.players[0], st.players[1]);
    expect(st.players[0].board.find(c => c.card.name === "Allié")!.card.keywords).toContain("vol");
  });
});

describe("camp — un emblème rangé chez l'adversaire agit sur SON plateau", () => {
  it("Terreur posée chez l'adversaire affaiblit MES créatures, pas les siennes", () => {
    // Terreur pénalise le camp OPPOSÉ à son porteur. Posée chez l'adversaire,
    // elle se retourne donc contre moi — c'est la démonstration que le camp est
    // bien implicite dans le rangement.
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Semeur", mana_cost: 1,
      capabilities: [emblemeRegistre("on_play", "terreur", { side: "opponent" })],
    }));
    s.players[0].hand.push(c);
    const mien = mkInstance(mkCard({ name: "Mien", attack: 3, health: 3 }));
    s.players[0].board.push(mien);
    const sien = mkInstance(mkCard({ name: "Sien", attack: 3, health: 3 }));
    s.players[1].board.push(sien);

    const next = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);

    expect(next.players[1].emblems).toHaveLength(1);   // rangé chez LUI
    expect(next.players[0].emblems).toHaveLength(0);
    expect(next.players[0].board.find(x => x.card.name === "Mien")!.currentAttack).toBe(2);
    expect(next.players[1].board.find(x => x.card.name === "Sien")!.currentAttack).toBe(3);
  });
});

describe("cumul", () => {
  it("deux poses identiques s'empilent au lieu de se dupliquer", () => {
    const s = etat();
    const a = mkInstance(mkCard({ name: "A", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "commandement")] }));
    const b = mkInstance(mkCard({ name: "B", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "commandement")] }));
    s.players[0].hand.push(a, b);

    let st = applyAction(s, { type: "play_card", cardInstanceId: a.instanceId } as never);
    st = applyAction(st, { type: "play_card", cardInstanceId: b.instanceId } as never);

    expect(st.players[0].emblems).toHaveLength(1);
    expect(st.players[0].emblems[0].stacks).toBe(2);
  });
});

describe("emblème COMPOSÉ — résolu en fin de tour", () => {
  it("se résout à chaque fin de tour de son porteur", () => {
    const s = etat();
    const c = mkInstance(mkCard({ name: "Rituel", mana_cost: 1, capabilities: [emblemeCompose("on_end_of_turn", DEGATS_AU_HASARD)] }));
    s.players[0].hand.push(c);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 }));
    s.players[1].board.push(cible);

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    expect(st.players[1].board[0].currentHealth).toBe(9); // rien à la pose

    st = applyAction(st, { type: "end_turn" });
    expect(st.players[1].board[0].currentHealth).toBe(7); // −2 en fin de tour
  });

  it("N piles ⇒ l'effet se résout N fois", () => {
    const s = etat();
    const a = mkInstance(mkCard({ name: "A", mana_cost: 1, capabilities: [emblemeCompose("on_end_of_turn", DEGATS_AU_HASARD)] }));
    const b = mkInstance(mkCard({ name: "B", mana_cost: 1, capabilities: [emblemeCompose("on_end_of_turn", DEGATS_AU_HASARD)] }));
    s.players[0].hand.push(a, b);
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 })));

    let st = applyAction(s, { type: "play_card", cardInstanceId: a.instanceId } as never);
    st = applyAction(st, { type: "play_card", cardInstanceId: b.instanceId } as never);
    expect(st.players[0].emblems[0].stacks).toBe(2);

    st = applyAction(st, { type: "end_turn" });
    expect(st.players[1].board[0].currentHealth).toBe(16); // 2 × 2 dégâts
  });

  it("N'EST PAS écarté par le filtre « source absente du plateau »", () => {
    // LE piège du lot : `advanceEndOfTurn` saute tout pas dont la source n'est
    // plus en jeu. Un emblème n'a JAMAIS de source en jeu — sans traitement
    // dédié, il serait sauté à chaque fois, en silence.
    const s = etat();
    const sort = mkInstance(mkCard({
      name: "Décret", card_type: "spell", mana_cost: 1, attack: null, health: null,
      capabilities: [emblemeCompose("on_end_of_turn", DEGATS_AU_HASARD)],
    }));
    s.players[0].hand.push(sort);
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));

    let st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as never);
    expect(st.players[0].board).toHaveLength(0); // aucune source en jeu
    st = applyAction(st, { type: "end_turn" });

    expect(st.players[1].board[0].currentHealth).toBe(7);
  });

  it("une cible « au choix » met le tour en PAUSE, puis reprend", () => {
    const s = etat();
    const sort = mkInstance(mkCard({
      name: "Décret", card_type: "spell", mana_cost: 1, attack: null, health: null,
      capabilities: [emblemeCompose("on_end_of_turn", DEGATS_AU_CHOIX)],
    }));
    s.players[0].hand.push(sort);
    const c1 = mkInstance(mkCard({ name: "C1", attack: 1, health: 9 }));
    const c2 = mkInstance(mkCard({ name: "C2", attack: 1, health: 9 }));
    s.players[1].board.push(c1, c2);

    let st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as never);
    st = applyAction(st, { type: "end_turn" });

    expect(st.endTurnPending).toBe(true);
    const trig = st.pendingTriggers![0];
    expect(trig.emblemIndex).toBe(0);
    expect(trig.sourceInstanceId).toBeNull();

    st = applyAction(st, {
      type: "resolve_pending_trigger", triggerId: trig.id, targetInstanceId: c2.instanceId,
    } as never);

    expect(st.players[1].board.find(c => c.card.name === "C2")!.currentHealth).toBe(7);
    expect(st.players[1].board.find(c => c.card.name === "C1")!.currentHealth).toBe(9);
    expect(st.currentPlayerIndex).toBe(1); // le tour a bien basculé
  });
});

describe("synchronisation multijoueur", () => {
  it("le hash de synchro DISTINGUE deux états qui ne diffèrent que par un emblème", () => {
    // `stateHash` fonctionne par liste d'EXCLUSION (VOLATILE_KEYS) : tout ce qui
    // vit dans l'état est haché d'office, donc les emblèmes y sont entrés sans
    // une ligne de code. Ce test le VERROUILLE — les inscrire par mégarde dans
    // les clés volatiles laisserait deux clients diverger en silence sur un
    // effet permanent, exactement le trou que le hash existe pour fermer.
    // Le MÊME état avant/après : deux `etat()` distincts diffèrent déjà par les
    // identifiants générés, ce qui ne prouverait rien.
    const s = etat();
    const avant = syncHash(s);
    s.players[0].emblems.push({ abilityId: "vol", stacks: 1 });
    expect(syncHash(s)).not.toBe(avant);
  });

  it("distingue aussi deux PILES différentes du même emblème", () => {
    const s = etat();
    s.players[0].emblems.push({ abilityId: "vol", stacks: 1 });
    const uneP = syncHash(s);
    s.players[0].emblems[0].stacks = 2;
    expect(syncHash(s)).not.toBe(uneP);
  });
});

describe("emblèmes ÉPHÉMÈRES — durée en tours", () => {
  /** Fait passer N tours complets (le joueur 0 puis le joueur 1). */
  const tourComplet = (st: ReturnType<typeof mkState>, n = 1) => {
    let cur = st;
    for (let i = 0; i < n; i++) {
      cur = applyAction(cur, { type: "end_turn" });
      cur = applyAction(cur, { type: "end_turn" });
    }
    return cur;
  };

  it("un emblème sans durée reste PERMANENT — le défaut ne change pas", () => {
    const s = etat();
    const c = mkInstance(mkCard({ name: "Perpétuel", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "vol")] }));
    s.players[0].hand.push(c);

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    st = tourComplet(st, 3);

    expect(st.players[0].emblems).toHaveLength(1);
    expect(st.players[0].emblems[0].duration).toBeUndefined();
  });

  it("décompte une fois par tour de SON PORTEUR, puis disparaît", () => {
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Éphémère", mana_cost: 1,
      capabilities: [emblemeRegistre("on_play", "vol", { duration: 2 })],
    }));
    s.players[0].hand.push(c);

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    expect(st.players[0].emblems[0].duration).toBe(2);

    st = tourComplet(st, 1);
    expect(st.players[0].emblems[0].duration).toBe(1);

    st = tourComplet(st, 1);
    expect(st.players[0].emblems).toHaveLength(0);
  });

  it("un emblème à 1 agit une DERNIÈRE fois avant de disparaître", () => {
    // Le décompte a lieu après la file de fin de tour : l'effet du dernier tour
    // doit bien partir. C'est la nuance qui distingue « dure 1 tour » de
    // « ne sert à rien ».
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Dernier souffle", mana_cost: 1,
      capabilities: [{ ...emblemeCompose("on_end_of_turn", DEGATS_AU_HASARD), duration: 1 }],
    }));
    s.players[0].hand.push(c);
    s.players[1].board.push(mkInstance(mkCard({ name: "Cible", attack: 1, health: 9 })));

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    st = applyAction(st, { type: "end_turn" });

    expect(st.players[1].board[0].currentHealth).toBe(7); // il a frappé
    expect(st.players[0].emblems).toHaveLength(0);        // puis il est parti
  });

  it("sa disparition RETIRE bien le don qu'il conférait", () => {
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Passager", mana_cost: 1,
      capabilities: [emblemeRegistre("on_play", "vol", { duration: 1 })],
    }));
    s.players[0].hand.push(c);
    s.players[0].board.push(mkInstance(mkCard({ name: "Allié", attack: 2, health: 4 })));

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    expect(st.players[0].board.find(x => x.card.name === "Allié")!.card.keywords).toContain("vol");

    st = tourComplet(st, 1);
    expect(st.players[0].emblems).toHaveLength(0);
    expect(st.players[0].board.find(x => x.card.name === "Allié")!.card.keywords).not.toContain("vol");
  });

  it("deux durées RESTANTES différentes ne fusionnent PAS", () => {
    // Le piège du cumul : fusionner une pose du tour 1 avec une du tour 3 ferait
    // expirer l'une trop tôt et prolongerait l'autre.
    const s = etat();
    const a = mkInstance(mkCard({ name: "A", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "vol", { duration: 3 })] }));
    const b = mkInstance(mkCard({ name: "B", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "vol", { duration: 3 })] }));
    s.players[0].hand.push(a, b);

    // Première pose au tour 1.
    let st = applyAction(s, { type: "play_card", cardInstanceId: a.instanceId } as never);
    st = tourComplet(st, 1);                       // A tombe à 2
    // Seconde pose au tour suivant : durée restante 3, distincte de 2.
    st = applyAction(st, { type: "play_card", cardInstanceId: b.instanceId } as never);

    expect(st.players[0].emblems).toHaveLength(2);
    expect(st.players[0].emblems.map(e => e.duration).sort()).toEqual([2, 3]);
  });

  it("deux poses de MÊME durée restante fusionnent toujours", () => {
    const s = etat();
    const a = mkInstance(mkCard({ name: "A", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "vol", { duration: 3 })] }));
    const b = mkInstance(mkCard({ name: "B", mana_cost: 1, capabilities: [emblemeRegistre("on_play", "vol", { duration: 3 })] }));
    s.players[0].hand.push(a, b);

    let st = applyAction(s, { type: "play_card", cardInstanceId: a.instanceId } as never);
    st = applyAction(st, { type: "play_card", cardInstanceId: b.instanceId } as never);

    expect(st.players[0].emblems).toHaveLength(1);
    expect(st.players[0].emblems[0].stacks).toBe(2);
  });

  it("une malédiction éphémère décompte sur les tours de l'ADVERSAIRE", () => {
    // Cohérent avec le camp implicite : l'emblème vit chez celui qu'il affecte,
    // donc il vieillit à SES fins de tour.
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Semeur", mana_cost: 1,
      capabilities: [emblemeRegistre("on_play", "terreur", { side: "opponent", duration: 1 })],
    }));
    s.players[0].hand.push(c);

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    expect(st.players[1].emblems).toHaveLength(1);

    st = applyAction(st, { type: "end_turn" });   // fin du tour de P0 : rien
    expect(st.players[1].emblems).toHaveLength(1);
    st = applyAction(st, { type: "end_turn" });   // fin du tour de P1 : il expire
    expect(st.players[1].emblems).toHaveLength(0);
  });
});

describe("réversibilité du don d'emblème", () => {
  it("ne retire PAS un mot-clé que la créature possédait déjà", () => {
    // Le garde-fou de la purge : on ne reprend que ce qu'on a donné. Une
    // créature qui vole nativement doit continuer à voler après l'expiration
    // d'un emblème de Vol.
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Passager", mana_cost: 1,
      capabilities: [emblemeRegistre("on_play", "vol", { duration: 1 })],
    }));
    s.players[0].hand.push(c);
    const volantNé = mkInstance(mkCard({ name: "Volant", attack: 2, health: 4, keywords: ["vol"] as never }));
    s.players[0].board.push(volantNé);

    let st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    st = applyAction(st, { type: "end_turn" });
    st = applyAction(st, { type: "end_turn" });

    expect(st.players[0].emblems).toHaveLength(0);
    expect(st.players[0].board.find(x => x.card.name === "Volant")!.card.keywords).toContain("vol");
  });
});

describe("cadences PERMANENTES — l'emblème réagit, tour après tour", () => {
  /** Emblème posé par un sort, avec la cadence voulue. Le sort disparaît ; seul
   *  l'emblème reste, ce qui isole bien ce qu'on mesure. */
  const poseParSort = (cadence: Capability["trigger"]) => {
    const s = etat();
    const sort = mkInstance(mkCard({
      name: "Décret", card_type: "spell", mana_cost: 1, attack: null, health: null,
      capabilities: [{ ...emblemeCompose(cadence, DEGATS_AU_HASARD), trigger: cadence }],
    } as never));
    s.players[0].hand.push(sort);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 40 }));
    s.players[1].board.push(cible);
    const st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as never);
    expect(st.players[0].emblems).toHaveLength(1);
    return { st, cibleId: cible.instanceId };
  };
  const pv = (st: ReturnType<typeof mkState>, id: string) =>
    st.players[1].board.find((c) => c.instanceId === id)!.currentHealth;

  it("« à l'entrée en jeu » parle quand une créature du porteur arrive", () => {
    const { st, cibleId } = poseParSort("on_play");
    expect(pv(st, cibleId)).toBe(40); // rien à la pose du sort

    const creature = mkInstance(mkCard({ name: "Arrivante", mana_cost: 1 }));
    st.players[0].hand.push(creature);
    const apres = applyAction(st, { type: "play_card", cardInstanceId: creature.instanceId } as never);
    expect(pv(apres, cibleId)).toBe(38);
  });

  it("« à l'attaque » parle à chaque attaque du porteur", () => {
    const { st, cibleId } = poseParSort("on_attack");
    const attaquant = mkInstance(mkCard({ name: "Assaillant", attack: 1, health: 9 }));
    attaquant.hasSummoningSickness = false;
    st.players[0].board.push(attaquant);

    const apres = applyAction(st, {
      type: "attack", attackerInstanceId: attaquant.instanceId, targetInstanceId: "enemy_hero",
    } as never);
    expect(pv(apres, cibleId)).toBe(38);
  });

  it("« à la mort » parle quand une créature du porteur meurt", () => {
    const { st, cibleId } = poseParSort("on_death");
    const fragile = mkInstance(mkCard({ name: "Fragile", attack: 1, health: 1 }));
    st.players[0].board.push(fragile);
    const tueur = mkInstance(mkCard({ name: "Tueur", attack: 9, health: 9 }));
    tueur.hasSummoningSickness = false;
    st.players[1].board.push(tueur);

    let apres = applyAction(st, { type: "end_turn" });
    apres = applyAction(apres, {
      type: "attack", attackerInstanceId: tueur.instanceId, targetInstanceId: fragile.instanceId,
    } as never);
    expect(apres.players[0].board.some((c) => c.card.name === "Fragile")).toBe(false);
    expect(pv(apres, cibleId)).toBe(38);
  });

  it("« sous 15 PV » parle UNE fois, au franchissement", () => {
    // Verrou à un coup au niveau du JOUEUR : sans lui, l'emblème reparlerait à
    // chaque action tant que le héros reste sous le seuil.
    const { st, cibleId } = poseParSort("on_low_hp");
    expect(pv(st, cibleId)).toBe(40);

    st.players[0].hero.hp = 10;
    let apres = applyAction(st, { type: "end_turn" });
    expect(pv(apres, cibleId)).toBe(38);
    expect(apres.players[0].lowHpEmblemsFired).toBe(true);

    apres = applyAction(apres, { type: "end_turn" });
    apres = applyAction(apres, { type: "end_turn" });
    expect(pv(apres, cibleId)).toBe(38); // toujours 38 : il n'a parlé qu'une fois
  });

  it("une cadence ne parle PAS sur un autre événement", () => {
    // Le défaut trouvé en écrivant ces tests : buildEndOfTurnQueue empilait
    // TOUS les emblèmes composés sans regarder leur cadence, si bien qu'un
    // emblème « à l'entrée en jeu » parlait aussi à chaque fin de tour.
    const { st, cibleId } = poseParSort("on_play");
    const apres = applyAction(st, { type: "end_turn" });
    expect(pv(apres, cibleId)).toBe(40);
  });

  it("une créature qui arrive ne réveille pas SON PROPRE emblème", () => {
    const s = etat();
    const c = mkInstance(mkCard({
      name: "Arrivante", mana_cost: 1,
      capabilities: [{ ...emblemeCompose("on_play", DEGATS_AU_HASARD), trigger: "on_play" }],
    } as never));
    s.players[0].hand.push(c);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 40 }));
    s.players[1].board.push(cible);

    const st = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId } as never);
    expect(st.players[0].emblems).toHaveLength(1);
    expect(pv(st, cible.instanceId)).toBe(40);
  });
});
