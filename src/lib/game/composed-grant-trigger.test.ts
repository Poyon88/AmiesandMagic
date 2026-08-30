// DON D'UNE CAPACITÉ À DÉCLENCHEUR — « conférer Tempête X, qui partira à sa mort ».
//
// Le don composé ne savait transporter qu'un id de mot-clé. Une capacité CURÉE
// ainsi conférée retombait sur son mode par défaut — l'entrée en jeu — déjà
// passée pour une créature sur le plateau : elle ne se déclenchait jamais, et
// rien ne le signalait. C'est ce qui limitait le don aux seules passives.
//
// `grantTrigger` fait voyager le déclencheur avec la capacité, et le moteur pose
// l'instance correspondante dans `keyword_instances` — le canal que TOUS les
// chemins curés lisent (pioche, fin de tour, attaque, retour, bas PV, mort,
// activation).
import { describe, expect, it } from "vitest";
import { applyAction, initRNG } from "./engine";
import { describeComposedCap } from "./composed-display";
import { modeForCreatureTrigger } from "./capability-adapter";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { CapabilityTrigger, Capability, CardInstance, ComposedEffect, GameState, KeywordInstance, TargetSpec } from "./types";

const ALLIE_AU_CHOIX: TargetSpec = { entity: "unit", count: 1, side: "ally", location: "board", designation: "choice" };

