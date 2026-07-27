"use client";

// Paramètres du mot-clé « Invocations multiples » : une liste ordonnée de COÛTS
// (une invocation par entrée, créature tirée au hasard dans la collection à ce
// coût exact) et, optionnellement, une restriction de pool par race ou faction.
//
// Sans race ni faction, le pool suit l'ALIGNEMENT de la carte source — le
// comportement d'Invocation X. Renseigner l'un des deux le REMPLACE : « race
// Loups » doit pouvoir piocher hors de l'alignement de la carte.
//
// Partagé par la forge (créature et sort) et par la liste d'effets unifiée, pour
// que les écrans se comportent à l'identique.

import { useTranslations } from "next-intl";
import { FACTIONS } from "@/lib/card-engine/constants";

const FACTION_OPTIONS = Object.keys(FACTIONS).sort((a, b) => a.localeCompare(b, "fr"));
const RACE_OPTIONS = Array.from(new Set(Object.values(FACTIONS).flatMap((f) => f.races)))
  .sort((a, b) => a.localeCompare(b, "fr"));

export default function CostListEditor({
  value, onChange, accent = "#9b59b6", race = "", faction = "", onRestrictChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
  accent?: string;
  race?: string;
  faction?: string;
  /** Absent ⇒ les sélecteurs de restriction ne sont pas proposés. */
  onRestrictChange?: (r: { race?: string; faction?: string }) => void;
}) {
  const tf = useTranslations("forge");
  const costs = value ?? [];
  const patch = (idx: number, n: number) => onChange(costs.map((c, i) => (i === idx ? n : c)));
  const selectStyle = {
    padding: "3px 6px", borderRadius: 5, border: `1px solid ${accent}44`,
    fontSize: 10, fontFamily: "'Cinzel',serif", background: "#fff", maxWidth: 160,
  } as const;

  return (
    <div style={{ border: `1px solid ${accent}33`, borderRadius: 6, padding: 8, background: "#fff" }}>
      <div style={{ fontSize: 8, color: accent, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
        {tf('invocation_costs_label')}
        {costs.length === 0 && <span style={{ color: "#e74c3c", marginLeft: 4 }}>· {tf('required')}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {costs.map((cost, idx) => (
          <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <input
              type="number" min={0} max={20} value={cost}
              onChange={(e) => patch(idx, Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
              style={{ width: 40, padding: "2px 4px", borderRadius: 4, border: `1px solid ${accent}44`, fontSize: 11, textAlign: "center", fontFamily: "'Cinzel',serif" }}
            />
            <button
              onClick={() => onChange(costs.filter((_, i) => i !== idx))}
              title={tf('remove')}
              style={{ padding: "1px 6px", borderRadius: 3, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", fontSize: 9, cursor: "pointer" }}
            >×</button>
          </span>
        ))}
        <button
          onClick={() => onChange([...costs, 1])}
          style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${accent}44`, background: "#fff", color: accent, fontSize: 9, cursor: "pointer", fontFamily: "'Cinzel',serif" }}
        >{tf('add_invocation')}</button>
      </div>

      {onRestrictChange && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${accent}33` }}>
          <div style={{ fontSize: 8, color: accent, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
            {tf('invocation_pool_label')}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <select value={race} onChange={(e) => onRestrictChange({ race: e.target.value || undefined, faction })} style={selectStyle}>
              <option value="">{tf('invocation_pool_any_race')}</option>
              {RACE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={faction} onChange={(e) => onRestrictChange({ race, faction: e.target.value || undefined })} style={selectStyle}>
              <option value="">{tf('invocation_pool_any_faction')}</option>
              {FACTION_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      )}

      <div style={{ fontSize: 8, color: "#999", marginTop: 6, fontStyle: "italic" }}>
        {onRestrictChange ? tf('invocation_pool_hint') : tf('invocation_costs_hint')}
      </div>
    </div>
  );
}
