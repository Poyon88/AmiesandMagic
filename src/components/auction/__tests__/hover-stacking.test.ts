// Le descriptif d'une carte survolée doit passer AU-DESSUS de ses voisines.
//
// Pourquoi ce test existe. Chaque carte de l'hôtel des ventes est enveloppée
// dans `.am-animate-rise`, dont l'animation se termine en `forwards` sur
// `transform: translateY(0)`. Ce n'est PAS `none` : l'enveloppe reste donc un
// CONTEXTE D'EMPILEMENT à vie, et le `z-index: 20` que GameCard pose sur la
// carte agrandie y est enfermé. Les enveloppes suivantes passent devant, quoi
// qu'on fasse à l'intérieur.
//
// La correction consiste à remonter l'ENVELOPPE (`.am-hover-lift`), pas son
// contenu. Rien dans le code ne rappelle ce raisonnement au moment où l'on
// retire une classe qui « ne sert visiblement à rien » — d'où ce garde-fou.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("empilement au survol", () => {
  it("la carte d'enchère porte le relèvement en plus de l'animation", () => {
    const src = read("src/components/auction/AuctionHouse.tsx");
    expect(src, "l'enveloppe de carte a perdu am-hover-lift").toMatch(
      /className="am-animate-rise am-hover-lift"/,
    );
  });

  it("la classe existe, positionne l'élément, et monte au survol", () => {
    const css = read("src/app/globals.css");
    // `position` est indispensable : un `z-index` sur un élément non positionné
    // n'a aucun effet.
    expect(css).toMatch(/\.am-hover-lift\s*\{[^}]*position:\s*relative/);
    expect(css).toMatch(/\.am-hover-lift:hover[^{]*\{[^}]*z-index:\s*[1-9]/);
  });

  it("le clavier en profite aussi", () => {
    // Sans `focus-within`, une carte atteinte au clavier afficherait son
    // descriptif sous ses voisines.
    expect(read("src/app/globals.css")).toMatch(/\.am-hover-lift:hover,\s*\.am-hover-lift:focus-within/);
  });

  it("l'animation qui crée le contexte d'empilement est toujours là", () => {
    // Contre-épreuve : si `am-rise` cessait d'animer `transform`, le problème
    // disparaîtrait et ce garde-fou n'aurait plus de raison d'être. Le voir
    // tomber invite à relire, pas à contourner.
    const css = read("src/app/globals.css");
    expect(css).toMatch(/@keyframes am-rise[\s\S]*?transform:\s*translateY/);
    expect(css).toMatch(/\.am-animate-rise\s*\{[\s\S]*?forwards/);
  });
});
