// La SIGNATURE d'un clan : les capacités qu'on y rencontre le plus souvent.
//
// Elle était d'abord lue dans `clanProfiles.likelyKeywords` — c'est-à-dire dans
// l'INTENTION du générateur, les capacités qu'il a le droit de tirer et avec
// quelle probabilité. Ce n'est pas la même chose que ce que le clan contient
// vraiment : les cartes sont créées à la main autant que tirées, et l'intention
// vieillit. L'Ordre de l'Aube visait Bénédiction en deuxième position ; une
// seule de ses cartes la porte.
//
// On compte donc les cartes elles-mêmes.
//
// Module pur : il reçoit des cartes, il rend un classement. Aucune requête.

import { composedCapsOf, composedIcon } from "./composed-display";
import { KEYWORD_LABELS } from "./keyword-labels";
import { SPELL_KEYWORD_LABELS } from "./spell-keywords";
import { composedTriggerMode } from "./composed-display";
import { keywordTriggerMode } from "./keyword-display";
import type { KeywordInstance, KeywordMode, Keyword } from "./types";

/** Une capacité du classement. `spell` distingue les deux registres, qui ont
 *  chacun leurs icônes et leur espace de traduction — `incineration` existe
 *  des deux côtés et ne désigne pas la même chose. */
export interface SignatureEntry {
  id: string;
  spell: boolean;
  /** Nombre de cartes du clan qui la portent. Affiché : c'est lui qui rend le
   *  classement vérifiable, et qui évite de présenter comme emblématique une
   *  capacité vue une seule fois. */
  count: number;
  /** Déclencheur DOMINANT dans ce clan. Une capacité n'a pas de couleur en
   *  soi : Renforcement à l'attaque n'est pas Renforcement à l'entrée, et c'est
   *  l'usage du clan qui le dit.
   *
   *  Trois états, et ils ne se confondent pas :
   *   - un mode → teinte et mot correspondants ;
   *   - `"permanent"` → passif majoritaire : blanc, et le mot « Permanent » ;
   *   - `null` → ÉGALITÉ. Blanc aussi, mais AUCUN mot : annoncer « Permanent »
   *     là où deux usages se valent serait une affirmation fausse.
   */
  dominant: KeywordMode | "permanent" | null;
}

/** Forme minimale attendue — volontairement plus lâche que `Card`, pour qu'on
 *  puisse n'aller chercher que ces colonnes en base. */
export interface CarteComptable {
  keywords?: string[] | null;
  spell_keywords?: { id?: string }[] | null;
  /** Effets COMPOSÉS. Une capacité assemblée dans la forge ne laisse aucune
   *  trace dans les deux colonnes ci-dessus : elle vit ici, sous `composed`.
   *  Les ignorer sous-comptait — « Remontée » n'additionnait que les sorts
   *  portant le mot-clé, pas les composés qui renvoient une unité en main. */
  capabilities?: Parameters<typeof composedCapsOf>[0];
  /** Modes par instance de mot-clé, quand la carte en porte. Sans eux, le
   *  déclencheur d'un mot-clé de créature retombe sur sa nature par défaut. */
  keyword_instances?: KeywordInstance[] | null;
  /** Statistiques, pour le profil de jeu (cf. clan-stat-profile.ts). Portées
   *  ici plutôt que dans un second type parallèle : c'est la même ligne de
   *  base, et deux types pour une ligne finissent toujours par diverger. */
  card_type?: string | null;
  attack?: number | null;
  health?: number | null;
}

export const SIGNATURE_MAX = 6;

/** Capacités portant EXACTEMENT le même nom des deux côtés du registre.
 *
 *  Trente-huit ids existent à la fois en créature et en sort ; pour dix-huit
 *  d'entre eux — Remontée, Poison, Tempête, Invocation… — c'est la même
 *  capacité, offerte sur les deux supports. Les compter séparément affichait
 *  deux lignes jumelles (« Remontée ×4 · Remontée ×4 ») et coupait le total en
 *  deux.
 *
 *  Le critère est le nom AFFICHÉ, et c'est volontaire : si la page ne peut pas
 *  distinguer deux capacités, le lecteur non plus. Les paires qui portent des
 *  noms différents (Chant, dont le sens diffère selon le support) restent
 *  séparées. */
const IDS_PARTAGES: ReadonlySet<string> = new Set(
  Object.keys(KEYWORD_LABELS).filter(
    (id) => KEYWORD_LABELS[id as keyof typeof KEYWORD_LABELS]
      === SPELL_KEYWORD_LABELS[id as keyof typeof SPELL_KEYWORD_LABELS],
  ),
);

