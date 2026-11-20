// Garde-fous du livret de règles.
//
// Le livret est la seule source de l'agent qui répond aux joueurs : une règle
// fausse y part comme une vérité. Ces tests ne jugent pas la prose, ils
// empêchent trois dérives silencieuses :
//   - le document de référence oublié après une modification ;
//   - un ancien nom de capacité, ou un mot du moteur, glissé dans le texte ;
//   - une précision rattachée à une capacité qui n'existe plus.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ABILITIES } from "@/lib/game/abilities";
import { DECK_SIZE, MAX_HAND_SIZE } from "@/lib/game/constants";
import { CHAPITRES, livret } from "./livret";
import { documentLivret } from "./document";
import { PRECISIONS } from "./precisions";
import { ECONOMIE } from "./economie";

const DOC = "docs/livret-de-regles.md";

/** Noms que portent les capacités à l'écran. */
function nomsOfficiels(): Set<string> {
  const out = new Set<string>();
  for (const a of Object.values(ABILITIES)) {
    out.add(a.label);
    if (a.creature?.label) out.add(a.creature.label);
    if (a.spell?.label) out.add(a.spell.label);
  }
  return out;
}

/** « Résistance X » → « Résistance » : un thème cite la capacité sans sa valeur. */
const sansValeur = (n: string) => n.replace(/\s*[+-]?X(\/[+-]?Y)?$/, "").trim();

describe("livret de règles", () => {
  it("le document de référence est à jour (sinon : npm run livret)", () => {
    expect(fs.existsSync(DOC), `${DOC} absent : npm run livret`).toBe(true);
    expect(fs.readFileSync(DOC, "utf8")).toBe(documentLivret());
  });

  it("chaque chapitre a un identifiant unique et un contenu", () => {
    const ids = CHAPITRES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CHAPITRES) {
      expect(c.texte({ decouverte: "doc" }).trim().length, c.id).toBeGreaterThan(80);
    }
  });

  it("les chiffres viennent des constantes du jeu", () => {
    const t = livret({ decouverte: "doc" });
    expect(t).toContain(`exactement ${DECK_SIZE} cartes`);
    expect(t).toContain(`au plus ${MAX_HAND_SIZE} cartes`);
  });

  it("toutes les capacités du registre figurent au lexique", () => {
    const t = CHAPITRES.find((c) => c.id === "lexique")!.texte({ decouverte: "doc" });
    for (const a of Object.values(ABILITIES)) {
      expect(t, a.id).toContain(`**${a.creature?.label ?? a.label}**`);
    }
  });

  it("la variante de découverte en vigueur est celle du contexte", () => {
    expect(livret({ decouverte: "off" })).not.toContain("Découverte un tour sur deux");
    expect(livret({ decouverte: 1 })).toContain("2 Communes de son clan");
    expect(livret({ decouverte: 2 })).toContain("d'une autre faction");
    expect(livret({ decouverte: 2 })).not.toContain("2 Communes de son clan");
  });

  // Un montant réglé depuis l'admin ne s'écrit pas dans le document : il y
  // serait faux au premier réglage. L'agent, lui, reçoit la valeur lue en base.
  it("les montants réglables viennent du contexte, jamais du texte", () => {
    const sans = livret({ decouverte: "doc" });
    expect(sans).toContain("Prix d'une faction : affiché dans la boutique");
    const avec = livret({ decouverte: "doc", economie: { prixFaction: 777, prixForfait: 1555, surenchereMin: 3, prolongationSecondes: 45, marcheOuvert: true } });
    expect(avec).toContain("Prix d'une faction : 777 pièces d'or");
    expect(avec).toContain("« Toutes les factions » : 1555 pièces d'or");
    expect(avec).toContain("Surenchère minimale : 3 ");
    expect(avec).toContain("45 secondes");
    expect(avec).not.toContain("actuellement fermé");
    expect(livret({ decouverte: "doc", economie: { marcheOuvert: false } })).toContain("actuellement fermé");
  });

  // Les règles du site ne portent aucun chiffre en dur : prix, durées et
  // plafonds vivent dans le bloc « Montants en vigueur ».
  it("aucun montant en dur dans les règles du site", () => {
    for (const p of ECONOMIE) {
      for (const r of p.regles) {
        expect(r, `${p.theme} : « ${r} »`).not.toMatch(/\d+\s*(€|pièces? d'or|or\b|jours?|minutes?|secondes?|essence)/);
      }
    }
  });

  // Une précision dont la capacité a été renommée ou supprimée resterait dans
  // le livret sans que rien ne le signale.
  it("chaque précision « capacité » désigne une capacité qui existe", () => {
    const noms = new Set([...nomsOfficiels()].map(sansValeur));
    for (const p of PRECISIONS) {
      if (p.type !== "capacite") continue;
      expect(noms.has(sansValeur(p.theme)), `« ${p.theme} » n'est pas le nom d'une capacité`).toBe(true);
    }
  });

  it("aucune précision vide", () => {
    for (const p of [...PRECISIONS, ...ECONOMIE]) {
      expect(p.regles.length, p.theme).toBeGreaterThan(0);
      for (const r of p.regles) expect(r.trim().length, p.theme).toBeGreaterThan(15);
    }
  });

  // Le livret parle comme l'écran : « action », jamais « sort » (renommé), et
  // aucun identifiant du moteur.
  it("n'emploie ni l'ancien vocabulaire ni les mots du moteur", () => {
    const prose = CHAPITRES
      .filter((c) => c.id !== "lexique" && c.id !== "factions")
      .map((c) => c.texte({ decouverte: "doc" }))
      .join("\n");
    const interdits = [/\bsorts?\b(?! »)/i, /\bmots?-clés?\b/i, /\bkeyword/i, /\binstanceId\b/, /\bdivine_shield\b/, /\bon_[a-z_]+\b/];
    for (const re of interdits) {
      const m = prose.match(re);
      expect(m, m ? `« ${m[0]} » dans : …${prose.slice(Math.max(0, m.index! - 60), m.index! + 60)}…` : "").toBeNull();
    }
  });
});
