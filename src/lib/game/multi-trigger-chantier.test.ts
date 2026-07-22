// Chantier « tous déclencheurs » : les effets d'invocation sont rejouables
// depuis mort / attaque / retour / fin de tour / activation. Règles :
//   - pouvoir ciblé déclenché pendant le tour ADVERSE → cible au hasard ;
//   - sur le tour du contrôleur → picker différé (pendingTriggers) ;
//   - mode "attack" (flux synchrone) → toujours au hasard ;
//   - sélections interactives → modale sur le tour du contrôleur, hasard sinon.
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import type { Card, GameAction, Keyword } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

const atk = (attackerInstanceId: string, targetInstanceId: string): GameAction =>
  ({ type: "attack", attackerInstanceId, targetInstanceId } as GameAction);

function creature(name: string, attack: number, health: number, extra: Partial<Card> = {}): Card {
  return mkCard({ name, attack, health, mana_cost: 0, ...extra });
}

// Carte commune éligible aux Sélections (pool Mercenaires, sans alignement).
const commune = (id: number) =>
  mkCard({ id, name: `Commune-${id}`, faction: "Mercenaires", rarity: "Commune", card_type: "creature", attack: 1, health: 1 });

describe("Chantier multi-déclencheurs — effets sans ciblage", () => {
  it("Solidarité à la MORT : pioche X si 2+ alliés de même race", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(creature("Tueur", 6, 6)));
    const defender = mkInstance(creature("Fraternel", 1, 1, {
      race: "Orcs",
      keywords: ["solidarite"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "solidarite" as Keyword, mode: "death", x: 2 }],
    }));
    s.players[1].board.push(defender);
    s.players[1].board.push(mkInstance(creature("Orc-A", 1, 1, { race: "Orcs" })));
    s.players[1].board.push(mkInstance(creature("Orc-B", 1, 1, { race: "Orcs" })));
    s.players[1].deck.push(mkInstance(creature("Pioche-1", 1, 1)), mkInstance(creature("Pioche-2", 1, 1)), mkInstance(creature("Pioche-3", 1, 1)));

    const next = applyAction(s, atk(s.players[0].board[0].instanceId, defender.instanceId));
    expect(next.players[1].hand).toHaveLength(2); // x = 2
  });

  it("Appel Suprême à l'ATTAQUE : récupère en main la créature de la race au plus haut coût", () => {
    const s = mkState();
    s.rngState = 7;
    const src = mkInstance(creature("Héraut", 2, 4, {
      keywords: ["appel_supreme"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "appel_supreme" as Keyword, mode: "attack", race: "Orcs" }],
    }));
    s.players[0].board.push(src);
    s.players[0].deck.push(
      mkInstance(creature("Orc-3", 1, 1, { race: "Orcs", mana_cost: 3 })),
      mkInstance(creature("Orc-5", 1, 1, { race: "Orcs", mana_cost: 5 })),
      mkInstance(creature("Humain-9", 1, 1, { race: "Humains", mana_cost: 9 })),
    );

    const next = applyAction(s, atk(src.instanceId, "enemy_hero"));
    expect(next.players[0].hand.some(c => c.card.name === "Orc-5")).toBe(true);
    expect(next.players[0].hand.some(c => c.card.name === "Humain-9")).toBe(false);
  });

  it("Rassemblement en FIN DE TOUR : garde les créatures de même race, défausse le reste", () => {
    const s = mkState();
    const src = mkInstance(creature("Banneret", 2, 3, {
      race: "Orcs",
      keywords: ["rassemblement"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "rassemblement" as Keyword, mode: "end_of_turn", x: 2 }],
    }));
    s.players[0].board.push(src);
    s.players[0].deck.push(
      mkInstance(creature("Orc-Deck", 1, 1, { race: "Orcs" })),
      mkInstance(creature("Humain-Deck", 1, 1, { race: "Humains" })),
    );

    const next = applyAction(s, { type: "end_turn" } as GameAction);
    expect(next.players[0].hand.some(c => c.card.name === "Orc-Deck")).toBe(true);
    expect(next.players[0].graveyard.some(c => c.card.name === "Humain-Deck")).toBe(true);
  });

  it("Exhumation à la MORT : ressuscite une unité du cimetière — jamais elle-même", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(creature("Tueur", 9, 9)));
    const defender = mkInstance(creature("Fossoyeur", 1, 1, {
      mana_cost: 5,
      keywords: ["exhumation"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "exhumation" as Keyword, mode: "death", x: 10 }],
    }));
    s.players[1].board.push(defender);
    const buried = mkInstance(creature("Enterré", 2, 2, { mana_cost: 3 }));
    s.players[1].graveyard.push(buried);

    const next = applyAction(s, atk(s.players[0].board[0].instanceId, defender.instanceId));
    // L'Enterré revient en jeu ; le Fossoyeur (coût 5 ≤ X=10 !) reste au cimetière.
    expect(next.players[1].board.some(c => c.card.name === "Enterré")).toBe(true);
    expect(next.players[1].graveyard.some(c => c.card.name === "Fossoyeur")).toBe(true);
    expect(next.players[1].board.some(c => c.card.name === "Fossoyeur")).toBe(false);
  });

  it("Rappel à la MORT : renvoie une carte du cimetière en main — jamais elle-même", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(creature("Tueur", 9, 9)));
    const defender = mkInstance(creature("Nécromant", 1, 1, {
      keywords: ["rappel"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "rappel" as Keyword, mode: "death" }],
    }));
    s.players[1].board.push(defender);
    s.players[1].graveyard.push(mkInstance(creature("Souvenir", 2, 2)));

    const next = applyAction(s, atk(s.players[0].board[0].instanceId, defender.instanceId));
    expect(next.players[1].hand.some(c => c.card.name === "Souvenir")).toBe(true);
    expect(next.players[1].graveyard.some(c => c.card.name === "Nécromant")).toBe(true);
  });

  it("Domination à la MORT (tour adverse) : vole une unité ennemie au hasard", () => {
    const s = mkState();
    const attacker = mkInstance(creature("Agresseur", 6, 6));
    s.players[0].board.push(attacker);
    const defender = mkInstance(creature("Dominateur", 1, 1, {
      keywords: ["domination"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "domination" as Keyword, mode: "death" }],
    }));
    s.players[1].board.push(defender);

    const next = applyAction(s, atk(attacker.instanceId, defender.instanceId));
    // L'Agresseur (seule unité ennemie) passe sous le contrôle du joueur 1.
    expect(next.players[1].board.some(c => c.card.name === "Agresseur")).toBe(true);
    expect(next.players[0].board.some(c => c.card.name === "Agresseur")).toBe(false);
  });

  it("Traque du destin en FIN DE TOUR : ajoute une carte révélée au hasard en main", () => {
    const s = mkState();
    const src = mkInstance(creature("Augure", 2, 3, {
      keywords: ["traque_du_destin"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "traque_du_destin" as Keyword, mode: "end_of_turn", x: 2 }],
    }));
    s.players[0].board.push(src);
    s.players[0].deck.push(
      mkInstance(creature("Top-1", 1, 1)),
      mkInstance(creature("Top-2", 1, 1)),
      mkInstance(creature("Fond", 1, 1)),
    );

    const next = applyAction(s, { type: "end_turn" } as GameAction);
    // Une des 2 cartes révélées est en main, le reste du deck est intact (3 - 1).
    expect(next.players[0].hand).toHaveLength(1);
    expect(["Top-1", "Top-2"]).toContain(next.players[0].hand[0].card.name);
    expect(next.players[0].deck).toHaveLength(2);
  });
});

