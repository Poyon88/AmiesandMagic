// Un héros peut être le visage par défaut de sa RACE, de son CLAN, de sa
// FACTION — les trois indépendamment.
//
// Un seul drapeau existait, `is_default`, unique par race. Il ne permettait pas
// de dire « c'est LUI qui représente Les Légions du Chaos » : la faction en
// comptait deux marqués par défaut (Démons et Elfes Corrompus), et la vitrine
// devait trancher par un tri alphabétique — un arbitrage arbitraire qui n'était
// écrit nulle part.
//
// Trois colonnes plutôt qu'une colonne « portée » : un héros peut être à la
// fois le visage de sa race ET de sa faction, ce qu'une valeur unique
// interdirait.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const MIGRATION = lire("supabase-migration-hero-defaults.sql");
const ROUTE = lire("src/app/api/heroes/route.ts");
const ADMIN = lire("src/components/admin/HeroManager.tsx");
const VITRINE = lire("src/app/landing/page.tsx");

const NIVEAUX = [
  { champ: "is_default", colonne: "race" },
  { champ: "is_default_clan", colonne: "clan" },
  { champ: "is_default_faction", colonne: "faction" },
];

describe("La migration", () => {
  it("ajoute les deux colonnes sans toucher à l'existante", () => {
    expect(MIGRATION).toContain("add column if not exists is_default_clan");
    expect(MIGRATION).toContain("add column if not exists is_default_faction");
    // `is_default` reste : le renommer casserait l'index partiel en place et
    // la pastille de l'admin.
    expect(MIGRATION).not.toContain("drop column");
    expect(MIGRATION).not.toContain("rename column");
  });

  it("pose un index d'unicité par niveau", () => {
    // Sans lui, deux héros pourraient se dire tous deux visage de la faction —
    // et la vitrine retomberait sur un arbitrage arbitraire.
    expect(MIGRATION).toContain("heroes_one_default_per_clan");
    expect(MIGRATION).toContain("heroes_one_default_per_faction");
    expect(MIGRATION).toMatch(/create unique index if not exists/g);
  });

  it("est rejouable", () => {
    const creations = MIGRATION.match(/create unique index/g) ?? [];
    const gardes = MIGRATION.match(/create unique index if not exists/g) ?? [];
    expect(gardes.length).toBe(creations.length);
  });

  it("n'amorce QUE les cas sans ambiguïté", () => {
    // Là où plusieurs héros seraient candidats, la migration ne choisit pas :
    // l'admin tranche. Amorcer au hasard serait pire que ne rien faire.
    expect(MIGRATION).toContain("c.n = 1");
  });
});

describe("Le serveur tient l'unicité", () => {
  it.each(NIVEAUX)("$champ libère le titulaire précédent de son $colonne", ({ champ, colonne }) => {
    // L'index partiel REJETTE l'écriture si l'ancien titulaire n'est pas
    // libéré : sans cette passe, cocher la case renverrait une erreur opaque.
    expect(ROUTE).toContain(`['${champ}', '${colonne}'`);
  });

  it("relit le clan et la faction en base plutôt que de croire la requête", () => {
    // Le corps d'un PATCH ne porte pas forcément le clan du héros : s'y fier
    // laisserait l'ancien titulaire en place et ferait échouer l'écriture.
    expect(ROUTE).toContain("select('race, clan, faction')");
  });

  it.each(NIVEAUX)("$champ franchit la liste blanche des champs acceptés", ({ champ }) => {
    // Le piège maison : un champ absent de la liste est écarté EN SILENCE.
    expect(ROUTE.match(new RegExp(`\\b${champ}\\b`, "g"))!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("L'écran d'administration", () => {
  it("propose les trois cases", () => {
    expect(ADMIN).toContain("Défaut pour la race");
    expect(ADMIN).toContain("Défaut pour le clan");
    expect(ADMIN).toContain("Défaut pour la faction");
  });

  it("n'offre le clan et la faction que si le héros en a un", () => {
    // Cocher « défaut de clan » sur un héros sans clan ne voudrait rien dire,
    // et l'index d'unicité l'ignorerait — la case mentirait.
    expect(ADMIN).toContain("{hero.clan && (");
    expect(ADMIN).toContain("{hero.faction && (");
  });

  it("distingue les trois pastilles du bandeau", () => {
    for (const l of ["Défaut race", "Défaut clan", "Défaut faction"]) {
      expect(ADMIN, l).toContain(l);
    }
  });
});

describe("Le menu des clans ne détruit plus rien", () => {
  const ADMIN_ = lire("src/components/admin/HeroManager.tsx");

  it("n'efface le clan que si la faction en DÉCLARE", () => {
    // Sans cette condition, ouvrir la fiche d'un héros à la race héritée
    // vidait son clan en silence : la liste était vide, donc tout clan en
    // était « absent ». Elendil a perdu « Hauts-Elfes » ainsi.
    expect(ADMIN_).toContain("if (clan && availableClans.length > 0 && !availableClans.includes(clan))");
  });

  it("garde la valeur enregistrée dans la liste", () => {
    // Sinon le <select> l'affiche vide et la première sauvegarde la perd.
    expect(ADMIN_).toContain("(valeur actuelle)");
  });

  it("explique pourquoi aucun clan n'est proposé", () => {
    // Le champ Race est verrouillé en édition : sans message, l'écran n'offre
    // aucune issue et le diagnostic prend une enquête.
    expect(ADMIN_).toContain("const raceInconnue");
    expect(ADMIN_).toContain("const factionInconnue");
    expect(ADMIN_).toContain("inconnue du moteur");
    expect(ADMIN_).toMatch(/inconnue de \$\{getFactionDisplayName\(faction\)\}/);
  });
});

describe("La vitrine s'en sert", () => {
  it("préfère le défaut de FACTION au défaut de race", () => {
    // Sans ça, le nouveau drapeau serait inerte : on pourrait le cocher sans
    // que rien ne change à l'écran.
    expect(VITRINE).toContain("is_default_faction");
    // `!!h.is_default` est un préfixe de `!!h.is_default_faction` : on compare
    // donc les rangs ligne à ligne, pas par position de sous-chaîne.
    const rangs = VITRINE
      .slice(VITRINE.indexOf("const rangs"), VITRINE.indexOf("for (const retient"))
      .split("\n")
      .filter((l) => l.includes("=>"));
    expect(rangs).toHaveLength(3);
    expect(rangs[0]).toContain("!!h.is_default_faction");
    expect(rangs[1]).toContain("!!h.is_default");
    expect(rangs[1]).not.toContain("!!h.is_default_faction");
  });

  it("garde un repli jusqu'au premier héros venu", () => {
    // L'Empire du Milieu n'a aucun héros par défaut : sans ce troisième rang,
    // sa carte retomberait sur le blason générique.
    expect(VITRINE).toContain("!h.is_default_faction && !h.is_default");
  });

  it("ramène la colonne, sinon le rang de tête serait toujours vide", () => {
    expect(VITRINE).toContain("is_default, is_default_faction");
  });
});
