// Chant X — la seule mécanique qui adosse la puissance d'un SORT à ce que le
// lanceur tient sur le PLATEAU.
//
// Règle : si le lanceur contrôle au moins une créature portant Chant, TOUS les X
// du sort gagnent +X (et le Y des couples aussi). Binaire : une chanteuse ou
// dix, le bonus vaut X.
//
// Périmètre assumé (décision de conception) : tout X, y compris ceux qui ne sont
// pas des amplitudes — Douleur (auto-dégâts) et les compteurs plafonnés en font
// partie. Les cas correspondants sont verrouillés ici pour que le choix reste
// VISIBLE si on veut un jour le restreindre.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { MAX_EPARGNE } from "./constants";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameAction, GameState, SpellKeywordInstance } from "./types";

/** Créature dont la seule fonction est d'activer les sorts Chant. */
function chanteuse(nom = "Barde") {
  return mkInstance(mkCard({ name: nom, attack: 1, health: 4, keywords: ["chant"] as never }));
}

/** Sort porteur de `kws`, plus Chant X. */
function sortChant(x: number | null, ...kws: SpellKeywordInstance[]) {
  return mkInstance(mkCard({
    name: "Hymne", card_type: "spell", attack: null, health: null,
    spell_keywords: [
      ...kws,
      ...(x != null ? [{ id: "chant", amount: x } as SpellKeywordInstance] : []),
    ],
  }));
}

function lancer(s: GameState, spell: ReturnType<typeof sortChant>, action: Partial<GameAction> = {}): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId, ...action } as GameAction);
}

/** Plateau : une cible ennemie à 20 PV, et `chanteuses` bardes côté lanceur. */
function table(chanteuses: number) {
  const s = mkState();
  const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 }));
  s.players[1].board.push(cible);
  for (let i = 0; i < chanteuses; i++) s.players[0].board.push(chanteuse(`Barde${i}`));
  return { s, cible };
}

const pv = (st: GameState, nom = "Cible") =>
  st.players[1].board.find((c) => c.card.name === nom)!.currentHealth;

describe("Chant X — le cas de référence", () => {
  it("Impact 2 + Chant 2 inflige 4 avec une chanteuse, 2 sans", () => {
    const avec = table(1);
    const st1 = lancer(avec.s, sortChant(2, { id: "impact", amount: 2 }), { targetInstanceId: avec.cible.instanceId });
    expect(pv(st1)).toBe(16); // 20 − 4

    const sans = table(0);
    const st2 = lancer(sans.s, sortChant(2, { id: "impact", amount: 2 }), { targetInstanceId: sans.cible.instanceId });
    expect(pv(st2)).toBe(18); // 20 − 2
  });

  it("un sort SANS Chant n'est pas boosté, même entouré de chanteuses", () => {
    const { s, cible } = table(2);
    const st = lancer(s, sortChant(null, { id: "impact", amount: 2 }), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(18);
  });

  it("le bonus est BINAIRE : trois chanteuses ne valent pas plus qu'une", () => {
    const { s, cible } = table(3);
    const st = lancer(s, sortChant(2, { id: "impact", amount: 2 }), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(16); // et non 20 − (2 + 3×2)
  });
});

describe("Chant X — qui compte comme chanteuse", () => {
  it("une chanteuse ADVERSE n'active rien", () => {
    const { s, cible } = table(0);
    s.players[1].board.push(chanteuse());
    const st = lancer(s, sortChant(2, { id: "impact", amount: 2 }), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(18);
  });

  it("une chanteuse à 0 PV (cadavre pas encore balayé) n'active rien", () => {
    const { s, cible } = table(1);
    s.players[0].board[0].currentHealth = 0;
    const st = lancer(s, sortChant(2, { id: "impact", amount: 2 }), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(18);
  });
});

describe("Chant X — portée sur les effets du sort", () => {
  it("le couple X/Y est boosté DES DEUX CÔTÉS (Renforcement +1/+1 → +3/+3)", () => {
    const s = mkState();
    const allie = mkInstance(mkCard({ name: "Allié", attack: 2, health: 3 }));
    s.players[0].board.push(allie, chanteuse());
    const spell = sortChant(2, { id: "renforcement", attack: 1, health: 1 } as SpellKeywordInstance);
    const st = lancer(s, spell, { targetInstanceId: allie.instanceId });
    const a = st.players[0].board.find((c) => c.card.name === "Allié")!;
    expect([a.currentAttack, a.currentHealth]).toEqual([5, 6]); // 2+3 / 3+3
  });

  it("TOUS les effets du sort sont boostés, pas seulement le premier", () => {
    const s = mkState();
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 }));
    s.players[1].board.push(cible);
    s.players[0].board.push(chanteuse());
    s.players[0].hero.hp = 10;
    // Impact 2 (cible) + Guérison 3 (héros allié) + Chant 2 → 4 dégâts, 5 PV.
    const spell = sortChant(2,
      { id: "impact", amount: 2 },
      { id: "guerison", amount: 3 },
    );
    s.players[0].hand.push(spell);
    const st = applyAction(s, {
      type: "play_card", cardInstanceId: spell.instanceId,
      targetMap: { kw_0: cible.instanceId, kw_1: "friendly_hero" },
    });
    expect(pv(st)).toBe(16);
    expect(st.players[0].hero.hp).toBe(15);
  });

  it("les effets COMPOSÉS du sort sont boostés eux aussi", () => {
    const s = mkState();
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 }));
    s.players[1].board.push(cible);
    s.players[0].board.push(chanteuse());
    const spell = mkInstance(mkCard({
      name: "Hymne composé", card_type: "spell", attack: null, health: null,
      // Carte au modèle `capabilities` : getCapabilities IGNORE alors
      // spell_keywords (seul `keywords` est refusionné, pour les dons runtime).
      // Chant doit donc être déclaré en capacité, comme le fait la forge.
      capabilities: [
        { uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "chant", params: { x: 2 } },
        {
          uid: "cx_1", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
          composed: {
            content: "deal_damage", magnitude: { x: 3 },
            target: { entity: "unit", side: "enemy", count: "all", location: "board", designation: "automatic" },
          },
        },
      ] as unknown as Capability[],
    }));
    s.players[0].hand.push(spell);
    const st = applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });
    expect(pv(st)).toBe(15); // 20 − (3 + 2)
  });
});

