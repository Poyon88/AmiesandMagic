// Soleil X — le miroir de Lune, et son complément exact.
//
// Règle : le bonus ne tombe QUE si la carte est la PREMIÈRE jouée du tour.
// Toutes ses valeurs X/Y gagnent alors X — instantané côté sort, gravé pour
// toute la vie de l'unité côté créature.
//
// Les deux capacités partagent une seule mécanique (`TEMPO_CONDITIONS`,
// `stampTempoBonus`, `tempoBonusForCard`) : ce fichier vérifie l'inversion de la
// condition, et surtout ce que la mise en commun rend possible — une carte qui
// porte les DEUX, renforcée à tout moment mais jamais deux fois.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { getSpellKeywordDesc } from "./spell-keywords";
import { activeThresholdGlows } from "./threshold-glow";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Card, GameAction, GameState, KeywordInstance, SpellKeywordInstance } from "./types";

/** Sort portant `kws`, plus Soleil X (et éventuellement Lune ou Chant). */
function sortSoleil(
  x: number | null,
  kws: SpellKeywordInstance[],
  extra: { lune?: number; chant?: number } = {},
) {
  return mkInstance(mkCard({
    name: "Lever du jour", card_type: "spell", attack: null, health: null,
    spell_keywords: [
      ...kws,
      ...(x != null ? [{ id: "soleil", amount: x } as SpellKeywordInstance] : []),
      ...(extra.lune != null ? [{ id: "lune", amount: extra.lune } as SpellKeywordInstance] : []),
      ...(extra.chant != null ? [{ id: "chant", amount: extra.chant } as SpellKeywordInstance] : []),
    ],
  }));
}

/** Créature portant Soleil X, plus les mots-clés passés en sidecar. */
function creatureSoleil(x: number | null, instances: KeywordInstance[] = [], extra: Partial<Card> = {}) {
  const kws = [...instances.map(k => k.id), ...(x != null ? ["soleil"] : [])];
  return mkInstance(mkCard({
    name: "Griffon d'Aurore", attack: 2, health: 5,
    keywords: kws as never,
    keyword_instances: [
      ...instances,
      ...(x != null ? [{ id: "soleil", x } as KeywordInstance] : []),
    ],
    ...extra,
  }));
}

function jouer(s: GameState, inst: ReturnType<typeof mkInstance>, action: Partial<GameAction> = {}): GameState {
  s.players[0].hand.push(inst);
  return applyAction(s, { type: "play_card", cardInstanceId: inst.instanceId, ...action } as GameAction);
}

/** Plateau : une cible ennemie à 30 PV. `dejaJoue` cartes déjà jouées ce tour. */
function table(dejaJoue: number) {
  const s = mkState();
  const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 30 }));
  s.players[1].board.push(cible);
  s.players[0].cardsPlayedThisTurn = dejaJoue;
  return { s, cible };
}

const pv = (st: GameState, nom = "Cible") =>
  st.players[1].board.find((c) => c.card.name === nom)!.currentHealth;
const surPlateau = (st: GameState, nom: string) =>
  st.players[0].board.find((c) => c.card.name === nom)!;

// ─── 1. La condition, inversée ──────────────────────────────────────────────

