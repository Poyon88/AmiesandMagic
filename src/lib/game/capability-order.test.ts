// L'ordre des pouvoirs d'une créature est celui de `keywords[]`.
//
// Constaté sur « Devin du Ciel Fendu » (Divination · Préincanter 2 ·
// Inspiration 1) : la forge affiche cet ordre dans « Déclenchement des
// pouvoirs », mais la carte en base portait des `capabilities` dans un autre —
// Divination reléguée en DERNIER. Or ce sont les capabilities qui pilotent la
// résolution, et l'ordre compte dès qu'un pouvoir prépare le terrain d'un autre.
//
// Cause : `effectiveCreatureInstances` concaténait `[...keyword_instances,
// ...mots-clés sans instance]`. Un mot-clé sans X n'a pas d'instance (rien à y
// stocker) : il partait donc systématiquement en queue, quel que soit son rang
// dans `keywords[]`. `keyword_instances` est une source de DONNÉES (x, y, mode),
// pas un ordre.
import { describe, expect, it } from "vitest";
import { deriveCapabilities, getCapabilities } from "./capability-adapter";
import { mkCard } from "./test-harness";
import type { Card, KeywordInstance } from "./types";

/** Ordre des abilities dérivées, dans l'ordre des capabilities. */
// `getCapabilities` est le point d'entrée du MOTEUR : c'est lui qui privilégie
// la colonne persistée. `deriveCapabilities` seul ne voit jamais ce chemin — d'où
// le trou de la première passe.
const ordre = (card: Card) => getCapabilities(card).map((c) => c.abilityId);
const deriveCapabilitiesOfCard = (card: Card) => getCapabilities(card);

