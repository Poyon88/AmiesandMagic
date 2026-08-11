// Traduction « saisie de la forge » → `keyword_instances` persistables.
//
// SOURCE UNIQUE, partagée par les deux formulaires qui produisent des capacités
// de créature : l'onglet Forge (cartes) et l'onglet Tokens (templates). Le
// constructeur vivait en ligne dans CardForge ; le dupliquer côté tokens aurait
// recréé la panne classique de ce dépôt — deux tables parallèles qui divergent
// et perdent une capacité EN SILENCE (cf. l'ancien mapping libellé→id de la
// forge, où le doublon laissait tomber les nouveaux mots-clés à la création).
//
// Le contrat de sortie est celui que lit `capability-adapter` : une entrée par
// mot-clé qui a quelque chose à dire (un mode, un X, une portée, une donnée
// annexe). Un mot-clé purement « à l'invocation » sans X ne produit RIEN — il
// reste décrit par le seul `keywords[]`, et l'adaptateur lui attribue son
// déclencheur naturel.

import { CREATURE_LABEL_TO_ENGINE_ID, XY_ABILITY_IDS } from "@/lib/game/abilities";
import type { CapabilityTrigger, Keyword, KeywordInstance, KeywordMode } from "@/lib/game/types";

/** Libellé FR de la forge → id moteur. Base dérivée du registre (exhaustive par
 *  construction), complétée par les alias legacy qui l'emportent : brouillons
 *  stockés en localStorage, JSON exportés, et libellés d'affichage divergents
 *  (« Traque » → charge, « Vol » → ranged, « Berserk » → gloire). */
export const FORGE_TO_GAME_KEYWORD: Record<string, Keyword> = {
  ...(CREATURE_LABEL_TO_ENGINE_ID as Record<string, Keyword>),
  // Legacy aliases
  "Raid": "raid", "Convocations multiples": "convocations_multiples", "Traque": "charge", "Provocation": "taunt", "Bouclier": "divine_shield", "Vol": "ranged",
  // Tier 0
  "Loyauté": "loyaute", "Ancré": "ancre", "Résistance X": "resistance",
  "Première Frappe": "premiere_frappe",
  // Alias legacy : brouillons de forge (localStorage / JSON exportés) créés
  // avant le renommage Berserk → Gloire +X/+Y.
  "Berserk": "gloire",
  // Tier 1 — Terrain
  "Précision": "precision", "Drain de vie": "drain_de_vie", "Esquive": "esquive",
  "Poison": "poison", "Célérité": "celerite",
  "Augure": "augure", "Bénédiction": "benediction", "Bravoure": "bravoure",
  "Pillage X": "pillage", "Riposte X": "riposte",
  // Tier 1 — Cimetière / Main
  "Rappel": "rappel", "Combustion": "combustion",
  // Tier 2 — Terrain
  "Terreur": "terreur", "Pauvreté X": "pauvrete", "Armure": "armure", "Commandement": "commandement",
  "Fureur": "fureur", "Double Attaque": "double_attaque", "Invisible": "invisible",
  "Canalisation": "canalisation", "Contresort": "contresort",
  "Conférer": "conferer",
  "Déclenchement": "declenchement",
  "Convocation X": "convocation", "Malédiction": "malediction",
  "Nécrophagie": "necrophagie", "Richesse X": "richesse", "Sacrifice démoniaque X": "sacrifice_demoniaque", "Paralysie": "paralysie",
  "Permutation": "permutation", "Persécution X": "persecution",
  "Piétinement": "pietinement",
  // Tier 2 — Cimetière / Main / Mixte
  "Catalyse": "catalyse", "Ombre du passé": "ombre_du_passe",
  "Profanation X": "profanation", "Prescience X": "prescience",
  "Suprématie": "suprematie", "Divination": "divination",
  // Tier 3
  "Liaison de vie": "liaison_de_vie", "Ombre": "ombre",
  "Sacrifice": "sacrifice", "Maléfice": "malefice",
  "Indestructible": "indestructible", "Régénération": "regeneration", "Corruption": "corruption",
  "Carnage X": "carnage", "Héritage X": "heritage", "Mimique": "mimique",
  "Métamorphose": "metamorphose", "Tactique X": "tactique",
  "Exhumation X": "exhumation", "Héritage du cimetière": "heritage_du_cimetiere",
  // Tier 4
  "Pacte de sang": "pacte_de_sang", "Souffle de feu X": "souffle_de_feu",
  "Domination": "domination", "Résurrection": "resurrection", "Transcendance": "transcendance",
  "Vampirisme X": "vampirisme",
  // Deck / Race / Clan
  "Traque du destin X": "traque_du_destin", "Sang mêlé": "sang_mele",
  "Fierté du clan": "fierte_du_clan", "Solidarité X": "solidarite",
  "Entraide (Race)": "entraide",
  "Cycle éternel": "cycle_eternel", "Martyr": "martyr",
  "Instinct de meute X": "instinct_de_meute", "Totem": "totem",
  "Appel du clan X": "appel_du_clan", "Appel Suprême": "appel_supreme", "Rassemblement X": "rassemblement",
  "Sélection X": "selection",
  "Lycanthropie X": "lycanthropie",
  "Tempête X": "tempete",
  "Cataclysme X": "cataclysme",
  "Douleur X": "douleur",
  "Inspiration X": "inspiration",
};

