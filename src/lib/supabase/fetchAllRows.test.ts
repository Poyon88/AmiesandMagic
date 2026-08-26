import { describe, it, expect } from "vitest";
import { fetchAllRows, scanAllRows } from "./fetchAllRows";

/** Faux PostgREST : il PLAFONNE chaque réponse à `maxRows`, comme le vrai.
 *  Compte aussi les appels, pour prouver la sortie anticipée. */
function pager(rows: { id: number }[], maxRows = 1000) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + maxRows)), error: null };
  };
  return { page, calls };
}

const MANY = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1 }));

describe("fetchAllRows", () => {
  it("rend TOUTES les lignes au-delà du plafond de 1 000", async () => {
    const { page } = pager(MANY);
    const out = await fetchAllRows(page);
    expect(out).toHaveLength(2500);
    expect(out[2499]).toEqual({ id: 2500 });
  });

  it("continue de paginer si le serveur plafonne PLUS BAS que la page demandée", async () => {
    // Le piège : avancer de `pageSize` au lieu du nombre de lignes reçues
    // s'arrêterait ici à 300 lignes en se croyant au bout.
    const { page } = pager(MANY, 300);
    expect(await fetchAllRows(page)).toHaveLength(2500);
  });

  it("ne demande qu'une page quand la table est plus courte", async () => {
    const { page, calls } = pager(MANY.slice(0, 10));
    expect(await fetchAllRows(page)).toHaveLength(10);
    expect(calls).toHaveLength(2); // la page pleine, puis la page vide qui arrête
  });

  it("jette au lieu de rendre une liste tronquée quand la lecture échoue", async () => {
    const failing = async () => ({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(failing, { label: "Catalogue" })).rejects.toThrow(/Catalogue : boom/);
  });
});

describe("scanAllRows", () => {
  it("s'arrête dès que `visit` rend une valeur", async () => {
    const { page, calls } = pager(MANY);
    const hit = await scanAllRows(page, (rows) => rows.find((r) => r.id === 42));
    expect(hit).toEqual({ id: 42 });
    expect(calls).toHaveLength(1); // trouvé page 1 : pas de 2e aller-retour
  });

  it("va chercher au-delà du plafond quand la cible est plus loin", async () => {
    const { page, calls } = pager(MANY);
    expect(await scanAllRows(page, (rows) => rows.find((r) => r.id === 2400))).toEqual({ id: 2400 });
    expect(calls).toHaveLength(3);
  });

  it("rend null quand rien ne correspond", async () => {
    const { page } = pager(MANY);
    expect(await scanAllRows(page, (rows) => rows.find((r) => r.id === 99999))).toBeNull();
  });
});
