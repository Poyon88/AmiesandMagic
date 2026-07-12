"use client";

// Éditeur d'effets composés (modèle hybride), partagé par l'onglet Capacités
// (création) et l'onglet Édition (cartes existantes). Produit/édite un tableau de
// Capability portant un `composed`. Le serveur reçoit ces entrées via
// composed_capabilities et les persiste dans la colonne capabilities.

import { useTranslations } from "next-intl";
import TokenCascadePicker from "@/components/admin/TokenCascadePicker";
import RaceClanPicker from "@/components/admin/RaceClanPicker";
import { ABILITIES, creatureEngineId } from "@/lib/game/abilities";
import type { Capability, ComposedEffect, ComposedEffectContent, CapabilityTrigger, TargetSpec, TokenTemplate } from "@/lib/game/types";

const COMPOSED_CONTENTS: { v: ComposedEffectContent; l: string; target: "none" | "unit" | "unit_or_hero"; xy?: boolean }[] = [
  { v: "deal_damage", l: "Infliger des dégâts", target: "unit_or_hero" },
  { v: "heal", l: "Soigner", target: "unit_or_hero" },
  { v: "buff", l: "Buff +X/+Y", target: "unit", xy: true },
  { v: "debuff", l: "Debuff -X/-Y", target: "unit", xy: true },
  { v: "destroy", l: "Détruire", target: "unit" },
  { v: "bounce", l: "Renvoyer en main", target: "unit" },
  { v: "paralyze", l: "Paralyser", target: "unit" },
  { v: "grant_keyword", l: "Conférer une capacité", target: "unit" },
  { v: "draw_cards", l: "Piocher", target: "none" },
  { v: "discard", l: "Défausser (adversaire)", target: "none" },
  { v: "summon_token", l: "Invoquer un token", target: "none" },
  { v: "gain_mana", l: "Gagner du mana", target: "none" },
  { v: "exhumation", l: "Ressusciter (cimetière)", target: "unit" },
];

const GRANTABLE = Object.values(ABILITIES)
  .filter((a) => a.triggers?.grantable && a.applicable_to.includes("creature"))
  .map((a) => ({ id: creatureEngineId(a), label: a.creature?.label ?? a.label }))
  .sort((a, b) => a.label.localeCompare(b.label, "fr"));

const DEFAULT_TARGET: TargetSpec = { entity: "unit", count: 1, side: "enemy", location: "board", designation: "choice" };

const cardBorder = "1px solid #e3d9c0";
const labelStyle = { fontSize: 8, color: "#999", letterSpacing: 1, fontWeight: 700 } as const;

