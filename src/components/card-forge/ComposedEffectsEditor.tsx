"use client";

// Éditeur d'effets composés (modèle hybride), partagé par l'onglet Capacités
// (création) et l'onglet Édition (cartes existantes). Produit/édite un tableau de
// Capability portant un `composed`. Le serveur reçoit ces entrées via
// composed_capabilities et les persiste dans la colonne capabilities.

import { useTranslations } from "next-intl";
import TokenCascadePicker from "@/components/admin/TokenCascadePicker";
import RaceClanPicker from "@/components/admin/RaceClanPicker";
import KeywordIcon from "@/components/shared/KeywordIcon";
import CostListEditor from "./CostListEditor";
import LinkedCardsPicker from "./LinkedCardsPicker";
import { ABILITIES, creatureEngineId, XY_ABILITY_IDS } from "@/lib/game/abilities";
import { ALL_SPELL_KEYWORDS, SPELL_KEYWORDS, SPELL_KEYWORD_LABELS, SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import { buildSpellEffectCatalog, instantiatePreset } from "@/lib/card-forge/spell-effect-catalog";
import { FACTIONS, getFactionDisplayName } from "@/lib/card-engine/constants";
import type { Capability, ComposedEffect, ComposedEffectContent, ComposedPoolFilter, CapabilityTrigger, SpellKeywordId, SpellKeywordInstance, TargetSpec, TokenTemplate } from "@/lib/game/types";

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
  { v: "draw_cards", l: "Piocher", target: "none" },
  { v: "discard", l: "Défausser (adversaire)", target: "none" },
  { v: "summon_token", l: "Invoquer un token", target: "none" },
  { v: "gain_mana", l: "Gagner du mana", target: "none" },
  { v: "exhumation", l: "Ressusciter (cimetière)", target: "unit" },
  // Sélections : pas de cible en jeu (on filtre un pool de cartes hors jeu),
  // d'où target "none" — le bloc « Pool » ci-dessous les paramètre.
  { v: "invocation", l: "Invocation (créature aléatoire)", target: "none" },
  { v: "epargne", l: "Épargne (compteur)", target: "none" },
  { v: "incineration", l: "Incinération (recycler un cimetière)", target: "unit_or_hero" },
  { v: "devoration", l: "Dévoration (détruire et absorber)", target: "unit" },
  { v: "retour_differe", l: "Retour différé (sous le deck)", target: "unit" },
  { v: "selection", l: "Sélection (1 parmi 3)", target: "none" },
  { v: "selection_magique", l: "Sélection magique (1 sort parmi 3)", target: "none" },
  { v: "renfort_royal", l: "Sélection Royale (1 parmi 3)", target: "none" },
];

/** Contenus paramétrés par un filtre de pool (race / faction / clan / mot-clé).
 *  Pour eux, X est un PLAFOND DE COÛT des cartes révélées (comme exhumation),
 *  pas une amplitude. */
const POOL_CONTENTS = new Set<ComposedEffectContent>(["invocation", "selection", "selection_magique", "renfort_royal"]);

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

const GRANTABLE = Object.values(ABILITIES)
  .filter((a) => a.triggers?.grantable && a.applicable_to.includes("creature"))
  .map((a) => ({ id: creatureEngineId(a), label: a.creature?.label ?? a.label }))
  .sort((a, b) => a.label.localeCompare(b.label, "fr"));

