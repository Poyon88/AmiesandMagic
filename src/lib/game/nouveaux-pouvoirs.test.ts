// Cinq pouvoirs ajoutés en lot : Seconde vie, Incinération, Dévoration,
// Creuser, Retour différé. Un describe par pouvoir.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CardInstance, GameState } from "./types";

const inst = (name: string, opts: Record<string, unknown> = {}) =>
  mkInstance(mkCard({ name, attack: 2, health: 2, mana_cost: 1, ...opts }));

const noms = (l: CardInstance[]) => l.map((c) => c.card.name);

// ── 1. SECONDE VIE ─────────────────────────────────────────────────────────

// Une créature au cimetière y est arrivée MORTE : `currentHealth <= 0` et
// `diedOnTurn` gravé par cleanDeadCreatures. Le harnais, lui, fabrique une
// instance neuve et intacte — et c'est précisément ce décalage qui a laissé
// passer le défaut : la Seconde vie posait la créature avec ses 0 PV, le
// balayage de fin d'invocation la renvoyait aussitôt au cimetière, et tous les
// tests passaient. On enterre donc pour de bon.
function creatureSecondeVie(x: number, extra: Record<string, unknown> = {}): CardInstance {
  const c = mkInstance(mkCard({
    name: "Revenante", mana_cost: 7, attack: 3, health: 3,
    keywords: ["seconde_vie"], keyword_instances: [{ id: "seconde_vie", x }] as never,
    effect_text: `[Seconde vie ${x}]`, ...extra,
  }));
  c.currentHealth = 0;
  c.diedOnTurn = 1;
  return c;
}

describe("Seconde vie — jouer depuis le cimetière", () => {
  it("invoque la créature pour son coût alternatif, pas son coût normal", () => {
    const s = mkState();
    const c = creatureSecondeVie(2);
    s.players[0].graveyard.push(c);
    s.players[0].mana = 3; // < 7 (coût normal), ≥ 2 (Seconde vie)

    const next = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true });

    expect(noms(next.players[0].board)).toContain("Revenante");
    expect(noms(next.players[0].graveyard)).not.toContain("Revenante");
    expect(next.players[0].mana).toBe(1); // 3 − 2
  });

  it("revient en jeu VIVANTE, avec ses PV restaurés", () => {
    const s = mkState();
    const c = creatureSecondeVie(2); // 3/3, morte à 0 PV au cimetière
    s.players[0].graveyard.push(c);
    s.players[0].mana = 3;

    const next = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true });
    const en_jeu = next.players[0].board.find((x) => x.card.name === "Revenante");

    expect(en_jeu).toBeDefined();
    expect(en_jeu!.currentHealth).toBe(3);
    expect(en_jeu!.diedOnTurn).toBeNull();
  });

  it("la créature PERD Seconde vie une fois ressuscitée", () => {
    const s = mkState();
    const c = creatureSecondeVie(2);
    s.players[0].graveyard.push(c);

    const next = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true });
    const en_jeu = next.players[0].board.find((x) => x.card.name === "Revenante")!;

    expect(en_jeu.card.keywords).not.toContain("seconde_vie");
    expect(en_jeu.card.keyword_instances ?? []).toEqual([]);
  });

  it("déclenche les effets d'arrivée en jeu comme depuis la main", () => {
    const s = mkState();
    // Épargne 3 en plus : si l'effet d'entrée ne se déclenchait pas, le
    // compteur resterait à null.
    const c = creatureSecondeVie(2, {
      keywords: ["seconde_vie", "epargne"],
      keyword_instances: [{ id: "seconde_vie", x: 2 }, { id: "epargne", x: 3 }] as never,
    });
    s.players[0].graveyard.push(c);

    const next = applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true });
    expect(next.players[0].epargne).toBe(3);
  });

  it("refuse une créature du cimetière SANS Seconde vie", () => {
    const s = mkState();
    const c = inst("Quelconque");
    s.players[0].graveyard.push(c);
    expect(applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true })).toBe(s);
  });

  it("refuse si le mana ne couvre pas le coût alternatif", () => {
    const s = mkState();
    const c = creatureSecondeVie(5);
    s.players[0].graveyard.push(c);
    s.players[0].mana = 4;
    expect(applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true })).toBe(s);
  });

  it("ne permet pas de piocher dans le cimetière ADVERSE", () => {
    const s = mkState();
    const c = creatureSecondeVie(2);
    s.players[1].graveyard.push(c);
    expect(applyAction(s, { type: "play_card", cardInstanceId: c.instanceId, fromGraveyard: true })).toBe(s);
  });
});

