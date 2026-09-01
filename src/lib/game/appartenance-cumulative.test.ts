// APPARTENANCE d'une cible composée — deux niveaux, et c'est tout l'enjeu :
//   • DANS une catégorie, les valeurs sont ALTERNATIVES (race Elfes OU Nains) ;
//   • ENTRE catégories, elles se CUMULENT (race Elfes ET clan Les Sylvains).
//
// Signalé le 2026-09-01 : « Brume des Sous-Bois » (conférer Esquive en fin de
// tour aux unités alliées — Elfes + Les Sylvains) donnait aussi Esquive aux
// Aigles Géants, qui ne sont Sylvains que par le CLAN.
//
// Cause : le filtre faisait un OU à tous les étages. Croiser deux catégories
// était donc impossible — ajouter un critère ÉLARGISSAIT le pool au lieu de le
// restreindre, l'inverse exact de ce qu'un auteur de carte attend.
import { describe, expect, it } from "vitest";
import { applyAction } from "./engine";
import { describeComposedCap } from "./composed-display";
import type { Capability, ComposedEffect } from "./types";
import { mkCard, mkInstance, mkState } from "./test-harness";

function brume(membership: NonNullable<ComposedEffect["target"]>["membership"]): Capability {
  return {
    uid: "em_brume", trigger: "on_end_of_turn", effectKind: "emblem", abilityId: "_composed",
    composed: {
      content: "grant_keyword", grantAbilityId: "esquive", magnitude: { x: 0 },
      target: {
        entity: "unit", count: "all", side: "ally", location: "board",
        designation: "automatic", membership,
      },
    },
  };
}

const unite = (name: string, race: string, clan: string) =>
  mkInstance(mkCard({ name, attack: 2, health: 3, race, clan } as never));

/** Pose l'emblème puis termine le tour ; renvoie qui porte Esquive. */
function porteursDEsquive(cap: Capability, board: ReturnType<typeof unite>[]) {
  const s = mkState();
  s.players[1].deck.push(mkInstance(mkCard({ name: "Pioche" })));
  s.players[0].board.push(...board);
  const sort = mkInstance(mkCard({
    name: "Brume des Sous-Bois", mana_cost: 1, card_type: "spell",
    attack: null, health: null, capabilities: [cap],
  } as never));
  s.players[0].hand.push(sort);

  let st = applyAction(s, { type: "play_card", cardInstanceId: sort.instanceId } as never);
  st = applyAction(st, { type: "end_turn" });
  return new Set(
    st.players[0].board
      .filter(c => (c.card.keywords as unknown as string[]).includes("esquive"))
      .map(c => c.card.name),
  );
}

describe("Appartenance : les catégories se CUMULENT", () => {
  it("race + clan : ni l'Aigle Sylvain ni l'Elfe d'un autre clan ne sont visés", () => {
    const porteurs = porteursDEsquive(
      brume({ race: ["Elfes"], clan: ["Les Sylvains"] }),
      [
        unite("Archère Sylvaine", "Elfes", "Les Sylvains"),
        unite("Aigle Géant", "Aigles", "Les Sylvains"),
        unite("Elfe d'ailleurs", "Elfes", "Autre Clan"),
      ],
    );
    expect(porteurs).toEqual(new Set(["Archère Sylvaine"]));
  });

  it("race + clan + faction : les trois doivent tomber juste", () => {
    const porteurs = porteursDEsquive(
      brume({ race: ["Elfes"], clan: ["Les Sylvains"], faction: ["Elfes"] }),
      [
        mkInstance(mkCard({ name: "Complète", attack: 1, health: 1, race: "Elfes", clan: "Les Sylvains", faction: "Elfes" } as never)),
        mkInstance(mkCard({ name: "Mauvaise faction", attack: 1, health: 1, race: "Elfes", clan: "Les Sylvains", faction: "Nains" } as never)),
      ],
    );
    expect(porteurs).toEqual(new Set(["Complète"]));
  });
});

describe("Appartenance : DANS une catégorie, les valeurs restent alternatives", () => {
  it("deux races listées visent les deux", () => {
    const porteurs = porteursDEsquive(
      brume({ race: ["Elfes", "Aigles"] }),
      [
        unite("Elfe", "Elfes", "Les Sylvains"),
        unite("Aigle", "Aigles", "Les Sylvains"),
        unite("Nain", "Nains", "Les Sylvains"),
      ],
    );
    expect(porteurs).toEqual(new Set(["Elfe", "Aigle"]));
  });

  it("une seule catégorie renseignée filtre sur elle seule", () => {
    const porteurs = porteursDEsquive(
      brume({ clan: ["Les Sylvains"] }),
      [
        unite("Aigle Sylvain", "Aigles", "Les Sylvains"),
        unite("Elfe étranger", "Elfes", "Autre Clan"),
      ],
    );
    expect(porteurs).toEqual(new Set(["Aigle Sylvain"]));
  });
});

describe("Le LIBELLÉ dit le cumul", () => {
  it("« / » entre valeurs d'une même catégorie, « + » entre catégories", () => {
    const texte = describeComposedCap(brume({ race: ["Elfes", "Aigles"], clan: ["Les Sylvains"] }));
    // Les deux races restent alternatives…
    expect(texte).toContain("/");
    // …et le clan s'ajoute, il ne s'additionne pas à la liste des alternatives.
    expect(texte).toContain(" + ");
    expect(texte).not.toContain("Aigles/Les Sylvains");
  });
});