describe("Soleil X — seule la première carte du tour est renforcée", () => {
  it("SORT : Impact 3 + Soleil 2 inflige 5 en première carte, 3 ensuite", () => {
    const premier = table(0);
    const st1 = jouer(premier.s, sortSoleil(2, [{ id: "impact", amount: 3 }]), { targetInstanceId: premier.cible.instanceId });
    expect(pv(st1)).toBe(25); // 30 − 5

    const second = table(1);
    const st2 = jouer(second.s, sortSoleil(2, [{ id: "impact", amount: 3 }]), { targetInstanceId: second.cible.instanceId });
    expect(pv(st2)).toBe(27); // 30 − 3
  });

  it("CRÉATURE : le X du sidecar n'est majoré qu'en ouverture", () => {
    const premier = table(0);
    const st1 = jouer(premier.s, creatureSoleil(2, [{ id: "resistance", x: 1 }]));
    expect(surPlateau(st1, "Griffon d'Aurore").card.keyword_instances!.find(k => k.id === "resistance")!.x).toBe(3);

    const second = table(1);
    const st2 = jouer(second.s, creatureSoleil(2, [{ id: "resistance", x: 1 }]));
    expect(surPlateau(st2, "Griffon d'Aurore").card.keyword_instances!.find(k => k.id === "resistance")!.x).toBe(1);
  });

  it("le compteur repart de zéro : une carte Soleil redevient renforçable chaque tour", () => {
    const { s, cible } = table(1);
    const st = jouer(s, sortSoleil(2, [{ id: "impact", amount: 3 }]), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(27); // 30 − 3, deuxième carte : rien

    // Tour suivant du même joueur : son compteur est remis à zéro.
    const t2 = applyAction(applyAction(st, { type: "end_turn" } as GameAction), { type: "end_turn" } as GameAction);
    expect(t2.players[t2.currentPlayerIndex].cardsPlayedThisTurn).toBe(0);
    const st2 = jouer(t2, sortSoleil(2, [{ id: "impact", amount: 3 }]), { targetInstanceId: cible.instanceId });
    expect(pv(st2)).toBe(22); // 27 − 5
  });
});

// ─── 2. Créature : le gain dure toute sa vie ────────────────────────────────

describe("Soleil X sur une créature — gain FIGÉ, et permanent", () => {
  it("Riposte est majorée durablement", () => {
    const { s } = table(0);
    const st = jouer(s, creatureSoleil(2, [{ id: "riposte", x: 1 }]));
    const pose = surPlateau(st, "Griffon d'Aurore");
    expect(pose.riposteX).toBe(3);
    expect(pose.card.keyword_instances!.find(k => k.id === "riposte")!.x).toBe(3);
  });

  it("le bloc [Résistance 1] du texte est réécrit lui aussi", () => {
    const { s } = table(0);
    const carte = mkInstance(mkCard({
      name: "Griffon muet", attack: 2, health: 5,
      keywords: ["soleil", "resistance"] as never,
      keyword_instances: [{ id: "soleil", x: 2 } as KeywordInstance],
      effect_text: "Il fend les nuées. [Résistance 1]",
    }));
    const st = jouer(s, carte);
    expect(surPlateau(st, "Griffon muet").card.effect_text).toContain("[Résistance 3]");
  });

  it("le X de Soleil lui-même n'est jamais majoré", () => {
    const { s } = table(0);
    const st = jouer(s, creatureSoleil(2, [{ id: "riposte", x: 1 }]));
    expect(surPlateau(st, "Griffon d'Aurore").card.keyword_instances!.find(k => k.id === "soleil")!.x).toBe(2);
  });

  it("rejouée en DEUXIÈME carte, elle retrouve ses valeurs d'origine", () => {
    // Le miroir du test de Lune : c'est ici la différence NÉGATIVE qui joue,
    // puisque la condition est perdue et non gagnée.
    const { s } = table(0);
    const st = jouer(s, creatureSoleil(2, [{ id: "riposte", x: 1 }]));
    const pose = surPlateau(st, "Griffon d'Aurore");
    expect(pose.riposteX).toBe(3);

    st.players[0].board = st.players[0].board.filter(c => c !== pose);
    st.players[0].cardsPlayedThisTurn = 1;
    const rejoue = jouer(st, pose);
    const repose = surPlateau(rejoue, "Griffon d'Aurore");
    expect(repose.riposteX).toBe(1);
    expect(repose.card.keyword_instances!.find(k => k.id === "riposte")!.x).toBe(1);
    expect(repose.tempoApplied ?? 0).toBe(0);
  });
});

// ─── 3. Ce que la mécanique commune rend possible ───────────────────────────

describe("Soleil ET Lune sur la même carte", () => {
  it("la première carte prend Soleil, les suivantes prennent Lune — jamais les deux", () => {
    // Soleil 2 · Lune 3 · Impact 4 → 6 en ouverture, 7 ensuite. Jamais 9.
    const premier = table(0);
    const st1 = jouer(premier.s, sortSoleil(2, [{ id: "impact", amount: 4 }], { lune: 3 }), { targetInstanceId: premier.cible.instanceId });
    expect(pv(st1)).toBe(24); // 30 − 6

    const second = table(1);
    const st2 = jouer(second.s, sortSoleil(2, [{ id: "impact", amount: 4 }], { lune: 3 }), { targetInstanceId: second.cible.instanceId });
    expect(pv(st2)).toBe(23); // 30 − 7
  });

  it("aucun des deux ne majore le X de l'autre", () => {
    const { s } = table(0);
    const st = jouer(s, creatureSoleil(2, [{ id: "lune", x: 3 } as KeywordInstance, { id: "riposte", x: 1 } as KeywordInstance]));
    const pose = surPlateau(st, "Griffon d'Aurore");
    expect(pose.card.keyword_instances!.find(k => k.id === "soleil")!.x).toBe(2);
    expect(pose.card.keyword_instances!.find(k => k.id === "lune")!.x).toBe(3);
    // Et la Riposte n'a reçu que le bonus de Soleil.
    expect(pose.riposteX).toBe(3);
  });
});

describe("Soleil X — cumul avec Chant", () => {
  it("les deux s'additionnent sans se majorer l'un l'autre", () => {
    const { s, cible } = table(0);
    s.players[0].board.push(mkInstance(mkCard({ name: "Barde", attack: 1, health: 4, keywords: ["chant"] as never })));
    const st = jouer(s, sortSoleil(2, [{ id: "impact", amount: 4 }], { chant: 3 }), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(21); // 30 − (4+2+3)
  });
});

// ─── 4. Halo et description ─────────────────────────────────────────────────

describe("Soleil X — le halo", () => {
  it("luit en ouverture de tour, et s'éteint dès qu'une carte est jouée", () => {
    const { s } = table(0);
    const sort = sortSoleil(2, [{ id: "impact", amount: 1 }]);
    const creature = creatureSoleil(2, [{ id: "riposte", x: 1 }]);
    const id = s.players[0].id;

    expect(activeThresholdGlows(sort.card, s, id).map(g => g.abilityId)).toContain("soleil");
    expect(activeThresholdGlows(creature.card, s, id).map(g => g.abilityId)).toContain("soleil");

    s.players[0].cardsPlayedThisTurn = 1;
    expect(activeThresholdGlows(sort.card, s, id).map(g => g.abilityId)).not.toContain("soleil");
    expect(activeThresholdGlows(creature.card, s, id).map(g => g.abilityId)).not.toContain("soleil");
  });

  it("les deux halos sont exactement complémentaires", () => {
    // À tout instant, une carte portant les deux en allume un et un seul.
    const { s } = table(0);
    const carte = sortSoleil(2, [{ id: "impact", amount: 1 }], { lune: 2 });
    const id = s.players[0].id;
    const actifs = (st: GameState) =>
      activeThresholdGlows(carte.card, st, id).map(g => g.abilityId).filter(a => a === "lune" || a === "soleil");

    expect(actifs(s)).toEqual(["soleil"]);
    s.players[0].cardsPlayedThisTurn = 1;
    expect(actifs(s)).toEqual(["lune"]);
  });
});

describe("Soleil X — la description", () => {
  it("ne contient qu'un seul « X », sans quoi la substitution le mangerait", () => {
    const desc = getSpellKeywordDesc({ id: "soleil", amount: 4 } as SpellKeywordInstance);
    expect(desc).toContain("4");
    expect(desc).not.toContain("X");
    expect((desc.match(/4/g) ?? []).length).toBe(1);
  });
});

// ─── Effets composés +X/+Y ──────────────────────────────────────────────────

describe("Soleil X — un buff COMPOSÉ gagne ses DEUX moitiés", () => {
  /** Créature Soleil 1 portant un buff composé sur elle-même à l'entrée. */
  function poulain(magnitude: { x?: number; y?: number }) {
    return mkInstance(mkCard({
      name: "Poulain", attack: 1, health: 1,
      keywords: ["soleil"] as never,
      keyword_instances: [{ id: "soleil", x: 1 } as KeywordInstance],
      capabilities: [
        { uid: "cw_0", trigger: "automatic", abilityId: "soleil", effectKind: "immediate", params: { x: 1 } },
        {
          uid: "cx_0", trigger: "on_play", abilityId: "_composed", effectKind: "immediate",
          composed: {
            content: "buff", magnitude,
            target: { entity: "self", count: 1, side: "ally", location: "board", designation: "automatic" },
          },
        },
      ],
    } as Parameters<typeof mkCard>[0]));
  }

  it("amplitude complète {x:0,y:0} : +1 ATK ET +1 PV", () => {
    const { s } = table(0);
    const st = jouer(s, poulain({ x: 0, y: 0 }));
    const u = st.players[0].board.find(c => c.card.name === "Poulain")!;
    expect([u.currentAttack, u.currentHealth]).toEqual([2, 2]);
  });

  it("amplitude amputée de son `y` : la défense reste au sec — d'où fillXYMagnitude", () => {
    // Le défaut d'origine, figé ici : l'éditeur affichait « Y 0 » sans jamais
    // écrire le champ, et un champ absent ne naît pas au bonus (règle voulue,
    // cf. stampTempoBonus). Le garde-fou est au contrat de sortie de la route
    // de sauvegarde, pas dans le moteur — ce test dit pourquoi il doit y être.
    const { s } = table(0);
    const st = jouer(s, poulain({ x: 0 }));
    const u = st.players[0].board.find(c => c.card.name === "Poulain")!;
    expect([u.currentAttack, u.currentHealth]).toEqual([2, 1]);
  });
});