function sortCompose(nom: string, composed: ComposedEffect, uid = "cx_0"): CardInstance {
  const caps: Capability[] = [{ uid, trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed", composed }];
  return mkInstance(mkCard({ name: nom, card_type: "spell", attack: null, health: null, capabilities: caps as never }));
}

function don(abilityId: string, grantTrigger: CapabilityTrigger | undefined, x?: number): CardInstance {
  return sortCompose("Le Don", {
    content: "grant_keyword", grantAbilityId: abilityId, grantTrigger,
    ...(x != null ? { magnitude: { x } } : {}),
    target: ALLIE_AU_CHOIX,
  });
}

const creature = (nom: string, pv = 5) => mkInstance(mkCard({ name: nom, attack: 1, health: pv }));

function lancer(s: GameState, sort: CardInstance, cible?: CardInstance): GameState {
  initRNG(42);
  s.players[0].hand.push(sort);
  return applyAction(s, {
    type: "play_card", cardInstanceId: sort.instanceId,
    ...(cible ? { targetMap: { cx_0: cible.instanceId } } : {}),
  });
}

const instancesDe = (c: CardInstance): KeywordInstance[] => c.card.keyword_instances ?? [];
const trouve = (s: GameState, id: string) =>
  [...s.players[0].board, ...s.players[1].board, ...s.players[0].graveyard].find((c) => c.instanceId === id);

describe("le déclencheur voyage avec la capacité conférée", () => {
  it("pose l'instance au MODE choisi — c'est le canal que lit le moteur", () => {
    const s0 = mkState();
    const porteuse = creature("Porteuse");
    s0.players[0].board = [porteuse];

    const s = lancer(s0, don("tempete", "on_death", 2), porteuse);
    const apres = trouve(s, porteuse.instanceId)!;

    expect((apres.card.keywords as unknown as string[])).toContain("tempete");
    // Sans le `mode`, cette instance vaudrait « à l'entrée en jeu » — moment déjà
    // passé pour une créature sur le plateau, donc capacité morte en silence.
    expect(instancesDe(apres)).toContainEqual(expect.objectContaining({ id: "tempete", mode: "death", x: 2 }));
  });

  it("une Tempête conférée « à la mort » frappe VRAIMENT quand la porteuse meurt", () => {
    const s0 = mkState();
    const porteuse = creature("Porteuse");
    s0.players[0].board = [porteuse];
    s0.players[1].board = [creature("Ennemie", 9)];

    let s = lancer(s0, don("tempete", "on_death", 3), porteuse);
    const pvAvant = s.players[1].board[0].currentHealth;

    // La porteuse meurt : son râle conféré doit partir.
    s = lancer(s, sortCompose("Le Couperet", { content: "destroy", target: ALLIE_AU_CHOIX }), s.players[0].board[0]);

    expect(s.players[0].board).toHaveLength(0);
    expect(s.players[1].board[0].currentHealth).toBe(pvAvant - 3);
  });

  it("ne pose RIEN pour une passive : sa présence suffit, son X passe par grantedKeywordX", () => {
    const s0 = mkState();
    const porteuse = creature("Porteuse");
    s0.players[0].board = [porteuse];

    // `grantTriggerOptions` écarte `automatic` : l'éditeur ne propose aucun
    // déclencheur pour une passive, donc `grantTrigger` arrive indéfini.
    const s = lancer(s0, don("vol", undefined), porteuse);
    const apres = trouve(s, porteuse.instanceId)!;

    expect((apres.card.keywords as unknown as string[])).toContain("vol");
    expect(instancesDe(apres)).toHaveLength(0);
  });
});

describe("râles d'agonie conférés", () => {
  it("CARNAGE conféré inflige enfin ses dégâts — son X était figé à zéro", () => {
    // Le défaut réparé : `carnageX` est gravé à la NAISSANCE de l'instance et le
    // râle exige `> 0`. Un Carnage conféré gardait donc 0 et ne partait jamais,
    // sans le moindre signe.
    const s0 = mkState();
    const porteuse = creature("Porteuse");
    s0.players[0].board = [porteuse];
    s0.players[1].board = [creature("Ennemie", 9)];

    let s = lancer(s0, don("carnage", "on_death", 4), porteuse);
    expect(trouve(s, porteuse.instanceId)!.carnageX).toBe(4);

    const pvAvant = s.players[1].board[0].currentHealth;
    s = lancer(s, sortCompose("Le Couperet", { content: "destroy", target: ALLIE_AU_CHOIX }), s.players[0].board[0]);

    expect(s.players[1].board[0].currentHealth).toBe(pvAvant - 4);
  });

  it("ne se résout pas DEUX fois : l'instance d'un râle est posée SANS mode", () => {
    // Un râle est déjà résolu par son bloc câblé (`hasKw` à la mort). Lui poser
    // un `mode: "death"` le ferait rejouer par la boucle `customDeathInstances`.
    const s0 = mkState();
    const porteuse = creature("Porteuse");
    s0.players[0].board = [porteuse];

    const s = lancer(s0, don("carnage", "on_death", 4), porteuse);
    const inst = instancesDe(trouve(s, porteuse.instanceId)!).find((k) => (k.id as unknown as string) === "carnage");

    expect(inst).toBeDefined();
    expect(inst!.mode).toBeUndefined();
    expect(inst!.x).toBe(4);
  });
});

describe("les cinq X figés sur l'instance honorent la valeur conférée", () => {
  // Ces cinq-là sont gravés à la naissance et leurs résolveurs exigent `> 0`.
  // Persécution et Riposte étaient conférables DE LONGUE DATE et pourtant
  // inertes : rien ne gravait leur X sur une créature qui ne les portait pas.
  const cas: [string, keyof CardInstance][] = [
    ["persecution", "persecutionX"],
    ["riposte", "riposteX"],
    ["carnage", "carnageX"],
    ["sacrifice_demoniaque", "sacrificeDemoniaqueX"],
    ["heritage", "heritageX"],
  ];

  for (const [abilityId, champ] of cas) {
    it(`${abilityId} conférée avec X=6 grave 6, et non un repli`, () => {
      const s0 = mkState();
      const porteuse = creature("Porteuse");
      s0.players[0].board = [porteuse];

      const s = lancer(s0, don(abilityId, "on_death", 6), porteuse);

      expect(trouve(s, porteuse.instanceId)![champ]).toBe(6);
    });
  }

  it("la valeur écrite par l'AUTEUR reste souveraine sur celle du don", () => {
    // Le don ne tranche que là où rien n'était posé : sinon conférer Riposte
    // rééquilibrerait en silence une carte déjà calibrée.
    const s0 = mkState();
    const porteuse = mkInstance(mkCard({
      name: "Déjà armée", attack: 1, health: 5,
      keywords: ["riposte"] as never,
      keyword_instances: [{ id: "riposte", x: 2 }] as never,
    }));
    porteuse.riposteX = 2;
    s0.players[0].board = [porteuse];

    const s = lancer(s0, don("riposte", "on_death", 9), porteuse);

    expect(trouve(s, porteuse.instanceId)!.riposteX).toBe(2);
  });
});

describe("modeForCreatureTrigger", () => {
  it("est l'inverse exact de la lecture du moteur", () => {
    const paires: [CapabilityTrigger, string | undefined][] = [
      ["on_death", "death"], ["on_activation", "tap"], ["on_return", "return"],
      ["on_end_of_turn", "end_of_turn"], ["on_attack", "attack"], ["on_draw", "draw"],
      ["on_low_hp", "low_hp"],
    ];
    for (const [trigger, mode] of paires) expect(modeForCreatureTrigger(trigger), trigger).toBe(mode);
  });

  it("rend `undefined` là où aucun mode n'existe", () => {
    // `on_play` EST le mode absent, par convention ; `automatic` se lit à la
    // simple présence du mot-clé ; `spell_resolution` n'est pas une créature.
    for (const t of ["on_play", "automatic", "spell_resolution"] as CapabilityTrigger[]) {
      expect(modeForCreatureTrigger(t), t).toBeUndefined();
    }
  });
});

describe("le texte de carte dit QUAND la capacité conférée partira", () => {
  const capDon = (abilityId: string, grantTrigger?: string, x = 3): Capability => ({
    uid: "u", trigger: "on_play", effectKind: "immediate", abilityId: "_composed",
    composed: {
      content: "grant_keyword", grantAbilityId: abilityId,
      grantTrigger: grantTrigger as CapabilityTrigger | undefined,
      magnitude: { x }, target: ALLIE_AU_CHOIX,
    },
  });

  it("annonce le déclencheur d'une capacité curée conférée", () => {
    expect(describeComposedCap(capDon("tempete", "on_death"))).toContain("à sa mort");
    expect(describeComposedCap(capDon("tempete", "on_end_of_turn"))).toContain("à la fin du tour");
  });

  it("se TAIT quand la capacité n'a pas le choix de son moment", () => {
    // Une passive se lit à sa seule présence ; un râle ne part qu'à la mort.
    // L'écrire alourdirait les cartes existantes sans rien apprendre.
    expect(describeComposedCap(capDon("vol", undefined))).not.toContain("se déclenchera");
    expect(describeComposedCap(capDon("carnage", "on_death"))).not.toContain("se déclenchera");
  });
});
