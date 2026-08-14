// Les COMPAGNONS d'une carte sont nommés dans son verso, partout.
//
// Demandé : voir le nom des compagnons dans le descriptif, et leur verso au
// survol.
//
// Le bloc de descriptions est réimplémenté CINQ fois — GameCard, HandCard,
// BoardCreature, SpellCastOverlay, MulliganOverlay — et aucun ne délègue aux
// autres. Écrire la liste dans chacun aurait été une sixième copie d'un motif
// qui a déjà dérivé plusieurs fois ici : d'où un composant partagé,
// `CompagnonsNames`, inséré dans les cinq.
//
// Ce test garde le CÂBLAGE : rien dans le typage n'empêche d'ajouter un sixième
// renderer sans y penser, ni d'en retirer un.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/** Les renderers qui peignent un verso de carte. */
const RENDERERS = [
  "src/components/cards/GameCard.tsx",
  "src/components/game/HandCard.tsx",
  "src/components/game/BoardCreature.tsx",
  "src/components/game/SpellCastOverlay.tsx",
  "src/components/game/MulliganOverlay.tsx",
];

describe("Câblage des noms de compagnons", () => {
  it.each(RENDERERS)("%s cite CompagnonsNames", (f) => {
    expect(lire(f)).toContain("<CompagnonsNames");
  });

  it.each(RENDERERS)("%s importe le composant partagé", (f) => {
    expect(lire(f)).toMatch(/import CompagnonsNames from "(\.\/|@\/components\/cards\/)CompagnonsNames";/);
  });

  // Compagnons existe en DEUX formes — capacité de créature et mot-clé de sort —
  // et chaque forme a son propre bloc de description, avec sa propre source
  // d'ids. Couvrir l'une sans l'autre laisse la moitié des cartes anonymes.
  it.each(RENDERERS.filter((f) => lire(f).includes("spellKeywordDesc")))(
    "%s nomme aussi les compagnons du SORT",
    (f) => {
      expect(lire(f)).toContain("<CompagnonsNames ids={spellKw.linkedCardIds}");
    },
  );

  it.each(RENDERERS)("%s nomme les compagnons de la CRÉATURE", (f) => {
    expect(lire(f)).toMatch(/<CompagnonsNames ids=\{(entry\.)?instance\?\.linkedCardIds\}/);
  });

  it("tous les renderers de verso sont couverts", () => {
    // Garde-fou du garde-fou : si un sixième bloc apparaît, il doit rejoindre
    // cette liste — sinon ses compagnons resteraient anonymes en silence.
    const trouves = ["src/components/cards", "src/components/game"].flatMap((dir) =>
      fs.readdirSync(path.join(process.cwd(), dir))
        .filter((f) => f.endsWith(".tsx"))
        .map((f) => `${dir}/${f}`)
        .filter((f) => lire(f).includes("buildKeywordDisplayEntries")),
    );
    expect([...trouves].sort()).toEqual([...RENDERERS].sort());
  });
});

describe("Le composant partagé", () => {
  const SRC = lire("src/components/cards/CompagnonsNames.tsx");

  it("montre le VERSO au survol, pas l'illustration", () => {
    expect(SRC).toContain("showDetails");
  });

  it("n'affiche RIEN tant qu'aucune carte n'est résolue", () => {
    // Hors partie, la requête est en vol au premier rendu : mieux vaut le texte
    // générique seul qu'une liste vide ou des points de suspension.
    expect(SRC).toMatch(/if \(cartes\.length === 0\) return null;/);
  });

  it("localise les noms plutôt que d'afficher le nom brut", () => {
    expect(SRC).toContain("localizeName(c)");
  });
});

describe("Le résolveur par id", () => {
  const SRC = lire("src/components/cards/useLinkedCards.ts");

  it("privilégie les pools du match — gratuit en partie", () => {
    expect(SRC).toContain("factionCardPool");
    expect(SRC).toContain("allSpellsPool");
  });

  it("ne demande au serveur que les ids MANQUANTS", () => {
    expect(SRC).toMatch(/manquants/);
    expect(SRC).toContain("/api/cards/by-ids?ids=");
  });

  it("omet les ids introuvables au lieu d'afficher un trou nommé", () => {
    expect(SRC).toMatch(/filter\(\(c\): c is Card => !!c\)/);
  });
});
