// Descriptifs des COÛTS ADDITIONNELS (et de l'Éveil), affichés au survol du
// jeton du coin droit d'une carte. Source unique : les clés `vocab.cost_help.*`
// des catalogues, avec ce français pour repli.
//
// Chaque texte décrit ce que le moteur fait VRAIMENT (cf. playCard) : la vie
// est payée par le héros et ne peut pas le tuer, la défausse, le sacrifice et
// le repli sont choisis par le joueur, l'exil prend le dessus du deck.
import type { SafeT } from "@/i18n/config";

export type CostHelpKind = "vie" | "defausse" | "sacrifice" | "exil" | "repli" | "eveil";

export const COST_HELP_FR: Record<string, string> = {
  "vie.title": "Coût en vie {n}",
  "vie.desc": "En plus du mana, votre héros perd {n} PV quand vous jouez cette carte. Impossible si cela le ferait tomber à 0 PV.",
  "defausse.title": "Défausse {n}",
  "defausse.desc_one": "En plus du mana, défaussez une carte de votre main, de votre choix.",
  "defausse.desc_many": "En plus du mana, défaussez {n} cartes de votre main, de votre choix.",
  "sacrifice.title": "Sacrifice {n}",
  "sacrifice.desc_one": "En plus du mana, sacrifiez une de vos créatures en jeu, de votre choix.",
  "sacrifice.desc_many": "En plus du mana, sacrifiez {n} de vos créatures en jeu, de votre choix.",
  "exil.title": "Exil {n}",
  "exil.desc_one": "En plus du mana, la carte du dessus de votre deck est exilée : elle quitte la partie. Impossible si votre deck est vide.",
  "exil.desc_many": "En plus du mana, les {n} cartes du dessus de votre deck sont exilées : elles quittent la partie. Il faut au moins {n} cartes dans votre deck.",
  "repli.title": "Repli {n}",
  "repli.desc_one": "En plus du mana, replacez une carte de votre main, de votre choix, sur le dessus de votre deck.",
  "repli.desc_many": "En plus du mana, replacez {n} cartes de votre main, de votre choix, sur le dessus de votre deck. La première choisie finit sur le dessus.",
  "eveil.title": "Éveil {n}",
  "eveil.desc": "Au lieu de la jouer, vous pouvez mettre cette carte en éveil. Vous versez ensuite ses {n} points avec votre mana, 1 point par mana, pendant vos tours. Au dernier point, elle entre en jeu comme si vous l'aviez jouée.",
  "eveil.remaining": "Encore {left} points à verser sur {n}.",
};

function texte(t: SafeT | undefined, cle: string, params: Record<string, number>): string {
  let s = t?.(`vocab.cost_help.${cle}`) ?? COST_HELP_FR[cle] ?? "";
  for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

/** Titre et descriptif d'un coût de valeur `n`. Pour l'Éveil, `paid` (points
 *  déjà versés) ajoute la ligne « encore … à verser ». */
export function costHelp(
  kind: CostHelpKind,
  n: number,
  t?: SafeT,
  paid = 0,
): { title: string; desc: string; extra?: string } {
  const singulier = kind === "vie" || kind === "eveil";
  const desc = texte(t, singulier ? `${kind}.desc` : `${kind}.desc_${n > 1 ? "many" : "one"}`, { n });
  const left = Math.max(0, n - paid);
  return {
    title: texte(t, `${kind}.title`, { n }),
    desc,
    ...(kind === "eveil" && paid > 0 && left > 0 ? { extra: texte(t, "eveil.remaining", { n, left }) } : {}),
  };
}
