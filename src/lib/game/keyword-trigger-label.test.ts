// Le DÉCLENCHEUR d'un pouvoir, entre parenthèses après son nom.
//
// Les préfixes de déclencheur avaient été retirés des descriptions : la couleur
// de l'icône devait suffire. Elle ne suffit pas — une teinte se retient mal, et
// ne se lit pas du tout sur les cartes en petit. Le mot revient, mais accroché
// au NOM du pouvoir, pas noyé dans le texte.
//
// Le piège de ce lot : le mot ne peut PAS être déduit du mode d'affichage tel
// quel. Huit capacités « à la mort » sont stockées sans mode — leur icône reste
// neutre exprès — et auraient été annoncées « Permanent ».
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { keywordTriggerLabel, keywordTriggerBadge, triggerBadge } from "./keyword-display";
import { keywordModeColor } from "./keyword-labels";
import { DEATH_NATURE_IDS, AUTOMATIC_ABILITY_IDS } from "./abilities";
import { LOW_HP_TRIGGER_THRESHOLD } from "./constants";
import type { Keyword } from "./types";

describe("Le mot du déclencheur", () => {
  it("suit le mode explicite de l'instance", () => {
    const attendu: Record<string, string> = {
      entry: "Entrée", attack: "Attaque", death: "Mort", return: "Remontée",
      tap: "Activable", end_of_turn: "Fin de tour", draw: "Pioche",
    };
    for (const [mode, mot] of Object.entries(attendu)) {
      expect(keywordTriggerLabel("taunt", { id: "taunt", mode } as never), mode).toBe(mot);
    }
  });

  it("chiffre « Sous N PV » depuis le seuil du moteur", () => {
    // Le seuil est une règle de jeu : le recopier dans huit catalogues, c'est
    // garantir qu'ils mentiront le jour où il bougera.
    expect(keywordTriggerLabel("taunt", { id: "taunt", mode: "low_hp" } as never))
      .toBe(`Sous ${LOW_HP_TRIGGER_THRESHOLD} PV`);
    expect(LOW_HP_TRIGGER_THRESHOLD).toBe(15);
  });

  it("dit « Permanent » pour un passif", () => {
    expect(keywordTriggerLabel("armure")).toBe("Permanent");
    expect(keywordTriggerLabel("terreur")).toBe("Permanent");
  });

  it("dit « Entrée » pour un effet d'arrivée simple", () => {
    expect(keywordTriggerLabel("invocation")).toBe("Entrée");
  });
});

describe("Les râles d'agonie intrinsèques", () => {
  // C'est LA correction du lot. Ces capacités n'ont pas de mode stocké : le mode
  // d'affichage les laisse neutres pour garder l'icône blanche. En déduire le
  // mot donnerait « Permanent » sur Cycle éternel ou Résurrection.
  it.each([...DEATH_NATURE_IDS])("%s est annoncée « Mort », pas « Permanent »", (kw) => {
    expect(keywordTriggerLabel(kw as Keyword)).toBe("Mort");
  });

  it("il y en a bien huit — le scan n'est pas à vide", () => {
    expect(DEATH_NATURE_IDS.size).toBe(8);
  });

  it("un mode explicite reste prioritaire sur cette correction", () => {
    expect(keywordTriggerLabel("resurrection", { id: "resurrection", mode: "tap" } as never))
      .toBe("Activable");
  });
});

describe("Cas où rien n'est annoncé", () => {
  it("le mode `spell` ne rend rien", () => {
    // Il ne désigne pas un déclencheur de créature mais la résolution du sort
    // porteur ; aucun mot ne lui a été attribué.
    expect(keywordTriggerLabel("taunt", { id: "taunt", mode: "spell" } as never)).toBeNull();
  });
});

describe("Le mot ET sa couleur vont ensemble", () => {
  it("« Mort » est rouge, « Entrée » jaune, « Permanent » blanc", () => {
    expect(triggerBadge("death")).toEqual({ label: "Mort", color: keywordModeColor("death") });
    expect(triggerBadge("entry")).toEqual({ label: "Entrée", color: keywordModeColor("entry") });
    expect(triggerBadge(undefined)).toEqual({ label: "Permanent", color: "#fff" });
  });

  it("un râle intrinsèque est annoncé en ROUGE, pas en blanc", () => {
    // C'est la contradiction que le mot avait rendue visible : le nom et
    // l'icône restent neutres (choix d'affichage assumé), mais annoncer
    // « (Mort) » en blanc revenait à dire une chose et à en peindre une autre.
    const badge = keywordTriggerBadge("cycle_eternel")!;
    expect(badge.label).toBe("Mort");
    expect(badge.color).toBe(keywordModeColor("death"));
  });

  it("chaque mot a une couleur, aucune n'est vide", () => {
    for (const mode of ["entry", "attack", "death", "return", "tap", "end_of_turn", "draw", "low_hp"] as const) {
      const b = triggerBadge(mode)!;
      expect(b, mode).toBeTruthy();
      expect(b.color, mode).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    }
  });

  it("le mode `spell` ne rend aucun badge", () => {
    expect(triggerBadge("spell")).toBeNull();
  });
});

