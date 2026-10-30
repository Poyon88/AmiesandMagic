// MENU D'ACTIVATION — une créature qui porte plusieurs pouvoirs activables les
// propose TOUS, et le joueur choisit lequel utiliser. Le moteur savait déjà
// activer n'importe lequel (par rang de mot-clé ou par uid de composé) : c'est
// l'interface qui ne voyait que le premier. On verrouille ici la liste, son
// ordre, et le fait qu'activer un pouvoir AUTRE que le premier fonctionne et
// engage la créature pour le tour.
import { describe, expect, it } from "vitest";
import { applyAction, peutActiverPouvoir, pouvoirsActivables } from "./engine";
import { mkCard, mkInstance, mkState } from "./test-harness";
import type { Capability, ComposedEffect, KeywordInstance } from "./types";

const cap = (uid: string, composed: ComposedEffect): Capability =>
  ({ uid, trigger: "on_activation", effectKind: "immediate", abilityId: "_composed", composed });

function polyvalente() {
  const c = mkInstance(mkCard({
    name: "Polyvalente", mana_cost: 0, attack: 1, health: 3,
    keywords: ["afflux", "impact"],
    keyword_instances: [
      { id: "afflux", mode: "tap", x: 2 },
      { id: "impact", x: 1 },            // à l'entrée : pas un pouvoir activable
    ] as KeywordInstance[],
    capabilities: [
      cap("pioche", { content: "draw_cards", magnitude: { x: 1 } }),
      cap("mana", { content: "gain_mana", magnitude: { x: 3 } }),
    ],
  }));
  c.hasSummoningSickness = false;
  return c;
}

describe("la liste des pouvoirs activables", () => {
  it("mots-clés « tap » d'abord, puis TOUS les composés à l'activation", () => {
    const p = pouvoirsActivables(null, polyvalente());
    expect(p.map(x => x.kind === "keyword" ? `kw:${x.instance.id}` : x.kind === "composed" ? `cx:${x.uid}` : x.kind))
      .toEqual(["kw:afflux", "cx:pioche", "cx:mana"]);
  });

  it("le rang du mot-clé est celui de keyword_instances (ce qu'attend tap_activate)", () => {
    const c = polyvalente();
    c.card = { ...c.card, keyword_instances: [{ id: "impact", x: 1 }, { id: "afflux", mode: "tap", x: 2 }] as KeywordInstance[] };
    const kw = pouvoirsActivables(null, c).find(x => x.kind === "keyword");
    expect(kw && kw.kind === "keyword" ? kw.instanceIdx : -1).toBe(1);
  });

  it("une créature sans pouvoir activable : liste vide", () => {
    expect(pouvoirsActivables(null, mkInstance(mkCard({ name: "Nue", attack: 1, health: 1 })))).toEqual([]);
  });

  it("sans sort mémorisé, aucune entrée « sort appris »", () => {
    const s = mkState();
    const c = polyvalente();
    s.players[0].board.push(c);
    expect(pouvoirsActivables(s, c).some(x => x.kind === "learned")).toBe(false);
  });
});

describe("activer un pouvoir qui n'est PAS le premier", () => {
  it("le second composé se résout, seul", () => {
    const s = mkState();
    const c = polyvalente();
    s.players[0].mana = 0;
    s.players[0].deck.push(mkInstance(mkCard({ name: "Pioche" })));
    s.players[0].board.push(c);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: -1, composedUid: "mana" });
    expect(st.players[0].mana).toBe(3);
    expect(st.players[0].hand.length).toBe(0); // la pioche n'a pas eu lieu
  });

  it("une seule activation par tour, quel que soit le pouvoir choisi", () => {
    const s = mkState();
    const c = polyvalente();
    s.players[0].mana = 0;
    s.players[0].board.push(c);
    const st = applyAction(s, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: -1, composedUid: "mana" });
    const apres = st.players[0].board[0];
    expect(peutActiverPouvoir(apres)).toBe(false);
    const re = applyAction(st, { type: "tap_activate", sourceInstanceId: c.instanceId, instanceIdx: 0 });
    expect(re.players[0].mana).toBe(3); // l'Afflux refusé : créature engagée
  });
});
