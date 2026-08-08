// Durcissement de la phase de FIN DE TOUR, après une partie bloquée puis, dans
// d'autres parties, un joueur qui rejouait un tour.
//
// Trois causes distinctes sont verrouillées ici :
//   1. `endTurn` n'était pas idempotent — un second `end_turn` reconstruisait
//      toute la file et RE-empilait ses déclencheurs (pending 1 → 2), doublant
//      les effets de fin de tour ;
//   2. un déclencheur dont les cibles s'évaporaient entre la mise en file et la
//      résolution restait dans la file pour toujours : côté client aucune modale
//      à afficher, et la garde « aucune action tant que la file n'est pas vide »
//      refusait tout en silence — plateau cliquable et inerte ;
//   3. la fenêtre de choix se prenait sur le reliquat du chrono de tour, donc
//      ~0 s quand la pause naissait justement de son expiration.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState } from "./types";

/** Effet composé « fin de tour, +1/+1 à un allié AU CHOIX » (interactif). */
function buffAuChoix(uid = "cx_0"): Capability {
  return {
    uid, trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
    composed: {
      content: "buff", magnitude: { x: 1, y: 1 },
      target: { entity: "unit", side: "ally", count: 1, location: "board", designation: "choice" },
    },
  } as unknown as Capability;
}

function plateauAvecChoix() {
  const s = mkState();
  s.players[0].id = "MOI";
  s.players[1].id = "LUI";
  const src = mkInstance(mkCard({
    name: "Src", attack: 1, health: 3, capabilities: [buffAuChoix()] as never,
  }));
  const ami = mkInstance(mkCard({ name: "Ami", attack: 1, health: 3 }));
  s.players[0].board.push(src, ami);
  return { s, src, ami };
}

describe("end_turn est IDEMPOTENT tant que la fin de tour est en pause", () => {
  it("un second end_turn ne re-empile pas la séquence", () => {
    const { s } = plateauAvecChoix();

    const un = applyAction(s, { type: "end_turn" });
    expect(un.pendingTriggers).toHaveLength(1);
    expect(un.endTurnPending).toBe(true);

    const deux = applyAction(un, { type: "end_turn" });

    // Avant : pending passait à 2 et les effets de fin de tour étaient rejoués.
    expect(deux.pendingTriggers).toHaveLength(1);
    // No-op strict : le même objet d'état est rendu.
    expect(deux).toBe(un);
  });

  it("le tour ne bascule qu'UNE fois même après un end_turn en double", () => {
    const { s } = plateauAvecChoix();
    let st = applyAction(s, { type: "end_turn" });
    st = applyAction(st, { type: "end_turn" });
    st = applyAction(st, { type: "auto_resolve_pending_triggers" });

    expect(st.players[st.currentPlayerIndex].id).toBe("LUI");
    expect(st.endTurnPending).toBe(false);
    expect(st.pendingTriggers ?? []).toHaveLength(0);
    // Le buff n'a été appliqué qu'une fois (+1/+1 sur un seul allié).
    const gains = st.players[0].board.reduce((n, c) => n + (c.currentAttack - (c.baseAttack ?? 0)), 0);
    expect(gains).toBe(1);
  });
});

describe("déclencheur ORPHELIN : le moteur le purge au lieu de bloquer", () => {
  it("plus aucune cible éligible ⇒ la file se vide et le tour bascule", () => {
    const { s } = plateauAvecChoix();
    const enPause = applyAction(s, { type: "end_turn" });
    expect(enPause.pendingTriggers).toHaveLength(1);

    // Les cibles s'évaporent (mortes, exilées…) pendant que le joueur réfléchit.
    for (const c of enPause.players[0].board) c.currentHealth = 0;

    // N'importe quelle reprise doit constater l'impasse et enchaîner. Avant, la
    // file gardait son déclencheur : aucune modale possible, aucune action
    // permise, partie figée.
    const apres = applyAction(enPause, { type: "auto_resolve_pending_triggers" });

    expect(apres.pendingTriggers ?? []).toHaveLength(0);
    expect(apres.endTurnPending).toBe(false);
    expect(apres.players[apres.currentPlayerIndex].id).toBe("LUI");
  });

  it("une Sélection dont le pool a disparu ne fige pas la partie", () => {
    const s = mkState();
    s.players[0].id = "MOI";
    s.players[1].id = "LUI";
    s.factionCardPool = [mkCard({ name: "Offerte", faction: "Mercenaires", rarity: "Commune", mana_cost: 1 })];
    const barde = mkInstance(mkCard({
      name: "Barde", attack: 1, health: 3,
      keywords: ["selection"] as never,
      keyword_instances: [{ id: "selection", x: 3, mode: "end_of_turn" }] as never,
    }));
    s.players[0].board.push(barde);

    const enPause = applyAction(s, { type: "end_turn" });
    expect(enPause.pendingTriggers).toHaveLength(1);

    // Le pool devient introuvable (cas réel : ids offerts absents des pools
    // rattachés côté client après un resync).
    enPause.factionCardPool = [];
    enPause.allSpellsPool = [];

    const apres = applyAction(enPause, { type: "auto_resolve_pending_triggers" });
    expect(apres.pendingTriggers ?? []).toHaveLength(0);
    expect(apres.players[apres.currentPlayerIndex].id).toBe("LUI");
  });
});

