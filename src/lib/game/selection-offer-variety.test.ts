// Le tirage d'une SÉLECTION doit changer d'une activation à l'autre.
//
// Signalé en partie avec « Esprit aux Mille Perles » (Sélection 3 en fin de
// tour) : la modale proposait éternellement les 3 mêmes cartes.
//
// Cause : le chemin COMPOSÉ construit un GameState synthétique pour interroger
// le pool, et ce state n'avait pas de `turnNumber`. Or c'est la seule part du
// germe de tirage qui bouge vraiment d'une activation à l'autre. Le mode de
// défaillance est particulièrement discret : `undefined * 1000` donne NaN, et
// `NaN & 0xfffffff` vaut 0 — le pseudo-RNG rend alors 0 à chaque appel, ce qui
// produit une permutation parfaitement valide… et constante. Aucune erreur,
// aucun log, juste un « aléatoire » gelé.
import { describe, expect, it } from "vitest";
import { applyAction, getSelectionCards } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, ComposedEffect, GameState } from "./types";

/** Pool de communes assez large pour qu'un tirage figé se voie. */
function poolCommunes(n: number): Card[] {
  return Array.from({ length: n }, (_, i) => mkCard({
    id: 5000 + i, name: `Pool${i}`, mana_cost: (i % 3) + 1,
    rarity: "Commune", faction: "Nains", card_type: "creature",
  }));
}

function capSelection(x: number): Capability {
  const composed: ComposedEffect = { content: "selection", magnitude: { x } };
  return { uid: "cx_0", trigger: "on_end_of_turn", effectKind: "immediate", abilityId: "_composed", composed, targets: [] };
}

/** P0 contrôle un porteur de « Sélection 3 » déclenchée en fin de tour. */
function etat(): GameState {
  const s = mkState();
  s.factionCardPool = poolCommunes(60);
  s.allSpellsPool = [];
  s.players[0].board.push(mkInstance(mkCard({
    name: "Esprit aux Mille Perles", attack: 2, health: 3,
    faction: "Nains", capabilities: [capSelection(3)],
  })));
  s.players[0].deck = Array.from({ length: 10 }, (_, i) => mkInstance(mkCard({ name: `D${i}` })));
  s.players[1].deck = Array.from({ length: 10 }, (_, i) => mkInstance(mkCard({ name: `E${i}` })));
  return s;
}

/** Ids proposés par le déclencheur de Sélection en attente, s'il y en a un. */
function offre(st: GameState): number[] {
  const t = st.pendingTriggers?.find(p => p.selectionType);
  return t?.selectionOptionIds ?? [];
}

/** Passe le tour de P0 (déclenche sa fin de tour), puis rend la main à P0 en
 *  résolvant la sélection et en terminant le tour de P1. */
function tourComplet(st: GameState): GameState {
  let s = applyAction(st, { type: "end_turn" });
  const t = s.pendingTriggers?.find(p => p.selectionType);
  if (t) {
    s = applyAction(s, {
      type: "resolve_pending_trigger", triggerId: t.id,
      selectionCardId: t.selectionOptionIds![0],
    });
  }
  return applyAction(s, { type: "end_turn" }); // tour de P1 → la main revient à P0
}

describe("Sélection — le tirage varie d'une activation à l'autre", () => {
  it("deux tours consécutifs ne proposent pas la MÊME offre", () => {
    let s = etat();

    s = applyAction(s, { type: "end_turn" });
    const offre1 = offre(s);
    expect(offre1.length, "la sélection doit proposer des cartes").toBeGreaterThan(0);

    // On résout, on laisse P1 jouer, et on revient à la fin de tour de P0.
    const t = s.pendingTriggers!.find(p => p.selectionType)!;
    s = applyAction(s, { type: "resolve_pending_trigger", triggerId: t.id, selectionCardId: offre1[0] });
    s = applyAction(s, { type: "end_turn" });
    s = applyAction(s, { type: "end_turn" });
    const offre2 = offre(s);

    expect(offre2.length).toBeGreaterThan(0);
    expect(offre2, "offre identique au tour suivant → tirage gelé").not.toEqual(offre1);
  });

  it("trois activations donnent au moins deux offres distinctes", () => {
    // Deux tirages peuvent coïncider par hasard ; trois offres toutes égales,
    // non — c'est la signature du germe figé.
    let s = etat();
    const offres: string[] = [];
    for (let i = 0; i < 3; i++) {
      s = applyAction(s, { type: "end_turn" });
      offres.push(offre(s).join(","));
      const t = s.pendingTriggers?.find(p => p.selectionType);
      if (t) {
        s = applyAction(s, {
          type: "resolve_pending_trigger", triggerId: t.id,
          selectionCardId: t.selectionOptionIds![0],
        });
      }
      s = applyAction(s, { type: "end_turn" }); // tour de P1
    }
    expect(new Set(offres).size, `offres : ${offres.join(" | ")}`).toBeGreaterThan(1);
  });
});

describe("getSelectionCards — le germe dépend bien du tour", () => {
  it("deux tours différents donnent des offres différentes", () => {
    const base = mkState();
    base.players[0].hand = [mkInstance(mkCard({ name: "H" }))];
    const synth = (turnNumber: number) => ({
      factionCardPool: poolCommunes(60), allSpellsPool: [],
      players: base.players, currentPlayerIndex: 0, turnNumber,
    } as unknown as GameState);
    const src = { faction: "Nains", card_alignment: null };

    const a = getSelectionCards(synth(3), 3, src).map(c => c.id);
    const b = getSelectionCards(synth(4), 3, src).map(c => c.id);
    expect(a).not.toEqual(b);
  });

  it("le MÊME tour redonne la même offre (déterminisme entre les deux clients)", () => {
    // L'autre moitié du contrat : le tirage ne consomme pas la RNG partagée, il
    // est reproductible — les deux clients doivent voir les mêmes 3 cartes.
    const base = mkState();
    const synth = () => ({
      factionCardPool: poolCommunes(60), allSpellsPool: [],
      players: base.players, currentPlayerIndex: 0, turnNumber: 7,
    } as unknown as GameState);
    const src = { faction: "Nains", card_alignment: null };

    expect(getSelectionCards(synth(), 3, src).map(c => c.id))
      .toEqual(getSelectionCards(synth(), 3, src).map(c => c.id));
  });
});