const DEFAULT_TARGET: TargetSpec = { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" };

const cardBorder = "1px solid #e3d9c0";
const labelStyle = { fontSize: 8, color: "#999", letterSpacing: 1, fontWeight: 700 } as const;

const SPELL_CATALOG = buildSpellEffectCatalog(ALL_SPELL_KEYWORDS);

export default function ComposedEffectsEditor({
  value, onChange, isUnit, tokenTemplates, singleEffect = false,
  curated, onCuratedChange,
}: {
  value: Capability[];
  onChange: (v: Capability[]) => void;
  isUnit: boolean;
  tokenTemplates: TokenTemplate[];
  // Un seul effet composé édité (ex. pouvoir de héros) : masque ajout/suppression
  // pour garantir le contrat « un seul ComposedEffect » sans perte silencieuse.
  singleEffect?: boolean;
  // SORT : mécaniques curées (spell_keywords) éditées dans la MÊME liste que les
  // effets composés. Absent ⇒ éditeur composé seul (créature, pouvoir de héros).
  curated?: SpellKeywordInstance[];
  onCuratedChange?: (v: SpellKeywordInstance[]) => void;
}) {
  const tr = useTranslations("forge");
  // Liste unifiée active seulement si l'appelant fournit le couple curated/onCuratedChange.
  const unified = !!curated && !!onCuratedChange && !singleEffect;
  const triggers: { v: CapabilityTrigger; l: string }[] = isUnit
    ? [{ v: "on_play", l: tr('trigger_on_play') }, { v: "on_death", l: tr('trigger_on_death') }, { v: "on_return", l: tr('trigger_on_return') }, { v: "on_activation", l: tr('trigger_on_activation') }, { v: "on_attack", l: tr('trigger_on_attack') }, { v: "on_end_of_turn", l: tr('trigger_on_end_of_turn') }, { v: "on_draw", l: tr('trigger_on_draw') }, { v: "on_low_hp", l: tr('trigger_on_low_hp') }]
    // Un SORT n'a que deux moments possibles : sa résolution (quand on le lance)
    // et sa PIOCHE. Le mode « draw » des mots-clés ne lui est pas ouvert — sur un
    // sort, `keyword_instances` décrit les capacités CONFÉRÉES à une cible, un
    // mode y désignerait le déclencheur du don une fois posé sur la créature.
    // Un sort qui agit à la pioche passe donc forcément par un effet composé.
    : [{ v: "spell_resolution", l: tr('trigger_spell_resolution') }, { v: "on_draw", l: tr('trigger_on_draw') }];

  const addComposed = () => onChange([...value, {
    uid: `c_${Math.random().toString(36).slice(2, 9)}`, trigger: isUnit ? "on_play" : "spell_resolution",
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

  return (
    <div>
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
          <div key={kw.id} style={{ border: cardBorder, borderRadius: 8, padding: 10, marginBottom: 8, background: "#fbf7ff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[kw.id] || def.symbol || "✦"} size={16} keyword={`spell_${kw.id}`} />
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, color: "#9b59b6", flex: 1 }}>{SPELL_KEYWORD_LABELS[kw.id] ?? kw.id}</span>
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
              {kw.id === "appel_supreme" && (
                <>
                  <span style={labelStyle}>{tr('race_label')} {!kw.race && <span style={{ color: "#e74c3c" }}>· {tr('required')}</span>}</span>
                  {sel(kw.race ?? "", [{ v: "", l: tr('race_dash') }, ...RACE_OPTIONS.map((r) => ({ v: r, l: r }))],
                    (v) => patchCurated(idx, { race: v || undefined }))}
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
          <div key={cap.uid} style={{ border: cardBorder, borderRadius: 8, padding: 10, marginBottom: 8, background: "#fffdf6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, fontWeight: 700, color: "#8a6d3b", flex: 1 }}>{tr('composed_effect_n', { n: idx + 1 })}</span>
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
                cap.effectKind === "emblem" ? triggers.filter((t) => t.v !== "on_draw") : triggers,
                (v) => patchCap(idx, { trigger: v }),
              )}

              {/* EMBLÈME — l'effet n'est pas joué maintenant : il est DÉPOSÉ sur
                  un joueur et survit à cette carte. Un emblème composé se résout
                  à chaque fin de tour de son porteur. */}
              <span style={labelStyle}>{tr('label_emblem')}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={cap.effectKind === "emblem"}
                    onChange={(e) => patchCap(idx, {
                      effectKind: e.target.checked ? "emblem" : "immediate",
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
              </div>
              {/* Un déclencheur RÉPÉTITIF empile un emblème de plus à chaque
                  occurrence — et un emblème composé à N piles se résout N fois.
                  C'est jouable, mais il faut l'avoir voulu. */}
              {cap.effectKind === "emblem"
                && (cap.trigger === "on_attack" || cap.trigger === "on_end_of_turn") && (
                <>
                  <span />
                  <span style={{ fontSize: 11, color: "#b9770e", fontStyle: "italic" }}>
                    {tr('emblem_repeat_warning')}
                  </span>
                </>
              )}

              <span style={labelStyle}>{tr('label_content')}</span>
              {sel(eff.content, COMPOSED_CONTENTS.map((o) => ({ v: o.v, l: tr(`content_${o.v}`) })), (v) => {
                const m = COMPOSED_CONTENTS.find((c) => c.v === v)!;
                const prev = eff.target ?? { ...DEFAULT_TARGET, entity: "unit" };
                const scatterOk = scatterAllowed(v, prev.location);
                // Exhumation : cible pré-remplie cimetière allié « au choix » (sinon
                // composedSlotType ne produirait pas de picker). Champs éditables ensuite.
                const nextTarget = m.target === "none" ? undefined
                  : v === "exhumation"
                    ? { entity: "unit" as const, count: 1 as const, side: "ally" as const, location: "graveyard" as const, designation: "choice" as const }
                    : (prev.designation === "scatter" && !scatterOk ? { ...prev, designation: "random" as const } : prev);
                patchEffect(idx, {
                  content: v, target: nextTarget,
                  grantAbilityId: v === "grant_keyword" ? (eff.grantAbilityId ?? GRANTABLE[0]?.id) : undefined,
                  // Le filtre de pool ne survit pas à un changement vers un
                  // contenu qui n'en a pas (sinon champ fantôme en base).
                  pool: POOL_CONTENTS.has(v) ? eff.pool : undefined,
                });
              })}

              <span style={labelStyle}>{tr('label_magnitude')}</span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <label style={{ fontSize: 9, color: "#666" }}>X {numInput(eff.magnitude?.x ?? 0, (n) => patchEffect(idx, { magnitude: { ...eff.magnitude, x: n } }))}</label>
                {showY && <label style={{ fontSize: 9, color: "#666" }}>Y {numInput(eff.magnitude?.y ?? 0, (n) => patchEffect(idx, { magnitude: { ...eff.magnitude, y: n } }))}</label>}
              </span>

              {eff.content === "grant_keyword" && (
                <>
                  <span style={labelStyle}>{tr('label_granted_ability')}</span>
                  {sel(eff.grantAbilityId ?? GRANTABLE[0]?.id ?? "", GRANTABLE.map((g) => ({ v: g.id, l: g.label })), (v) => patchEffect(idx, {
                    grantAbilityId: v,
                    // Capacité à couple X/Y : amorcer Y à 1 (repli du moteur)
                    // plutôt que 0, sinon la Gloire conférée n'accorde aucun PV.
                    magnitude: XY_ABILITY_IDS.has(v) && eff.magnitude?.y == null
                      ? { ...eff.magnitude, y: 1 }
                      : eff.magnitude,
                  }))}
                </>
              )}
              {eff.content === "summon_token" && (
                <>
                  <span style={labelStyle}>{tr('label_token')}</span>
                  <TokenCascadePicker value={eff.tokenId ?? null} onChange={(id) => patchEffect(idx, { tokenId: id })} tokens={tokenTemplates} compact />
                </>
              )}
              {POOL_CONTENTS.has(eff.content) && (
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
                    meta.target === "unit_or_hero"
                      ? [{ v: "unit", l: tr('entity_unit') }, { v: "hero", l: tr('entity_hero') }, { v: "both", l: tr('entity_both') }, { v: "self", l: tr('entity_self') }]
                      : [{ v: "unit", l: tr('entity_unit') }, { v: "self", l: tr('entity_self') }],
                    (v) => {
                      const entity = v as TargetSpec["entity"];
                      // "self" vise la source : il doit se résoudre
                      // automatiquement. On force designation:"automatic"
                      // (et count:1), sinon le "choice" par défaut resterait
                      // stocké et casserait la résolution (le déclencheur
                      // serait perdu — cf. Ours Maudit fin de tour).
                      patchTarget(idx, entity === "self"
                        ? { entity, designation: "automatic", count: 1 }
                        : { entity });
                    },
                  )}

                  {/* "self" = la source : ni bord, ni nombre, ni choix. */}
                  {t.entity !== "self" && (<>
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
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#666" }}>{tr('add_effect')}</span>
          <select value="" onChange={(e) => { addFromCatalog(e.target.value); e.currentTarget.value = ""; }}
            style={{ padding: "4px 10px", borderRadius: 5, border: cardBorder, fontSize: 11, fontFamily: "'Cinzel',serif", background: "#fff", maxWidth: 320 }}>
            <option value="">{tr('spell_effect_dash')}</option>
            <optgroup label={tr('group_composed')}>
              {SPELL_CATALOG.filter((e) => e.kind === "composed").map((e) => (
                <option key={e.id} value={e.id}>{e.symbol} {e.label}</option>
              ))}
            </optgroup>
            <optgroup label={tr('group_curated')}>
              {SPELL_CATALOG.filter((e) => e.kind === "curated" && !curatedRows.some((k) => k.id === e.id)).map((e) => (
                <option key={e.id} value={e.id}>{e.symbol} {e.label}</option>
              ))}
            </optgroup>
          </select>
        </div>
      ) : !singleEffect && (
        <button onClick={addComposed} style={{ marginTop: 4, padding: "5px 12px", borderRadius: 6, border: "1px dashed #b8a36a", background: "#fffdf6", color: "#8a6d3b", fontSize: 11, fontFamily: "'Cinzel',serif", cursor: "pointer" }}>{tr('add_composed_effect')}</button>
      )}
    </div>
  );
}