export default function ComposedEffectsEditor({
  value, onChange, isUnit, tokenTemplates, singleEffect = false,
}: {
  value: Capability[];
  onChange: (v: Capability[]) => void;
  isUnit: boolean;
  tokenTemplates: TokenTemplate[];
  // Un seul effet composé édité (ex. pouvoir de héros) : masque ajout/suppression
  // pour garantir le contrat « un seul ComposedEffect » sans perte silencieuse.
  singleEffect?: boolean;
}) {
  const tr = useTranslations("forge");
  const triggers: { v: CapabilityTrigger; l: string }[] = isUnit
    ? [{ v: "on_play", l: tr('trigger_on_play') }, { v: "on_death", l: tr('trigger_on_death') }, { v: "on_return", l: tr('trigger_on_return') }, { v: "on_activation", l: tr('trigger_on_activation') }, { v: "on_attack", l: tr('trigger_on_attack') }, { v: "on_end_of_turn", l: tr('trigger_on_end_of_turn') }]
    : [{ v: "spell_resolution", l: tr('trigger_spell_resolution') }];

  const addComposed = () => onChange([...value, {
    uid: `c_${Math.random().toString(36).slice(2, 9)}`, trigger: isUnit ? "on_play" : "spell_resolution",
    effectKind: "immediate", abilityId: "_composed",
    composed: { content: "deal_damage", magnitude: { x: 1 }, target: { ...DEFAULT_TARGET } },
  }]);
  const removeComposed = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const patchCap = (idx: number, p: Partial<Capability>) => onChange(value.map((c, i) => i === idx ? { ...c, ...p } : c));
  const patchEffect = (idx: number, p: Partial<ComposedEffect>) => onChange(value.map((c, i) => i === idx ? { ...c, composed: { ...(c.composed as ComposedEffect), ...p } } : c));
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

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: 12, fontWeight: 700, color: "#8a6d3b" }}>🧩 {tr('composed_effects_heading')}</span>
        <span style={{ fontSize: 9, color: "#aaa" }}>{tr('composed_effects_subtitle')}</span>
      </div>
      {value.map((cap, idx) => {
        const eff = cap.composed as ComposedEffect;
        const meta = COMPOSED_CONTENTS.find((c) => c.v === eff.content)!;
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
              {sel(cap.trigger, triggers, (v) => patchCap(idx, { trigger: v }))}

              <span style={labelStyle}>{tr('label_content')}</span>
              {sel(eff.content, COMPOSED_CONTENTS.map((o) => ({ v: o.v, l: tr(`content_${o.v}`) })), (v) => {
                const m = COMPOSED_CONTENTS.find((c) => c.v === v)!;
                const prev = eff.target ?? { ...DEFAULT_TARGET, entity: "unit" };
                // "scatter" (répartition point par point) n'a de sens que pour dégâts/soin.
                const scatterOk = v === "deal_damage" || v === "heal";
                // Exhumation : cible pré-remplie cimetière allié « au choix » (sinon
                // composedSlotType ne produirait pas de picker). Champs éditables ensuite.
                const nextTarget = m.target === "none" ? undefined
                  : v === "exhumation"
                    ? { entity: "unit" as const, count: 1 as const, side: "ally" as const, location: "graveyard" as const, designation: "choice" as const }
                    : (prev.designation === "scatter" && !scatterOk ? { ...prev, designation: "random" as const } : prev);
                patchEffect(idx, { content: v, target: nextTarget, grantAbilityId: v === "grant_keyword" ? (eff.grantAbilityId ?? GRANTABLE[0]?.id) : undefined });
              })}

              <span style={labelStyle}>{tr('label_magnitude')}</span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <label style={{ fontSize: 9, color: "#666" }}>X {numInput(eff.magnitude?.x ?? 0, (n) => patchEffect(idx, { magnitude: { ...eff.magnitude, x: n } }))}</label>
                {meta.xy && <label style={{ fontSize: 9, color: "#666" }}>Y {numInput(eff.magnitude?.y ?? 0, (n) => patchEffect(idx, { magnitude: { ...eff.magnitude, y: n } }))}</label>}
              </span>

              {eff.content === "grant_keyword" && (
                <>
                  <span style={labelStyle}>{tr('label_granted_ability')}</span>
                  {sel(eff.grantAbilityId ?? GRANTABLE[0]?.id ?? "", GRANTABLE.map((g) => ({ v: g.id, l: g.label })), (v) => patchEffect(idx, { grantAbilityId: v }))}
                </>
              )}
              {eff.content === "summon_token" && (
                <>
                  <span style={labelStyle}>{tr('label_token')}</span>
                  <TokenCascadePicker value={eff.tokenId ?? null} onChange={(id) => patchEffect(idx, { tokenId: id })} tokens={tokenTemplates} compact />
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
                      {t.designation === "scatter" ? (
                        <>
                          <span style={labelStyle}>{tr('label_count')}</span>
                          <span style={{ fontSize: 9, color: "#8a6d3b", fontStyle: "italic" }}>
                            {tr('scatter_points_hint', { x: eff.magnitude?.x ?? 0 })}
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={labelStyle}>{tr('label_count')}</span>
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            {sel(countMode, [{ v: "1", l: "1" }, { v: "N", l: "N" }, { v: "all", l: tr('count_all') }], (v) => patchTarget(idx, { count: v === "all" ? "all" : v === "1" ? 1 : 2 }))}
                            {countMode === "N" && numInput(typeof t.count === "number" ? t.count : 2, (n) => patchTarget(idx, { count: Math.max(1, n) }), 1, 8)}
                          </span>
                        </>
                      )}

                      <span style={labelStyle}>{tr('label_location')}</span>
                      {sel(t.location, [{ v: "board", l: tr('location_board') }, { v: "hand", l: tr('location_hand') }, { v: "deck", l: tr('location_deck') }, { v: "graveyard", l: tr('location_graveyard') }], (v) => patchTarget(idx, { location: v as TargetSpec["location"] }))}

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
                          // Répartition point par point : dégâts/soin uniquement.
                          ...((eff.content === "deal_damage" || eff.content === "heal")
                            ? [{ v: "scatter" as const, l: tr('designation_scatter') }]
                            : []),
                          { v: "automatic", l: tr('designation_automatic') },
                        ],
                        (v) => patchTarget(idx, { designation: v as TargetSpec["designation"] }),
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
      {!singleEffect && (
        <button onClick={addComposed} style={{ marginTop: 4, padding: "5px 12px", borderRadius: 6, border: "1px dashed #b8a36a", background: "#fffdf6", color: "#8a6d3b", fontSize: 11, fontFamily: "'Cinzel',serif", cursor: "pointer" }}>{tr('add_composed_effect')}</button>
      )}
    </div>
  );
}