/** Clé de comptage. Les capacités partagées se rangent du côté CRÉATURE : les
 *  deux registres portent alors le même libellé et la même description, le
 *  choix est donc sans effet sur ce qui s'affiche. */
function cleDeComptage(id: string, sort: boolean): string {
  return IDS_PARTAGES.has(id) ? `c:${id}` : `${sort ? "s" : "c"}:${id}`;
}

/** Les capacités les plus présentes, la plus fréquente d'abord.
 *
 *  Une carte compte UNE FOIS par capacité, même si elle la porte en double :
 *  on mesure combien de cartes l'utilisent, pas combien d'exemplaires existent.
 *
 *  Les égalités sont fréquentes — sur un clan de trente cartes, les premières
 *  places tiennent souvent à une unité. Elles sont donc départagées par id,
 *  faute de quoi deux rendus successifs de la même page pourraient différer. */
export function signatureFromCards(
  cartes: CarteComptable[],
  max: number = SIGNATURE_MAX,
): SignatureEntry[] {
  /** Par capacité : combien de cartes la portent, et sous quels déclencheurs. */
  const compte = new Map<string, { cartes: number; modes: Map<string, number> }>();

  const noter = (vues: Map<string, Set<KeywordMode | undefined>>, cle: string, mode: KeywordMode | undefined) => {
    const modes = vues.get(cle);
    if (modes) modes.add(mode);
    else vues.set(cle, new Set([mode]));
  };

  for (const carte of cartes) {
    // Une carte, une voix par capacité — mais elle peut porter la même capacité
    // sous DEUX déclencheurs (deux instances de mot-clé), et chacun compte
    // alors dans le classement des déclencheurs.
    const vues = new Map<string, Set<KeywordMode | undefined>>();

    for (const kw of carte.keywords ?? []) {
      if (typeof kw !== "string" || !kw) continue;
      const instances = (carte.keyword_instances ?? []).filter((i) => i?.id === kw);
      if (instances.length === 0) {
        noter(vues, cleDeComptage(kw, false), keywordTriggerMode(kw as Keyword));
      } else {
        for (const inst of instances) {
          noter(vues, cleDeComptage(kw, false), keywordTriggerMode(kw as Keyword, inst));
        }
      }
    }
    // Un mot-clé de SORT se résout au lancement : son déclencheur est le sort.
    for (const sk of carte.spell_keywords ?? []) {
      if (sk?.id) noter(vues, cleDeComptage(sk.id, true), "spell");
    }
    // Les composés se rangent sous la capacité qu'ils INCARNENT, pas sous une
    // rubrique « composé » à part : un renvoi en main est une Remontée, que la
    // carte porte le mot-clé ou qu'elle assemble l'effet. `composedIcon` donne
    // déjà cet id canonique, préfixé `spell_` quand il vient du registre sort —
    // exactement le partage utilisé ici.
    for (const cap of composedCapsOf(carte.capabilities)) {
      const id = composedIcon(cap).keyword;
      if (!id) continue;
      const cle = id.startsWith("spell_")
        ? cleDeComptage(id.slice(6), true)
        : cleDeComptage(id, false);
      noter(vues, cle, composedTriggerMode(cap));
    }

    for (const [cle, modes] of vues) {
      const e = compte.get(cle) ?? { cartes: 0, modes: new Map<string, number>() };
      e.cartes += 1;
      for (const m of modes) {
        const k = m ?? "";
        e.modes.set(k, (e.modes.get(k) ?? 0) + 1);
      }
      compte.set(cle, e);
    }
  }

  return [...compte.entries()]
    .sort(([cleA, a], [cleB, b]) => b.cartes - a.cartes || cleA.localeCompare(cleB))
    .slice(0, max)
    .map(([cle, e]) => ({
      id: cle.slice(2),
      spell: cle.startsWith("s:"),
      count: e.cartes,
      dominant: declencheurDominant(e.modes),
    }));
}

/** Le déclencheur le plus représenté.
 *
 *  `null` s'il y a ÉGALITÉ en tête : plutôt que de désigner un vainqueur
 *  arbitraire entre deux usages aussi fréquents, on ne dit rien. C'est
 *  différent d'un passif majoritaire, qui lui s'annonce « Permanent » — les
 *  deux restent blancs, mais l'un affirme quelque chose et l'autre pas. */
function declencheurDominant(modes: Map<string, number>): KeywordMode | "permanent" | null {
  const classe = [...modes.entries()].sort(([, a], [, b]) => b - a);
  if (classe.length === 0) return null;
  if (classe.length > 1 && classe[0][1] === classe[1][1]) return null;
  return (classe[0][0] || "permanent") as KeywordMode | "permanent";
}
