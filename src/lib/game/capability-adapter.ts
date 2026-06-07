// Adaptateur legacy → modèle unifié (refonte des capacités).
//
// `deriveCapabilities(card)` traduit les trois structures historiques
// (`spell_keywords[]`, `keywords[]` + `keyword_instances[]`, plus les colonnes
// scalaires : entraide_race, convocation_token_id, convocation_tokens,
// lycanthropie_token_id) en `Capability[]`, SANS changer le comportement en jeu.
//
// Invariant de sûreté (cf. plan) : seul le set « multi-mode curé »
// (CURATED_MULTIMODE_IDS) voit son `trigger` routé par déclencheur dans le
// moteur (`capsByTrigger`). Pour tous les autres ids, le moteur découvre la
// capacité via `hasCapability(id)` quel que soit le déclencheur ; leur `trigger`
// est donc cosmétique/taxonomique. L'adaptateur respecte malgré tout le
// déclencheur « naturel » (on_play / on_death / automatic) pour que la forge et
// l'UI affichent la bonne catégorie.

import {
  AUTOMATIC_ABILITY_IDS,
  CURATED_MULTIMODE_IDS,
  DEATH_NATURE_IDS,
  SPELL_KEYWORDS,
  isCreatureKwShadowedBySpell,
} from "./abilities";
import { parseXValuesFromEffectText } from "./keyword-labels";
import type {
  Capability,
  CapabilityTargetSlot,
  CapabilityTrigger,
  Card,
  KeywordInstance,
  KeywordMode,
} from "./types";

