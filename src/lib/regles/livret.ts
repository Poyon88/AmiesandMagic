// LIVRET DE RÈGLES d'Armies of Legends — la référence sur laquelle s'appuient
// les agents : l'agent de tri des retours joueurs (qui répond aux questions de
// règles) et Claude Code (qui le lit dans docs/livret-de-regles.md avant de
// toucher à une règle).
//
// POURQUOI DU CODE ET NON UN DOCUMENT. Un livret écrit à part finit par mentir :
// la taille du deck change dans le moteur, pas dans le texte. Ici chaque
// chiffre est lu dans les constantes du jeu, le lexique des capacités et les
// factions sont tirés du registre — ils ne peuvent pas dériver. Seule la prose
// est écrite à la main, et c'est elle qu'il faut tenir à jour.
//
// COMMENT LE COMPLÉTER (à chaque évolution du jeu qu'un joueur peut constater) :
//   - une règle générale change ou s'ajoute → le chapitre concerné, dans
//     `chapitres/` ;
//   - une capacité gagne un cas particulier, un arbitrage, une exception →
//     une entrée dans `precisions.ts` (une ligne suffit) ;
//   - le fonctionnement du site change (boutique, enchères, tournois, compte)
//     → une ligne dans `economie.ts` ; un montant ne s'écrit JAMAIS dans une
//     phrase, il se lit dans une constante ou en base (chapitre 14) ;
//   - un nouveau pan du jeu → un nouveau chapitre, ajouté à CHAPITRES ci-dessous.
// Puis `npm run livret` régénère docs/livret-de-regles.md. Un test échoue tant
// que le document n'est pas régénéré (livret.test.ts) : l'oubli se voit.
//
// CE QUI N'Y A PAS SA PLACE : le calendrier, le détail d'une carte précise, la
// situation d'un joueur (solde, achat), ce qui est seulement prévu, et tout ce
// qui relève de l'implémentation. Le livret dit ce qu'un
// joueur peut observer, dans les mots qu'il lit à l'écran.
import { regleDecouverteActivee, varianteDecouverte } from "@/lib/game/decouverte";
import { bases } from "./chapitres/01-bases";
import { tour } from "./chapitres/02-tour";
import { unitesEtCombat } from "./chapitres/03-unites-combat";
import { actionsObjetsEmblemes } from "./chapitres/04-actions-objets-emblemes";
import { capacites } from "./chapitres/05-capacites";
import { choixEtResolution } from "./chapitres/06-choix-resolution";
import { zones } from "./chapitres/07-zones";
import { herosEtCompteurs } from "./chapitres/08-heros-compteurs";
import { couts } from "./chapitres/09-couts";
import { decksEtFormats } from "./chapitres/10-decks-formats";
import { lexique } from "./chapitres/11-lexique";
import { precisionsParCapacite } from "./chapitres/12-precisions";
import { factions } from "./chapitres/13-factions";
import { siteEtEconomie } from "./chapitres/14-site-economie";

/** Ce qui varie selon le déploiement. `doc` : le document de référence, qui
 *  décrit toutes les variantes sans dire laquelle est en vigueur. */
export interface ContexteLivret {
  decouverte: "off" | 1 | 2 | "doc";
  /** Montants réglés depuis l'admin, lus en base par l'appelant. Absents (ou
   *  nuls) : le livret renvoie à l'écran où ils s'affichent. */
  economie?: MontantsRegles;
}

/** Ce que l'équipe du jeu règle sans redéployer (boutique, enchères). */
export interface MontantsRegles {
  prixFaction?: number | null;
  prixForfait?: number | null;
  surenchereMin?: number | null;
  prolongationSecondes?: number | null;
  marcheOuvert?: boolean | null;
}

export interface Chapitre {
  /** Identifiant stable (sert d'ancre et aux tests). */
  id: string;
  titre: string;
  texte: (ctx: ContexteLivret) => string;
}

/** L'ordre est celui de la lecture : du général au particulier. */
export const CHAPITRES: readonly Chapitre[] = [
  bases,
  tour,
  unitesEtCombat,
  actionsObjetsEmblemes,
  capacites,
  choixEtResolution,
  zones,
  herosEtCompteurs,
  couts,
  decksEtFormats,
  lexique,
  precisionsParCapacite,
  factions,
  siteEtEconomie,
];

/** Contexte du déploiement courant (drapeau de règles de cette build), avec
 *  les montants réglables si l'appelant les a lus. */
export function contexteCourant(economie?: MontantsRegles): ContexteLivret {
  return { decouverte: regleDecouverteActivee() ? varianteDecouverte() : "off", economie };
}

/** Le livret entier, en Markdown. Stable pour un contexte donné : aucune date,
 *  aucun identifiant — il sert de préfixe mis en cache dans le prompt de l'agent. */
export function livret(ctx: ContexteLivret = contexteCourant()): string {
  return CHAPITRES.map((c, i) => `## ${i + 1}. ${c.titre}\n\n${c.texte(ctx).trim()}`).join("\n\n");
}
