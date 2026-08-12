// GAME_SECTIONS est écrite à la main : ce fichier est ce qui l'empêche de
// dériver. Trois vérifications par entrée, chacune correspondant à une panne
// déjà vue dans ce dépôt :
//
//  1. la route existe — une news publiée pointerait sinon vers un 404, et
//     personne ne s'en apercevrait avant un joueur (le cas qui a motivé tout
//     ceci : « la rubrique auctions » écrit à la main, alors que la route est
//     /auction au singulier) ;
//  2. la route est bien celle du menu — deux chemins vers la même section
//     divergeraient au premier renommage ;
//  3. `frLabel` est exactement la valeur de `labelKey` en français — sans quoi
//     le bouton du joueur et le lien inséré dans le Markdown afficheraient deux
//     noms différents pour la même section.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { GAME_SECTIONS, findGameSection, gameSectionMarkdownLink } from "./game-sections";

const RACINE = process.cwd();
const MAIN_MENU = fs.readFileSync(
  path.join(RACINE, "src/components/MainMenu.tsx"),
  "utf8",
);
const FR = JSON.parse(
  fs.readFileSync(path.join(RACINE, "messages/fr.json"), "utf8"),
) as { home: Record<string, string> };

describe("GAME_SECTIONS", () => {
  it("déclare plusieurs sections (le test ne tourne pas à vide)", () => {
    expect(GAME_SECTIONS.length).toBeGreaterThan(3);
    expect(GAME_SECTIONS.map((s) => s.key)).toContain("auction");
  });

  it("n'a ni clé ni route en double", () => {
    expect(new Set(GAME_SECTIONS.map((s) => s.key)).size).toBe(GAME_SECTIONS.length);
    expect(new Set(GAME_SECTIONS.map((s) => s.href)).size).toBe(GAME_SECTIONS.length);
  });

  it.each(GAME_SECTIONS.map((s) => [s.key, s] as const))(
    "« %s » pointe vers une page qui existe, connue du menu, et bien nommée",
    (_key, section) => {
      // 1. La route correspond à un vrai fichier de page de l'App Router.
      const page = path.join(RACINE, "src/app", section.href, "page.tsx");
      expect(fs.existsSync(page), `page absente pour ${section.href} (${page})`).toBe(true);

      // 2. MainMenu mène à la même route.
      expect(MAIN_MENU, `route ${section.href} absente de MainMenu`).toContain(
        `href="${section.href}"`,
      );

      // 3. Le libellé français est celui du fichier de messages, à la lettre.
      expect(FR.home[section.labelKey], `clé ${section.labelKey} absente de fr.json`).toBeTruthy();
      expect(section.frLabel, `frLabel de ${section.key} désaccordé de ${section.labelKey}`).toBe(
        FR.home[section.labelKey],
      );
    },
  );
});

// Le bouton d'action appelle `t(section.labelKey)` sur la page de la news. Une
// clé absente d'une locale ferait lever next-intl pour ce joueur-là seulement —
// invisible en test français. On vérifie donc les 8 fichiers de messages.
describe("libellés de section présents dans toutes les locales", () => {
  const locales = fs
    .readdirSync(path.join(RACINE, "messages"))
    .filter((f) => /^[a-z]{2}\.json$/.test(f));

  it("trouve bien les 8 fichiers de messages", () => {
    expect(locales.length).toBe(8);
  });

  it.each(locales)("%s traduit toutes les sections", (fichier) => {
    const messages = JSON.parse(
      fs.readFileSync(path.join(RACINE, "messages", fichier), "utf8"),
    ) as { home?: Record<string, string> };
    for (const section of GAME_SECTIONS) {
      expect(
        messages.home?.[section.labelKey],
        `${fichier} : clé home.${section.labelKey} manquante (bouton de news cassé dans cette langue)`,
      ).toBeTruthy();
    }
  });
});

describe("findGameSection", () => {
  it("retrouve une section par sa clé", () => {
    expect(findGameSection("auction")?.href).toBe("/auction");
  });

  it("rend undefined sur une clé absente, nulle ou vide (news orpheline)", () => {
    expect(findGameSection("section-supprimee")).toBeUndefined();
    expect(findGameSection(null)).toBeUndefined();
    expect(findGameSection("")).toBeUndefined();
  });
});

describe("gameSectionMarkdownLink", () => {
  it("produit un lien Markdown interne que renderMarkdown sait rendre", () => {
    const section = findGameSection("auction")!;
    expect(gameSectionMarkdownLink(section)).toBe("[Marché](/auction)");
  });
});