describe("horloge du CHOIX, détachée du chrono de tour", () => {
  it("posée à la mise en pause, effacée à la reprise", () => {
    const { s } = plateauAvecChoix();

    const enPause = applyAction(s, { type: "end_turn" });
    expect(enPause.choiceStartedAt).toBeGreaterThan(0);

    const apres = applyAction(enPause, { type: "auto_resolve_pending_triggers" });
    expect(apres.choiceStartedAt).toBeUndefined();
  });

  it("repart de zéro à CHAQUE nouveau choix (le 2ᵉ n'hérite pas du 1er)", async () => {
    const s = mkState();
    s.players[0].id = "MOI";
    s.players[1].id = "LUI";
    s.players[0].board.push(
      mkInstance(mkCard({ name: "S1", attack: 1, health: 3, capabilities: [buffAuChoix("a")] as never })),
      mkInstance(mkCard({ name: "S2", attack: 1, health: 3, capabilities: [buffAuChoix("b")] as never })),
    );

    const premier = applyAction(s, { type: "end_turn" });
    const t1 = premier.choiceStartedAt!;
    expect(premier.pendingTriggers).toHaveLength(1);

    await new Promise((r) => setTimeout(r, 5));
    const second = applyAction(premier, {
      type: "resolve_pending_trigger",
      triggerId: premier.pendingTriggers![0].id,
      targetInstanceId: premier.players[0].board[0].instanceId,
    });

    // Un second choix attend, avec une horloge NEUVE : sans ça il héritait du
    // temps déjà consommé par le premier.
    expect(second.pendingTriggers).toHaveLength(1);
    expect(second.choiceStartedAt!).toBeGreaterThan(t1);
  });

  it("exclue du hash de synchro (heure murale, propre à chaque client)", async () => {
    const { s } = plateauAvecChoix();
    const a = applyAction(s, { type: "end_turn" });
    await new Promise((r) => setTimeout(r, 5));
    const b: GameState = { ...a, choiceStartedAt: (a.choiceStartedAt ?? 0) + 5000 };
    const { syncHash } = await import("./stateHash");
    expect(syncHash(a)).toBe(syncHash(b));
  });
});

describe("repli automatique : le début de tour du joueur ENTRANT est bien appliqué", () => {
  // Reproduction fidèle d'« Esprit des Cauris Dispersés » (carte 666) : fin de
  // tour → renvoie en main UNE unité ennemie AU CHOIX. Le chrono expire, le
  // repli automatique tranche… et le joueur suivant héritait d'un tour VIDE :
  // `finishEndTurn` termine par `return startTurn(...)`, or `startTurn` CLONE
  // l'état — et la boucle de `autoResolvePendingTriggers` jetait ce retour.
  // L'index de joueur (muté avant le clone) basculait bien, mais le début de
  // tour partait à la poubelle : pas d'incrément de tour, pas de mana, pas de
  // pioche, et surtout `turnStartedAt` inchangé → chrono DÉJÀ expiré, le
  // joueur entrant rendait la main aussitôt et le tour repartait au précédent.
  // Symptôme rapporté : « il rejoue un tour, et encore, et encore ».
  function tableCauris() {
    const s = mkState();
    s.players[0].id = "MOI";
    s.players[1].id = "LUI";
    s.players[0].board.push(mkInstance(mkCard({
      name: "Esprit des Cauris Dispersés", mana_cost: 3, attack: 2, health: 2,
      capabilities: [{
        uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed",
        composed: {
          content: "bounce", magnitude: { x: 1 },
          target: { side: "enemy", count: 1, entity: "unit", location: "board", designation: "choice" },
        },
      }] as never,
    })));
    s.players[1].board.push(mkInstance(mkCard({ name: "Proie", attack: 1, health: 3 })));
    s.players[1].maxMana = 4;
    s.players[1].mana = 0;
    s.players[1].deck = [mkInstance(mkCard({ name: "Piochée" }))];
    return s;
  }

  it("le repli produit EXACTEMENT le même début de tour que la résolution manuelle", () => {
    const auto = applyAction(
      applyAction(tableCauris(), { type: "end_turn" }),
      { type: "auto_resolve_pending_triggers" },
    );

    const enPause = applyAction(tableCauris(), { type: "end_turn" });
    const manuel = applyAction(enPause, {
      type: "resolve_pending_trigger",
      triggerId: enPause.pendingTriggers![0].id,
      targetInstanceId: enPause.players[1].board[0].instanceId,
    });

    // Le tour a basculé des deux côtés…
    expect(auto.players[auto.currentPlayerIndex].id).toBe("LUI");
    expect(manuel.players[manuel.currentPlayerIndex].id).toBe("LUI");
    // …et surtout le DÉBUT de tour est identique. Avant, la voie automatique
    // rendait turnNumber=1, mana=0 et aucune pioche.
    expect(auto.turnNumber).toBe(manuel.turnNumber);
    expect(auto.players[1].mana).toBe(manuel.players[1].mana);
    expect(auto.players[1].hand.length).toBe(manuel.players[1].hand.length);
  });

  it("le joueur entrant reçoit mana, pioche et une horloge de tour NEUVE", () => {
    const avant = Date.now();
    const st = applyAction(
      applyAction(tableCauris(), { type: "end_turn" }),
      { type: "auto_resolve_pending_triggers" },
    );

    expect(st.turnNumber).toBe(2);
    expect(st.players[1].mana).toBe(5); // maxMana 4 → 5, rechargé à plein
    expect(st.players[1].hand.map((c) => c.card.name)).toContain("Piochée");
    // `turnStartedAt` restait à sa valeur d'origine (0 dans le harnais), donc
    // le chrono du joueur entrant démarrait déjà expiré.
    expect(st.turnStartedAt).toBeGreaterThanOrEqual(avant);
  });
});
