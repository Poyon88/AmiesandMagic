import { describe, expect, it } from "vitest";
import {
  ORBIT_BOTTOM_DEG, ORBIT_TOP_DEG, compteurVisible, orbitLayout, segmentsAllumes, type OrbitSlot,
} from "./orbit-geometry";

const R = 137;
const T = 42;
/** Angle depuis l'horizontale CÔTÉ PLATEAU, positif vers le haut. */
const angle = (s: OrbitSlot, side: "mine" | "theirs") =>
  (Math.atan2(-s.y, side === "mine" ? -s.x : s.x) * 180) / Math.PI;
const tous = (l: ReturnType<typeof orbitLayout>) => [...l.emblems.slots, ...l.counters.slots];

describe("orbitLayout", () => {
  it("mon héros (bord droit) : tout se range à GAUCHE, côté plateau", () => {
    for (const s of tous(orbitLayout(4, 4, { side: "mine", radius: R, itemSize: T }))) expect(s.x).toBeLessThan(0);
  });

  it("emblèmes au-dessus des compteurs", () => {
    const l = orbitLayout(3, 3, { side: "mine", radius: R, itemSize: T });
    const plusBasEmbleme = Math.max(...l.emblems.slots.map(s => s.y));
    const plusHautCompteur = Math.min(...l.counters.slots.map(s => s.y));
    expect(plusBasEmbleme).toBeLessThan(plusHautCompteur);
    for (const s of l.emblems.slots) expect(s.y).toBeLessThan(0);
    for (const s of l.counters.slots) expect(s.y).toBeGreaterThan(0);
  });

  it("l'adversaire est le MIROIR horizontal", () => {
    const m = orbitLayout(3, 5, { side: "mine", radius: R, itemSize: T });
    const t = orbitLayout(3, 5, { side: "theirs", radius: R, itemSize: T });
    tous(m).forEach((s, i) => {
      expect(tous(t)[i].x).toBeCloseTo(-s.x);
      expect(tous(t)[i].y).toBeCloseTo(s.y);
    });
  });

  it("rien ne sort de l'arc, rien ne se chevauche — y compris entre les deux groupes", () => {
    for (let e = 0; e <= 9; e++) for (let c = 0; c <= 9; c++) {
      for (const side of ["mine", "theirs"] as const) {
        const slots = tous(orbitLayout(e, c, { side, radius: R, itemSize: T }));
        for (const s of slots) {
          expect(Math.hypot(s.x, s.y)).toBeCloseTo(R);
          const a = angle(s, side);
          expect(a).toBeLessThanOrEqual(ORBIT_TOP_DEG + 1e-6);
          expect(a).toBeGreaterThanOrEqual(ORBIT_BOTTOM_DEG - 1e-6);
        }
        for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
          expect(Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y)).toBeGreaterThanOrEqual(T);
        }
      }
    }
  });

  it("un groupe vide laisse sa moitié à l'autre : 7 compteurs sans emblème tiennent sans « +N »", () => {
    const l = orbitLayout(0, 7, { side: "mine", radius: R, itemSize: T });
    expect(l.counters.overflow).toBe(0);
    expect(l.counters.slots).toHaveLength(7);
  });

  it("trop d'éléments ⇒ « +N », compteurs servis d'abord, et les comptes sont justes", () => {
    const l = orbitLayout(9, 7, { side: "mine", radius: R, itemSize: T });
    expect(l.counters.overflow).toBe(0);
    expect(l.emblems.overflow).toBeGreaterThan(0);
    expect(l.emblems.slots.length - 1 + l.emblems.overflow).toBe(9);
  });

  it("peu d'éléments ⇒ pas de « +N », et rien du tout sans élément", () => {
    const l = orbitLayout(3, 2, { side: "mine", radius: R, itemSize: T });
    expect(l.emblems.overflow + l.counters.overflow).toBe(0);
    expect(tous(orbitLayout(0, 0, { side: "mine", radius: R, itemSize: T }))).toEqual([]);
  });
});

describe("jauges et visibilité", () => {
  it("segments allumés bornés à [0, n]", () => {
    expect(segmentsAllumes(5, 8)).toBe(5);
    expect(segmentsAllumes(12, 8)).toBe(8);
    expect(segmentsAllumes(null, 8)).toBe(0);
    expect(segmentsAllumes(-1, 3)).toBe(0);
  });

  it("un compteur n'apparaît qu'au-dessus de 0", () => {
    expect(compteurVisible(null)).toBe(false);
    expect(compteurVisible(0)).toBe(false);
    expect(compteurVisible(1)).toBe(true);
  });
});