describe("Chant X — instantané et étanchéité", () => {
  it("un Cataclysme qui TUE sa propre chanteuse garde son bonus", () => {
    const s = mkState();
    const barde = chanteuse();
    barde.currentHealth = 1; // le Cataclysme va l'emporter
    s.players[0].board.push(barde);
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 }));
    s.players[1].board.push(cible);

    // Cataclysme 2 + Chant 2 → 4 aux DEUX camps. La condition est figée avant la
    // phase 1 : la mort de la chanteuse en cours de résolution ne doit pas
    // rétrograder les effets suivants.
    const st = lancer(s, sortChant(2, { id: "cataclysme", amount: 2 }));

    expect(pv(st)).toBe(16);
    expect(st.players[0].graveyard.some((c) => c.card.name === "Barde")).toBe(true);
  });

  it("un râle d'agonie déclenché PAR le sort n'est pas boosté", () => {
    const s = mkState();
    s.players[0].board.push(chanteuse());
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 }));
    s.players[1].board.push(cible);
    // Créature ennemie fragile : elle meurt du sort et riposte 3 au héros
    // lanceur via un effet composé on_death. Ce 3 ne doit PAS devenir 5 —
    // settleSpellDeaths tourne pourtant à l'intérieur du withChant.
    const kamikaze = mkInstance(mkCard({
      name: "Kamikaze", attack: 1, health: 1,
      capabilities: [{
        uid: "cx_0", trigger: "on_death", effectKind: "immediate", abilityId: "_composed",
        composed: {
          content: "deal_damage", magnitude: { x: 3 },
          target: { entity: "hero", side: "enemy", count: 1, location: "board", designation: "automatic" },
        },
      }] as unknown as Capability[],
    }));
    s.players[1].board.push(kamikaze);
    const hpAvant = s.players[0].hero.hp;

    lancerCataclysme(s);

    function lancerCataclysme(state: GameState) {
      const st = lancer(state, sortChant(2, { id: "deferlement", amount: 2 }));
      // Le Déferlement boosté (4) tue le Kamikaze ; son râle frappe le héros
      // adverse — c'est-à-dire le lanceur — de 3, pas de 5.
      expect(st.players[1].graveyard.some((c) => c.card.name === "Kamikaze")).toBe(true);
      expect(st.players[0].hero.hp).toBe(hpAvant - 3);
      expect(pv(st)).toBe(16); // la cible, elle, a bien pris 4
    }
  });

  it("un sort RELANCÉ sans Chant n'hérite pas du bonus de l'englobant", () => {
    const s = mkState();
    s.players[0].board.push(chanteuse());
    const cible = mkInstance(mkCard({ name: "Cible", attack: 1, health: 20 }));
    s.players[1].board.push(cible);
    // Historique : un Impact 2 SANS Chant, déjà lancé.
    const ancien = mkCard({
      name: "Vieil Impact", card_type: "spell", attack: null, health: null,
      spell_keywords: [{ id: "impact", amount: 2 }] as SpellKeywordInstance[],
    });
    s.players[0].spellHistory = [{ card: ancien }] as never;

    // Relancer 1 + Chant 2 : le sort RELANCÉ n'a pas Chant → il inflige 2.
    // (Relancer 1 est lui-même boosté à 3 par le choix « tout X », mais
    // l'historique n'a qu'une entrée : une seule relance.)
    const st = lancer(s, sortChant(2, { id: "relancer", amount: 1 }));
    expect(pv(st)).toBe(18);
  });
});

describe("Chant X — conséquences ASSUMÉES du périmètre « tout X »", () => {
  it("Douleur est boostée elle aussi : le sort fait plus mal à SON lanceur", () => {
    const { s } = table(1);
    const hpAvant = s.players[0].hero.hp;
    const st = lancer(s, sortChant(2, { id: "douleur", amount: 1 }));
    // 1 + 2 = 3 dégâts à son propre héros. Le jour où cela pose problème, le
    // repli est un `Set` d'ids exclus dans `chanted` — rien d'autre.
    expect(st.players[0].hero.hp).toBe(hpAvant - 3);
  });

  it("Épargne boostée reste écrêtée au plafond, en silence", () => {
    const { s } = table(1);
    const st = lancer(s, sortChant(4, { id: "epargne", amount: MAX_EPARGNE }));
    expect(st.players[0].epargne).toBe(MAX_EPARGNE);
  });

  it("Chant ne se boost pas lui-même (son X EST le bonus)", () => {
    const { s, cible } = table(1);
    // Chant 2 + Chant 2 sur la même carte : le second ne doit pas lire 4.
    // getCapabilities garde les deux ; cardChantAmount prend le premier.
    const st = lancer(s, sortChant(2, { id: "impact", amount: 2 }), { targetInstanceId: cible.instanceId });
    expect(pv(st)).toBe(16); // 2 + 2, jamais 2 + 4
  });
});