describe("Chantier multi-déclencheurs — pouvoirs ciblés (hasard tour adverse / defer tour propre / hasard à l'attaque)", () => {
  it("Affaiblissement à la MORT pendant le tour ADVERSE : cible ennemie au hasard", () => {
    const s = mkState();
    const attacker = mkInstance(creature("Brute", 5, 5));
    s.players[0].board.push(attacker);
    const defender = mkInstance(creature("Maudisseur", 1, 1, {
      keywords: ["affaiblissement"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "affaiblissement" as Keyword, mode: "death", x: 2, y: 2 }],
    }));
    s.players[1].board.push(defender);

    const next = applyAction(s, atk(attacker.instanceId, defender.instanceId));
    const brute = next.players[0].board.find(c => c.card.name === "Brute")!;
    // Seule ennemie → cible « au hasard » déterministe : -2 ATK / -2 PV.
    expect(brute.currentAttack).toBe(3);
    // Aucun picker en attente (tour adverse → résolution immédiate).
    expect(next.pendingTriggers ?? []).toHaveLength(0);
  });

  it("Affaiblissement en FIN DE TOUR (tour du contrôleur) : picker différé, puis résolution", () => {
    const s = mkState();
    const src = mkInstance(creature("Sorcier", 2, 3, {
      keywords: ["affaiblissement"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "affaiblissement" as Keyword, mode: "end_of_turn", x: 1, y: 1 }],
    }));
    s.players[0].board.push(src);
    const enemy = mkInstance(creature("Cible", 4, 4));
    s.players[1].board.push(enemy);

    const paused = applyAction(s, { type: "end_turn" } as GameAction);
    const trigger = (paused.pendingTriggers ?? []).find(t => t.kw === "affaiblissement");
    expect(trigger).toBeDefined();
    expect(trigger!.x).toBe(1);
    expect(trigger!.y).toBe(1);

    const resolved = applyAction(paused, {
      type: "resolve_pending_trigger", triggerId: trigger!.id, targetInstanceId: enemy.instanceId,
    } as GameAction);
    const t = resolved.players[1].board.find(c => c.card.name === "Cible")!;
    expect(t.currentAttack).toBe(3);
    expect(t.maxHealth).toBe(3);
  });

  it("Affaiblissement à l'ATTAQUE : cible au hasard immédiate, aucun picker", () => {
    const s = mkState();
    const src = mkInstance(creature("Lame", 2, 3, {
      keywords: ["affaiblissement"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "affaiblissement" as Keyword, mode: "attack", x: 1, y: 1 }],
    }));
    s.players[0].board.push(src);
    const enemy = mkInstance(creature("Cible", 4, 4));
    s.players[1].board.push(enemy);

    const next = applyAction(s, atk(src.instanceId, "enemy_hero"));
    const t = next.players[1].board.find(c => c.card.name === "Cible")!;
    expect(t.currentAttack).toBe(3); // -1 immédiat
    expect(next.pendingTriggers ?? []).toHaveLength(0);
  });

  it("Vampirisme à l'ATTAQUE : draine une créature ennemie au hasard", () => {
    const s = mkState();
    const src = mkInstance(creature("Buveur", 2, 3, {
      keywords: ["vampirisme"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "vampirisme" as Keyword, mode: "attack", x: 2 }],
    }));
    s.players[0].board.push(src);
    const enemy = mkInstance(creature("Proie", 1, 5));
    s.players[1].board.push(enemy);
    const heroHpBefore = s.players[1].hero.hp;

    const next = applyAction(s, atk(src.instanceId, "enemy_hero"));
    const proie = next.players[1].board.find(c => c.card.name === "Proie")!;
    expect(proie.currentHealth).toBe(3); // 5 - 2 drainés
    const buveur = next.players[0].board.find(c => c.card.name === "Buveur")!;
    expect(buveur.maxHealth).toBe(5); // 3 + 2 volés
    // Le héros n'est PAS la cible du drain (créature disponible) — il ne subit
    // que les dégâts d'attaque normaux de la Lame (2).
    expect(next.players[1].hero.hp).toBe(heroHpBefore - 2);
  });

  it("Bénédiction en FIN DE TOUR : defer puis soin complet de l'allié choisi", () => {
    const s = mkState();
    const src = mkInstance(creature("Prêtre", 1, 3, {
      keywords: ["benediction"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "benediction" as Keyword, mode: "end_of_turn" }],
    }));
    s.players[0].board.push(src);
    const wounded = mkInstance(creature("Blessé", 2, 6));
    wounded.currentHealth = 1;
    s.players[0].board.push(wounded);

    const paused = applyAction(s, { type: "end_turn" } as GameAction);
    const trigger = (paused.pendingTriggers ?? []).find(t => t.kw === "benediction");
    expect(trigger).toBeDefined();

    const resolved = applyAction(paused, {
      type: "resolve_pending_trigger", triggerId: trigger!.id, targetInstanceId: wounded.instanceId,
    } as GameAction);
    const healed = resolved.players[0].board.find(c => c.card.name === "Blessé")!;
    expect(healed.currentHealth).toBe(6);
  });

  it("Sacrifice au TAP (cible explicite) : détruit l'allié, la source gagne ses stats", () => {
    const s = mkState();
    const src = mkInstance(creature("Cultiste", 2, 2, {
      keywords: ["sacrifice"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "sacrifice" as Keyword, mode: "tap" }],
    }));
    src.hasSummoningSickness = false;
    s.players[0].board.push(src);
    const ally = mkInstance(creature("Offrande", 3, 4));
    s.players[0].board.push(ally);

    const next = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0, targetInstanceId: ally.instanceId,
    } as GameAction);
    const cultiste = next.players[0].board.find(c => c.card.name === "Cultiste")!;
    expect(cultiste.currentAttack).toBe(5);  // 2 + 3
    expect(cultiste.maxHealth).toBe(6);      // 2 + 4
    expect(next.players[0].board.some(c => c.card.name === "Offrande")).toBe(false);
    expect(next.players[0].graveyard.some(c => c.card.name === "Offrande")).toBe(true);
  });

  it("Permutation au TAP (cible explicite) : échange les PV avec l'ennemie visée", () => {
    const s = mkState();
    const src = mkInstance(creature("Illusionniste", 2, 2, {
      keywords: ["permutation"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "permutation" as Keyword, mode: "tap" }],
    }));
    src.hasSummoningSickness = false;
    s.players[0].board.push(src);
    const enemy = mkInstance(creature("Colosse", 3, 9));
    s.players[1].board.push(enemy);

    const next = applyAction(s, {
      type: "tap_activate", sourceInstanceId: src.instanceId, instanceIdx: 0, targetInstanceId: enemy.instanceId,
    } as GameAction);
    expect(next.players[0].board.find(c => c.card.name === "Illusionniste")!.currentHealth).toBe(9);
    expect(next.players[1].board.find(c => c.card.name === "Colosse")!.currentHealth).toBe(2);
  });
});

