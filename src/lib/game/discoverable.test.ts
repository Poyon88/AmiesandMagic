// Carte NON DÉCOUVRABLE — écartée des tirages, sans cesser d'être jouable.
//
// Demandé : un champ par carte, à O par défaut, réglable sur N dans la forge.
//
// Même intention et même point de passage que les sets « spéciaux » : le filtre
// s'applique à la CONSTRUCTION des pools, pas dans les ~8 résolveurs qui y
// puisent (Sélection ×3, Invocation, Invocations multiples, Déchainement,
// Concentration, Épargne). Un résolveur ajouté demain hérite de la règle.
import { describe, expect, it } from "vitest";
import { excludeNonDiscoverable, excludeSpecialSets } from "./deck-rules";

const carte = (id: number, discoverable?: boolean | null, set_id: number | null = null) =>
  ({ id, discoverable, set_id });

describe("excludeNonDiscoverable", () => {
  it("écarte les cartes marquées `false`", () => {
    const pool = [carte(1, true), carte(2, false), carte(3, true)];
    expect(excludeNonDiscoverable(pool).map((c) => c.id)).toEqual([1, 3]);
  });

  it("`undefined` vaut DÉCOUVRABLE : un chemin qui n'a pas la colonne ne vide pas le pool", () => {
    // Garde-fou important : une requête oubliant `discoverable` renverrait
    // undefined partout, et un filtre strict aurait effacé tout le pool en
    // silence — pas de Sélection, pas d'Invocation, sans un mot.
    const pool = [carte(1), carte(2), carte(3)];
    expect(excludeNonDiscoverable(pool)).toHaveLength(3);
  });

  it("`null` vaut découvrable aussi", () => {
    expect(excludeNonDiscoverable([carte(1, null)])).toHaveLength(1);
  });

  it("pool vide : rien, sans lever", () => {
    expect(excludeNonDiscoverable([])).toEqual([]);
  });

  it("ne mute pas le tableau d'entrée", () => {
    const pool = [carte(1, true), carte(2, false)];
    excludeNonDiscoverable(pool);
    expect(pool).toHaveLength(2);
  });
});

describe("Composition avec le filtre des sets spéciaux", () => {
  it("les deux règles s'additionnent, dans n'importe quel ordre", () => {
    const pool = [
      carte(1, true, null),   // gardée
      carte(2, false, null),  // écartée : non découvrable
      carte(3, true, 7),      // écartée : set spécial
      carte(4, false, 7),     // écartée deux fois
    ];
    const speciaux = new Set([7]);
    const a = excludeNonDiscoverable(excludeSpecialSets(pool, speciaux));
    const b = excludeSpecialSets(excludeNonDiscoverable(pool), speciaux);
    expect(a.map((c) => c.id)).toEqual([1]);
    expect(b.map((c) => c.id)).toEqual([1]);
  });

  it("une carte non découvrable d'un set ORDINAIRE est bien écartée", () => {
    // C'est tout l'intérêt du champ : exclure une carte SANS avoir à lui créer
    // un set spécial dédié.
    const pool = [carte(1, false, 3), carte(2, true, 3)];
    expect(excludeNonDiscoverable(excludeSpecialSets(pool, new Set([99]))).map((c) => c.id))
      .toEqual([2]);
  });
});