// ── 2. INCINÉRATION ────────────────────────────────────────────────────────

function stateAvecCimetieres(): GameState {
  const s = mkState();
  for (let i = 0; i < 4; i++) s.players[0].graveyard.push(inst(`Mien${i}`));
  for (let i = 0; i < 4; i++) s.players[1].graveyard.push(inst(`Sien${i}`));
  return s;
}

function sortIncineration(x: number): CardInstance {
  return mkInstance(mkCard({
    name: "Brasier", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "incineration", amount: x }] as never,
  }));
}

describe("Incinération — recycler un cimetière sous son deck", () => {
  it("vise le cimetière ADVERSE quand on cible le héros adverse", () => {
    const s = stateAvecCimetieres();
    s.players[0].hand.push(sortIncineration(2));
    const sortId = s.players[0].hand[0].instanceId;

    const next = applyAction(s, { type: "play_card", cardInstanceId: sortId, targetInstanceId: "enemy_hero" });

    expect(next.players[1].graveyard).toHaveLength(2);
    expect(next.players[1].deck).toHaveLength(2);
    // 4 d'origine + le sort lui-même, qui rejoint le cimetière après résolution.
    expect(next.players[0].graveyard).toHaveLength(5);
  });

  it("vise SON PROPRE cimetière quand on cible son héros", () => {
    const s = stateAvecCimetieres();
    s.players[0].hand.push(sortIncineration(3));
    const sortId = s.players[0].hand[0].instanceId;

    const next = applyAction(s, { type: "play_card", cardInstanceId: sortId, targetInstanceId: "friendly_hero" });

    // 4 − 3 recyclées = 1, + le sort une fois résolu. Le sort n'est donc PAS
    // recyclable par sa propre Incinération : il arrive au cimetière après.
    expect(next.players[0].graveyard).toHaveLength(2);
    expect(next.players[0].deck).toHaveLength(3);
    expect(next.players[1].graveyard).toHaveLength(4);
  });

  it("place les cartes SOUS le deck, jamais dessus", () => {
    const s = stateAvecCimetieres();
    s.players[1].deck.push(inst("DejaLa"));
    s.players[0].hand.push(sortIncineration(1));
    const sortId = s.players[0].hand[0].instanceId;

    const next = applyAction(s, { type: "play_card", cardInstanceId: sortId, targetInstanceId: "enemy_hero" });

    expect(next.players[1].deck[0].card.name).toBe("DejaLa"); // le dessus n'a pas bougé
    expect(next.players[1].deck).toHaveLength(2);
  });

  it("se contente du cimetière disponible s'il est plus petit que X", () => {
    const s = mkState();
    s.players[1].graveyard.push(inst("Unique"));
    s.players[0].hand.push(sortIncineration(5));
    const sortId = s.players[0].hand[0].instanceId;

    const next = applyAction(s, { type: "play_card", cardInstanceId: sortId, targetInstanceId: "enemy_hero" });

    expect(next.players[1].graveyard).toHaveLength(0);
    expect(next.players[1].deck).toHaveLength(1);
  });
});

// ── 3. DÉVORATION ──────────────────────────────────────────────────────────

