import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withLocalizedCards } from "./localizeCard";

type Ligne = { card_id: number; name: string | null; flavor_text: string | null; effect_text: string | null };

/** Faux PostgREST : plafonne chaque réponse à 1 000 lignes, comme le vrai, et
 *  note les filtres reçus. */
function fauxSupabase(table: Ligne[], opts: { echec?: boolean } = {}) {
  const vus = { in: [] as number[][], order: [] as string[], locale: [] as string[] };
  const client = {
    from: () => {
      let lignes = table;
      const q = {
        select: () => q,
        eq: (_col: string, v: string) => { vus.locale.push(v); return q; },
        in: (_col: string, ids: number[]) => { vus.in.push(ids); lignes = lignes.filter((l) => ids.includes(l.card_id)); return q; },
        order: (col: string) => { vus.order.push(col); return q; },
        range: (from: number, to: number) => {
          const res = opts.echec
            ? { data: null, error: { message: "boom" } }
            : { data: lignes.slice(from, Math.min(to + 1, from + 1000)), error: null };
          return { returns: () => Promise.resolve(res) };
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, vus };
}

const cartes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `FR ${i + 1}`, effect_text: null, flavor_text: null }));
const traductions = (n: number): Ligne[] => Array.from({ length: n }, (_, i) => ({ card_id: i + 1, name: `DE ${i + 1}`, flavor_text: null, effect_text: null }));

describe("withLocalizedCards", () => {
  it("traduit TOUT un catalogue au-delà du plafond de 1 000 lignes, sans .in()", async () => {
    const { client, vus } = fauxSupabase(traductions(2500));
    const out = await withLocalizedCards(client, cartes(2500), "de");
    expect(out[0].name_display).toBe("DE 1");
    expect(out[2499].name_display).toBe("DE 2500");
    expect(vus.in).toHaveLength(0);
    expect(vus.order.every((c) => c === "card_id")).toBe(true);
    expect(vus.locale.every((l) => l === "de")).toBe(true);
  });

  it("garde le filtre .in() pour une petite liste et ignore les autres lignes", async () => {
    const { client, vus } = fauxSupabase(traductions(50));
    const out = await withLocalizedCards(client, cartes(3), "de");
    expect(out.map((c) => c.name_display)).toEqual(["DE 1", "DE 2", "DE 3"]);
    expect(vus.in[0]).toEqual([1, 2, 3]);
  });

  it("retombe sur le français quand la lecture échoue, sans jeter", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client } = fauxSupabase([], { echec: true });
    const out = await withLocalizedCards(client, cartes(2), "de");
    expect(out.map((c) => c.name_display)).toEqual(["FR 1", "FR 2"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ne lit rien en français", async () => {
    const { client, vus } = fauxSupabase(traductions(5));
    const out = await withLocalizedCards(client, cartes(2), "fr");
    expect(out[0].name_display).toBe("FR 1");
    expect(vus.locale).toHaveLength(0);
  });
});