describe("Ordre des pouvoirs d'une créature", () => {
  it("« Devin du Ciel Fendu » : Divination reste en TÊTE, comme déclaré", () => {
    // Donnée exacte relevée en base, hors capabilities (qui sont dérivées).
    const card = mkCard({
      name: "Devin du Ciel Fendu", mana_cost: 3, attack: 2, health: 1,
      keywords: ["divination", "preincanter", "inspiration"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });

    expect(ordre(card)).toEqual(["divination", "preincanter", "inspiration"]);
  });

  it("le mot-clé sans X peut être au milieu, ou en dernier", () => {
    const milieu = mkCard({
      keywords: ["preincanter", "divination", "inspiration"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(milieu)).toEqual(["preincanter", "divination", "inspiration"]);

    const fin = mkCard({
      keywords: ["preincanter", "inspiration", "divination"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(fin)).toEqual(["preincanter", "inspiration", "divination"]);
  });

  it("l'ordre des instances ne prime PAS sur celui de keywords[]", () => {
    // Instances volontairement en ordre inverse : elles portent les données, pas
    // le rang.
    const card = mkCard({
      keywords: ["preincanter", "inspiration"] as never,
      keyword_instances: [
        { id: "inspiration", x: 1 },
        { id: "preincanter", x: 2 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(card)).toEqual(["preincanter", "inspiration"]);
  });

  it("les X restent appariés au bon mot-clé après réordonnancement", () => {
    const card = mkCard({
      keywords: ["divination", "preincanter", "inspiration"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "inspiration", x: 1 },
      ] as unknown as KeywordInstance[],
    });
    const caps = deriveCapabilities(card);
    const x = (id: string) => caps.find((c) => c.abilityId === id)?.params?.x;
    expect(x("preincanter")).toBe(2);
    expect(x("inspiration")).toBe(1);
  });

  it("sans aucune instance, l'ordre de keywords[] est déjà respecté (inchangé)", () => {
    const card = mkCard({
      keywords: ["divination", "augure", "bravoure"] as never,
    });
    expect(ordre(card)).toEqual(["divination", "augure", "bravoure"]);
  });
});

describe("Ordre des pouvoirs — données héritées préservées", () => {
  it("une instance absente de keywords[] n'est pas perdue (rangée en queue)", () => {
    const card = mkCard({
      keywords: ["divination"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
      ] as unknown as KeywordInstance[],
    });
    expect(ordre(card)).toEqual(["divination", "preincanter"]);
  });

  it("deux instances d'un même id sont toutes conservées", () => {
    // Une Map id→instance unique en aurait perdu une.
    const card = mkCard({
      keywords: ["preincanter", "divination"] as never,
      keyword_instances: [
        { id: "preincanter", x: 2 },
        { id: "preincanter", x: 5, mode: "death" },
      ] as unknown as KeywordInstance[],
    });
    const caps = deriveCapabilities(card);
    expect(caps.filter((c) => c.abilityId === "preincanter")).toHaveLength(2);
    // Et Divination reste APRÈS les deux, comme dans keywords[].
    expect(ordre(card)).toEqual(["preincanter", "preincanter", "divination"]);
  });

  it("un id répété dans keywords[] ne dédouble pas la capacité", () => {
    const card = mkCard({
      keywords: ["divination", "preincanter", "divination"] as never,
      keyword_instances: [{ id: "preincanter", x: 2 }] as unknown as KeywordInstance[],
    });
    expect(ordre(card)).toEqual(["divination", "preincanter"]);
  });
});

// ─── Capacités PERSISTÉES ──────────────────────────────────────────────────
// Le trou de la première passe. `getCapabilities` privilégie `card.capabilities`
// quand la colonne existe — donc pour TOUTES les cartes de la forge — et ne
// dérive qu'à défaut. Mes tests d'alors construisaient des cartes SANS cette
// colonne : ils validaient la dérivation, jamais le chemin réellement emprunté en
// partie. Le symptôme est resté entier : sur « Devin du Ciel Fendu », Préincanter
// se résolvait avant Divination et ne pouvait donc pas voir le sort que Divination
// venait de poser sur le dessus du deck.
describe("Ordre des pouvoirs — capacités PERSISTÉES", () => {
  /** Devin du Ciel Fendu, exactement comme en base : `capabilities` figé dans le
   *  mauvais ordre (Divination en queue), `keywords` dans le bon. */
  const devinPersiste = () => mkCard({
    name: "Devin du Ciel Fendu", mana_cost: 3, attack: 2, health: 1,
    keywords: ["divination", "preincanter", "inspiration"] as never,
    keyword_instances: [
      { id: "preincanter", x: 2 },
      { id: "inspiration", x: 1 },
    ] as unknown as KeywordInstance[],
    capabilities: [
      { uid: "cw_0", params: { x: 2 }, targets: [], trigger: "on_play", abilityId: "preincanter", effectKind: "immediate" },
      { uid: "cw_1", params: { x: 1 }, targets: [], trigger: "on_play", abilityId: "inspiration", effectKind: "immediate" },
      { uid: "cw_2", targets: [], trigger: "on_play", abilityId: "divination", effectKind: "immediate" },
    ] as never,
  });

  it("l'ordre persisté est corrigé à la LECTURE, sans migration", () => {
    expect(ordre(devinPersiste())).toEqual(["divination", "preincanter", "inspiration"]);
  });

  it("les uid restent attachés à leur capacité (clé des pickers composés)", () => {
    const caps = deriveCapabilitiesOfCard(devinPersiste());
    const uid = (id: string) => caps.find((c) => c.abilityId === id)?.uid;
    expect(uid("preincanter")).toBe("cw_0");
    expect(uid("inspiration")).toBe("cw_1");
    expect(uid("divination")).toBe("cw_2");
  });

  it("les paramètres suivent leur capacité", () => {
    const caps = deriveCapabilitiesOfCard(devinPersiste());
    expect(caps.find((c) => c.abilityId === "preincanter")?.params?.x).toBe(2);
    expect(caps.find((c) => c.abilityId === "inspiration")?.params?.x).toBe(1);
  });

  it("un effet COMPOSÉ reste en queue, sans se faire dépasser", () => {
    // Louve kiptchake : deux mots-clés + un composé. L'ordre relatif du composé
    // ne doit pas bouger — c'est celui que produit déjà la sauvegarde.
    const louve = mkCard({
      name: "Louve kiptchake", mana_cost: 2, attack: 2, health: 1,
      keywords: ["impact", "ombre"] as never,
      keyword_instances: [{ id: "impact", x: 1 }] as unknown as KeywordInstance[],
      capabilities: [
        { uid: "cw_0", params: { x: 1 }, targets: [], trigger: "on_play", abilityId: "impact", effectKind: "immediate" },
        { uid: "cw_1", targets: [], trigger: "automatic", abilityId: "ombre", effectKind: "immediate" },
        { uid: "cx_0", trigger: "on_attack", abilityId: "_composed", effectKind: "immediate", composed: { content: "bounce", target: { entity: "self", side: "enemy", count: 1, location: "board", designation: "automatic" } } },
      ] as never,
    });
    expect(ordre(louve)).toEqual(["impact", "ombre", "_composed"]);
  });

  it("un SORT n'est pas réordonné : ses sk_i suivent spell_keywords", () => {
    const sort = mkCard({
      name: "Lame consacrée", card_type: "spell", attack: null, health: null, mana_cost: 2,
      spell_keywords: [{ id: "impact", amount: 2 }, { id: "precision" }, { id: "incineration", amount: 1 }] as never,
      capabilities: [
        { uid: "sk_0", params: { x: 2 }, targets: [], trigger: "spell_resolution", abilityId: "impact", effectKind: "immediate" },
        { uid: "sk_1", targets: [], trigger: "spell_resolution", abilityId: "precision", effectKind: "immediate" },
        { uid: "sk_2", params: { x: 1 }, targets: [], trigger: "spell_resolution", abilityId: "incineration", effectKind: "immediate" },
      ] as never,
    });
    expect(ordre(sort)).toEqual(["impact", "precision", "incineration"]);
  });
});