/** Réciproque id moteur → libellé forge. Un id visé par plusieurs libellés
 *  (alias legacy) retient le DERNIER, comme la construction historique. */
export const GAME_TO_FORGE_KEYWORD: Record<string, string> = Object.fromEntries(
  Object.entries(FORGE_TO_GAME_KEYWORD).map(([label, id]) => [id, label]),
);

/** Données annexes saisies dans des champs DÉDIÉS du formulaire (hors grille
 *  X générique), portées par une poignée de mots-clés. Toutes optionnelles :
 *  l'éditeur de tokens n'en renseigne qu'une partie, et un mot-clé dont la
 *  donnée manque est écarté en amont (cf. TOKEN_UNSUPPORTED_IDS). */
export interface ForgeKeywordExtras {
  /** Renforcement multiple : +Y PV, et filtres race/clan facultatifs. */
  rmY?: number; rmRace?: string; rmClan?: string;
  /** Seconds membres des capacités à couple X/Y. */
  afY?: number; rfY?: number; dcY?: number; glY?: number; fdaY?: number;
  /** Invocations multiples : coûts à invoquer + restriction de pool. */
  invocCosts?: number[]; invocRace?: string; invocFaction?: string;
  /** Appel Suprême : race ciblée. */
  asRace?: string;
  /** Conférer : capacité donnée et son amplitude. */
  conferAbilityId?: string; conferX?: number; conferY?: number;
  /** Déclenchement : sous-ensemble figé de déclencheurs rejoués. */
  declenchementTriggers?: CapabilityTrigger[];
}

/** Couples X/Y traités par une branche DÉDIÉE ci-dessous (leur second membre
 *  vient d'un champ nommé de `extras`, pour des raisons historiques). Tout autre
 *  couple du registre passe par la branche GÉNÉRIQUE, qui lit `yValues`.
 *
 *  Oublier une entrée ici est sans danger — le couple retombe simplement sur la
 *  branche générique, qui persiste bien son Y. C'est l'inverse qui coûtait cher :
 *  avant cette branche, une capacité +X/+Y absente de la liste repartait SANS
 *  `y`, et le moteur lui appliquait son défaut 1 en silence (Pureté et Seuil
 *  Sacrificiel ont vécu ainsi). */
const XY_IDS_A_BRANCHE_DEDIEE: ReadonlySet<string> = new Set([
  "renforcement_multiple", "affaiblissement", "renforcement",
  "dechainement", "gloire", "force_des_ancetres",
]);

export interface BuildKeywordInstancesInput {
  /** Libellés forge sélectionnés (l'ordre est conservé). */
  labels: string[];
  /** X par libellé. */
  xValues?: Record<string, number>;
  /** Y par libellé, pour les couples X/Y sans champ dédié dans `extras`. */
  yValues?: Record<string, number>;
  /** Mode (déclencheur) par libellé ; absent = à l'invocation. */
  modes?: Record<string, KeywordMode>;
  /** Portée du don, sorts uniquement. */
  grantScopes?: Record<string, "target" | "all_allies">;
  /** Vrai pour un SORT : bascule les branches « côté créature ». */
  isSpellCard?: boolean;
  extras?: ForgeKeywordExtras;
}

/** Construit les `keyword_instances` à persister. Fonction PURE — aucun accès à
 *  l'état React — pour être testable et réutilisable côté tokens. */
