// Les pages de FACTION : adresses, clans présentés, et accès public.
//
// Trois choses que rien d'autre ne tient :
//   1. le slug d'une faction doit rester STABLE et unique — c'est une URL
//      publique, partagée et indexée ;
//   2. le portrait d'un clan est dérivé du moteur, donc il doit rester en
//      phase avec ce que le générateur produit vraiment ;
//   3. la route doit être publique, sinon le premier clic depuis la vitrine
//      renvoie vers /login — la boucle déjà vécue avec /landing.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FACTIONS } from "@/lib/card-engine/constants";
import { factionSlug, factionFromSlug, showcaseFactionSlugs } from "./faction-slug";
import { clansOfFaction } from "./clan-profile";

const PRESENTEES = Object.entries(FACTIONS)
  .filter(([, d]) => d.alignment !== "spéciale")
  .map(([id]) => id);

describe("Adresses", () => {
  it("sont celles attendues, mot pour mot", () => {
    // Figées EXPRÈS : ces URL seront partagées et indexées. Les changer devra
    // être un choix, pas un effet de bord d'un renommage d'id.
    expect(Object.keys(FACTIONS).map(factionSlug)).toEqual([
      "elfes", "nains", "empire-du-milieu", "royaumes-du-soleil", "humains",
      "hommes-betes", "elementaires", "mercenaires", "morts-vivants", "elfes-noirs",
    ]);
  });

  it("sont uniques — deux factions ne peuvent pas partager une page", () => {
    const slugs = Object.keys(FACTIONS).map(factionSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("font l'aller-retour", () => {
    for (const id of Object.keys(FACTIONS)) {
      expect(factionFromSlug(factionSlug(id))).toBe(id);
    }
  });

  it("n'ont ni accent, ni majuscule, ni espace", () => {
    for (const id of Object.keys(FACTIONS)) expect(factionSlug(id)).toMatch(/^[a-z0-9-]+$/);
  });

  it("ne proposent PAS Mercenaires — un vivier, pas une armée", () => {
    expect(showcaseFactionSlugs()).not.toContain("mercenaires");
    expect(showcaseFactionSlugs()).toHaveLength(PRESENTEES.length);
  });
});

describe("Portrait de clan", () => {
  it.each(PRESENTEES)("%s déclare des clans", (id) => {
    expect(clansOfFaction(id).length).toBeGreaterThan(0);
  });

  it("rend UN bloc par clan, même déclaré pour plusieurs races", () => {
    // La Combe Verte est déclarée pour les Hobbits ET les Hommes-Arbres. Deux
    // sections identiques sur la page seraient une régression visible.
    const combe = clansOfFaction("Elfes").filter((c) => c.nom === "La Combe Verte");
    expect(combe).toHaveLength(1);
    expect(combe[0].races).toEqual(["Hobbits", "Hommes-Arbres"]);
  });

  it("donne toute la faction à un clan transversal", () => {
    const nord = clansOfFaction("Humains").find((c) => c.nom === "Le Royaume du Nord")!;
    expect(nord.races).toEqual(FACTIONS["Humains"].races);
  });

  it("garde les jauges dans [0, 1]", () => {
    for (const id of PRESENTEES)
      for (const c of clansOfFaction(id)) {
        expect(c.offensif).toBeGreaterThanOrEqual(0);
        expect(c.offensif).toBeLessThanOrEqual(1);
        expect(c.defensif).toBeGreaterThanOrEqual(0);
        expect(c.defensif).toBeLessThanOrEqual(1);
      }
  });

  it("rend un tableau vide pour une faction inconnue, sans jeter", () => {
    expect(clansOfFaction("Gnomes de l'espace")).toEqual([]);
  });
});

describe("Descriptifs des capacités emblématiques", () => {
  const LOCALES = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"];
  const catalogue = (loc: string) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), `messages/${loc}.json`), "utf8"));

  // Le classement se fait sur les cartes : N'IMPORTE QUELLE capacité peut y
  // apparaître. Le catalogue doit donc être complet des deux côtés, pas
  // seulement sur une liste choisie d'avance.
  it.each(LOCALES)("%s nomme ET décrit chaque capacité de créature", (loc) => {
    const kw = catalogue(loc).vocab.keywords;
    const attendu = Object.keys(catalogue("fr").vocab.keywords);
    expect(attendu.length).toBeGreaterThan(40);
    for (const id of attendu) {
      expect(kw[id]?.label?.trim(), `${loc} / ${id} — libellé`).toBeTruthy();
      expect(kw[id]?.desc?.trim(), `${loc} / ${id} — descriptif`).toBeTruthy();
    }
  });

  it.each(LOCALES)("%s en fait autant pour les capacités de sort", (loc) => {
    // Un quart des cartes de clan sont des sorts : leurs capacités entrent dans
    // le classement et ont leur PROPRE espace de traduction.
    const sk = catalogue(loc).vocab.spell_keywords;
    for (const id of Object.keys(catalogue("fr").vocab.spell_keywords)) {
      expect(sk[id]?.label?.trim(), `${loc} / ${id} — libellé`).toBeTruthy();
      expect(sk[id]?.desc?.trim(), `${loc} / ${id} — descriptif`).toBeTruthy();
    }
  });

  it("l'encart lit les DEUX registres", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/components/factions/FactionClansPage.tsx"), "utf8");
    expect(src).toContain("vocab.vocab?.spell_keywords?.[e.id]?.desc");
    expect(src).toContain("vocab.vocab?.keywords?.[e.id]?.desc");
    // En portail : les blocs de portrait vivent dans une grille, un survol en
    // bord de colonne se ferait rogner.
    expect(src).toContain("createPortal");
    // Clavier et tactile, pas seulement la souris.
    expect(src).toContain("onFocus=");
    expect(src).toContain("onClick=");
  });
});