describe("Traductions", () => {
  const LOCALES = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"];
  const CLES = ["permanent", "entry", "attack", "death", "return", "tap", "end_of_turn", "draw", "low_hp"];

  const catalogue = (loc: string) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${loc}.json`), "utf8"));

  it.each(LOCALES)("%s fournit les neuf mots", (loc) => {
    const tr = catalogue(loc).vocab.triggers;
    expect(Object.keys(tr).sort()).toEqual([...CLES].sort());
    for (const k of CLES) expect(tr[k]?.trim(), `${loc} / ${k}`).toBeTruthy();
  });

  it.each(LOCALES)("%s garde le marqueur {n} du seuil", (loc) => {
    // Substitué à la main : SafeT rend la chaîne brute, sans formatage ICU.
    expect(catalogue(loc).vocab.triggers.low_hp).toContain("{n}");
  });
});

describe("Câblage", () => {
  const RENDERERS = [
    "src/components/cards/GameCard.tsx",
    "src/components/game/HandCard.tsx",
    "src/components/game/BoardCreature.tsx",
    "src/components/game/SpellCastOverlay.tsx",
    "src/components/game/MulliganOverlay.tsx",
  ];
  const lire = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

  it.each(RENDERERS)("%s annonce le déclencheur", (f) => {
    expect(lire(f)).toContain("vocab.keywordTrigger(kw,");
  });

  it.each(RENDERERS)("%s n'impose que la COULEUR au mot", (f) => {
    // Graisse et taille restent héritées du nom : le mot doit se lire comme
    // lui. Seule la couleur est posée, et elle vient du badge — jamais
    // recalculée sur place, sinon les cinq renderers finiraient par diverger.
    const src = lire(f);
    expect(src).toContain("<span style={{ color: d.color }}> ({d.label})</span>");
    expect(src).not.toContain("fontWeight: 400, opacity: 0.75");
  });

  it("tous les blocs de description sont couverts", () => {
    // Même garde que pour les compagnons : un sixième renderer ne doit pas
    // apparaître en oubliant la parenthèse.
    const trouves = ["src/components/cards", "src/components/game"].flatMap((dir) =>
      fs.readdirSync(path.join(process.cwd(), dir))
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => `${dir}/${f}`)
        .filter((f) => lire(f).includes("buildKeywordDisplayEntries")),
    );
    expect([...trouves].sort()).toEqual([...RENDERERS].sort());
  });

  it("n'alourdit PAS les listes compactes ni les badges de la forge", () => {
    // CardPreview et CardVisual peignent des pastilles sans description : une
    // parenthèse y doublerait la largeur pour rien. CardPreview peint en outre
    // ses effets composés en doré fixe, hors de la convention de couleur.
    for (const f of ["src/components/game/CardPreview.tsx", "src/components/card-forge/CardVisual.tsx"]) {
      expect(lire(f)).not.toContain("keywordTrigger");
      expect(lire(f)).not.toContain("vocab.triggerBadge(");
      expect(lire(f)).not.toContain("vocab.composedBadge(");
    }
  });

  const AVEC_COMPOSES = RENDERERS.filter((f) => lire(f).includes("vocab.composedName(cap)"));

  it("les blocs d'effets COMPOSÉS sont couverts eux aussi", () => {
    // `composedBadge(cap)` et non `triggerBadge(cmode)` : un EMBLÈME doit
    // s'annoncer « Emblème » et non « Entrée ». Rien ne se produit à l'arrivée
    // de la carte — l'emblème y est seulement POSÉ, et parlera aux entrées
    // suivantes. Le mode seul ne pouvait pas porter cette distinction, il fallait
    // la capacité entière.
    expect(AVEC_COMPOSES.length).toBe(4); // tous sauf SpellCastOverlay, qui n'en a pas
    for (const f of AVEC_COMPOSES) expect(lire(f), f).toContain("vocab.composedBadge(cap)");
  });

  it("les passifs restent nombreux — la parenthèse n'est pas anecdotique", () => {
    expect(AUTOMATIC_ABILITY_IDS.size).toBeGreaterThan(30);
  });
});