describe("Dévoration — détruire et absorber", () => {
  const devoreur = () => mkInstance(mkCard({
    name: "Gloutonne", mana_cost: 4, attack: 2, health: 3, keywords: ["devoration"],
  }));

  it("tue la cible et en absorbe définitivement ATK et PV", () => {
    const s = mkState();
    const proie = inst("Proie", { attack: 4, health: 5 });
    s.players[1].board.push(proie);
    const d = devoreur();
    s.players[0].hand.push(d);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: d.instanceId, targetInstanceId: proie.instanceId,
    });

    expect(noms(next.players[1].board)).not.toContain("Proie");
    const g = next.players[0].board.find((c) => c.card.name === "Gloutonne")!;
    expect(g.currentAttack).toBe(2 + 4);
    expect(g.currentHealth).toBe(3 + 5);
    expect(g.maxHealth).toBe(3 + 5);
  });

  it("absorbe les stats COURANTES, buffs compris", () => {
    const s = mkState();
    const proie = inst("Enflée", { attack: 1, health: 1 });
    proie.currentAttack = 6;
    proie.currentHealth = 7;
    s.players[1].board.push(proie);
    const d = devoreur();
    s.players[0].hand.push(d);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: d.instanceId, targetInstanceId: proie.instanceId,
    });
    const g = next.players[0].board.find((c) => c.card.name === "Gloutonne")!;
    expect(g.currentAttack).toBe(2 + 6);
  });

  it("ne se dévore pas elle-même", () => {
    const s = mkState();
    const d = devoreur();
    s.players[0].hand.push(d);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: d.instanceId, targetInstanceId: d.instanceId,
    });
    const g = next.players[0].board.find((c) => c.card.name === "Gloutonne")!;
    expect(g.currentAttack).toBe(2); // inchangée
    expect(g.currentHealth).toBe(3);
  });
});

// ── 4. CREUSER ─────────────────────────────────────────────────────────────

describe("Creuser — remonter une carte du fond du deck", () => {
  const sortCreuser = (x: number) => mkInstance(mkCard({
    name: "Fouille", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "creuser", amount: x }] as never,
  }));

  function stateDeck(): GameState {
    const s = mkState();
    for (const n of ["A", "B", "C", "D", "E"]) s.players[0].deck.push(inst(n));
    return s;
  }

  it("remonte sur le DESSUS la carte choisie parmi celles du fond", () => {
    const s = stateDeck();
    const sort = sortCreuser(3); // fond = C, D, E
    s.players[0].hand.push(sort);

    // index 1 dans la tranche révélée [C, D, E] → D
    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, targetMap: { creuser_0: "1" },
    });

    expect(next.players[0].deck[0].card.name).toBe("D");
    expect(next.players[0].deck).toHaveLength(5); // rien n'est perdu
  });

  it("renvoie les cartes NON choisies au fond, dans l'ordre", () => {
    const s = stateDeck();
    const sort = sortCreuser(3);
    s.players[0].hand.push(sort);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, targetMap: { creuser_0: "1" },
    });

    expect(noms(next.players[0].deck)).toEqual(["D", "A", "B", "C", "E"]);
  });

  it("sans choix explicite, remonte la première carte révélée", () => {
    const s = stateDeck();
    const sort = sortCreuser(2); // fond = D, E
    s.players[0].hand.push(sort);

    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
    expect(next.players[0].deck[0].card.name).toBe("D");
  });

  it("ne casse pas sur un deck plus court que X", () => {
    const s = mkState();
    s.players[0].deck.push(inst("Seule"));
    const sort = sortCreuser(5);
    s.players[0].hand.push(sort);

    const next = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId });
    expect(noms(next.players[0].deck)).toEqual(["Seule"]);
  });
});

// ── 5. RETOUR DIFFÉRÉ ──────────────────────────────────────────────────────

