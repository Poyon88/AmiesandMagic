// PESTE — état « pestiférée » d'une unité.
//   • Posé par l'ACTION Peste (cible alliée ou ennemie), ou NATIF : une unité
//     qui porte la capacité entre en jeu malade.
//   • −1 PV à la fin du tour de son CONTRÔLEUR, perte directe (ni Bouclier ni
//     réduction), qui compte comme une blessure.
//   • À la mort de la pestiférée, quelle qu'en soit la cause, la maladie passe
//     à une autre unité vivante et saine, au hasard, dans les deux camps.
//     Aucune candidate ⇒ elle s'éteint.
//   • Bénédiction la retire ; Guérison non. Quitter le plateau sans mourir
//     l'éteint.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { syncHash } from "./stateHash";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, CardInstance, GameAction, GameState, Keyword } from "./types";

function unite(name: string, attack: number, health: number, keywords: string[] = []): CardInstance {
  return mkInstance(mkCard({ name, mana_cost: 0, attack, health, keywords: keywords as unknown as Keyword[] }));
}
const sortMotCle = (id: string, amount?: number) => mkInstance(mkCard({
  name: `Action ${id}`, card_type: "spell", mana_cost: 0, attack: null, health: null,
  spell_keywords: [{ id, ...(amount != null ? { amount } : {}) }] as never,
}));
/** État dont les decks ne sont pas vides (pas de fatigue en fin de tour). */
function etat(): GameState {
  const s = mkState();
  for (const p of s.players) p.deck = [unite("Pioche", 1, 1), unite("Pioche", 1, 1), unite("Pioche", 1, 1), unite("Pioche", 1, 1)];
  return s;
}
function jouer(s: GameState, carte: CardInstance, cible?: CardInstance): GameState {
  s.players[s.currentPlayerIndex].hand.push(carte);
  return applyAction(s, { type: "play_card", cardInstanceId: carte.instanceId, targetInstanceId: cible?.instanceId } as GameAction);
}
const finDeTour = (s: GameState) => applyAction(s, { type: "end_turn" } as GameAction);
const enJeu = (s: GameState) => [...s.players[0].board, ...s.players[1].board];
const trouver = (s: GameState, c: CardInstance) => enJeu(s).find((u) => u.instanceId === c.instanceId);
const pestiferees = (s: GameState) => enJeu(s).filter((u) => u.isPlagued).map((u) => u.card.name).sort();

describe("Peste — comment on l'attrape", () => {
  it("l'action rend pestiférée l'unité ENNEMIE désignée", () => {
    const s = etat();
    const cible = unite("Cible", 1, 5);
    s.players[1].board = [cible, unite("Autre", 1, 5)];
    const st = jouer(s, sortMotCle("peste"), cible);
    expect(pestiferees(st)).toEqual(["Cible"]);
    expect(trouver(st, cible)?.currentHealth).toBe(5); // rien à la pose
  });

  it("l'action peut aussi viser une unité ALLIÉE", () => {
    const s = etat();
    const mienne = unite("Mienne", 1, 5);
    s.players[0].board = [mienne];
    expect(pestiferees(jouer(s, sortMotCle("peste"), mienne))).toEqual(["Mienne"]);
  });

  it("une unité qui porte la capacité entre en jeu pestiférée", () => {
    const s = etat();
    const rat = unite("Rat", 3, 3, ["peste"]);
    const st = jouer(s, rat);
    expect(trouver(st, rat)?.isPlagued).toBe(true);
  });
});

describe("Peste — la perte de PV", () => {
  it("−1 PV à la fin du tour de son CONTRÔLEUR, pas à celle de l'adversaire", () => {
    const s = etat();
    const cible = unite("Cible", 1, 5);
    s.players[1].board = [cible];
    let st = jouer(s, sortMotCle("peste"), cible);
    st = finDeTour(st); // fin du tour de P1 : la cible est à P2, rien
    expect(trouver(st, cible)?.currentHealth).toBe(5);
    st = finDeTour(st); // fin du tour de P2
    expect(trouver(st, cible)?.currentHealth).toBe(4);
    st = finDeTour(st); // fin du tour de P1
    expect(trouver(st, cible)?.currentHealth).toBe(4);
  });

  it("une unité née pestiférée perd son PV dès la fin du tour où elle est jouée", () => {
    const s = etat();
    const rat = unite("Rat", 3, 3, ["peste"]);
    const st = finDeTour(jouer(s, rat));
    expect(trouver(st, rat)?.currentHealth).toBe(2);
  });

  it("perte directe : un Bouclier ne l'absorbe pas et n'est pas consommé", () => {
    const s = etat();
    const garde = unite("Garde", 1, 5);
    garde.hasDivineShield = true;
    garde.isPlagued = true;
    s.players[0].board = [garde];
    const st = finDeTour(s);
    expect(trouver(st, garde)?.currentHealth).toBe(4);
    expect(trouver(st, garde)?.hasDivineShield).toBe(true);
  });

  it("compte comme une blessure pour le déclencheur Blessure", () => {
    const s = etat();
    const cap: Capability = {
      uid: "w0", trigger: "on_wound", effectKind: "immediate", abilityId: "_composed", targets: [],
      composed: { content: "deal_damage", magnitude: { x: 2 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "random" } },
    };
    const ecorchee = mkInstance(mkCard({ name: "Écorchée", mana_cost: 0, attack: 0, health: 5, capabilities: [cap] }));
    ecorchee.isPlagued = true;
    s.players[0].board = [ecorchee];
    const st = finDeTour(s);
    expect(trouver(st, ecorchee)?.currentHealth).toBe(4);
    expect(st.players[1].hero.hp).toBe(s.players[1].hero.hp - 2);
  });
});