export function buildKeywordInstances(input: BuildKeywordInstancesInput): KeywordInstance[] {
  const { labels, xValues = {}, yValues = {}, modes = {}, grantScopes = {}, isSpellCard = false, extras = {} } = input;

  return labels
    .map((label): KeywordInstance | null => {
      const id = FORGE_TO_GAME_KEYWORD[label];
      if (!id) return null;
      const mode = modes[label];
      const x = xValues[label];
      // Sur un sort, un mot-clé conféré réglé sur « tous les alliés » doit
      // persister sa portée même sans mode ni X. « target » est le défaut → pas
      // de champ.
      const grantScope = isSpellCard && grantScopes[label] === "all_allies" ? "all_allies" as const : undefined;
      // Renforcement multiple (créature) : porte +X/+Y et race/clan ; toujours émis.
      if (id === "renforcement_multiple" && !isSpellCard) {
        return { id, ...(mode ? { mode } : {}), x: x ?? 0, y: extras.rmY ?? 0, ...(extras.rmRace ? { race: extras.rmRace } : {}), ...(extras.rmClan ? { clan: extras.rmClan } : {}) };
      }
      // Affaiblissement (créature) : porte -X (ATK, valeur générique) / -Y (PV dédié).
      if (id === "affaiblissement" && !isSpellCard) {
        return { id, ...(mode ? { mode } : {}), x: x ?? 0, y: extras.afY ?? 0 };
      }
      // Renforcement (créature, self-buff) : porte +X (ATK générique) / +Y (PV dédié).
      if (id === "renforcement" && !isSpellCard) {
        return { id, ...(mode ? { mode } : {}), x: x ?? 0, y: extras.rfY ?? 0 };
      }
      // Déchainement (créature) : porte X (nombre de sorts, valeur générique)
      // / Y (coût des sorts, dédié) ; toujours émis — sans le Y persisté, le
      // moteur retomberait sur coût 1 quelle que soit la saisie.
      if (id === "dechainement" && !isSpellCard) {
        return { id, ...(mode ? { mode } : {}), x: x ?? 1, y: extras.dcY ?? 1 };
      }
      // Gloire : porte +X (ATK générique) / +Y (PV dédié). Émise aussi sur
      // un SORT, qui la CONFÈRE — sans le Y persisté, le don retombait sur
      // le +Y=1 de repli quelle que soit la saisie (la portée doit alors
      // suivre, ce que la branche générique faisait seule jusqu'ici).
      if (id === "gloire") {
        return { id, ...(mode ? { mode } : {}), x: x ?? 0, y: extras.glY ?? 0, ...(grantScope ? { grantScope } : {}) };
      }
      // Force des ancêtres : porte +X (ATK générique) / +Y (PV dédié).
      // Émise aussi sur un SORT (capacité conférée, mêmes raisons que Gloire).
      if (id === "force_des_ancetres") {
        return { id, ...(mode ? { mode } : {}), x: x ?? 1, y: extras.fdaY ?? 1, ...(grantScope ? { grantScope } : {}) };
      }
      // Tout AUTRE couple +X/+Y du registre (Seuil Sacrificiel, Pureté, et les
      // suivants) : Y pris dans la grille générique, jamais dans un champ nommé.
      // Toujours émis — c'est cette branche qui garantit qu'une capacité à
      // couple n'arrive pas en base sans son second membre.
      if (XY_ABILITY_IDS.has(id) && !XY_IDS_A_BRANCHE_DEDIEE.has(id)) {
        return { id, ...(mode ? { mode } : {}), x: x ?? 1, y: yValues[label] ?? 1, ...(grantScope ? { grantScope } : {}) };
      }
      // Invocations multiples : porte la liste des coûts ; toujours émise
      // (sans elle le mot-clé n'aurait rien à invoquer).
      if (id === "invocations_multiples") {
        return {
          id, ...(mode ? { mode } : {}),
          ...(extras.invocCosts?.length ? { costs: extras.invocCosts } : {}),
          ...(extras.invocRace ? { race: extras.invocRace } : {}),
          ...(extras.invocFaction ? { faction: extras.invocFaction } : {}),
        };
      }
      // Appel Suprême (créature) : porte la race ciblée ; toujours émis.
      if (id === "appel_supreme" && !isSpellCard) {
        return { id, ...(mode ? { mode } : {}), ...(extras.asRace ? { race: extras.asRace } : {}) };
      }
      // Conférer (créature) : porte l'ability conférée + la portée ; toujours émis.
      if (id === "conferer" && !isSpellCard) {
        const scope = grantScopes["Conférer"] === "all_allies" ? "all_allies" as const : undefined;
        // x/y = amplitude de la capacité conférée (y seulement si elle
        // porte un couple, sinon l'instance stockerait un Y sans sens).
        const xy = XY_ABILITY_IDS.has(extras.conferAbilityId ?? "");
        return { id, ...(mode ? { mode } : {}), ...(extras.conferAbilityId ? { grantAbilityId: extras.conferAbilityId } : {}), x: extras.conferX ?? 0, ...(xy ? { y: extras.conferY ?? 0 } : {}), ...(scope ? { grantScope: scope } : {}) };
      }
      // Déclenchement (créature) : porte le sous-ensemble figé de déclencheurs ; toujours émis.
      if (id === "declenchement" && !isSpellCard) {
        return { id, ...(mode ? { mode } : {}), ...(extras.declenchementTriggers?.length ? { replayTriggers: extras.declenchementTriggers } : {}) };
      }
      if (!mode && x == null && !grantScope) return null; // pure play + no X + default scope → nothing to store
      return { id, ...(mode ? { mode } : {}), ...(x != null ? { x } : {}), ...(grantScope ? { grantScope } : {}) };
    })
    .filter((k): k is KeywordInstance => k !== null);
}
