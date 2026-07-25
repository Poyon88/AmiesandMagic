// Force des ancêtres +X/+Y : aura conditionnelle DYNAMIQUE — tant que le
// cimetière du PROPRIÉTAIRE compte 5 créatures ou plus, la porteuse gagne
// +X ATK / +Y PV ; le bonus retombe quand la condition se rompt (cimetière
// vidé par Exhumation/Résurrection) ou que le mot-clé disparaît. Couvre le
// seuil (5), le décompte créatures-seulement (les sorts ne comptent pas), le
// cimetière du bon joueur, la pose/dépose du bonus et la garde « ne pas tuer
// par retrait d'aura ».
import { describe, expect, it } from "vitest";
import { recalculateAuras, FORCE_ANCETRES_GRAVEYARD_THRESHOLD } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";

function mkBearer(x: number, y: number) {
  return mkInstance(mkCard({
    name: "Porteuse", attack: 2, health: 3,
    keywords: ["force_des_ancetres"],
    keyword_instances: [{ id: "force_des_ancetres", x, y }],
  }));
}

function fillGraveyard(s: ReturnType<typeof mkState>, playerIdx: 0 | 1, n: number, cardType: "creature" | "spell" = "creature") {
  for (let i = 0; i < n; i++) {
    s.players[playerIdx].graveyard.push(mkInstance(mkCard({ name: `Morte${i}`, card_type: cardType })));
  }
}

describe("Force des ancêtres +X/+Y", () => {
  it("accorde +X/+Y quand le cimetière du propriétaire compte 5 créatures", () => {
    const s = mkState();
    const bearer = mkBearer(3, 2);
    s.players[0].board.push(bearer);
    fillGraveyard(s, 0, FORCE_ANCETRES_GRAVEYARD_THRESHOLD);

    recalculateAuras(s.players[0], s.players[1]);

    expect(bearer.currentAttack).toBe(2 + 3);
    expect(bearer.currentHealth).toBe(3 + 2);
    expect(bearer.maxHealth).toBe(3 + 2);
  });

  it("aucun bonus sous le seuil (4 créatures)", () => {
    const s = mkState();
    const bearer = mkBearer(3, 2);
    s.players[0].board.push(bearer);
    fillGraveyard(s, 0, FORCE_ANCETRES_GRAVEYARD_THRESHOLD - 1);

    recalculateAuras(s.players[0], s.players[1]);

    expect(bearer.currentAttack).toBe(2);
    expect(bearer.currentHealth).toBe(3);
  });

  it("les sorts au cimetière ne comptent pas", () => {
    const s = mkState();
    const bearer = mkBearer(3, 2);
    s.players[0].board.push(bearer);
    fillGraveyard(s, 0, 4, "creature");
    fillGraveyard(s, 0, 3, "spell"); // 4 créatures + 3 sorts → condition NON remplie

    recalculateAuras(s.players[0], s.players[1]);

    expect(bearer.currentAttack).toBe(2);
    expect(bearer.currentHealth).toBe(3);
  });

  it("regarde le cimetière du PROPRIÉTAIRE, pas celui de l'adversaire", () => {
    const s = mkState();
    const bearer = mkBearer(3, 2);
    s.players[0].board.push(bearer);
    fillGraveyard(s, 1, FORCE_ANCETRES_GRAVEYARD_THRESHOLD); // cimetière adverse plein

    recalculateAuras(s.players[0], s.players[1]);

    expect(bearer.currentAttack).toBe(2);
    expect(bearer.currentHealth).toBe(3);

    // Et la réciproque : une porteuse ADVERSE en profite, elle.
    const enemyBearer = mkBearer(1, 1);
    s.players[1].board.push(enemyBearer);
    recalculateAuras(s.players[0], s.players[1]);
    expect(enemyBearer.currentAttack).toBe(2 + 1);
    expect(enemyBearer.currentHealth).toBe(3 + 1);
  });

  it("le bonus retombe quand la condition se rompt (cimetière vidé)", () => {
    const s = mkState();
    const bearer = mkBearer(2, 2);
    s.players[0].board.push(bearer);
    fillGraveyard(s, 0, FORCE_ANCETRES_GRAVEYARD_THRESHOLD);

    recalculateAuras(s.players[0], s.players[1]);
    expect(bearer.currentAttack).toBe(4);
    expect(bearer.maxHealth).toBe(5);

    // Exhumation/Résurrection : le cimetière repasse sous le seuil.
    s.players[0].graveyard.splice(0, 2);
    recalculateAuras(s.players[0], s.players[1]);

    expect(bearer.currentAttack).toBe(2);
    expect(bearer.currentHealth).toBe(3);
    expect(bearer.maxHealth).toBe(3);
  });

  it("le retrait de l'aura ne tue pas une porteuse blessée (plancher 1 PV)", () => {
    const s = mkState();
    const bearer = mkBearer(2, 4);
    s.players[0].board.push(bearer);
    fillGraveyard(s, 0, FORCE_ANCETRES_GRAVEYARD_THRESHOLD);

    recalculateAuras(s.players[0], s.players[1]);
    expect(bearer.maxHealth).toBe(7);
    // Blessée jusqu'à ne tenir que sur le bonus d'aura.
    bearer.currentHealth = 2;

    s.players[0].graveyard.length = 0; // condition rompue
    recalculateAuras(s.players[0], s.players[1]);

    expect(bearer.currentHealth).toBe(1); // clampée, pas morte
    expect(bearer.maxHealth).toBe(3);
  });
});
