// `ALL_KEYWORDS` est une liste tenue À LA MAIN, et c'est le seul inventaire que
// consulte l'onglet ÉDITION pour ses puces de mots-clés (`SORTED_KEYWORDS` dans
// CardEditor.tsx). L'onglet FORGE, lui, dérive sa liste du registre
// (`KEYWORDS`, dérivé d'ABILITIES). Les deux peuvent donc DIVERGER.
//
// Rien ne le signalait : `KEYWORD_LABELS` et `KEYWORD_SYMBOLS` sont typés
// `Record<Keyword, string>`, donc TypeScript force à les compléter quand on
// ajoute une capacité — mais `ALL_KEYWORDS` est un simple tableau, que le
// compilateur ne vérifie pas. Symptôme vécu : Chant, créé et fonctionnel côté
// moteur et côté Forge, restait INTROUVABLE dans l'éditeur.
//
// Ce test transforme cet oubli silencieux en échec bruyant.
import { describe, expect, it } from "vitest";
import { ALL_KEYWORDS } from "./keyword-labels";
import { ABILITIES, creatureEngineId } from "./abilities";

/** Capacités du registre volontairement ABSENTES des puces de l'éditeur.
 *  Toute autre absence est un oubli — d'où l'échec du test. */
const EXCLUSIONS_ASSUMEES: Record<string, string> = {
  // Doublon historique de `ranged` (même libellé « Vol », même traitement en
  // combat). La forge n'émet que `ranged` ; lister les deux afficherait deux
  // puces « Vol » identiques.
  vol: "alias legacy de ranged",
  // Exige un second choix (l'ability conférée, `grantAbilityId`) que l'éditeur
  // ne sait pas encore saisir — il n'écrit que `grantScope`. L'exposer poserait
  // un Conférer sans capacité, donc inerte, sans que rien ne le dise.
  conferer: "sélecteur d'ability conféré absent de l'éditeur",
};

describe("ALL_KEYWORDS couvre le registre des capacités créature", () => {
  it("aucune capacité créature n'est absente sans raison déclarée", () => {
    const liste = new Set<string>(ALL_KEYWORDS as unknown as string[]);
    const manquantes = Object.values(ABILITIES)
      .filter((a) => a.applicable_to.includes("creature"))
      .map((a) => creatureEngineId(a))
      .filter((id) => !liste.has(id) && !(id in EXCLUSIONS_ASSUMEES));

    // Si ce test tombe : la capacité que vous venez d'ajouter n'apparaîtra pas
    // dans l'onglet Édition. Ajoutez-la à ALL_KEYWORDS, ou déclarez l'exclusion
    // ci-dessus avec sa raison.
    expect(manquantes).toEqual([]);
  });

  it("aucune entrée fantôme (mot-clé listé mais absent du registre)", () => {
    // `ranged` n'existe PAS dans ABILITIES (le registre ne connaît que `vol`) :
    // c'est l'id historique que la forge écrit dans `card.keywords`, et le seul
    // des deux que la liste expose. Les deux moitiés de l'alias sont donc
    // déclarées — `vol` côté exclusions, `ranged` ici.
    const ALIAS_SANS_ENTREE_REGISTRE = new Set(["ranged"]);
    const parId = new Map(
      Object.values(ABILITIES).map((a) => [creatureEngineId(a), a] as const),
    );
    const fantomes = (ALL_KEYWORDS as unknown as string[])
      .filter((id) => !parId.has(id) && !ALIAS_SANS_ENTREE_REGISTRE.has(id));
    expect(fantomes).toEqual([]);
  });

  it("Chant y figure — la régression qui a motivé ce fichier", () => {
    expect(ALL_KEYWORDS as unknown as string[]).toContain("chant");
  });
});
