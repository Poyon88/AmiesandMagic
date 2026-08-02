// INVARIANT DE PLATEAU : après n'importe quelle action, aucune unité à 0 PV ne
// doit rester en jeu.
//
// Ce fichier existe parce que la même panne est survenue trois fois en un jour,
// sur trois chemins différents : effet à la pioche, pouvoir de tap curé
// (Baliste à Répétition), résolution de sort. À chaque fois la cause était
// identique — le site qui résout l'effet oubliait de balayer les morts — et le
// symptôme muet : pas d'exception, pas de log, juste une créature fantôme
// affichée à 0 PV que plus rien ne peut tuer.
//
// Deux garde-fous ici :
//   1. un scénario LÉTAL par type d'action capable d'infliger des dégâts, qui
//      vérifie l'invariant après coup ;
//   2. une table de couverture typée `Record<GameAction["type"], …>` : ajouter
//      un type d'action au moteur casse la compilation tant qu'on ne l'a pas
//      classé ici. C'est ce second point qui ferme la CLASSE de bugs plutôt que
//      les cas un par un.
//
// Chaque scénario prouve d'abord qu'il a réellement TUÉ quelque chose. Sans
// cette vérification, un scénario qui « fizzle » (cible manquée, effet inerte)
// validerait l'invariant à vide — exactement le faux positif qui a déjà masqué
// un de ces bugs.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type {
  Capability, ComposedEffect, GameAction, GameState, HeroDefinition, SpellKeywordInstance,
} from "./types";

// ─── Table de couverture (exhaustivité garantie par le compilateur) ─────────
type Couverture =
  /** L'action peut infliger des dégâts → un scénario létal est exigé. */
  | "létal"
  /** L'action ne peut tuer personne → rien à couvrir ici. */
  | "sans dégâts";

const COUVERTURE: Record<GameAction["type"], Couverture> = {
  play_card: "létal",
  attack: "létal",
  end_turn: "létal",
  hero_power: "létal",
  tap_activate: "létal",
  resolve_pending_trigger: "létal",
  auto_resolve_pending_triggers: "létal",
  // Aucun de ces trois ne touche aux PV d'une unité : le mulligan échange des
  // cartes, l'Épargne ajoute une carte en main, la concession termine la partie.
  mulligan: "sans dégâts",
  spend_epargne: "sans dégâts",
  concede: "sans dégâts",
};

// ─── Outillage ──────────────────────────────────────────────────────────────
function attendAucunCadavre(st: GameState, contexte: string) {
  for (const [i, p] of st.players.entries()) {
    const cadavres = p.board
      .filter(c => c.currentHealth <= 0)
      .map(c => `${c.card.name} (${c.currentHealth} PV)`);
    expect(cadavres, `${contexte} — plateau du joueur ${i}`).toEqual([]);
  }
}

function estAuCimetiere(st: GameState, nom: string): boolean {
  return st.players.some(p => p.graveyard.some(c => c.card.name === nom));
}

