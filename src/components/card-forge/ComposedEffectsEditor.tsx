"use client";

// Éditeur d'effets composés (modèle hybride), partagé par l'onglet Capacités
// (création) et l'onglet Édition (cartes existantes). Produit/édite un tableau de
// Capability portant un `composed`. Le serveur reçoit ces entrées via
// composed_capabilities et les persiste dans la colonne capabilities.

import { useTranslations } from "next-intl";
import PlancherAleatoireInput from "@/components/card-forge/PlancherAleatoireInput";
import TokenCascadePicker from "@/components/admin/TokenCascadePicker";
import RaceClanPicker from "@/components/admin/RaceClanPicker";
import { composedDisplayOrder, positionAfterExisting, spellKeywordDisplayOrder, POWER_ORDER_LAST } from "@/lib/game/composed-position";
import { movePowerUnified, unifiedPowerList } from "@/lib/card-forge/power-order";
import KeywordIcon from "@/components/shared/KeywordIcon";
import CostListEditor from "./CostListEditor";
import LinkedCardsPicker from "./LinkedCardsPicker";
import { designatedCardIds, tuteurCardIds } from "@/lib/game/tuteur";
import SpellEffectPicker from "./SpellEffectPicker";
import { ABILITIES, creatureEngineId, getCapabilityTriggers, RANDOM_X_ABILITY_IDS, XY_ABILITY_IDS } from "@/lib/game/abilities";
import { OCCURRENCE_CONTENTS, MAX_OCCURRENCES } from "@/lib/game/composed-occurrences";
import { DEFAULT_EMBLEM_CADENCE, isEmblemCadence, isItemFiringTrigger, isTokenFiringTrigger } from "@/lib/game/capability-adapter";
import { ALL_SPELL_KEYWORDS, SPELL_KEYWORDS, SPELL_KEYWORD_LABELS, SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import { buildSpellEffectCatalog, instantiatePreset } from "@/lib/card-forge/spell-effect-catalog";
import { FACTIONS, getFactionDisplayName } from "@/lib/card-engine/constants";
import { MAX_MANA } from "@/lib/game/constants";
import type { CardType, Capability, ComposedEffect, ComposedEffectContent, ComposedPoolFilter, CapabilityTrigger, SpellKeywordId, SpellKeywordInstance, TargetSpec, TokenTemplate } from "@/lib/game/types";

const COMPOSED_CONTENTS: { v: ComposedEffectContent; l: string; target: "none" | "unit" | "unit_or_hero"; xy?: boolean }[] = [
  { v: "deal_damage", l: "Infliger des dégâts", target: "unit_or_hero" },
  { v: "heal", l: "Soigner", target: "unit_or_hero" },
  { v: "buff", l: "Buff +X/+Y", target: "unit", xy: true },
  { v: "debuff", l: "Debuff -X/-Y", target: "unit", xy: true },
  { v: "destroy", l: "Détruire", target: "unit" },
  { v: "bounce", l: "Renvoyer en main", target: "unit" },
  { v: "paralyze", l: "Paralyser", target: "unit" },
  // État empoisonné subi (−1 PV/fin de tour) ≠ don du mot-clé Poison.
  { v: "poison", l: "Empoisonner", target: "unit" },
  { v: "grant_keyword", l: "Conférer une capacité", target: "unit" },
  // Aucune cible en jeu : l'appelée se cherche dans le DECK, via le filtre de
  // pool ci-dessous (POOL_CONTENTS).
  { v: "appel", l: "Appel depuis le deck", target: "none" },
  // Appel Suprême filtrable : la carte la plus chère du deck qui satisfait le
  // pool (race / faction / clan / mot-clé) et le plafond X (0 = sans) → main.
  { v: "appel_supreme", l: "Appel Suprême (deck → main, la plus chère, filtres)", target: "none" },
  { v: "draw_cards", l: "Piocher", target: "none" },
  { v: "discard", l: "Défausser (adversaire)", target: "none" },
  { v: "summon_token", l: "Invoquer un token", target: "none" },
  { v: "gain_mana", l: "Gagner du mana", target: "none" },
  { v: "exhumation", l: "Ressusciter (cimetière)", target: "unit" },
  // Rappel : cimetière allié → main ; `target.cardKind` restreint aux unités ou
  // aux sorts. X sans rôle.
  { v: "rappel", l: "Rappel (cimetière → main)", target: "unit" },
  // Sélections : pas de cible en jeu (on filtre un pool de cartes hors jeu),
  // d'où target "none" — le bloc « Pool » ci-dessous les paramètre.
  { v: "invocation", l: "Invocation (aléatoire, ou cartes désignées)", target: "none" },
  // Tuteur : la carte désignée (créature ou sort) rejoint la main. Ni cible,
  // ni amplitude, ni filtre de pool.
  { v: "tuteur", l: "Tuteur (cartes désignées → main)", target: "none" },
  { v: "epargne", l: "Épargne (compteur)", target: "none" },
  { v: "foi", l: "Foi (compteur)", target: "none" },
  { v: "conquete", l: "Conquête (compteur)", target: "none" },
  { v: "exploration", l: "Exploration (compteur, pioche à 3)", target: "none" },
  { v: "incineration", l: "Incinération (recycler un cimetière)", target: "unit_or_hero" },
  { v: "devoration", l: "Dévoration (détruire et absorber)", target: "unit" },
  // Tactique : la SOURCE partage X de ses capacités permanentes, tirées au
  // hasard. Réservé de fait aux créatures — un sort n'a pas de capacités
  // permanentes à donner, et l'effet reste alors muet (comme Dévoration).
  { v: "tactique", l: "Tactique (partage ses capacités permanentes, créature)", target: "unit" },
  { v: "retour_differe", l: "Retour différé (sous le deck)", target: "unit" },
  // Silence : même corps que la mécanique de sort, mais la cible se déclare —
  // « toutes les unités ennemies », « une au hasard »… deviennent possibles.
  { v: "silence", l: "Silence (retire tout à la cible)", target: "unit" },
  // Déchainement X/Y : X sorts aléatoires de coût Y (« ? » sur Y = plafond).
  // Aucune cible : les sorts déchainés tirent les leurs au hasard.
  { v: "dechainement", l: "Déchainement X/Y (actions aléatoires)", target: "none", xy: true },
  { v: "selection", l: "Sélection (1 parmi 3)", target: "none" },
  { v: "faveur", l: "Faveur (1 carte au hasard → main)", target: "none" },
  { v: "selection_magique", l: "Sélection magique (1 action parmi 3)", target: "none" },
  { v: "renfort_royal", l: "Sélection Royale (1 parmi 3)", target: "none" },
  { v: "tresor", l: "Trésor (1 objet parmi 3)", target: "none" },
];

/** Contenus paramétrés par un filtre de pool (race / faction / clan / mot-clé).
 *  Pour eux, X est un PLAFOND DE COÛT des cartes révélées (comme exhumation),
 *  pas une amplitude. */
const POOL_CONTENTS = new Set<ComposedEffectContent>(["invocation", "selection", "selection_magique", "renfort_royal", "appel", "appel_supreme", "faveur", "tresor"]);

/** Sous-ensemble dont le pool peut être restreint par type de carte.
 *  Appel depuis le deck ne pose qu'une unité OU un objet (un sort ne se met pas
 *  en jeu) ; Invocation n'invoque que des unités et Sélection magique ne
 *  propose que des sorts : le filtre n'y aurait aucun sens. */
const CARD_TYPE_POOL_CONTENTS = new Set<ComposedEffectContent>(["selection", "renfort_royal", "faveur", "appel_supreme", "appel"]);

function poolSansTypeHorsPerimetre(pool: ComposedPoolFilter | undefined, content: ComposedEffectContent): ComposedPoolFilter | undefined {
  if (!pool?.cardType) return pool;
  // Appel n'accepte que « Objets » : un « Sorts » hérité d'une Sélection lui
  // ferait chercher une unité de type sort, c'est-à-dire rien.
  if (CARD_TYPE_POOL_CONTENTS.has(content) && (content !== "appel" || pool.cardType === "item")) return pool;
  const { cardType: _retire, ...reste } = pool;
  return Object.keys(reste).length > 0 ? reste : undefined;
}

/** Contenus incompatibles avec la répartition au hasard, malgré un bloc de
 *  cibles à l'écran : Exhumation puise dans le CIMETIÈRE (le tirage n'accepte
 *  que des unités vivantes, le pool serait toujours vide) et Incinération vise
 *  un CAMP entier, pas des unités — son contenu se résout avant même le bloc de
 *  ciblage. */
const SCATTER_EXCLUDED = new Set<ComposedEffectContent>(["exhumation", "incineration"]);

/** La répartition au hasard tire des cibles VIVANTES sur le plateau, passe par
 *  passe. Hors plateau, il n'y a rien à répartir. */
function scatterAllowed(content: ComposedEffectContent, location: TargetSpec["location"]): boolean {
  return location === "board" && !SCATTER_EXCLUDED.has(content);
}

/** Régime « point par point » : seuls les dégâts et le soin découpent leur
 *  amplitude X en passes de 1. Pour tous les autres contenus, X est l'amplitude
 *  de l'effet (ou n'a pas de sens) et c'est NOMBRE qui donne le nombre de passes. */
function scatterIsPointwise(content: ComposedEffectContent): boolean {
  return content === "deal_damage" || content === "heal";
}

const FACTION_OPTIONS = Object.keys(FACTIONS).sort((a, b) => a.localeCompare(b, "fr"));

const RACE_OPTIONS = Array.from(new Set(Object.values(FACTIONS).flatMap((f) => f.races))).sort((a, b) => a.localeCompare(b, "fr"));

// Mots-clés utilisables comme filtre « ne propose que les cartes portant … ».
// Même dérivation d'id que GRANTABLE, mais sans la contrainte `grantable` :
// on ne confère rien ici, on filtre sur la présence de la capacité.
const POOL_KEYWORDS = Object.values(ABILITIES)
  .filter((a) => a.applicable_to.includes("creature"))
  .map((a) => ({ id: creatureEngineId(a), label: a.creature?.label ?? a.label }))
  .sort((a, b) => a.label.localeCompare(b.label, "fr"));

// TOUTES les capacités de créature, et non les seules `grantable`.
//
// `triggers.grantable` vaut `automatic` : il ne retenait que les passives, au
// motif qu'elles seules se confèrent « de façon permanente ». La limite venait en
// réalité du CANAL du don — le mot-clé seul, sans mode — et non des capacités
// elles-mêmes. Depuis que le don transporte un déclencheur (`grantTrigger` →
// `keyword_instances.mode`), une Tempête ou une Divination conférées se
// déclenchent aussi bien qu'une Armure.
//
// `grantable` reste inchangé et continue de servir le don porté par un SORT
// (effectKind "grant"), qui lui n'a pas de déclencheur à transporter.
const GRANTABLE = Object.values(ABILITIES)
  .filter((a) => a.applicable_to.includes("creature"))
  .map((a) => ({ id: creatureEngineId(a), label: a.creature?.label ?? a.label }))
  .sort((a, b) => a.label.localeCompare(b.label, "fr"));

/** Déclencheurs qu'une capacité peut prendre une fois CONFÉRÉE.
 *
 *  `on_play` est retiré : la cible d'un don est déjà en jeu, donc son entrée est
 *  passée. Le laisser offrirait une option qui ne se déclenche jamais — le défaut
 *  même qu'on répare. Une liste vide ou à un seul élément ⇒ la capacité n'a pas
 *  de choix à faire (passive, ou râle d'agonie qui ne part qu'à la mort). */
function grantTriggerOptions(abilityId: string): CapabilityTrigger[] {
  return getCapabilityTriggers("creature", abilityId).filter((t) => t !== "on_play" && t !== "automatic");
}

/** Déclencheur proposé par défaut pour une capacité fraîchement choisie. */
function defaultGrantTrigger(abilityId: string): CapabilityTrigger | undefined {
  return grantTriggerOptions(abilityId)[0];
}

const DEFAULT_TARGET: TargetSpec = { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" };

/** Valeurs proposées au plafond de coût des cibles : jusqu'au mana maximum d'un
 *  tour (`MAX_MANA`), la borne au-delà de laquelle le filtre ne retirerait plus
 *  rien. Dérivé de la constante plutôt que écrit en dur — deux listes qui disent
 *  la même chose finissent toujours par diverger. */
const MAX_COST_OPTIONS = Array.from({ length: MAX_MANA + 1 }, (_, n) => n);

const cardBorder = "1px solid #e3d9c0";
const labelStyle = { fontSize: 8, color: "#999", letterSpacing: 1, fontWeight: 700 } as const;

const SPELL_CATALOG = buildSpellEffectCatalog(ALL_SPELL_KEYWORDS);

/** Sur un OBJET, ces déclencheurs parlent du PORTEUR, pas de l'objet : la
 *  capacité lui est greffée à l'équipement et suit SES événements. Les deux
 *  absents — `on_play` et `on_draw` — sont la vie propre de l'objet (sa pose,
 *  sa pioche) et se résolvent depuis lui. Sans cette distinction à l'écran,
 *  « à la mort » sur un objet se lit naturellement comme la mort de l'objet. */
const DECLENCHEUR_DU_PORTEUR = new Set<CapabilityTrigger>([
  "on_death", "on_return", "on_activation", "on_attack", "on_end_of_turn", "on_start_of_turn", "on_low_hp",
]);

export default function ComposedEffectsEditor({
  value, onChange, isUnit, tokenTemplates, singleEffect = false,
  pourToken = false, pourObjet = false, curated, onCuratedChange,
}: {
  value: Capability[];
  onChange: (v: Capability[]) => void;
  isUnit: boolean;
  tokenTemplates: TokenTemplate[];
  // Un seul effet composé édité (ex. pouvoir de héros) : masque ajout/suppression
  // pour garantir le contrat « un seul ComposedEffect » sans perte silencieuse.
  singleEffect?: boolean;
  // TOKEN : retire « à l'entrée » des déclencheurs. Un jeton n'entre jamais en
  // jeu par `playCard` — une capacité composée on-play y serait définitivement
  // muette, exactement comme les mots-clés curés que `tokenRequiresMode` force
  // déjà à choisir un mode.
  pourToken?: boolean;
  // OBJET : retire les déclencheurs qui n'y partiraient jamais, et annote ceux
  // qui parlent du PORTEUR plutôt que de l'objet.
  pourObjet?: boolean;
  // SORT : mécaniques curées (spell_keywords) éditées dans la MÊME liste que les
  // effets composés. Absent ⇒ éditeur composé seul (créature, pouvoir de héros).
  curated?: SpellKeywordInstance[];
  onCuratedChange?: (v: SpellKeywordInstance[]) => void;
}) {
  const tr = useTranslations("forge");
  // Liste unifiée active seulement si l'appelant fournit le couple curated/onCuratedChange.
  const unified = !!curated && !!onCuratedChange && !singleEffect;
  const triggersUnite: { v: CapabilityTrigger; l: string }[] = [{ v: "on_play", l: tr('trigger_on_play') }, { v: "on_death", l: tr('trigger_on_death') }, { v: "on_return", l: tr('trigger_on_return') }, { v: "on_activation", l: tr('trigger_on_activation') }, { v: "on_attack", l: tr('trigger_on_attack') }, { v: "on_end_of_turn", l: tr('trigger_on_end_of_turn') }, { v: "on_end_of_turn_in_hand", l: tr('trigger_on_end_of_turn_in_hand') }, { v: "on_start_of_turn", l: tr('trigger_on_start_of_turn') }, { v: "on_start_of_turn_in_hand", l: tr('trigger_on_start_of_turn_in_hand') }, { v: "on_draw", l: tr('trigger_on_draw') }, { v: "on_low_hp", l: tr('trigger_on_low_hp') }, { v: "on_wound", l: tr('trigger_on_wound') }];
  const triggers: { v: CapabilityTrigger; l: string }[] = isUnit
    // Filtré par la MÊME règle que le moteur (`isTokenFiringTrigger`, dérivée de
    // TOKEN_FIRING_MODES) plutôt que par une liste tenue ici : deux listes qui
    // disent la même chose finissent toujours par diverger.
    // OBJET : un seul déclencheur est retiré (`on_end_of_turn_in_hand`, que la
    // boucle de main écarte), et les autres sont ANNOTÉS — sur un objet, « à la
    // mort » ne parle pas de l'objet mais de son PORTEUR, et rien à l'écran ne
    // le disait. Filtré par le même prédicat que le moteur plutôt que par une
    // liste tenue ici : deux listes qui disent la même chose divergent toujours.
    ? (pourObjet
        ? triggersUnite.filter((t) => isItemFiringTrigger(t.v))
          .map((t) => ({ ...t, l: DECLENCHEUR_DU_PORTEUR.has(t.v) ? `${t.l} ${tr('item_trigger_bearer')}` : t.l }))
        : pourToken ? triggersUnite.filter((t) => isTokenFiringTrigger(t.v)) : triggersUnite)
    // Un SORT n'a que deux moments possibles : sa résolution (quand on le lance)
    // et sa PIOCHE. Le mode « draw » des mots-clés ne lui est pas ouvert — sur un
    // sort, `keyword_instances` décrit les capacités CONFÉRÉES à une cible, un
    // mode y désignerait le déclencheur du don une fois posé sur la créature.
    // Un sort qui agit à la pioche passe donc forcément par un effet composé.
    : [{ v: "spell_resolution", l: tr('trigger_spell_resolution') }, { v: "on_draw", l: tr('trigger_on_draw') }];

  /** Case « ? » d'une amplitude : le nombre saisi devient un PLAFOND, et la
   *  valeur est tirée entre 1 et lui.
   *
   *  Un plafond < 2 n'a rien à tirer — « entre 1 et 1 » est une constante — donc
   *  la case est désactivée plutôt que d'offrir un aléatoire qui n'en est pas. */
  const caseAlea = (
    idx: number,
    eff: ComposedEffect,
    champ: "randomX" | "randomY",
    plafond: number,
  ) => {
    const inerte = plafond < 2;
    // Plancher A : seulement là où X est un COÛT de carte (Sélections, Faveur,
    // Invocation) — le « ? » y reste un plafond, et A en borne le bas. Pour
    // des dégâts ou un soin, « au moins 4 dégâts » serait un autre mot-clé.
    const avecPlancher = champ === "randomX" && !inerte && !!eff.magnitude?.randomX
      && (RANDOM_X_ABILITY_IDS.has(eff.content) || eff.content === "invocation");
    return (
      <>
      <label
        // Les SÉLECTIONS ne tirent pas leur amplitude une fois pour toutes :
        // chaque carte révélée tire son propre coût. L'infobulle doit le dire,
        // sinon la case promet la mauvaise chose.
        //
        // FAVEUR partage le régime mais pas la phrase : elle n'offre qu'UNE
        // carte, et lui promettre que « les trois » valent X serait un
        // contresens pur et simple.
        title={inerte ? tr('random_needs_ceiling')
          : tr(eff.content === "faveur" ? 'random_hint_faveur'
            : RANDOM_X_ABILITY_IDS.has(eff.content) ? 'random_hint_selection'
            : 'random_hint', { max: plafond })}
        style={{
          display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9,
          color: inerte ? "#ccc" : eff.magnitude?.[champ] ? "#b3541e" : "#666",
          cursor: inerte ? "default" : "pointer",
          fontWeight: eff.magnitude?.[champ] ? 700 : 400,
        }}
      >
        <input
          type="checkbox"
          disabled={inerte}
          checked={!!eff.magnitude?.[champ] && !inerte}
          onChange={(e) => patchEffect(idx, { magnitude: {
            ...eff.magnitude, [champ]: e.target.checked,
            // Décocher le « ? » efface aussi son plancher : sinon il ressurgirait
            // au prochain cochage, sans que l'auteur l'ait redemandé.
            ...(champ === "randomX" && !e.target.checked ? { minX: undefined } : {}),
          } })}
        />
        ?
      </label>
      {avecPlancher && (
        <PlancherAleatoireInput
          value={eff.magnitude?.minX} plafond={plafond}
          title={tr('random_min_hint', { min: eff.magnitude?.minX ?? 1, max: plafond })}
          onChange={(v) => patchEffect(idx, { magnitude: { ...eff.magnitude, minX: v } })}
        />
      )}
      </>
    );
  };
  /** Ce que l'auteur doit savoir quand il coche « OU ».
   *
   *  Deux pièges, tous deux silencieux au moment de la saisie : une branche
   *  toute seule (il n'y a plus de choix, l'effet redevient ordinaire) et des
   *  branches déclarées sur des DÉCLENCHEURS différents — le groupe se forme
   *  par moment de jeu, deux branches qui ne se rencontrent jamais ne
   *  s'excluent pas davantage. */
  /** Libellé d'un contenu dans le sélecteur.
   *
   *  next-intl rend la CLÉ quand la traduction manque (« forge.content_appel »
   *  s'affichait tel quel dans la liste). Le libellé français porté par
   *  `COMPOSED_CONTENTS` sert donc de repli : un contenu ajouté sans sa clé
   *  reste lisible, au lieu d'exposer sa plomberie à l'auteur. */
  const libelleContenu = (o: { v: string; l: string }): string => {
    const traduit = tr(`content_${o.v}`);
    return traduit.startsWith("forge.") ? o.l : traduit;
  };

  const avertissementOu = (idx: number) => {
    const branches = value.filter((c) => c.alternative === true);
    const moi = value[idx];
    const message = branches.length < 2
      ? tr('alternative_warn_alone')
      : branches.some((c) => c.trigger !== moi.trigger)
        ? tr('alternative_warn_triggers')
        : null;
    if (!message) return null;
    return <span style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic" }}>{message}</span>;
  };

  const aleaX = (idx: number, eff: ComposedEffect) => caseAlea(idx, eff, "randomX", eff.magnitude?.x ?? 0);
  const aleaY = (idx: number, eff: ComposedEffect) => caseAlea(idx, eff, "randomY", eff.magnitude?.y ?? 0);

  // ORDRE D'AUTEUR (composed-position.ts) : un composé ajouté maintenant se
  // place APRÈS les mécaniques déjà saisies et AVANT celles qui viendront —
  // « ajouté en premier ⇒ résolu en premier ». Hors mode unifié (créature), le
  // nombre de mots-clés n'est pas connu ici : c'est l'appelant qui positionne.
  const positionNouveau = unified ? { position: positionAfterExisting((curated ?? []).length) } : {};
  const addComposed = () => onChange([...value, {
    ...positionNouveau,
    uid: `c_${Math.random().toString(36).slice(2, 9)}`,
    // Un token n'a pas d'entrée en jeu : son premier déclencheur proposé est le
    // premier qui parte réellement chez lui.
    trigger: isUnit ? (pourToken ? triggers[0]?.v ?? "on_death" : "on_play") : "spell_resolution",
    effectKind: "immediate", abilityId: "_composed",
    composed: { content: "deal_damage", magnitude: { x: 1 }, target: { ...DEFAULT_TARGET } },
  }]);
  const removeComposed = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const patchCap = (idx: number, p: Partial<Capability>) => onChange(value.map((c, i) => i === idx ? { ...c, ...p } : c));
  const patchEffect = (idx: number, p: Partial<ComposedEffect>) => onChange(value.map((c, i) => i === idx ? { ...c, composed: { ...(c.composed as ComposedEffect), ...p } } : c));
  // Filtre de pool : un champ vidé est SUPPRIMÉ (undefined) plutôt que laissé à
  // "" — le moteur traite "" comme « pas de filtre », mais une chaîne vide
  // persistée en base ferait du bruit dans les diffs de carte.
  const patchPool = (idx: number, p: Partial<ComposedPoolFilter>) => onChange(value.map((c, i) => {
    if (i !== idx) return c;
    const eff = c.composed as ComposedEffect;
    const next = { ...(eff.pool ?? {}), ...p };
    for (const k of Object.keys(next) as (keyof ComposedPoolFilter)[]) if (!next[k]) delete next[k];
    return { ...c, composed: { ...eff, pool: Object.keys(next).length > 0 ? next : undefined } };
  }));
  const patchTarget = (idx: number, p: Partial<TargetSpec>) => onChange(value.map((c, i) => {
    if (i !== idx) return c;
    const eff = c.composed as ComposedEffect;
    return { ...c, composed: { ...eff, target: { ...(eff.target ?? DEFAULT_TARGET), ...p } } };
  }));
  const numInput = (val: number, on: (n: number) => void, min = 0, max = 20) => (
    <input type="number" min={min} max={max} value={val} onChange={(e) => on(Math.max(min, Math.min(max, parseInt(e.target.value) || 0)))}
      style={{ width: 44, padding: "2px 4px", borderRadius: 4, border: cardBorder, fontSize: 11, textAlign: "center", fontFamily: "'Cinzel',serif" }} />
  );
  function sel<T extends string>(val: T, opts: { v: T; l: string }[], on: (v: T) => void) {
    return (
      <select value={val} onChange={(e) => on(e.target.value as T)} style={{ padding: "3px 8px", borderRadius: 5, border: cardBorder, fontSize: 11, fontFamily: "'Cinzel',serif", background: "#fff" }}>
        {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  }

  // ── Lignes curées (mécaniques de sort sans équivalent composé) ──────────────
  const curatedRows = curated ?? [];
  const patchCurated = (idx: number, p: Partial<SpellKeywordInstance>) =>
    onCuratedChange?.(curatedRows.map((k, i) => (i === idx ? { ...k, ...p } : k)));
  const removeCurated = (idx: number) => onCuratedChange?.(curatedRows.filter((_, i) => i !== idx));

  /** Ajoute une ligne depuis le catalogue : preset composé, ou mécanique curée. */
  const addFromCatalog = (entryId: string) => {
    const entry = SPELL_CATALOG.find((e) => e.id === entryId);
    if (!entry) return;
    if (entry.kind === "composed") {
      onChange([...value, {
        ...positionNouveau,
        uid: `c_${Math.random().toString(36).slice(2, 9)}`,
        trigger: "spell_resolution", effectKind: "immediate", abilityId: "_composed",
        composed: instantiatePreset(entry),
      }]);
      return;
    }
    // Curée : mêmes valeurs d'amorçage que l'ancien picker « + Effet du sort ».
    const id = entry.id as SpellKeywordId;
    if (curatedRows.some((k) => k.id === id)) return; // une seule instance par mécanique
    const def = SPELL_KEYWORDS[id];
    const init: SpellKeywordInstance = { id };
    if (def?.params.includes("amount")) init.amount = 1;
    if (def?.params.includes("attack")) init.attack = 1;
    if (def?.params.includes("health")) init.health = 1;
    onCuratedChange?.([...curatedRows, init]);
  };

  // ORDRE D'AUTEUR — liste unifiée (sort) : mécaniques et composés dans un seul
  // ordre, celui de résolution et d'affichage. Les lignes portent un `order`
  // CSS (le conteneur est une colonne flex) et des flèches ▲▼ ; le calcul du
  // déplacement vit dans `movePowerUnified` (pur, testé).
  const idsCurated = curatedRows.map((k) => k.id as string);
  const listeUnifiee = unified ? unifiedPowerList(idsCurated, idsCurated, value) : [];
  const rangDe = (cible: { kind: "keyword"; id: string } | { kind: "composed"; uid: string }) =>
    listeUnifiee.findIndex((p) => p.kind === cible.kind && (p.kind === "keyword" ? p.id === (cible as { id: string }).id : p.uid === (cible as { uid: string }).uid));
  const deplacer = (cible: { kind: "keyword"; id: string } | { kind: "composed"; uid: string }, sens: -1 | 1) => {
    const r = movePowerUnified(idsCurated, idsCurated, value, cible, sens);
    const parId = new Map(curatedRows.map((k) => [k.id as string, k] as const));
    onCuratedChange?.(r.keywords.map((id) => parId.get(id)).filter((k): k is SpellKeywordInstance => !!k));
    onChange(r.composed);
  };
  const fleches = (cible: { kind: "keyword"; id: string } | { kind: "composed"; uid: string }) => {
    if (!unified || listeUnifiee.length < 2) return null;
    const rang = rangDe(cible);
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 1, marginRight: 2 }}>
        {([-1, 1] as const).map((sens) => {
          const possible = sens === -1 ? rang > 0 : rang < listeUnifiee.length - 1;
          return (
            <button key={sens} type="button" disabled={!possible} onClick={() => deplacer(cible, sens)}
              title={sens === -1 ? tr('move_earlier') : tr('move_later')}
              style={{ width: 18, height: 11, borderRadius: 3, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${possible ? "#d8c48a" : "#eee"}`, background: possible ? "#fff" : "transparent", color: possible ? "#b8860b" : "#ddd", fontSize: 7, lineHeight: 1, cursor: possible ? "pointer" : "not-allowed" }}
            >{sens === -1 ? "▲" : "▼"}</button>
          );
        })}
      </span>
    );
  };
  const numero = (cible: { kind: "keyword"; id: string } | { kind: "composed"; uid: string }) =>
    unified && listeUnifiee.length > 1 ? <span style={{ color: "#b8860b", fontWeight: 700, marginRight: 4 }}>{rangDe(cible) + 1}.</span> : null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 12, fontWeight: 700, color: "#8a6d3b" }}>🧩 {tr(unified ? 'effects_heading' : 'composed_effects_heading')}</span>
        <span style={{ fontSize: 9, color: "#aaa" }}>{tr(unified ? 'effects_subtitle' : 'composed_effects_subtitle')}</span>
      </div>

      {/* Mécaniques curées : rendu volontairement resserré (pas de ciblage
          générique — chacune porte ses propres paramètres et son résolveur
          historique). Elles restent persistées dans spell_keywords. */}
      {unified && curatedRows.map((kw, idx) => {
        const def = SPELL_KEYWORDS[kw.id];
        if (!def) return null;
        return (
          <div key={kw.id} style={{ border: cardBorder, borderRadius: 8, padding: 10, marginBottom: 8, background: "#fbf7ff", order: spellKeywordDisplayOrder(idx) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              {fleches({ kind: "keyword", id: kw.id })}
              <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[kw.id] || def.symbol || "✦"} size={16} keyword={`spell_${kw.id}`} />
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, color: "#9b59b6", flex: 1 }}>{numero({ kind: "keyword", id: kw.id })}{SPELL_KEYWORD_LABELS[kw.id] ?? kw.id}</span>
              <span style={{ fontSize: 8, color: "#9b59b6", letterSpacing: 1 }}>{tr('effect_kind_curated')}</span>
              <button onClick={() => removeCurated(idx)} style={{ border: "none", background: "transparent", color: "#c0392b", cursor: "pointer", fontSize: 14 }} title={tr('remove')}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "center" }}>
              <span style={labelStyle}>{tr('label_content')}</span>
              <span style={{ fontSize: 11, color: "#444", fontFamily: "'Cinzel',serif", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {def.desc}
                {def.params.includes("amount") && (
                  <label style={{ fontSize: 9, color: "#9b59b6" }}>X {numInput(kw.amount ?? 1, (n) => patchCurated(idx, { amount: Math.max(1, n) }), 1)}</label>
                )}
                {def.params.includes("attack") && (
                  <label style={{ fontSize: 9, color: "#e74c3c" }}>ATK {numInput(kw.attack ?? 1, (n) => patchCurated(idx, { attack: n }))}</label>
                )}
                {def.params.includes("health") && (
                  <label style={{ fontSize: 9, color: "#c79a0a" }}>{kw.id === "dechainement" ? tr('spell_cost_y') : "PV"} {numInput(kw.health ?? 1, (n) => patchCurated(idx, { health: n }))}</label>
                )}
                {/* Déchainement : « ? » sur Y — coût plafond, chaque sort tiré entre 1 et Y. */}
                {kw.id === "dechainement" && <label title={tr('random_hint', { max: kw.health ?? 1 })} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 9, color: kw.randomY === true ? "#b3541e" : "#666", cursor: "pointer", fontWeight: kw.randomY === true ? 700 : 400 }}><input type="checkbox" checked={kw.randomY === true} onChange={(e) => patchCurated(idx, { randomY: e.target.checked ? true : undefined })} />?</label>}
              </span>
              {kw.id === "renforcement_multiple" && (
                <>
                  <span style={labelStyle}>{tr('race_clan_label')}</span>
                  <RaceClanPicker race={kw.race ?? ""} clan={kw.clan ?? ""}
                    onChange={(r, c) => patchCurated(idx, { race: r || undefined, clan: c || undefined })} />
                </>
              )}
              {kw.id === "invocations_multiples" && (
                <>
                  <span style={labelStyle}>{tr('invocation_costs_label')}</span>
                  <CostListEditor
                    value={kw.costs ?? []} onChange={(costs) => patchCurated(idx, { costs })}
                    race={kw.race ?? ""} faction={kw.faction ?? ""}
                    onRestrictChange={(r) => patchCurated(idx, { race: r.race, faction: r.faction })}
                  />
                </>
              )}
              {kw.id === "compagnons" && (
                <>
                  <span style={labelStyle}>🐾</span>
                  <LinkedCardsPicker
                    value={kw.linkedCardIds ?? []}
                    onChange={(linked) => patchCurated(idx, { linkedCardIds: linked })}
                    accent="#9b59b6"
                  />
                </>
              )}
              {/* Tuteur (forme curée, sort) : cartes ajoutées en main, doublons permis. */}
              {kw.id === "tuteur" && (
                <>
                  <span style={labelStyle}>🎓</span>
                  <LinkedCardsPicker
                    value={kw.linkedCardIds ?? []}
                    onChange={(linked) => patchCurated(idx, { linkedCardIds: linked })}
                    accent="#9b59b6"
                  />
                </>
              )}
              <span style={labelStyle}>{tr('label_targets')}</span>
              <span style={{ fontSize: 11, color: "#444", fontFamily: "'Cinzel',serif" }}>
                {def.needsTarget ? `${tr('one_target')}${def.targetType ? ` (${def.targetType})` : ""}` : "—"}
              </span>
            </div>
          </div>
        );
      })}

      {value.map((cap, idx) => {
        const eff = cap.composed as ComposedEffect;
        const meta = COMPOSED_CONTENTS.find((c) => c.v === eff.content)!;
        // « Conférer une capacité » : l'amplitude devient X/Y quand la capacité
        // conférée porte un couple (Gloire +X/+Y), sinon X seul.
        const grantedIsXY = eff.content === "grant_keyword"
          && XY_ABILITY_IDS.has(eff.grantAbilityId ?? GRANTABLE[0]?.id ?? "");
        const showY = meta.xy || grantedIsXY;
        const t = eff.target ?? DEFAULT_TARGET;
        const countMode = t.count === "all" ? "all" : t.count === 1 ? "1" : "N";
        return (
          <div key={cap.uid} style={{ border: cardBorder, borderRadius: 8, padding: 10, marginBottom: 8, background: "#fffdf6", order: composedDisplayOrder(cap) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              {fleches({ kind: "composed", uid: cap.uid })}
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, color: "#8a6d3b", flex: 1 }}>{numero({ kind: "composed", uid: cap.uid })}{tr('composed_effect_n', { n: idx + 1 })}</span>
              {!singleEffect && (
                <button onClick={() => removeComposed(idx)} style={{ border: "none", background: "transparent", color: "#c0392b", cursor: "pointer", fontSize: 14 }} title={tr('remove')}>✕</button>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "center" }}>
              <span style={labelStyle}>{tr('label_trigger')}</span>
              {/* Pour un EMBLÈME, le déclencheur ne dit pas quand poser (c'est
                  toujours à l'arrivée de la carte) mais à quoi il RÉAGIRA, pour
                  le reste de la partie. La PIOCHE en est écartée : elle n'a pas
                  de sens comme cadence permanente, et le moteur l'ignore. */}
              {sel(
                cap.trigger,
                // Pour un EMBLÈME, la liste ne dépend pas du type de la carte :
                // le déclencheur ne dit pas quand la carte agit, mais à quoi
                // l'emblème réagira chez son porteur — et ce sont des événements
                // de CRÉATURE, qu'il ait été posé par un sort ou par une unité.
                //
                // C'était le défaut : sur un sort, la liste se réduisait au seul
                // `spell_resolution`, auquel aucun emblème ne répond jamais.
                cap.effectKind === "emblem" ? triggersUnite.filter((t) => isEmblemCadence(t.v)) : triggers,
                (v) => {
                  // « La source des dégâts » n'existe que sous Blessure : quitter
                  // ce déclencheur en la gardant laisserait un effet inerte, sans
                  // que rien à l'écran ne le dise.
                  const perdSaCible = v !== "on_wound" && cap.composed?.target?.entity === "damage_source";
                  patchCap(idx, perdSaCible
                    ? { trigger: v, composed: { ...cap.composed!, target: { ...cap.composed!.target!, entity: "unit", designation: "choice" } } }
                    : { trigger: v });
                },
              )}

              {/* SINGULIER — condition ajoutée au déclencheur choisi ci-dessus. */}
              <span style={labelStyle}>{tr('singulier_toggle')}</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }} title={tr('singulier_toggle_title')}>
                <input type="checkbox" checked={cap.singulier === true}
                  onChange={(e) => patchCap(idx, { singulier: e.target.checked ? true : undefined })} />
                <span style={{ color: "#0D9488", fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{tr('singulier_toggle')}</span>
              </label>

              {/* « OU » — cet effet devient une BRANCHE du choix de la carte.
                  Une carte n'a qu'un groupe : tout ce qui est coché s'exclut
                  mutuellement, et le joueur tranche à la résolution. */}
              <span style={labelStyle}>{tr('alternative_toggle')}</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, cursor: "pointer" }} title={tr('alternative_toggle_title')}>
                <input type="checkbox" checked={cap.alternative === true}
                  onChange={(e) => patchCap(idx, { alternative: e.target.checked ? true : undefined })} />
                <span style={{ color: "#b3541e", fontWeight: 700, fontFamily: "'Cinzel',serif" }}>{tr('alternative_toggle')}</span>
                {cap.alternative === true && avertissementOu(idx)}
              </label>

              {/* EMBLÈME — l'effet n'est pas joué maintenant : il est DÉPOSÉ sur
                  un joueur et survit à cette carte. Un emblème composé se résout
                  à chaque fin de tour de son porteur.

                  MASQUÉ SUR UN JETON : les emblèmes sont posés par
                  `placeEmblemsForCard`, appelé à l'entrée d'une CRÉATURE et à la
                  résolution d'un SORT. Un jeton ne passe ni par l'un ni par
                  l'autre — l'emblème n'y serait jamais posé, comme « à l'entrée »
                  n'y part jamais. Autant ne pas proposer la case. */}
              {!pourToken && <span style={labelStyle}>{tr('label_emblem')}</span>}
              {!pourToken && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={cap.effectKind === "emblem"}
                    onChange={(e) => patchCap(idx, {
                      effectKind: e.target.checked ? "emblem" : "immediate",
                      // Devenir un emblème peut rendre le déclencheur courant
                      // invalide — `spell_resolution` sur un sort, typiquement.
                      // Le laisser tel quel produisait un emblème muet.
                      ...(e.target.checked && !isEmblemCadence(cap.trigger)
                        ? { trigger: DEFAULT_EMBLEM_CADENCE }
                        : {}),
                      ...(e.target.checked ? {} : { side: undefined }),
                    })}
                  />
                  {tr('emblem_permanent')}
                </label>
                {cap.effectKind === "emblem" && (
                  <span style={{ fontSize: 11, color: "#8a6d3b", fontStyle: "italic" }}>
                    {tr('emblem_trigger_note')}
                  </span>
                )}
                {cap.effectKind === "emblem" && (
                  <>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      {tr('label_emblem_side')}
                      <select
                        value={cap.side ?? "self"}
                        onChange={(e) => patchCap(idx, { side: e.target.value as "self" | "opponent" })}
                        style={{ fontSize: 12, padding: "2px 4px" }}
                      >
                        <option value="self">{tr('emblem_side_self')}</option>
                        <option value="opponent">{tr('emblem_side_opponent')}</option>
                      </select>
                    </label>
                    {/* Vide ou 0 ⇒ PERMANENT. Le champ n'est pas un compteur
                        obligatoire : la permanence reste le défaut. */}
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      {tr('label_emblem_duration')}
                      <input
                        type="number"
                        min={0}
                        value={cap.duration ?? ""}
                        placeholder="∞"
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          patchCap(idx, { duration: Number.isFinite(n) && n > 0 ? n : undefined });
                        }}
                        style={{ fontSize: 12, padding: "2px 4px", width: 56 }}
                      />
                      <span style={{ fontSize: 11, color: "#8a6d3b" }}>
                        {cap.duration ? tr('emblem_duration_turns') : tr('emblem_duration_permanent')}
                      </span>
                    </label>
                  </>
                )}
              </div>}
              {/* Un déclencheur RÉPÉTITIF empile un emblème de plus à chaque
                  occurrence — et un emblème composé à N piles se résout N fois.
                  C'est jouable, mais il faut l'avoir voulu. */}
              {cap.effectKind === "emblem"
                && (cap.trigger === "on_attack" || cap.trigger === "on_end_of_turn" || cap.trigger === "on_start_of_turn") && (
                <>
                  <span />
                  <span style={{ fontSize: 11, color: "#b9770e", fontStyle: "italic" }}>
                    {tr('emblem_repeat_warning')}
                  </span>
                </>
              )}

              <span style={labelStyle}>{tr('label_content')}</span>
              {sel(eff.content, COMPOSED_CONTENTS.map((o) => ({ v: o.v, l: libelleContenu(o) })), (v) => {
                const m = COMPOSED_CONTENTS.find((c) => c.v === v)!;
                const prev = eff.target ?? { ...DEFAULT_TARGET, entity: "unit" };
                const scatterOk = scatterAllowed(v, prev.location);
                // Exhumation : cible pré-remplie cimetière allié « au choix » (sinon
                // composedSlotType ne produirait pas de picker). Champs éditables ensuite.
                const nextTarget = m.target === "none" ? undefined
                  : v === "exhumation" || v === "rappel"
                    ? { entity: "unit" as const, count: 1 as const, side: "ally" as const, location: "graveyard" as const, designation: "choice" as const }
                    : (prev.designation === "scatter" && !scatterOk ? { ...prev, designation: "random" as const } : prev);
                patchEffect(idx, {
                  content: v, target: nextTarget,
                  grantAbilityId: v === "grant_keyword" ? (eff.grantAbilityId ?? GRANTABLE[0]?.id) : undefined,
                  grantTrigger: v === "grant_keyword"
                    ? (eff.grantTrigger ?? defaultGrantTrigger(eff.grantAbilityId ?? GRANTABLE[0]?.id ?? ""))
                    : undefined,
                  // Le filtre de pool ne survit pas à un changement vers un
                  // contenu qui n'en a pas (sinon champ fantôme en base).
                  // Le type de carte, lui, ne survit qu'entre contenus qui le
                  // proposent : « Objets » passé à une Invocation viderait son
                  // pool en silence, sans case à l'écran pour s'en apercevoir.
                  pool: POOL_CONTENTS.has(v) ? poolSansTypeHorsPerimetre(eff.pool, v) : undefined,
                  // Idem pour la carte désignée d'une Invocation.
                  cardId: v === "invocation" || v === "tuteur" ? eff.cardId : undefined,
                  cardIds: v === "invocation" || v === "tuteur" ? eff.cardIds : undefined,
                });
              })}

              {eff.content === "invocation" && (
                <>
                  <span style={labelStyle}>{tr('label_designated_card')}</span>
                  <div>
                    {/* Liste ORDONNÉE, doublons permis : plusieurs créatures désignées
                        = Invocations multiples désignées. Vide ⇒ tirage aléatoire. */}
                    <LinkedCardsPicker
                      title={`📣 ${tr('label_designated_card')}`} required={false} creaturesOnly
                      value={designatedCardIds(eff)}
                      onChange={(v) => patchEffect(idx, { cardIds: v, cardId: undefined })}
                    />
                    <div style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic", marginTop: 4 }}>{tr('designated_card_hint')}</div>
                  </div>
                </>
              )}
              {eff.content === "tuteur" && (
                <>
                  <span style={labelStyle}>{tr('label_designated_card')}</span>
                  <div>
                    {/* Liste ORDONNÉE, doublons permis (comme les Compagnons) :
                        deux fois la même carte = deux exemplaires en main. */}
                    <LinkedCardsPicker
                      title={`🎓 ${tr('label_designated_card')}`} required
                      value={tuteurCardIds(eff)}
                      onChange={(v) => patchEffect(idx, { cardIds: v, cardId: undefined })}
                    />
                    <div style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic", marginTop: 4 }}>{tr('tuteur_card_hint')}</div>
                  </div>
                </>
              )}
              {/* Invocation DÉSIGNÉE et Tuteur : ni amplitude ni filtre de pool —
                  la carte est nommée, il n'y a rien à tirer. */}
              {eff.content === "rappel" && (
                <>
                  <span style={labelStyle}>{tr('label_card_kind')}</span>
                  {sel(t.cardKind ?? "", [{ v: "", l: tr('card_kind_all') }, { v: "creature", l: tr('card_kind_creature') }, { v: "spell", l: tr('card_kind_spell') }],
                    (v) => patchTarget(idx, { cardKind: (v || undefined) as TargetSpec["cardKind"] }))}
                </>
              )}
              {!(eff.content === "invocation" && designatedCardIds(eff).length > 0) && eff.content !== "rappel" && eff.content !== "tuteur" && (<>
              <span style={labelStyle}>{tr('label_magnitude')}</span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 9, color: "#666" }}>X {numInput(eff.magnitude?.x ?? 0, (n) => patchEffect(idx, { magnitude: { ...eff.magnitude, x: n } }))}</label>
                {/* « ? » — la valeur saisie devient un PLAFOND et le nombre est
                    tiré entre 1 et lui, une seule fois, à la résolution. */}
                {aleaX(idx, eff)}
                {showY && <label style={{ fontSize: 9, color: "#666" }}>Y {numInput(eff.magnitude?.y ?? 0, (n) => patchEffect(idx, { magnitude: { ...eff.magnitude, y: n } }))}</label>}
                {showY && aleaY(idx, eff)}
              </span>
              </>)}

              {/* OCCURRENCES — combien de fois le contenu se rejoue. Proposé
                  exactement sur les contenus que le moteur sait répéter
                  (OCCURRENCE_CONTENTS, importée plutôt que recopiée). 1 = une
                  passe, soit le comportement d'avant. */}
              {OCCURRENCE_CONTENTS.has(eff.content) && (
                <>
                  <span style={labelStyle}>{tr('label_occurrences')}</span>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {numInput(eff.occurrences ?? 1, (n) => patchEffect(idx, { occurrences: n > 1 ? n : undefined }), 1, MAX_OCCURRENCES)}
                    <span style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic" }}>{tr('occurrences_hint')}</span>
                  </span>
                </>
              )}

              {eff.content === "grant_keyword" && (() => {
                const grantId = eff.grantAbilityId ?? GRANTABLE[0]?.id ?? "";
                const optionsDecl = grantTriggerOptions(grantId);
                return (
                  <>
                    <span style={labelStyle}>{tr('label_granted_ability')}</span>
                    {sel(grantId, GRANTABLE.map((g) => ({ v: g.id, l: g.label })), (v) => patchEffect(idx, {
                      grantAbilityId: v,
                      // Capacité à couple X/Y : amorcer Y à 1 (repli du moteur)
                      // plutôt que 0, sinon la Gloire conférée n'accorde aucun PV.
                      magnitude: XY_ABILITY_IDS.has(v) && eff.magnitude?.y == null
                        ? { ...eff.magnitude, y: 1 }
                        : eff.magnitude,
                      // Le déclencheur suit la capacité : garder celui de la
                      // précédente le rendrait incohérent en silence (une Armure
                      // « à la mort », un râle « à l'attaque »).
                      grantTrigger: grantTriggerOptions(v).includes(eff.grantTrigger as CapabilityTrigger)
                        ? eff.grantTrigger
                        : defaultGrantTrigger(v),
                    }))}
                    {optionsDecl.length > 1 && (
                      <>
                        <span style={labelStyle}>{tr('label_grant_trigger')}</span>
                        {sel(
                          eff.grantTrigger ?? optionsDecl[0],
                          // Libellés pris dans la liste des UNITÉS : sur un sort, `triggers` ne
                          // contient que ses deux moments à lui, et le déclencheur du don
                          // — un événement de créature — s'affichait par son id brut.
                          optionsDecl.map((t) => ({ v: t, l: triggersUnite.find((x) => x.v === t)?.l ?? t })),
                          (v) => patchEffect(idx, { grantTrigger: v as CapabilityTrigger }),
                        )}
                      </>
                    )}
                  </>
                );
              })()}
              {eff.content === "summon_token" && (
                <>
                  <span style={labelStyle}>{tr('label_token')}</span>
                  <TokenCascadePicker value={eff.tokenId ?? null} onChange={(id) => patchEffect(idx, { tokenId: id })} tokens={tokenTemplates} compact />
                </>
              )}
              {POOL_CONTENTS.has(eff.content) && !(eff.content === "invocation" && designatedCardIds(eff).length > 0) && (
                <>
                  <span style={labelStyle}>{tr('label_pool_membership')}</span>
                  <RaceClanPicker
                    race={eff.pool?.race ?? ""}
                    clan={eff.pool?.clan ?? ""}
                    onChange={(r, c) => patchPool(idx, { race: r || undefined, clan: c || undefined })}
                  />

                  <span style={labelStyle}>{tr('label_pool_faction')}</span>
                  {sel(eff.pool?.faction ?? "", [{ v: "", l: tr('pool_any') }, ...FACTION_OPTIONS.map((f) => ({ v: f, l: getFactionDisplayName(f) }))],
                    (v) => patchPool(idx, { faction: v || undefined }))}

                  {CARD_TYPE_POOL_CONTENTS.has(eff.content) && (
                    <>
                      <span style={labelStyle}>{tr('label_pool_card_type')}</span>
                      {sel(eff.pool?.cardType ?? "", eff.content === "appel"
                        // Appel : pas d'« Indifférent » — sans filtre, il appelle
                        // une UNITÉ, et c'est ce que la case doit dire.
                        ? [{ v: "", l: tr('pool_type_creature') }, { v: "item", l: tr('pool_type_item') }]
                        : [
                          { v: "", l: tr('pool_any') },
                          { v: "creature", l: tr('pool_type_creature') },
                          { v: "spell", l: tr('pool_type_spell') },
                          { v: "item", l: tr('pool_type_item') },
                        ], (v) => patchPool(idx, { cardType: (v || undefined) as CardType | undefined }))}
                    </>
                  )}

                  <span style={labelStyle}>{tr('label_pool_keyword')}</span>
                  {sel(eff.pool?.keywordId ?? "", [{ v: "", l: tr('pool_any') }, ...POOL_KEYWORDS.map((k) => ({ v: k.id, l: k.label }))],
                    (v) => patchPool(idx, { keywordId: v || undefined }))}

                  <span style={labelStyle} />
                  <span style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic" }}>
                    {tr(eff.content === "invocation" ? 'pool_hint_invocation' : 'pool_hint')}
                  </span>
                </>
              )}
            </div>

            {meta.target !== "none" && (
              <div style={{ marginTop: 8, borderTop: "1px dashed #eadfc4", paddingTop: 8 }}>
                <div style={{ ...labelStyle, marginBottom: 6 }}>{tr('label_targets')}</div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", alignItems: "center" }}>
                  <span style={labelStyle}>{tr('label_type')}</span>
                  {sel(
                    t.entity,
                    [
                      ...(meta.target === "unit_or_hero"
                        ? [{ v: "unit", l: tr('entity_unit') }, { v: "hero", l: tr('entity_hero') }, { v: "both", l: tr('entity_both') }, { v: "self", l: tr('entity_self') }]
                        : [{ v: "unit", l: tr('entity_unit') }, { v: "self", l: tr('entity_self') }]),
                      // Propre au déclencheur Blessure : ce qui vient de blesser la porteuse.
                      ...(cap.trigger === "on_wound" ? [{ v: "damage_source", l: tr('entity_damage_source') }] : []),
                    ],
                    (v) => {
                      const entity = v as TargetSpec["entity"];
                      // "self" vise la source : il doit se résoudre
                      // automatiquement. On force designation:"automatic"
                      // (et count:1), sinon le "choice" par défaut resterait
                      // stocké et casserait la résolution (le déclencheur
                      // serait perdu — cf. Ours Maudit fin de tour).
                      patchTarget(idx, entity === "self" || entity === "damage_source"
                        ? { entity, designation: "automatic", count: 1 }
                        : { entity });
                    },
                  )}

                  {/* "self" = la source : ni bord, ni nombre, ni choix. */}
                  {t.entity !== "self" && t.entity !== "damage_source" && (<>
                  <span style={labelStyle}>{tr('label_side')}</span>
                  {sel(t.side, [{ v: "ally", l: tr('side_ally') }, { v: "enemy", l: tr('side_enemy') }, { v: "any", l: tr('side_any') }], (v) => patchTarget(idx, { side: v as TargetSpec["side"] }))}

                  {(t.entity === "unit" || t.entity === "both") && (
                    <>
                      {/* En répartition « point par point » (dégâts / soin), c'est
                          X qui porte le nombre de passes : NOMBRE n'a plus de rôle
                          et laisse place au rappel. Pour tout autre contenu réparti,
                          X reste l'amplitude et NOMBRE devient le nombre de tirages
                          — d'où un sélecteur bien visible, doublé de son propre
                          rappel (« au plus N cibles distinctes »). */}
                      {t.designation === "scatter" && scatterIsPointwise(eff.content) ? (
                        <>
                          <span style={labelStyle}>{tr('label_count')}</span>
                          <span style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic" }}>
                            {tr('scatter_points_hint', { x: eff.magnitude?.x ?? 0 })}
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={labelStyle}>{tr('label_count')}</span>
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            {sel(countMode, [{ v: "1", l: "1" }, { v: "N", l: "N" }, ...(t.designation === "scatter" ? [] : [{ v: "all", l: tr('count_all') }])], (v) => patchTarget(idx, { count: v === "all" ? "all" : v === "1" ? 1 : 2 }))}
                            {countMode === "N" && numInput(typeof t.count === "number" ? t.count : 2, (n) => patchTarget(idx, { count: Math.max(1, n) }), 1, 8)}
                            {t.designation === "scatter" && (
                              <span style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic" }}>
                                {tr('scatter_passes_hint', { n: typeof t.count === "number" ? t.count : 1 })}
                              </span>
                            )}
                          </span>
                        </>
                      )}

                      <span style={labelStyle}>{tr('label_location')}</span>
                      {sel(t.location, [{ v: "board", l: tr('location_board') }, { v: "hand", l: tr('location_hand') }, { v: "deck", l: tr('location_deck') }, { v: "graveyard", l: tr('location_graveyard') }], (v) => {
                        const location = v as TargetSpec["location"];
                        // Quitter le plateau invalide la répartition (elle ne tire
                        // que des unités vivantes en jeu) : on la ramène au tirage
                        // simple plutôt que de laisser une désignation morte en base.
                        patchTarget(idx, t.designation === "scatter" && !scatterAllowed(eff.content, location)
                          ? { location, designation: "random" }
                          : { location });
                      })}

                      <span style={labelStyle}>{tr('label_membership')}</span>
                      <RaceClanPicker
                        race={t.membership?.race?.[0] ?? ""}
                        clan={t.membership?.clan?.[0] ?? ""}
                        onChange={(r, c) => patchTarget(idx, { membership: (r || c) ? { ...(r ? { race: [r] } : {}), ...(c ? { clan: [c] } : {}) } : undefined })}
                      />

                      {/* Plafond de coût, cumulatif avec l'appartenance. L'option
                          vide vaut « aucun plafond » et se distingue de 0, qui est
                          un filtre réel (les seules cartes à coût nul). */}
                      <span style={labelStyle}>{tr('label_max_cost')}</span>
                      {sel(
                        t.maxCost != null ? String(t.maxCost) : "",
                        [{ v: "", l: tr('max_cost_any') }, ...MAX_COST_OPTIONS.map((n) => ({ v: String(n), l: `≤ ${n}` }))],
                        (v) => patchTarget(idx, { maxCost: v === "" ? undefined : Number(v) }),
                      )}

                      <span style={labelStyle}>{tr('label_designation')}</span>
                      {sel(
                        t.designation,
                        [
                          { v: "choice", l: tr('designation_choice') },
                          { v: "random", l: tr('designation_random') },
                          // Répartition au hasard : toute cible vivante du plateau.
                          ...(scatterAllowed(eff.content, t.location)
                            ? [{ v: "scatter" as const, l: tr('designation_scatter') }]
                            : []),
                          { v: "automatic", l: tr('designation_automatic') },
                        ],
                        (v) => {
                          const designation = v as TargetSpec["designation"];
                          // La répartition tire AVEC REMISE : il lui faut un nombre
                          // de passes fini. « Toutes » n'en est pas un — on retombe
                          // sur 2, la première valeur où la fourchette a du sens.
                          patchTarget(idx, designation === "scatter" && t.count === "all"
                            ? { designation, count: 2 }
                            : { designation });
                        },
                      )}
                    </>
                  )}
                  </>)}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {/* Ajout : une seule porte d'entrée pour toute la carte. Le catalogue
          mélange effets paramétrables (preset composé) et mécaniques curées ;
          l'auteur choisit un EFFET, pas une technologie de stockage. */}
      {unified ? (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", order: POWER_ORDER_LAST }}>
          <span style={{ fontSize: 11, color: "#666" }}>{tr('add_effect')}</span>
          <SpellEffectPicker
            placeholder={tr('spell_effect_dash')}
            border={cardBorder}
            onPick={addFromCatalog}
            groups={[
              { label: tr('group_composed'), entries: SPELL_CATALOG.filter((e) => e.kind === "composed") },
              { label: tr('group_curated'), entries: SPELL_CATALOG.filter((e) => e.kind === "curated" && !curatedRows.some((k) => k.id === e.id)) },
            ]}
          />
        </div>
      ) : !singleEffect && (
        <button onClick={addComposed} style={{ order: POWER_ORDER_LAST, marginTop: 4, padding: "5px 12px", borderRadius: 6, border: "1px dashed #b8a36a", background: "#fffdf6", color: "#8a6d3b", fontSize: 11, fontFamily: "'Cinzel',serif", cursor: "pointer" }}>{tr('add_composed_effect')}</button>
      )}
    </div>
  );
}