describe("Retour différé — sous le deck de son propriétaire", () => {
  const sortRetour = () => mkInstance(mkCard({
    name: "Sablier", card_type: "spell", attack: null, health: null, mana_cost: 1,
    spell_keywords: [{ id: "retour_differe" }] as never,
  }));

  it("place l'unité ADVERSE sous le deck adverse", () => {
    const s = mkState();
    const cible = inst("Intruse");
    s.players[1].board.push(cible);
    s.players[1].deck.push(inst("Dessus"));
    const sort = sortRetour();
    s.players[0].hand.push(sort);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, targetInstanceId: cible.instanceId,
    });

    expect(noms(next.players[1].board)).not.toContain("Intruse");
    expect(next.players[1].deck[next.players[1].deck.length - 1].card.name).toBe("Intruse");
    expect(next.players[1].deck[0].card.name).toBe("Dessus"); // le dessus est intact
  });

  it("fonctionne aussi sur SES PROPRES unités", () => {
    const s = mkState();
    const mienne = inst("Alliée");
    s.players[0].board.push(mienne);
    const sort = sortRetour();
    s.players[0].hand.push(sort);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, targetInstanceId: mienne.instanceId,
    });

    expect(noms(next.players[0].board)).not.toContain("Alliée");
    expect(noms(next.players[0].deck)).toContain("Alliée");
  });

  it("renvoie l'unité VOLÉE dans le deck de son vrai propriétaire", () => {
    const s = mkState();
    const volee = inst("Captive");
    volee.trueOwnerId = s.players[1].id; // prise par Domination
    s.players[0].board.push(volee);
    const sort = sortRetour();
    s.players[0].hand.push(sort);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: sort.instanceId, targetInstanceId: volee.instanceId,
    });

    expect(noms(next.players[1].deck)).toContain("Captive");
    expect(noms(next.players[0].deck)).not.toContain("Captive");
  });
});

// ── Formes composées ───────────────────────────────────────────────────────

describe("formes composées", () => {
  const porteur = (composed: Record<string, unknown>) => mkInstance(mkCard({
    name: "Grimoire", card_type: "spell", attack: null, health: null, mana_cost: 1,
    capabilities: [{
      uid: "cx_0", abilityId: "_composed", effectKind: "immediate",
      trigger: "spell_resolution", composed,
    }] as never,
  }));

  it("Incinération composée vise le camp indiqué par target.side", () => {
    const s = stateAvecCimetieres();
    const p = porteur({
      content: "incineration", magnitude: { x: 2 },
      target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "automatic" },
    });
    s.players[0].hand.push(p);

    const next = applyAction(s, { type: "play_card", cardInstanceId: p.instanceId });
    expect(next.players[1].graveyard).toHaveLength(2);
    expect(next.players[1].deck).toHaveLength(2);
  });

  it("Retour différé composé place la cible sous le deck de son propriétaire", () => {
    const s = mkState();
    const cible = inst("Visée");
    s.players[1].board.push(cible);
    const p = porteur({
      content: "retour_differe",
      target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "automatic" },
    });
    s.players[0].hand.push(p);

    const next = applyAction(s, { type: "play_card", cardInstanceId: p.instanceId });
    expect(noms(next.players[1].board)).not.toContain("Visée");
    expect(noms(next.players[1].deck)).toContain("Visée");
  });

  it("Dévoration composée portée par un SORT ne détruit rien (pas de source)", () => {
    const s = mkState();
    const cible = inst("Épargnée");
    s.players[1].board.push(cible);
    const p = porteur({
      content: "devoration",
      target: { entity: "unit", count: 1, side: "enemy", location: "board", designation: "automatic" },
    });
    s.players[0].hand.push(p);

    const next = applyAction(s, { type: "play_card", cardInstanceId: p.instanceId });
    // Sans porteur pour absorber les stats, l'effet s'abstient plutôt que de
    // se transformer en simple destruction.
    expect(noms(next.players[1].board)).toContain("Épargnée");
  });
});