function pruneParams(
  p: { x?: number | null; attack?: number | null; health?: number | null },
): Capability["params"] {
  const out: { x?: number; attack?: number; health?: number } = {};
  if (p.x != null) out.x = p.x;
  if (p.attack != null) out.attack = p.attack;
  if (p.health != null) out.health = p.health;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Déclencheur « naturel » d'un keyword créature selon son mode legacy. Pour le
 *  mode par défaut (undefined), on classe selon la taxonomie : curé → on_play,
 *  mort-intrinsèque → on_death, passif/auto → automatic, sinon on_play. */
function triggerForCreatureMode(id: string, mode: KeywordMode | undefined): CapabilityTrigger {
  if (mode === "death") return "on_death";
  if (mode === "tap") return "on_activation";
  if (mode === "return") return "on_return";
  // mode === undefined
  if (CURATED_MULTIMODE_IDS.has(id)) return "on_play";
  if (DEATH_NATURE_IDS.has(id)) return "on_death";
  if (AUTOMATIC_ABILITY_IDS.has(id)) return "automatic";
  return "on_play";
}

/** Liste d'instances effective d'une créature, reproduisant la sémantique de
 *  `hasKwInMode` : on part des `keyword_instances` quand elles existent et on
 *  synthétise une instance on-play pour chaque `keywords[]` non représenté
 *  (métadonnée jamais peuplée). Sans `keyword_instances`, chaque `keywords[]`
 *  est traité comme on-play. */
function effectiveCreatureInstances(card: Card): KeywordInstance[] {
  const insts = card.keyword_instances;
  const kws = (card.keywords ?? []) as unknown as string[];
  if (insts && insts.length > 0) {
    const idsWithInstance = new Set(insts.map((k) => k.id));
    const synth = kws
      .filter((kw) => !idsWithInstance.has(kw as KeywordInstance["id"]))
      .map((kw) => ({ id: kw } as KeywordInstance));
    return [...insts, ...synth];
  }
  return kws.map((kw) => ({ id: kw } as KeywordInstance));
}

function deriveSpellCapabilities(card: Card): Capability[] {
  const caps: Capability[] = [];

  // 1) Effets de sort prédéfinis (spell_keywords) → résolution, immédiat.
  (card.spell_keywords ?? []).forEach((sk, i) => {
    const def = SPELL_KEYWORDS[sk.id];
    const targets: CapabilityTargetSlot[] =
      def?.needsTarget && def.targetType ? [{ type: def.targetType, label: def.label }] : [];
    caps.push({
      uid: `sk_${i}`,
      trigger: "spell_resolution",
      effectKind: "immediate",
      abilityId: sk.id,
      params: pruneParams({ x: sk.amount, attack: sk.attack, health: sk.health }),
      race: sk.race,
      clan: sk.clan,
      tokenId: sk.token_id ?? undefined,
      targets,
    });
  });

  // 2) Mots-clés créature portés par le sort → conférés (grant), à la
  //    résolution. On saute ceux « ombragés » par leur jumeau spell_keyword
  //    (ex. convocations_multiples ↔ invocation_multiple) : l'effet passe par le
  //    sort, pas par un don.
  (card.keywords ?? []).forEach((kw, k) => {
    if (isCreatureKwShadowedBySpell(kw, card.spell_keywords)) return;
    const inst = card.keyword_instances?.find((x) => x.id === kw);
    const scope = inst?.grantScope ?? "target";
    const targets: CapabilityTargetSlot[] =
      scope === "target" ? [{ type: "friendly_creature", label: "Cible du don" }] : [];
    caps.push({
      uid: `grant_${k}`,
      trigger: "spell_resolution",
      effectKind: "grant",
      abilityId: kw,
      grantScope: scope,
      params: pruneParams({ x: inst?.x }),
      targets,
    });
  });

  return caps;
}

function deriveCreatureCapabilities(card: Card): Capability[] {
  const insts = effectiveCreatureInstances(card);
  const textX = parseXValuesFromEffectText(card.effect_text);

  return insts.map((inst, i) => {
    const id = inst.id as unknown as string;
    const mode = inst.mode;
    const trigger = triggerForCreatureMode(id, mode);

    // Résolution du X façon getKwX : inst.x prioritaire ; sinon, en mode défaut
    // uniquement, repli sur la notation [Keyword X] de effect_text.
    let x: number | undefined = inst.x ?? undefined;
    if (x == null && mode == null) {
      const fromText = textX[inst.id];
      if (fromText != null) x = fromText;
    }

    let params: Capability["params"];
    if (id === "renforcement_multiple") {
      // x = bonus ATK (+X), y = bonus PV (+Y).
      params = pruneParams({ attack: x, health: inst.y });
    } else {
      params = pruneParams({ x });
    }

    let race = inst.race;
    const clan = inst.clan;
    let tokenId: number | null | undefined;
    let tokens = undefined as Capability["tokens"];

    if (id === "entraide") race = card.entraide_race ?? race ?? undefined;
    if (id === "convocation") {
      tokenId = card.convocation_token_id ?? undefined;
      tokens = card.convocation_tokens ?? undefined;
    }
    if (id === "convocations_multiples") {
      tokens = card.convocation_tokens ?? undefined;
    }
    if (id === "lycanthropie") {
      tokenId = card.lycanthropie_token_id ?? undefined;
    }

    return {
      uid: `cw_${i}`,
      trigger,
      effectKind: "immediate" as const,
      abilityId: id,
      params,
      race,
      clan,
      tokenId,
      tokens,
      targets: [],
    };
  });
}

// NOTE (refonte, fin de phase B) — surfaces moteur déjà branchées sur ce modèle
// (via getCapabilities) : présence des keywords (hasKw), gating par déclencheur
// (hasKwInMode / cardHasKwOnPlay), valeurs X (getKwX), résolution des sorts
// (spellResolutionInstances → resolveSpellKeywords) et don (applyGrantCapability).
// RESTE à brancher avant la phase F (suppression des colonnes legacy) : les
// résolveurs d'effets curés mort/tap/retour (resolveCuratedKeywordEffect et ses
// appelants qui lisent keyword_instances), la lecture `charge` de
// createCardInstance, et les lectures directes de renforcement_multiple. Ces
// chemins lisent des colonnes que la forge continue de peupler jusqu'en phase D,
// donc restent cohérents d'ici là.

/** Traduit une carte legacy en `Capability[]`, iso-comportement. Pur. */
export function deriveCapabilities(card: Card): Capability[] {
  return card.card_type === "spell"
    ? deriveSpellCapabilities(card)
    : deriveCreatureCapabilities(card);
}

// Mémoïsation par objet `card`. Le moteur remplace toujours `card` par une copie
// immuable quand il mute les keywords (grant / silence / corruption), donc une
// nouvelle identité d'objet ⇒ re-dérivation correcte. Évite de re-dériver à
// chaque `hasKw` dans les boucles de combat.
const capabilitiesMemo = new WeakMap<Card, Capability[]>();

/** Renvoie `card.capabilities` si présent (carte backfillée), sinon le dérive
 *  des structures legacy (mémoïsé). Point d'entrée unique pour le moteur. */
export function getCapabilities(card: Card): Capability[] {
  if (card.capabilities) return card.capabilities;
  const hit = capabilitiesMemo.get(card);
  if (hit) return hit;
  const derived = deriveCapabilities(card);
  capabilitiesMemo.set(card, derived);
  return derived;
}
