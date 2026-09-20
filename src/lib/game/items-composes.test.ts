// OBJETS, LOT 5 (moteur) — les EFFETS COMPOSÉS portés par un objet.
//
// Le modèle prolonge celui du lot 3 : les capacités de l'objet sont GREFFÉES
// sur son porteur, et tout le moteur les trouve sans en rien savoir. Un composé
// ne vivant ni dans `keywords` ni dans le sidecar mais seulement dans
// `capabilities`, c'est un TROISIÈME canal — donc une troisième trace de purge.
//
// Le point délicat, et c'est lui que la moitié de ces tests protège :
// `on_play`. Le porteur est déjà en jeu quand l'objet le rejoint ; rien ne
// rejouera jamais son entrée. Un composé « à l'entrée » simplement greffé
// resterait donc inerte À JAMAIS, sans rien signaler. Il se résout à
// l'ÉQUIPEMENT — l'équipement EST l'entrée en jeu de la capacité.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { objetsDe, uidCapaciteObjet } from "./items";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, Card, CardInstance, GameAction, GameState } from "./types";

/** Objet portant un ou plusieurs effets composés. */
function objet(name: string, caps: Partial<Capability>[], over: Partial<Card> = {}): CardInstance {
  return mkInstance(mkCard({
    name, card_type: "item", mana_cost: 0, attack: 0, health: 0, faction: "Humains",
    capabilities: caps.map((c, i) => ({
      uid: `cx_${i}`, abilityId: "_composed", effectKind: "immediate", targets: [], ...c,
    })) as unknown as Capability[],
    ...over,
  }));
}

const creature = (name: string, atk = 1, pv = 3): CardInstance =>
  mkInstance(mkCard({ name, mana_cost: 0, attack: atk, health: pv, faction: "Humains" }));

/** Inflige X dégâts au héros adverse — effet OBSERVABLE sans ambiguïté. */
const degatsAuHeros = (x: number) => ({
  content: "deal_damage" as const,
  magnitude: { x },
  target: {
    entity: "hero" as const, count: 1, side: "enemy" as const,
    location: "board" as const, designation: "automatic" as const,
  },
});

function table(item: CardInstance, unite = creature("Soldat")): { s: GameState; item: CardInstance; unite: CardInstance } {
  const s = mkState();
  s.players[0].board.push(unite);
  s.players[0].items = [item];
  // Decks garnis : sans eux, chaque fin de tour pioche à vide et inflige un
  // point de FATIGUE au héros. Les tests ci-dessous mesurent les PV adverses
  // pour observer les effets composés — la fatigue les aurait tous faussés,
  // d'un point par tour, et l'assertion aurait menti sur la cause.
  for (const p of s.players) {
    p.deck = Array.from({ length: 30 }, (_, i) =>
      mkInstance(mkCard({ name: `Réserve${i}`, mana_cost: 1, attack: 1, health: 1 })));
  }
  return { s, item, unite };
}

const equiper = (s: GameState, item: CardInstance, cible: CardInstance) =>
  applyAction(s, { type: "equip_item", itemInstanceId: item.instanceId, targetInstanceId: cible.instanceId } as GameAction);

const sacrifier = (s: GameState, item: CardInstance) =>
  applyAction(s, { type: "sacrifice_item", itemInstanceId: item.instanceId } as GameAction);

const pvAdverse = (s: GameState) => s.players[1].hero.hp;
const unite = (s: GameState, nom: string) => s.players[0].board.find(c => c.card.name === nom)!;

describe("Effets « à l'équipement »", () => {
  it("un composé `on_play` de l'objet se résout à l'équipement", () => {
    const { s, item, unite: soldat } = table(
      objet("Brasier", [{ trigger: "on_play", composed: degatsAuHeros(3) }]));
    const avant = pvAdverse(s);

    expect(pvAdverse(equiper(s, item, soldat))).toBe(avant - 3);
  });

  it("il ne part PAS tant que l'objet n'est que posé", () => {
    // « Les capacités ne valent que porté » : l'objet est là, inerte.
    const { s } = table(objet("Brasier", [{ trigger: "on_play", composed: degatsAuHeros(3) }]));
    const avant = pvAdverse(s);

    expect(pvAdverse(applyAction(s, { type: "end_turn" } as GameAction))).toBe(avant);
  });

  it("il ne se rejoue PAS à chaque recalcul", () => {
    // Le piège du modèle : la greffe repasse à chaque `recalculateAuras`. Si
    // `on_play` y était greffé au lieu d'être résolu une fois à l'équipement,
    // le héros adverse perdrait 3 PV à chaque action du jeu.
    const { s, item, unite: soldat } = table(
      objet("Brasier", [{ trigger: "on_play", composed: degatsAuHeros(3) }]));
    const avant = pvAdverse(s);

    let etat = equiper(s, item, soldat);
    for (let i = 0; i < 6; i++) etat = applyAction(etat, { type: "end_turn" } as GameAction);

    expect(pvAdverse(etat)).toBe(avant - 3);
  });

  it("le déplacer sur une autre créature le rejoue — c'est un nouvel équipement", () => {
    const { s, item, unite: soldat } = table(
      objet("Brasier", [{ trigger: "on_play", composed: degatsAuHeros(3) }]));
    s.players[0].board.push(creature("Garde"));
    const avant = pvAdverse(s);

    const apres1 = equiper(s, item, soldat);
    const apres2 = equiper(apres1, objetsDe(apres1.players[0])[0], unite(apres1, "Garde"));

    expect(pvAdverse(apres2)).toBe(avant - 6);
  });
});

