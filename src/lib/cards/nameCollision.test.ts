import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCardName, findNameCollision } from "./nameCollision";

/** Faux client : `from("cards").select("id, name").order(…).range(from, to)`.
 *  Il PLAFONNE volontairement chaque réponse à `maxRows`, comme PostgREST : un
 *  double qui rendrait tout d'un coup ne pourrait pas voir la régression que
 *  cette pagination corrige. */
function fakeSupabase(rows: { id: number; name: string | null }[], maxRows = 1000) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => ({
            data: rows.slice(from, Math.min(to + 1, from + maxRows)),
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function failingSupabase(message: string) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async () => ({ data: null, error: { message } }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const ROWS = [
  { id: 17, name: "Iron Golem" },
  // La base contient de vrais noms à espace final : le trim doit s'appliquer
  // des DEUX côtés, pas seulement sur la saisie.
  { id: 629, name: "Golem en Surcharge " },
  { id: 42, name: null },
];

describe("normalizeCardName", () => {
  it("rend une clé insensible à la casse et aux espaces de bord", () => {
    expect(normalizeCardName("  Golem EN Surcharge ")).toBe("golem en surcharge");
  });

  it("traite le vide et le non-texte comme « pas de nom »", () => {
    expect(normalizeCardName("   ")).toBeNull();
    expect(normalizeCardName("")).toBeNull();
    expect(normalizeCardName(undefined)).toBeNull();
    expect(normalizeCardName(42)).toBeNull();
  });
});

describe("findNameCollision", () => {
  it("détecte l'homonyme malgré la casse et l'espace final EN BASE", async () => {
    const hit = await findNameCollision(fakeSupabase(ROWS), "golem en surcharge");
    expect(hit).toEqual({ id: 629, name: "Golem en Surcharge " });
  });

  it("ne signale rien sur un nom libre", async () => {
    expect(await findNameCollision(fakeSupabase(ROWS), "Golem des Abîmes")).toBeNull();
  });

  it("exclut la carte en cours de renommage", async () => {
    expect(await findNameCollision(fakeSupabase(ROWS), "Iron Golem", 17)).toBeNull();
    // …mais continue de voir les AUTRES cartes.
    expect(await findNameCollision(fakeSupabase(ROWS), "Iron Golem", 629)).toMatchObject({ id: 17 });
  });

  it("ignore un nom vide plutôt que de collisionner avec une ligne à nom nul", async () => {
    expect(await findNameCollision(fakeSupabase(ROWS), "   ")).toBeNull();
  });

  it("voit une carte située AU-DELÀ du plafond de 1 000 lignes", async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, name: `Carte ${i + 1}` }));
    many[1014] = { id: 1015, name: "Refus du Destin" };
    expect(await findNameCollision(fakeSupabase(many), "refus du destin")).toEqual({
      id: 1015,
      name: "Refus du Destin",
    });
  });

  it("pagine encore correctement si le serveur plafonne PLUS BAS que la page", async () => {
    const many = Array.from({ length: 2600 }, (_, i) => ({ id: i + 1, name: `Carte ${i + 1}` }));
    many[2400] = { id: 2401, name: "Dernière Sentinelle" };
    expect(await findNameCollision(fakeSupabase(many, 500), "dernière sentinelle")).toMatchObject({
      id: 2401,
    });
  });

  it("jette au lieu de répondre « nom libre » quand la lecture échoue", async () => {
    await expect(findNameCollision(failingSupabase("boom"), "Iron Golem")).rejects.toThrow(/boom/);
  });
});
