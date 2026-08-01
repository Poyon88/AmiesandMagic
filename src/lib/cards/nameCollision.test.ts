import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCardName, findNameCollision } from "./nameCollision";

// Faux client : seule `from("cards").select("id, name")` est exercée.
function fakeSupabase(rows: { id: number; name: string | null }[]) {
  return {
    from: () => ({ select: async () => ({ data: rows }) }),
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
});
