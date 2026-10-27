// Unités BI-RACE (`race` + `race2`, ex. un Elfe chevauchant un Aigle Géant) :
// elles comptent comme membres de CHACUNE de leurs races pour toutes les
// mécaniques de race, et Sang mêlé compte l'UNION des races alliées.
import { describe, expect, it } from "vitest";
import { applyAction, recalculateAuras } from "./engine";
import { getEntraideReduction } from "./abilities";
import { cardRaces, hasRace, sharesRace, formatRaces } from "./races";
import { resolveMarkers } from "./desc-markers";
import { mkCard, mkInstance, mkPlayer, mkState } from "./test-harness";

describe("races.ts", () => {
  it("lit 0, 1 ou 2 races, principale en tête, sans doublon", () => {
    expect(cardRaces({})).toEqual([]);
    expect(cardRaces({ race: "Elfes" })).toEqual(["Elfes"]);
    expect(cardRaces({ race: "Elfes", race2: "Aigles Géants" })).toEqual(["Elfes", "Aigles Géants"]);
    expect(cardRaces({ race: "Elfes", race2: "Elfes" })).toEqual(["Elfes"]);
    expect(formatRaces({ race: "Dragons", race2: "Zombies" })).toBe("Dragons / Zombies");
  });

  it("hasRace / sharesRace considèrent les deux races", () => {
    const monture = { race: "Elfes", race2: "Aigles Géants" };
    expect(hasRace(monture, "Aigles Géants")).toBe(true);
    expect(hasRace(monture, "Nains")).toBe(false);
    expect(sharesRace(monture, { race: "Aigles Géants" })).toBe(true);
    expect(sharesRace({ race: "Elfes" }, monture)).toBe(true);
    expect(sharesRace(monture, { race: "Nains" })).toBe(false);
    expect(sharesRace({}, {})).toBe(false);
  });
});

describe("Sang mêlé — union des races alliées", () => {
  it("un allié bi-race apporte ses deux races, sans compter deux fois une race partagée", () => {
    const p1 = mkPlayer("P1");
    const p2 = mkPlayer("P2");
    const monture = mkInstance(mkCard({ race: "Elfes", race2: "Aigles Géants" }));
    const elfe = mkInstance(mkCard({ race: "Elfes" }));
    const mele = mkInstance(mkCard({ attack: 1, health: 1, race: "Centaures", keywords: ["sang_mele"] }));
    p1.board = [monture, elfe, mele];
    recalculateAuras(p1, p2);
    // Elfes + Aigles Géants = 2 races distinctes → +2/+2
    expect(mele.currentAttack).toBe(3);
    expect(mele.maxHealth).toBe(3);
  });

  it("ses propres races ne comptent pas", () => {
    const p1 = mkPlayer("P1");
    const p2 = mkPlayer("P2");
    const mele = mkInstance(mkCard({ attack: 1, health: 1, race: "Dragons", race2: "Zombies", keywords: ["sang_mele"] }));
    p1.board = [mele];
    recalculateAuras(p1, p2);
    expect(mele.currentAttack).toBe(1);
  });
});

describe("Mécaniques « même race » avec une unité bi-race", () => {
  it("Loyauté d'une unité bi-race compte les alliés de l'une OU l'autre race", () => {
    const s = mkState();
    const p = s.players[0];
    p.board = [
      mkInstance(mkCard({ race: "Elfes" })),
      mkInstance(mkCard({ race: "Aigles Géants" })),
      mkInstance(mkCard({ race: "Nains" })),
    ];
    const fidele = mkInstance(mkCard({ attack: 1, health: 1, race: "Elfes", race2: "Aigles Géants", keywords: ["loyaute"] }));
    p.hand.push(fidele);
    const st = applyAction(s, { type: "play_card", cardInstanceId: fidele.instanceId });
    const posee = st.players[0].board.find((c) => c.card.id === fidele.card.id)!;
    expect(posee.loyauteATKBonus).toBe(2);
  });

  it("une unité bi-race profite de la Loyauté d'un allié de sa SECONDE race", () => {
    const s = mkState();
    const p = s.players[0];
    p.board = [mkInstance(mkCard({ race: "Zombies", race2: "Dragons" }))];
    const fidele = mkInstance(mkCard({ attack: 1, health: 1, race: "Dragons", keywords: ["loyaute"] }));
    p.hand.push(fidele);
    const st = applyAction(s, { type: "play_card", cardInstanceId: fidele.instanceId });
    const posee = st.players[0].board.find((c) => c.card.id === fidele.card.id)!;
    expect(posee.loyauteATKBonus).toBe(1);
  });

  it("Entraide ciblant une race compte les alliés bi-race qui la portent en seconde race", () => {
    const card = mkCard({ keywords: ["entraide"], entraide_race: "Aigles Géants" });
    const board = [
      mkInstance(mkCard({ race: "Elfes", race2: "Aigles Géants" })),
      mkInstance(mkCard({ race: "Aigles Géants" })),
      mkInstance(mkCard({ race: "Elfes" })),
    ];
    expect(getEntraideReduction(card, board)).toBe(2);
  });
});

describe("Description — les deux races sont nommées", () => {
  it("{race_pl} d'une unité bi-race liste ses deux races", () => {
    const out = resolveMarkers("vos {race_pl}", "loyaute", { card: { race: "Elfes", race2: "Aigles Géants" } });
    expect(out).toMatch(/^vos Elfes ou Aigles Géants$/);
  });
});
