import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// La forge (onglet Édition) rendait les ~2 600 cartes du catalogue d'un coup,
// chacune en `GameCard` complète (écus en clip-path + drop-shadow, SVG à
// dégradés, container queries, overlay avec backdrop-filter) : un iPad mettait
// une minute à répondre au moindre toucher. Le correctif tient en deux pièces
// que ce test verrouille par le SOURCE, faute de pouvoir mesurer le thread
// principal d'un iPad ici :
//   1. la grille est VIRTUALISÉE (react-virtuoso), seules les rangées visibles
//      existent dans le DOM ;
//   2. la cellule courante est une VIGNETTE ALLÉGÉE (CardThumb), sans filtre,
//      sans container query ni découpe ; le rendu complet reste réservé à la
//      carte sélectionnée.
const EDITOR = readFileSync(resolve(__dirname, "../../components/admin/CardEditor.tsx"), "utf8");
const THUMB = readFileSync(resolve(__dirname, "../../components/cards/CardThumb.tsx"), "utf8");
const LAYOUT = readFileSync(resolve(__dirname, "../../app/admin/layout.tsx"), "utf8");
const SIDEBAR = readFileSync(resolve(__dirname, "../../components/admin/AdminSidebar.tsx"), "utf8");

describe("grille de l'éditeur de cartes (forge) — iPad", () => {
  it("la grille est virtualisée et rend des vignettes allégées", () => {
    expect(EDITOR).toContain("VirtuosoGrid");
    expect(EDITOR).toContain("<CardThumb");
    // Plus de `filteredCards.map(card => ... <GameCard` : c'était le rendu de
    // tout le catalogue d'un coup.
    const grille = EDITOR.slice(EDITOR.indexOf("<VirtuosoGrid"), EDITOR.indexOf("itemContent"));
    expect(grille).toContain("data={filteredCards}");
    expect(EDITOR).not.toMatch(/filteredCards\.map\(card => \(\s*<div key=\{card\.id\} onClick=\{\(\) => selectCard\(card\)\}[^]*?<GameCard/);
  });

  it("seule la carte SÉLECTIONNÉE reçoit le rendu complet (GameCard)", () => {
    const item = EDITOR.slice(EDITOR.indexOf("itemContent"), EDITOR.indexOf("listClassName") > 0 ? EDITOR.length : 0);
    expect(item).toMatch(/selectedCard\?\.id === card\.id \? \(\s*<div[^]*?<GameCard/);
  });

  it("la vignette n'emploie ni filtre, ni container query, ni découpe, ni SVG", () => {
    const corps = THUMB.replace(/\/\/.*$/gm, "").replace(/\/\*[^]*?\*\//g, "");
    expect(corps).not.toMatch(/\bfilter\s*:/);
    expect(corps).not.toMatch(/backdropFilter|WebkitBackdropFilter/);
    expect(corps).not.toMatch(/\bcqw\b/);
    expect(corps).not.toMatch(/containerType|clipPath/);
    expect(corps).not.toMatch(/<svg/);
  });

  it("la racine de l'administration ne verrouille plus le défilement tactile", () => {
    expect(LAYOUT).not.toMatch(/height: "100vh", overflow: "hidden"/);
    expect(LAYOUT).toContain('height: "100dvh"');
    expect(LAYOUT).toContain("WebkitOverflowScrolling");
  });

  it("le lien « Admin » de la barre latérale ne pointe plus sur la 404 /admin", () => {
    expect(SIDEBAR).not.toMatch(/href="\/admin"/);
    expect(SIDEBAR).toContain('href="/admin/card-forge"');
  });
});
