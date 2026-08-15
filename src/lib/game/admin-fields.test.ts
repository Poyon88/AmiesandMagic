// Les champs de l'ADMINISTRATION doivent rester lisibles.
//
// L'administration est peinte sur fond blanc, alors que `--am-ink` (#efe8d6)
// est une teinte parchemin conçue pour les fonds sombres du jeu. Un champ qui
// n'impose pas sa couleur l'hérite, et la valeur saisie devient presque
// invisible — « Durgrim », « dwarves », « 2 » étaient illisibles dans l'écran
// des héros.
//
// Corrigé par une règle de FEUILLE DE STYLE portée par le conteneur `am-admin`,
// et non en éditant les quatre-vingt-seize champs concernés : un `style` en
// ligne surcharge toujours une feuille, donc les champs qui ont déjà leur
// couleur gardent la leur.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const lire = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const CSS = lire("src/app/globals.css");
const LAYOUT = lire("src/app/admin/layout.tsx");

describe("La règle globale", () => {
  it("existe et vise les trois sortes de champs", () => {
    for (const sel of [".am-admin input", ".am-admin select", ".am-admin textarea"]) {
      expect(CSS, sel).toContain(sel);
    }
  });

  it("impose une encre SOMBRE — c'était tout le problème", () => {
    const bloc = CSS.slice(CSS.indexOf(".am-admin input,"));
    expect(bloc).toMatch(/color:\s*#1a1a1a/);
  });

  it("épargne les cases et les boutons radio", () => {
    // Leur imposer un fond blanc écraserait la coche elle-même sur certains
    // navigateurs — le remède serait pire que le mal.
    expect(CSS).toContain('.am-admin input[type="checkbox"]');
    expect(CSS).toContain('.am-admin input[type="radio"]');
    expect(CSS).toContain("background-color: initial");
  });

  it("distingue le texte de substitution de la valeur saisie", () => {
    expect(CSS).toContain(".am-admin input::placeholder");
    // Firefox atténue les placeholders par défaut, ce qui les efface presque.
    expect(CSS.slice(CSS.indexOf("::placeholder"))).toContain("opacity: 1");
  });
});

describe("Le conteneur", () => {
  it("porte la classe, sinon la règle ne s'applique nulle part", () => {
    expect(LAYOUT).toContain('className="am-admin"');
  });
});

describe("L'écran des héros", () => {
  const ADMIN = lire("src/components/admin/HeroManager.tsx");

  it("son style de champ déclare sa couleur ET son fond", () => {
    // La règle globale suffirait, mais ce style est la référence copiée dans
    // l'écran : le laisser muet inviterait à recréer le défaut ailleurs.
    const bloc = ADMIN.slice(ADMIN.indexOf("  input: {"), ADMIN.indexOf("  badge: {"));
    expect(bloc).toContain('color: "#1a1a1a"');
    expect(bloc).toContain('background: "#fff"');
  });

  it("agrandit la saisie — 12 px sur du serif était juste", () => {
    const bloc = ADMIN.slice(ADMIN.indexOf("  input: {"), ADMIN.indexOf("  badge: {"));
    const taille = Number(bloc.match(/fontSize:\s*([\d.]+)/)![1]);
    expect(taille).toBeGreaterThanOrEqual(13);
  });
});