describe("Peste — la propagation", () => {
  it("morte de la Peste : la maladie passe à une autre unité", () => {
    const s = etat();
    const malade = unite("Malade", 1, 1);
    malade.isPlagued = true;
    s.players[0].board = [malade];
    s.players[1].board = [unite("Saine", 1, 5)];
    const st = finDeTour(s);
    expect(trouver(st, malade)).toBeUndefined();
    expect(pestiferees(st)).toEqual(["Saine"]);
  });

  it("morte au combat : même propagation", () => {
    const s = etat();
    const malade = unite("Malade", 1, 1);
    malade.isPlagued = true;
    const tueur = unite("Tueur", 3, 5);
    s.players[0].board = [tueur];
    s.players[1].board = [malade];
    const st = applyAction(s, { type: "attack", attackerInstanceId: tueur.instanceId, targetInstanceId: malade.instanceId } as GameAction);
    expect(trouver(st, malade)).toBeUndefined();
    expect(pestiferees(st)).toEqual(["Tueur"]);
  });

  it("morte d'une action : même propagation", () => {
    const s = etat();
    const malade = unite("Malade", 1, 2);
    malade.isPlagued = true;
    s.players[1].board = [malade];
    s.players[0].board = [unite("Témoin", 1, 5)];
    const st = jouer(s, sortMotCle("impact", 5), malade);
    expect(trouver(st, malade)).toBeUndefined();
    expect(pestiferees(st)).toEqual(["Témoin"]);
  });

  it("ne tombe jamais sur une unité déjà pestiférée", () => {
    for (let graine = 1; graine <= 12; graine++) {
      const s = etat();
      initRNG(graine);
      s.rngState = graine;
      const malade = unite("Malade", 1, 1);
      const autre = unite("Déjà", 1, 9);
      malade.isPlagued = true;
      autre.isPlagued = true;
      s.players[0].board = [malade, autre];
      s.players[1].board = [unite("Saine", 1, 9)];
      expect(pestiferees(finDeTour(s))).toEqual(["Déjà", "Saine"]);
    }
  });

  it("peut passer dans les deux camps", () => {
    const camps = new Set<string>();
    for (let graine = 1; graine <= 30; graine++) {
      const s = etat();
      s.rngState = graine;
      const malade = unite("Malade", 1, 1);
      malade.isPlagued = true;
      s.players[0].board = [malade, unite("Alliée", 1, 9)];
      s.players[1].board = [unite("Ennemie", 1, 9)];
      camps.add(pestiferees(finDeTour(s))[0]);
    }
    expect([...camps].sort()).toEqual(["Alliée", "Ennemie"]);
  });

  it("faute d'unité saine, la Peste disparaît", () => {
    const s = etat();
    const malade = unite("Malade", 1, 1);
    malade.isPlagued = true;
    s.players[0].board = [malade];
    const st = finDeTour(s);
    expect(enJeu(st)).toHaveLength(0);
    // Une unité posée ensuite est saine.
    const neuve = unite("Neuve", 1, 3);
    expect(trouver(jouer(st, neuve), neuve)?.isPlagued).toBeFalsy();
  });

  it("deux pestiférées qui meurent ensemble contaminent deux unités différentes", () => {
    const s = etat();
    const a = unite("A", 1, 1), b = unite("B", 1, 1);
    a.isPlagued = true; b.isPlagued = true;
    s.players[0].board = [a, b];
    s.players[1].board = [unite("S1", 1, 9), unite("S2", 1, 9)];
    expect(pestiferees(finDeTour(s))).toEqual(["S1", "S2"]);
  });

  it("Transcendance ne protège pas de la propagation (ce n'est pas une action)", () => {
    const s = etat();
    const malade = unite("Malade", 1, 1);
    malade.isPlagued = true;
    s.players[0].board = [malade];
    s.players[1].board = [unite("Intouchable", 1, 5, ["transcendance"])];
    expect(pestiferees(finDeTour(s))).toEqual(["Intouchable"]);
  });
});

