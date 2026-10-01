"use client";

// INVENTION — saisie de la capacité qu'une pièce ajoute à la MACHINE : la
// capacité (optionnelle), son amplitude X (et Y pour une capacité à couple), et
// son déclencheur UNE FOIS SUR LA MACHINE. Les +ATQ/+PV de la pièce se
// saisissent ailleurs (X/Y du mot-clé côté unité, ATK/PV côté sort).
//
// Partagé par la forge (unité et sort) et l'éditeur admin, pour que les trois
// surfaces proposent exactement les mêmes capacités et déclencheurs.
import { useMemo } from "react";
import { ABILITIES, XY_ABILITY_IDS, creatureEngineId } from "@/lib/game/abilities";
import { CURATED_KEYWORD_MODES } from "@/lib/card-engine/constants";
import { estCapaciteDeMachine, estPermanente } from "@/lib/game/machine";
import type { KeywordMode } from "@/lib/game/types";

export interface MachinePartValue {
  grantAbilityId?: string;
  grantX?: number;
  grantY?: number;
  grantMode?: KeywordMode;
}

const MODES: { mode: KeywordMode | undefined; label: string }[] = [
  { mode: undefined, label: "À l'arrivée en jeu" },
  { mode: "death", label: "À la mort" },
  { mode: "tap", label: "À l'activation" },
  { mode: "return", label: "Au retour en main" },
  { mode: "attack", label: "À l'attaque" },
  { mode: "end_of_turn", label: "En fin de tour" },
  { mode: "start_of_turn", label: "En début de tour" },
  { mode: "draw", label: "À la pioche" },
  { mode: "low_hp", label: "Sous le seuil de PV" },
  { mode: "wound", label: "Blessée sans mourir" },
];

export default function MachinePartEditor({ value, onChange, accent = "#b87333" }: {
  value: MachinePartValue;
  onChange: (patch: MachinePartValue) => void;
  accent?: string;
}) {
  const options = useMemo(() => Object.values(ABILITIES)
    .filter((a) => a.applicable_to.includes("creature") && estCapaciteDeMachine(creatureEngineId(a)))
    .map((a) => ({ id: creatureEngineId(a), label: a.creature?.label ?? a.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr")), []);

  const id = value.grantAbilityId ?? "";
  const choisie = options.find((o) => o.id === id);
  const permanente = !!id && estPermanente(id);
  const avecX = !!choisie && /X/.test(choisie.label);
  const couple = XY_ABILITY_IDS.has(id);
  const modesOuverts = choisie ? CURATED_KEYWORD_MODES[choisie.label] : undefined;
  const modes = MODES.filter((m) => m.mode === undefined || (modesOuverts?.has(m.mode as never) ?? false));

  const champ = { padding: "2px 6px", borderRadius: 4, border: `1px solid ${accent}44`, fontSize: 10, fontFamily: "'Cinzel',serif" } as const;
  return (
    <div style={{ marginTop: 6, padding: 6, borderRadius: 6, border: `1px solid ${accent}44`, background: "#fffaf3" }}>
      <div style={{ fontSize: 8, color: accent, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>⚙️ CAPACITÉ AJOUTÉE À LA MACHINE (optionnelle)</div>
      <select value={id}
        onChange={(e) => {
          const next = e.target.value || undefined;
          // Valeurs par défaut ÉCRITES (et non seulement affichées) : un X/Y
          // laissé tel quel doit arriver en base tel qu'on le voit.
          onChange({
            grantAbilityId: next,
            grantX: next && /X/.test(options.find((o) => o.id === next)?.label ?? "") ? (value.grantX ?? 1) : undefined,
            grantY: next && XY_ABILITY_IDS.has(next) ? (value.grantY ?? 1) : undefined,
            grantMode: undefined,
          });
        }}
        style={{ ...champ, width: "100%", padding: "4px 8px", background: "#fff", marginBottom: 4 }}>
        <option value="">— Aucune (stats seulement) —</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {choisie && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {avecX && (
            <label style={{ fontSize: 9, color: accent }}>{couple ? "+ATK (X)" : "X"}{" "}
              <input type="number" min={0} max={20} value={value.grantX ?? 1}
                onChange={(e) => onChange({ grantX: Math.max(0, Math.min(20, parseInt(e.target.value) || 0)) })}
                style={{ ...champ, width: 44, textAlign: "center" }} />
            </label>
          )}
          {couple && (
            <label style={{ fontSize: 9, color: accent }}>+PV (Y){" "}
              <input type="number" min={0} max={20} value={value.grantY ?? 1}
                onChange={(e) => onChange({ grantY: Math.max(0, Math.min(20, parseInt(e.target.value) || 0)) })}
                style={{ ...champ, width: 44, textAlign: "center" }} />
            </label>
          )}
          {permanente ? (
            <span style={{ fontSize: 9, color: "#888" }}>Capacité permanente</span>
          ) : (
            <label style={{ fontSize: 9, color: accent }}>Déclencheur sur la machine{" "}
              <select value={value.grantMode ?? ""}
                onChange={(e) => onChange({ grantMode: (e.target.value || undefined) as KeywordMode | undefined })}
                style={{ ...champ, background: "#fff" }}>
                {modes.map((m) => <option key={m.mode ?? "entry"} value={m.mode ?? ""}>{m.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