describe("Les communes SANS clan", () => {
  const LOCALES_ = ["fr", "en", "es", "de", "it", "pt", "ja", "zh"];
  const PAGE = fs.readFileSync(
    path.join(process.cwd(), "src/app/factions/[slug]/page.tsx"), "utf8");
  const VUE = fs.readFileSync(
    path.join(process.cwd(), "src/components/factions/FactionClansPage.tsx"), "utf8");

  it("sont bien récupérées — la requête d'AFFICHAGE ne les écarte plus", () => {
    // Elles représentent 23 à 40 communes par faction : les filtrer revenait à
    // cacher un tiers à la moitié du commun.
    //
    // On ne vise que la requête d'affichage : celle du COMPTAGE, elle, écarte
    // légitimement les cartes sans clan — on y classe les capacités par clan.
    const affichage = PAGE.slice(
      PAGE.indexOf(".select(COLONNES_CARTE)"),
      PAGE.indexOf('.select("clan, keywords, spell_keywords")'),
    );
    expect(affichage).not.toContain('.not("clan", "is", null)');
    expect(PAGE).toContain("const sansClan: Card[] = []");
  });

  it("ne sont pas mêlées aux clans", () => {
    expect(VUE).toContain("sansClan: Card[]");
    expect(VUE).toContain("<SansClanSection");
  });

  it("comptent dans le total annoncé en tête de page", () => {
    expect(VUE).toContain("+ sansClan.length");
  });

  it.each(LOCALES_)("%s annonce la règle qui les rend universelles", (loc) => {
    const p = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), `messages/${loc}.json`), "utf8"),
    ).factions_page;
    expect(p.no_clan_title?.trim(), `${loc} — titre`).toBeTruthy();
    expect(p.no_clan_desc?.trim(), `${loc} — explication`).toBeTruthy();
  });

  it("la règle annoncée est bien celle du constructeur de deck", () => {
    // La page promet qu'une carte sans clan entre dans n'importe quel deck.
    // C'est vrai parce que la limite d'un clan est gardée par `card.clan &&` :
    // une carte sans clan n'y entre jamais. Si cette garde changeait, la page
    // mentirait — d'où ce test au contact du vrai code.
    const builder = fs.readFileSync(
      path.join(process.cwd(), "src/components/deck/DeckBuilder.tsx"), "utf8");
    const regle = builder.split("\n").find((l) => l.includes("one_clan_only"))!;
    expect(regle).toContain("card.clan &&");
  });
});

describe("Accès", () => {
  const PROXY = fs.readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");

  it("/factions est public — sinon le clic depuis la vitrine rebondit", () => {
    const ligne = PROXY.match(/const PUBLIC_PATH_PREFIXES = .*/)![0];
    expect(ligne).toContain('"/factions"');
    expect(ligne).toContain('"/landing"');
  });

  it("le pied de page ramène à la GRILLE des factions, pas en haut", () => {
    const vue = fs.readFileSync(
      path.join(process.cwd(), "src/components/factions/FactionClansPage.tsx"), "utf8");
    const landing = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
    expect(vue).toContain('href="/landing#factions"');
    // Sans cette ancre, le lien retomberait silencieusement en haut de
    // l'accueil : le visiteur devrait re-parcourir toute la page.
    expect(landing).toContain('id="factions"');
  });

  it.each(["fr", "en", "es", "de", "it", "pt", "ja", "zh"])(
    "%s nomme le bouton vers les autres factions",
    (loc) => {
      const p = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), `messages/${loc}.json`), "utf8"),
      ).factions_page;
      expect(p.other_factions?.trim(), `${loc}`).toBeTruthy();
    },
  );

  it("la vitrine pointe vers ces pages", () => {
    const landing = fs.readFileSync(
      path.join(process.cwd(), "src/components/landing/LandingPage.tsx"), "utf8");
    expect(landing).toContain("href={`/factions/${factionSlug(factionId)}`}");
  });

  it("la page n'expose que des cartes obtenables", () => {
    // Une commune écartée des tirages ne s'obtient pas : l'afficher sur la page
    // qui promet « tout le commun de la faction » serait mentir.
    const page = fs.readFileSync(
      path.join(process.cwd(), "src/app/factions/[slug]/page.tsx"), "utf8");
    expect(page).toContain('.eq("discoverable", true)');
    expect(page).toContain('.eq("rarity", "Commune")');
  });
});
