// Sang mêlé : +1 ATK / +1 PV par race alliée DIFFÉRENTE. Aura DYNAMIQUE (comme
// Commandement) — le bonus ATK ET PV monte/descend quand la diversité de races
// change (ex. mort d'un allié de race unique). Régression du bug : avant, les
// PV étaient cuits en permanent à l'invocation et ne redescendaient jamais.
import { describe, expect, it } from "vitest";
import { recalculateAuras } from "./engine";
import { mkCard, mkInstance, mkPlayer } from "./test-harness";

describe("Sang mêlé — aura dynamique ATK+PV", () => {
  it("gagne +N/+N selon les races alliées uniques et redescend quand une race disparaît", () => {
    const p1 = mkPlayer("P1");
    const p2 = mkPlayer("P2");
    const wolf = mkInstance(mkCard({ name: "Loup", attack: 1, health: 1, race: "Hommes-Loups" }));
    const bear = mkInstance(mkCard({ name: "Ours", attack: 1, health: 1, race: "Hommes-Ours" }));
    const mele = mkInstance(mkCard({ name: "Sang", attack: 2, health: 3, race: "Centaures", keywords: ["sang_mele"] }));
    p1.board = [wolf, bear, mele];

    recalculateAuras(p1, p2);
    // 2 races alliées uniques (Hommes-Loups, Hommes-Ours) → +2/+2
    expect(mele.currentAttack).toBe(4); // 2 + 2
    expect(mele.maxHealth).toBe(5); // 3 + 2
    expect(mele.currentHealth).toBe(5);
    expect(mele.sangMeleHealthBonus).toBe(2);

    // Un allié de race unique meurt → retiré du plateau.
    p1.board = [bear, mele];
    recalculateAuras(p1, p2);
    // plus qu'1 race alliée unique → +1/+1 (ATK ET PV redescendent)
    expect(mele.currentAttack).toBe(3); // 2 + 1
    expect(mele.maxHealth).toBe(4); // 3 + 1
    expect(mele.currentHealth).toBe(4);
    expect(mele.sangMeleHealthBonus).toBe(1);
  });

  it("ne tue jamais la créature via le retrait d'aura (currentHealth ≥ 1)", () => {
    const p1 = mkPlayer("P1");
    const p2 = mkPlayer("P2");
    const a = mkInstance(mkCard({ attack: 1, health: 1, race: "Hommes-Loups" }));
    const b = mkInstance(mkCard({ attack: 1, health: 1, race: "Hommes-Ours" }));
    const mele = mkInstance(mkCard({ name: "Sang", attack: 1, health: 1, race: "Centaures", keywords: ["sang_mele"] }));
    p1.board = [a, b, mele];
    recalculateAuras(p1, p2); // +2/+2 → maxHealth 3, currentHealth 3
    mele.currentHealth = 1; // a encaissé des dégâts : 1 PV restant

    // Les deux alliés uniques disparaissent d'un coup → bonus PV -2, mais la
    // garde empêche de descendre currentHealth sous 1.
    p1.board = [mele];
    recalculateAuras(p1, p2);
    expect(mele.sangMeleHealthBonus).toBe(0);
    expect(mele.maxHealth).toBe(1); // 1 + 0
    expect(mele.currentHealth).toBe(1); // pas tué par retrait d'aura
  });

  it("le silence (perte du mot-clé) retire AUSSI le bonus de PV, pas seulement l'ATK", () => {
    const p1 = mkPlayer("P1");
    const p2 = mkPlayer("P2");
    const wolf = mkInstance(mkCard({ attack: 1, health: 1, race: "Hommes-Loups" }));
    const bear = mkInstance(mkCard({ attack: 1, health: 1, race: "Hommes-Ours" }));
    const mele = mkInstance(mkCard({ name: "Sang", attack: 2, health: 3, race: "Centaures", keywords: ["sang_mele"] }));
    p1.board = [wolf, bear, mele];

    recalculateAuras(p1, p2);
    expect(mele.currentAttack).toBe(4); // 2 + 2
    expect(mele.maxHealth).toBe(5); // 3 + 2
    expect(mele.sangMeleHealthBonus).toBe(2);

    // Silence : le handler vide les mots-clés de la carte. Au recompute qui suit,
    // la créature n'a plus « sang_mele » → uniqueRaces = 0 doit ramener le PV à 0.
    mele.card = { ...mele.card, keywords: [] };
    recalculateAuras(p1, p2);

    expect(mele.currentAttack).toBe(2); // ATK plus ré-ajoutée → base
    expect(mele.maxHealth).toBe(3); // le +2 PV Sang mêlé a bien été retranché
    expect(mele.currentHealth).toBe(3);
    expect(mele.sangMeleHealthBonus).toBe(0);
  });
});
