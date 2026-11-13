// DELETE /api/decks — supprimer un deck ne doit plus détruire de partie.
//
// La route est exécutée pour de bon contre une doublure du client Supabase qui
// rejoue le comportement de la base AVANT et APRÈS
// supabase-migration-deck-delete-preserve-matches.sql : avant, la clé étrangère
// de `matches` refuse la suppression (23503) ; après, elle met la référence à
// NULL et laisse faire.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Match { id: number; status: string; p1: number; p2: number }

const base = {
  migrationAppliquee: false,
  decks: [] as { id: number; user_id: string }[],
  matches: [] as Match[],
  file: [] as number[],
};

// Constructeur de requête minimal : mémorise table, verbe et filtres, puis
// s'exécute à l'`await` (ou à `maybeSingle`).
function requete(table: string) {
  const q = {
    verbe: "select" as "select" | "delete",
    eq: [] as [string, unknown][],
    statuts: null as string[] | null,
    ou: null as string | null,
  };
  const referenceDeck = (m: Match) => {
    if (!q.ou) return true;
    const id = Number(/player1_deck_id\.eq\.(\d+)/.exec(q.ou)![1]);
    return m.p1 === id || m.p2 === id;
  };
  const executer = () => {
    const idFiltre = q.eq.find(([c]) => c === "id" || c === "deck_id")?.[1] as number | undefined;
    if (table === "decks" && q.verbe === "select") {
      return { data: base.decks.filter((d) => d.id === idFiltre), error: null };
    }
    if (table === "matches") {
      const vises = base.matches.filter((m) => referenceDeck(m) && (!q.statuts || q.statuts.includes(m.status)));
      if (q.verbe === "delete") base.matches = base.matches.filter((m) => !vises.includes(m));
      return { data: vises.map((m) => ({ id: m.id })), error: null };
    }
    if (table === "matchmaking_queue") {
      base.file = base.file.filter((d) => d !== idFiltre);
      return { data: null, error: null };
    }
    // decks.delete()
    const reference = base.matches.some((m) => m.p1 === idFiltre || m.p2 === idFiltre) || base.file.includes(idFiltre!);
    if (reference && !base.migrationAppliquee) {
      return { data: null, error: { code: "23503", message: "violates foreign key constraint" } };
    }
    base.decks = base.decks.filter((d) => d.id !== idFiltre);
    return { data: null, error: null };
  };
  const b = {
    select: () => b,
    delete: () => { q.verbe = "delete"; return b; },
    eq: (c: string, v: unknown) => { q.eq.push([c, v]); return b; },
    in: (_c: string, v: string[]) => { q.statuts = v; return b; },
    or: (f: string) => { q.ou = f; return b; },
    limit: () => b,
    maybeSingle: async () => { const r = executer(); return { data: (r.data as unknown[] | null)?.[0] ?? null, error: r.error }; },
    then: (ok: (r: unknown) => unknown) => Promise.resolve(executer()).then(ok),
  };
  return b;
}

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "moi" } } }) } }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: requete }) }));

import { DELETE } from "@/app/api/decks/route";

const supprimer = (id: unknown) =>
  DELETE(new Request("http://localhost/api/decks", { method: "DELETE", body: JSON.stringify({ id }) }));

beforeEach(() => {
  base.decks = [{ id: 1, user_id: "moi" }, { id: 2, user_id: "autre" }];
  base.matches = [];
  base.file = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["AVANT la migration (clé étrangère bloquante)", false],
  ["APRÈS la migration (ON DELETE SET NULL)", true],
])("%s", (_nom, appliquee) => {
  beforeEach(() => { base.migrationAppliquee = appliquee; });

  it.each(["waiting", "active"])("partie `%s` ⇒ 409, ni la partie ni le deck ne bougent", async (status) => {
    base.matches = [{ id: 10, status, p1: 2, p2: 1 }];
    const res = await supprimer(1);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/partie en cours/);
    expect(base.matches).toHaveLength(1);
    expect(base.decks.some((d) => d.id === 1)).toBe(true);
  });

  it("deck jamais joué ⇒ supprimé", async () => {
    const res = await supprimer(1);
    expect(res.status).toBe(200);
    expect(base.decks.some((d) => d.id === 1)).toBe(false);
  });

  it("ne touche JAMAIS aux parties d'un autre deck", async () => {
    base.matches = [{ id: 11, status: "finished", p1: 2, p2: 2 }, { id: 12, status: "active", p1: 2, p2: 2 }];
    expect((await supprimer(1)).status).toBe(200);
    expect(base.matches).toHaveLength(2);
  });

  it("le deck d'un autre joueur ⇒ 404", async () => {
    expect((await supprimer(2)).status).toBe(404);
    expect(base.decks).toHaveLength(2);
  });

  it("identifiant non entier ⇒ 400 (il est interpolé dans un filtre)", async () => {
    expect((await supprimer("1,status.eq.active")).status).toBe(400);
    expect(base.decks).toHaveLength(2);
  });
});

describe("parties terminées", () => {
  const terminees: Match[] = [
    { id: 20, status: "finished", p1: 1, p2: 2 },
    { id: 21, status: "abandoned", p1: 2, p2: 1 },
  ];

  it("APRÈS la migration : le deck part, les parties RESTENT", async () => {
    base.migrationAppliquee = true;
    base.matches = [...terminees];
    expect((await supprimer(1)).status).toBe(200);
    expect(base.decks.some((d) => d.id === 1)).toBe(false);
    expect(base.matches).toHaveLength(2);
  });

  it("AVANT la migration : repli sur l'ancien comportement, borné aux parties terminées", async () => {
    base.migrationAppliquee = false;
    base.matches = [...terminees];
    base.file = [1];
    expect((await supprimer(1)).status).toBe(200);
    expect(base.decks.some((d) => d.id === 1)).toBe(false);
    expect(base.matches).toHaveLength(0);
    expect(base.file).toHaveLength(0);
  });
});