function capComposee(trigger: Capability["trigger"], composed: ComposedEffect): Capability {
  return { uid: "cx_0", trigger, effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** Victime standard : 2 PV, meurt à 3 dégâts. */
const VICTIME = "Victime";
const victime = () => mkInstance(mkCard({ name: VICTIME, attack: 1, health: 2 }));

interface Scenario {
  /** Type d'action réellement exercé (dernier appel applyAction du scénario). */
  type: GameAction["type"];
  nom: string;
  jouer: () => GameState;
}

const SCENARIOS: Scenario[] = [
  {
    type: "play_card",
    nom: "sort Impact 3 sur une créature à 2 PV",
    jouer: () => {
      const s = mkState();
      const cible = victime();
      s.players[1].board.push(cible);
      const sort = mkInstance(mkCard({
        name: "Éclair", card_type: "spell", attack: null, health: null,
        spell_keywords: [{ id: "impact", amount: 3 }] as SpellKeywordInstance[],
      }));
      s.players[0].hand.push(sort);
      return applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId, targetInstanceId: cible.instanceId });
    },
  },
  {
    type: "attack",
    nom: "combat : 3/3 abat une 1/2",
    jouer: () => {
      const s = mkState();
      const att = mkInstance(mkCard({ name: "Assaillant", attack: 3, health: 3 }));
      att.hasSummoningSickness = false;
      s.players[0].board.push(att);
      const cible = victime();
      s.players[1].board.push(cible);
      return applyAction(s, { type: "attack", attackerInstanceId: att.instanceId, targetInstanceId: cible.instanceId });
    },
  },
  {
    type: "tap_activate",
    nom: "pouvoir activé CURÉ (Impact 3 au tap)",
    jouer: () => {
      const s = mkState();
      const src = mkInstance(mkCard({
        name: "Baliste", attack: 0, health: 5,
        keywords: ["impact"] as never,
        keyword_instances: [{ id: "impact", x: 3, mode: "tap" } as never],
      }));
      src.hasSummoningSickness = false;
      s.players[0].board.push(src);
      const cible = victime();
      s.players[1].board.push(cible);
      return applyAction(s, {
        type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
        targetInstanceId: cible.instanceId,
      });
    },
  },
  {
    type: "tap_activate",
    nom: "pouvoir activé COMPOSÉ",
    jouer: () => {
      const s = mkState();
      const src = mkInstance(mkCard({
        name: "Canon", attack: 0, health: 5,
        capabilities: [capComposee("on_activation", {
          content: "deal_damage", magnitude: { x: 3 },
          target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" },
        })],
      }));
      src.hasSummoningSickness = false;
      s.players[0].board.push(src);
      s.players[1].board.push(victime());
      return applyAction(s, {
        type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0,
        composedUid: "cx_0",
      });
    },
  },
  {
    type: "hero_power",
    nom: "pouvoir de héros (Impact 3)",
    jouer: () => {
      const s = mkState();
      s.players[0].hero.heroDefinition = {
        id: 1, name: "Héros", race: "humans", powerName: "Foudre", powerCost: 0,
        powerEffect: { mode: "spell_trigger", keywordId: "impact", params: { amount: 3 } },
        powerDescription: "",
      } as unknown as HeroDefinition;
      const cible = victime();
      s.players[1].board.push(cible);
      return applyAction(s, { type: "hero_power", targetInstanceId: cible.instanceId });
    },
  },
  {
    type: "end_turn",
    nom: "effet composé de fin de tour (cible au hasard)",
    jouer: () => {
      const s = mkState();
      s.players[0].board.push(mkInstance(mkCard({
        name: "Brasier", attack: 1, health: 4,
        capabilities: [capComposee("on_end_of_turn", {
          content: "deal_damage", magnitude: { x: 3 },
          target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" },
        })],
      })));
      s.players[1].board.push(victime());
      s.players[0].deck = [mkInstance(mkCard({ name: "D0" }))];
      s.players[1].deck = [mkInstance(mkCard({ name: "D1" }))];
      return applyAction(s, { type: "end_turn" });
    },
  },
  {
    type: "end_turn",
    nom: "effet à la PIOCHE (résolu pendant le début de tour adverse)",
    jouer: () => {
      const s = mkState();
      s.players[0].board.push(victime());
      s.players[1].deck = [mkInstance(mkCard({
        name: "Présage", card_type: "spell", attack: null, health: null,
        capabilities: [capComposee("on_draw", {
          content: "deal_damage", magnitude: { x: 3 },
          target: { entity: "unit", count: "all", side: "enemy", location: "board", designation: "random" },
        })],
      }))];
      s.players[0].deck = [mkInstance(mkCard({ name: "D0" }))];
      return applyAction(s, { type: "end_turn" });
    },
  },
  {
    type: "resolve_pending_trigger",
    nom: "déclencheur en attente résolu sur une cible choisie",
    jouer: () => {
      const s = mkState();
      s.players[0].board.push(mkInstance(mkCard({
        name: "Oracle", attack: 1, health: 4,
        capabilities: [capComposee("on_end_of_turn", {
          content: "deal_damage", magnitude: { x: 3 },
          target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
        })],
      })));
      const cible = victime();
      s.players[1].board.push(cible);
      s.players[0].deck = [mkInstance(mkCard({ name: "D0" }))];
      s.players[1].deck = [mkInstance(mkCard({ name: "D1" }))];
      const st = applyAction(s, { type: "end_turn" });
      return applyAction(st, {
        type: "resolve_pending_trigger",
        triggerId: st.pendingTriggers![0].id,
        targetInstanceId: cible.instanceId,
      });
    },
  },
  {
    type: "auto_resolve_pending_triggers",
    nom: "repli automatique du chrono sur un déclencheur en attente",
    jouer: () => {
      const s = mkState();
      initRNG(11);
      s.players[0].board.push(mkInstance(mkCard({
        name: "Oracle", attack: 1, health: 4,
        capabilities: [capComposee("on_end_of_turn", {
          content: "deal_damage", magnitude: { x: 3 },
          target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" },
        })],
      })));
      s.players[1].board.push(victime());
      s.players[0].deck = [mkInstance(mkCard({ name: "D0" }))];
      s.players[1].deck = [mkInstance(mkCard({ name: "D1" }))];
      const st = applyAction(s, { type: "end_turn" });
      return applyAction(st, { type: "auto_resolve_pending_triggers" });
    },
  },
];

// ─── Les tests ──────────────────────────────────────────────────────────────
describe("invariant — aucune unité à 0 PV ne survit à une action", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.type} — ${sc.nom}`, () => {
      const st = sc.jouer();
      // 1. Le scénario a-t-il vraiment tué ? Sans ça, l'invariant serait
      //    vérifié à vide et le test ne protégerait plus rien.
      expect(estAuCimetiere(st, VICTIME), `${sc.nom} : la victime n'est pas morte, le scénario ne prouve rien`).toBe(true);
      // 2. L'invariant lui-même.
      attendAucunCadavre(st, sc.nom);
    });
  }

  it("chaque type d'action pouvant tuer possède au moins un scénario", () => {
    // Le vrai garde-fou : la table COUVERTURE est un Record sur
    // `GameAction["type"]`, donc ajouter une action au moteur casse `tsc` tant
    // qu'elle n'y figure pas. Ce test complète en exigeant qu'une action
    // classée « létal » soit effectivement exercée ci-dessus.
    const exerces = new Set(SCENARIOS.map(s => s.type));
    const manquants = (Object.entries(COUVERTURE) as [GameAction["type"], Couverture][])
      .filter(([type, kind]) => kind === "létal" && !exerces.has(type))
      .map(([type]) => type);
    expect(manquants, "types d'action létaux sans scénario d'invariant").toEqual([]);
  });
});
