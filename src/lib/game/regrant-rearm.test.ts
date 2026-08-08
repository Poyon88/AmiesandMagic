// Regagner une capacité DÉJÀ CONSOMMÉE doit la réarmer.
//
// Symptôme rapporté : une unité Ombre qui s'était révélée (elle a attaqué),
// re-dotée d'Ombre par « Fumée Protectrice » (sort, effet composé grant_keyword
// sur tous les alliés), restait attaquable. Le don posait le mot-clé — déjà
// présent — et s'arrêtait là : `ombreRevealed` restait à true, donc la garde
// `hasKw(c,"ombre") && !c.ombreRevealed` continuait de la considérer révélée.
//
// La même classe de bug frappait Esquive, Résurrection et Contresort. Bouclier
// et Traque, eux, se réarmaient déjà.
//
// Contre-partie verrouillée ici aussi : les AURAS de héros repassent par le même
// applyGrantedKeyword à chaque recalculateAuras. Y réarmer rendrait la cible
// indéfiniment intouchable.
import { describe, expect, it } from "vitest";
import { applyAction, getValidTargets } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, GameState, HeroDefinition } from "./types";

/** Sort « Fumée Protectrice » : confère Ombre à toutes les unités alliées. */
function fumeeProtectrice(abilityId = "ombre") {
  return mkInstance(mkCard({
    name: "Fumée Protectrice", card_type: "spell", attack: null, health: null,
    capabilities: [{
      uid: "cx_0", trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
      composed: {
        content: "grant_keyword", grantAbilityId: abilityId,
        target: { entity: "unit", side: "ally", count: "all", location: "board", designation: "automatic" },
      },
    }] as unknown as Capability[],
  }));
}

function lancer(s: GameState, spell: ReturnType<typeof fumeeProtectrice>): GameState {
  s.players[0].hand.push(spell);
  return applyAction(s, { type: "play_card", cardInstanceId: spell.instanceId });
}

describe("re-don d'une capacité consommée — Ombre", () => {
  it("une unité déjà révélée retourne dans l'ombre", () => {
    const s = mkState();
    const rodeur = mkInstance(mkCard({ name: "Rôdeur", attack: 2, health: 2, keywords: ["ombre"] as never }));
    rodeur.ombreRevealed = true; // elle a agi : elle est sortie de l'ombre
    s.players[0].board.push(rodeur);

    const next = lancer(s, fumeeProtectrice());

    expect(next.players[0].board.find((c) => c.card.name === "Rôdeur")!.ombreRevealed).toBe(false);
  });

  it("le don fonctionne aussi sur une unité qui n'avait PAS Ombre", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(mkCard({ name: "Bleu", attack: 2, health: 2 })));

    const next = lancer(s, fumeeProtectrice());
    const bleu = next.players[0].board.find((c) => c.card.name === "Bleu")!;

    expect(bleu.card.keywords).toContain("ombre");
    expect(bleu.ombreRevealed).toBe(false);
  });

  it("la protection revient : la cible sort des cibles légales", () => {
    const s = mkState();
    const rodeur = mkInstance(mkCard({ name: "Rôdeur", attack: 2, health: 8, keywords: ["ombre"] as never }));
    rodeur.ombreRevealed = true;
    s.players[1].board.push(rodeur);
    s.players[1].hand.push(fumeeProtectrice());

    // Révélée : l'assaillant d'en face peut la désigner.
    const brute = mkInstance(mkCard({ name: "Brute", attack: 3, health: 9 }));
    brute.hasSummoningSickness = false;
    s.players[0].board.push(brute);
    expect(getValidTargets(s, brute.instanceId)).toContain(rodeur.instanceId);

    // Son contrôleur relance Fumée Protectrice : elle replonge dans l'ombre.
    s.currentPlayerIndex = 1;
    const apres = applyAction(s, { type: "play_card", cardInstanceId: s.players[1].hand[0].instanceId });
    apres.currentPlayerIndex = 0;

    expect(apres.players[1].board.find((c) => c.card.name === "Rôdeur")!.ombreRevealed).toBe(false);
    expect(getValidTargets(apres, brute.instanceId)).not.toContain(rodeur.instanceId);
  });
});

describe("re-don d'une capacité consommée — autres usages", () => {
  it("Esquive dépensée ce tour est rendue", () => {
    const s = mkState();
    const agile = mkInstance(mkCard({ name: "Agile", attack: 1, health: 3, keywords: ["esquive"] as never }));
    agile.esquiveUsedThisTurn = true;
    s.players[0].board.push(agile);

    const next = lancer(s, fumeeProtectrice("esquive"));

    expect(next.players[0].board.find((c) => c.card.name === "Agile")!.esquiveUsedThisTurn).toBe(false);
  });

  it("Résurrection déjà consommée redevient disponible", () => {
    const s = mkState();
    const phenix = mkInstance(mkCard({ name: "Phénix", attack: 1, health: 3, keywords: ["resurrection"] as never }));
    phenix.hasUsedResurrection = true;
    s.players[0].board.push(phenix);

    const next = lancer(s, fumeeProtectrice("resurrection"));

    expect(next.players[0].board.find((c) => c.card.name === "Phénix")!.hasUsedResurrection).toBe(false);
  });

  it("Contresort conféré s'ARME (il ne s'activait qu'à l'entrée en jeu)", () => {
    const s = mkState();
    s.players[0].board.push(mkInstance(mkCard({ name: "Mage", attack: 1, health: 3 })));

    const next = lancer(s, fumeeProtectrice("contresort"));
    const mage = next.players[0].board.find((c) => c.card.name === "Mage")!;

    expect(mage.card.keywords).toContain("contresort");
    expect(mage.contresortActive).toBe(true);
  });
});

describe("les AURAS ne réarment pas", () => {
  it("une aura d'Ombre ne renvoie pas dans l'ombre une unité qui vient d'agir", () => {
    const s = mkState();
    const rodeur = mkInstance(mkCard({ name: "Rôdeur", attack: 2, health: 2, keywords: ["ombre"] as never }));
    rodeur.ombreRevealed = true;
    s.players[0].board.push(rodeur);
    s.players[0].hero.activeAuras = [{ keywordId: "ombre" }] as never;
    // Une action quelconque déclenche recalculateAuras.
    s.players[0].hand.push(mkInstance(mkCard({ name: "Babiole", card_type: "spell", attack: null, health: null })));

    const next = applyAction(s, { type: "end_turn" });

    // Réarmer ici la rendrait intouchable pour toujours : elle replongerait dans
    // l'ombre après chaque attaque, à chaque recalcul.
    expect(next.players[0].board.find((c) => c.card.name === "Rôdeur")!.ombreRevealed).toBe(true);
  });
});

describe("pouvoir de héros — don ponctuel", () => {
  it("réarme lui aussi la capacité consommée", () => {
    const s = mkState();
    const rodeur = mkInstance(mkCard({ name: "Rôdeur", attack: 2, health: 2, keywords: ["ombre"] as never }));
    rodeur.ombreRevealed = true;
    s.players[0].board.push(rodeur);
    s.players[0].hero.heroDefinition = {
      id: "h1", name: "Voileuse", race: "Elfes", powerName: "Voile",
      powerDescription: "", powerCost: 0,
      powerEffect: { mode: "grant_keyword", keywordId: "ombre" },
    } as unknown as HeroDefinition;

    const next = applyAction(s, {
      type: "hero_power", targetInstanceId: rodeur.instanceId,
    });

    expect(next.players[0].board.find((c) => c.card.name === "Rôdeur")!.ombreRevealed).toBe(false);
  });
});