describe("Chantier multi-déclencheurs — Sélections interactives", () => {
  it("Sélection à la MORT pendant le tour ADVERSE : carte au hasard ajoutée en main", () => {
    const s = mkState();
    s.factionCardPool = [commune(901)];
    const attacker = mkInstance(creature("Brute", 5, 5));
    s.players[0].board.push(attacker);
    const defender = mkInstance(creature("Émissaire", 1, 1, {
      faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "death", x: 0 }],
    }));
    s.players[1].board.push(defender);
    initRNG(3);

    const next = applyAction(s, atk(attacker.instanceId, defender.instanceId));
    // Tour adverse → pas de modale : la carte est tirée au hasard et va en main.
    expect(next.players[1].hand.some(c => c.card.id === 901)).toBe(true);
    expect(next.pendingTriggers ?? []).toHaveLength(0);
  });

  it("Sélection à la MORT pendant le tour du CONTRÔLEUR : modale différée puis choix", () => {
    const s = mkState();
    s.factionCardPool = [commune(902)];
    const kamikaze = mkInstance(creature("Kamikaze", 1, 1, {
      faction: undefined,
      keywords: ["selection"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "selection" as Keyword, mode: "death", x: 0 }],
    }));
    kamikaze.hasSummoningSickness = false;
    s.players[0].board.push(kamikaze);
    const wall = mkInstance(creature("Mur", 9, 9));
    s.players[1].board.push(wall);
    initRNG(3);

    // Le Kamikaze attaque le Mur et meurt sur SON tour → modale différée.
    const paused = applyAction(s, atk(kamikaze.instanceId, wall.instanceId));
    const trigger = (paused.pendingTriggers ?? []).find(t => t.selectionType === "selection");
    expect(trigger).toBeDefined();
    expect(trigger!.selectionOptionIds).toContain(902);

    const resolved = applyAction(paused, {
      type: "resolve_pending_trigger", triggerId: trigger!.id, selectionCardId: 902,
    } as GameAction);
    expect(resolved.players[0].hand.some(c => c.card.id === 902)).toBe(true);
  });
});