describe("Effets sur les événements du PORTEUR", () => {
  it("un composé `on_death` part à la mort du porteur", () => {
    const { s, item, unite: soldat } = table(
      objet("Fiole", [{ trigger: "on_death", composed: degatsAuHeros(4) }]));
    const avant = pvAdverse(s);

    const equipe = equiper(s, item, soldat);
    expect(pvAdverse(equipe), "rien ne part à l'équipement").toBe(avant);

    // On tue le porteur : le râle greffé doit partir.
    unite(equipe, "Soldat").currentHealth = 0;
    const apres = applyAction(equipe, { type: "end_turn" } as GameAction);

    expect(pvAdverse(apres)).toBe(avant - 4);
  });

  it("un composé `on_end_of_turn` part en fin de tour du porteur", () => {
    // Celui-ci passe par `buildEndOfTurnQueue`, qui lit `getCapabilities` de la
    // créature : il ne fonctionne QUE parce que la capacité est greffée.
    const { s, item, unite: soldat } = table(
      objet("Veilleuse", [{ trigger: "on_end_of_turn", composed: degatsAuHeros(2) }]));
    const avant = pvAdverse(s);

    const equipe = equiper(s, item, soldat);
    const apres = applyAction(equipe, { type: "end_turn" } as GameAction);

    expect(pvAdverse(apres)).toBe(avant - 2);
  });
});

describe("La greffe est réversible", () => {
  it("sacrifier l'objet retire ses capacités composées", () => {
    const { s, item, unite: soldat } = table(
      objet("Veilleuse", [{ trigger: "on_end_of_turn", composed: degatsAuHeros(2) }]));
    const equipe = equiper(s, item, soldat);
    expect(unite(equipe, "Soldat").card.capabilities?.length).toBe(1);

    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    const nu = unite(apres, "Soldat");
    expect(nu.card.capabilities ?? []).toHaveLength(0);
    expect(nu.itemGrantedCapUids ?? []).toHaveLength(0);

    // Et surtout : l'effet ne part plus.
    const avant = pvAdverse(apres);
    expect(pvAdverse(applyAction(apres, { type: "end_turn" } as GameAction))).toBe(avant);
  });

  it("dix recalculs n'empilent pas la greffe en double", () => {
    // L'uid est DÉTERMINISTE pour cette raison : la greffe se rejoue à chaque
    // passe, et un uid tiré au hasard aurait ajouté une copie à chaque fois.
    const { s, item, unite: soldat } = table(
      objet("Fiole", [{ trigger: "on_death", composed: degatsAuHeros(4) }]));
    let etat = equiper(s, item, soldat);
    for (let i = 0; i < 10; i++) etat = applyAction(etat, { type: "end_turn" } as GameAction);

    expect(unite(etat, "Soldat").card.capabilities).toHaveLength(1);
  });

  it("l'uid greffé est préfixé par l'INSTANCE de l'objet", () => {
    // Deux exemplaires du même objet, portés par deux créatures, ne doivent pas
    // se marcher dessus — d'où l'instance et non la carte.
    const a = objet("Fiole", [{ trigger: "on_death", composed: degatsAuHeros(1) }]);
    const b = objet("Fiole", [{ trigger: "on_death", composed: degatsAuHeros(1) }]);
    expect(uidCapaciteObjet(a, "cx_0")).not.toBe(uidCapaciteObjet(b, "cx_0"));
    expect(uidCapaciteObjet(a, "cx_0")).toBe(`obj_${a.instanceId}_cx_0`);
  });

  it("les capacités PROPRES du porteur survivent au retrait de l'objet", () => {
    const propre = creature("Mage");
    propre.card = {
      ...propre.card,
      capabilities: [{
        uid: "cx_0", abilityId: "_composed", effectKind: "immediate", targets: [],
        trigger: "on_death", composed: degatsAuHeros(1),
      }] as unknown as Capability[],
    };
    const { s, item } = table(
      objet("Fiole", [{ trigger: "on_death", composed: degatsAuHeros(4) }]), propre);

    const equipe = equiper(s, item, propre);
    expect(unite(equipe, "Mage").card.capabilities).toHaveLength(2);

    const apres = sacrifier(equipe, objetsDe(equipe.players[0])[0]);
    const caps = unite(apres, "Mage").card.capabilities ?? [];
    expect(caps).toHaveLength(1);
    expect(caps[0].uid, "la capacité native garde son uid").toBe("cx_0");
  });
});