describe("Peste — s'en débarrasser", () => {
  it("Bénédiction la retire, sans propagation", () => {
    const s = etat();
    const malade = unite("Malade", 1, 5);
    malade.isPlagued = true;
    malade.currentHealth = 2;
    s.players[0].board = [malade, unite("Voisine", 1, 5)];
    const st = jouer(s, sortMotCle("benediction"), malade);
    expect(pestiferees(st)).toEqual([]);
    expect(trouver(st, malade)?.currentHealth).toBe(5);
  });

  it("Guérison rend des PV mais laisse la Peste", () => {
    const s = etat();
    const malade = unite("Malade", 1, 5);
    malade.isPlagued = true;
    malade.currentHealth = 2;
    s.players[0].board = [malade];
    const st = jouer(s, sortMotCle("guerison", 2), malade);
    expect(trouver(st, malade)?.currentHealth).toBe(4);
    expect(pestiferees(st)).toEqual(["Malade"]);
  });

  it("renvoyée en main, elle revient saine et la Peste ne se propage pas", () => {
    const s = etat();
    const malade = unite("Malade", 1, 5);
    malade.isPlagued = true;
    s.players[1].board = [malade, unite("Voisine", 1, 5)];
    const renvoyeur = unite("Renvoyeur", 1, 1, ["remontee"]);
    const st = jouer(s, renvoyeur, malade);
    expect(pestiferees(st)).toEqual([]);
    const enMain = st.players[1].hand.find((c) => c.card.name === "Malade");
    expect(enMain).toBeDefined();
    expect(enMain?.isPlagued).toBeFalsy();
  });

  it("Silence ne la retire pas", () => {
    const s = etat();
    const malade = unite("Malade", 1, 5, ["taunt"]);
    malade.isPlagued = true;
    s.players[1].board = [malade];
    const st = jouer(s, sortMotCle("silence"), malade);
    // Le Silence a bien eu lieu (la capacité est partie), la maladie reste.
    expect((trouver(st, malade)?.card.keywords as unknown as string[]) ?? ["?"]).not.toContain("taunt");
    expect(pestiferees(st)).toEqual(["Malade"]);
  });
});

describe("Peste — Résurrection", () => {
  it("contaminée par une action : elle ressuscite saine, la Peste est partie ailleurs", () => {
    const s = etat();
    const phenix = unite("Phénix", 1, 1, ["resurrection"]);
    phenix.isPlagued = true;
    s.players[0].board = [phenix];
    s.players[1].board = [unite("Saine", 1, 5)];
    const st = finDeTour(s);
    const revenue = st.players[0].board.find((u) => u.card.name === "Phénix");
    expect(revenue).toBeDefined();
    expect(revenue?.isPlagued).toBeFalsy();
    expect(pestiferees(st)).toEqual(["Saine"]);
  });

  it("née pestiférée : elle ressuscite malade, et la Peste s'est quand même propagée", () => {
    const s = etat();
    const rat = unite("Rat", 1, 1, ["peste", "resurrection"]);
    s.players[0].board = [rat];
    s.players[1].board = [unite("Saine", 1, 5)];
    const st = finDeTour(s);
    expect(pestiferees(st)).toEqual(["Rat", "Saine"]);
  });
});

describe("Peste — synchronisation", () => {
  it("deux clients obtiennent le même état", () => {
    const partie = () => {
      const s = etat();
      s.rngState = 42;
      const malade = unite("Malade", 1, 1);
      malade.isPlagued = true;
      s.players[0].board = [malade, unite("A", 1, 9)];
      s.players[1].board = [unite("B", 1, 9), unite("C", 1, 9)];
      return pestiferees(finDeTour(s));
    };
    expect(partie()).toEqual(partie());
  });

  it("l'état entre dans le hash de synchro", () => {
    const s = etat();
    const u = unite("U", 1, 5);
    s.players[0].board = [u];
    const sain = syncHash(s);
    u.isPlagued = true;
    expect(syncHash(s)).not.toBe(sain);
  });
});

describe("Peste — barème", () => {
  // Un seul coût par capacité au barème : handicap pour l'unité née
  // pestiférée, même ampleur en positif pour l'action qui l'inflige.
  it("retire des points à une unité, en ajoute à une action", async () => {
    const { scoreCarte } = await import("@/lib/card-engine/card-points");
    const { BAREME_CALIBRE } = await import("@/lib/card-engine/bareme");
    const points = (c: Parameters<typeof scoreCarte>[1]) => scoreCarte(BAREME_CALIBRE, c).utilise;
    const nue = mkCard({ name: "Nue", mana_cost: 3, attack: 3, health: 3, rarity: "Commune" } as never);
    const malade = mkCard({ name: "Rat", mana_cost: 3, attack: 3, health: 3, rarity: "Commune", keywords: ["peste"] as never } as never);
    expect(points(malade)).toBeLessThan(points(nue));
    const vide = mkCard({ name: "Vide", card_type: "spell", mana_cost: 2, attack: null, health: null, rarity: "Commune" } as never);
    const action = mkCard({ name: "Miasme", card_type: "spell", mana_cost: 2, attack: null, health: null, rarity: "Commune", spell_keywords: [{ id: "peste" }] as never } as never);
    expect(points(action)).toBeGreaterThan(points(vide));
  });
});