describe("Chantier multi-déclencheurs — le mode non-play ne se déclenche PAS à l'invocation", () => {
  it("une instance en mode tap/mort n'exécute pas son effet à l'entrée en jeu", () => {
    const s = mkState();
    // Mimique en mode tap : jouer la carte avec une cible NE copie rien.
    const enemy = mkInstance(creature("Modèle", 7, 7, { keywords: ["taunt"] as unknown as Card["keywords"] }));
    s.players[1].board.push(enemy);
    const src = mkInstance(creature("Copieur", 1, 1, {
      keywords: ["mimique"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "mimique" as Keyword, mode: "tap" }],
    }));
    s.players[0].hand.push(src);

    const next = applyAction(s, {
      type: "play_card", cardInstanceId: src.instanceId, targetInstanceId: enemy.instanceId,
    } as GameAction);
    const copieur = next.players[0].board.find(c => c.card.name === "Copieur")!;
    expect(copieur.card.keywords).not.toContain("taunt");
  });

  it("une Divination en mode fin de tour ne réordonne pas le deck à l'invocation", () => {
    const s = mkState();
    const src = mkInstance(creature("Voyant", 1, 1, {
      keywords: ["divination"] as unknown as Card["keywords"],
      keyword_instances: [{ id: "divination" as Keyword, mode: "end_of_turn" }],
    }));
    s.players[0].hand.push(src);
    s.players[0].deck.push(mkInstance(creature("A", 1, 1)), mkInstance(creature("B", 1, 1)), mkInstance(creature("C", 1, 1)));
    const orderBefore = s.players[0].deck.map(c => c.card.name);

    const next = applyAction(s, { type: "play_card", cardInstanceId: src.instanceId, divinationChoiceIndex: 2 } as GameAction);
    expect(next.players[0].deck.map(c => c.card.name)).toEqual(orderBefore);
  });
});
