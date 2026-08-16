// UNE SEULE PIÈCE D'OR, partout.
//
// Le symbole de la monnaie était l'emoji 🪙, rendu par la police du système —
// donc ARGENTÉ sur macOS, ce qui contredit le nom même de la monnaie. Il a été
// remplacé par <GoldCoin />, un SVG dessiné.
//
// Ce test existe parce que le remplacement a été fait EN DEUX FOIS : la
// première passe a corrigé la boutique et l'en-tête, et a laissé l'emoji dans
// les enchères, l'administration et l'incrustation d'Épargne. Rien ne signalait
// l'oubli — sinon une capture d'écran de l'auteur. C'est le rôle de ce fichier.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const COIN = "\u{1FA99}"; // 🪙

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
  }
  return out;
}

/** Fichiers autorisés à contenir l'emoji, avec la raison.
 *
 *  ⚠️ Les SYMBOLES DE MOT-CLÉ ne sont PAS concernés par cette règle : ils
 *  passent par KeywordIcon, qui accepte un remplacement par image depuis la
 *  base et applique sa propre teinte. C'est un autre système que la monnaie. */
const AUTORISES: Record<string, string> = {
  "src/components/shared/GoldCoin.tsx": "le composant lui-même, qui cite l'emoji qu'il remplace",
  "src/components/shared/__tests__/gold-coin-consistency.test.ts": "ce test, qui doit nommer ce qu'il traque",
};

describe("la pièce d'or est dessinée, jamais tapée", () => {
  it("aucun composant d'interface n'utilise l'emoji", () => {
    const fautifs = walk("src/components")
      .filter((f) => !(f in AUTORISES))
      .filter((f) => readFileSync(join(ROOT, f), "utf8").includes(COIN));

    expect(fautifs, `à remplacer par <GoldCoin /> : ${fautifs.join(", ")}`).toEqual([]);
  });

  it("les écrans qui affichent de l'argent importent bien le composant", () => {
    // Contre-épreuve du test précédent : sans elle, supprimer purement et
    // simplement l'emoji le ferait passer au vert, en n'affichant plus rien.
    const ECRANS_MONETAIRES = [
      "src/components/auction/AuctionCard.tsx",
      "src/components/auction/AuctionDetail.tsx",
      "src/components/auction/MyAuctions.tsx",
      "src/components/admin/EconomyManager.tsx",
      "src/components/payments/GoldShop.tsx",
      "src/components/shared/GoldBalance.tsx",
    ];
    for (const f of ECRANS_MONETAIRES) {
      const src = readFileSync(join(ROOT, f), "utf8");
      expect(src, `${f} n'affiche aucune pièce`).toContain("<GoldCoin");
      // Chemin absolu OU relatif : GoldBalance vit dans le même dossier que
      // le composant et l'importe en `./GoldCoin`.
      expect(src, `${f} n'importe pas GoldCoin`).toMatch(/from "(@\/components\/shared|\.)\/GoldCoin"/);
    }
  });

  it("le symbole textuel reste disponible, mais signalé comme déconseillé", () => {
    // Il subsiste pour les contextes sans JSX. Le commentaire est ce qui évite
    // qu'on le rebranche dans une interface.
    const src = readFileSync(join(ROOT, "src/lib/economy/constants.ts"), "utf8");
    expect(src).toContain("CURRENCY_SYMBOL");
    expect(src).toMatch(/@deprecated/);
    expect(src).toContain("GoldCoin");
  });
});
