"use client";

import { RETARD_MAX, RETARD_MIN } from "@/lib/game/retard";
import { keywordModeColor } from "@/lib/game/keyword-labels";

const AMBRE = keywordModeColor("delay") ?? "#D4A373";

/** Choix du X de RETARD (1 à 3). `allowNone` ajoute « — » (aucun Retard), pour
 *  les effets de sort où le Retard est facultatif. */
export default function RetardSelect({ value, onChange, allowNone = false, title }: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  allowNone?: boolean;
  title?: string;
}) {
  const options: number[] = [];
  for (let n = RETARD_MIN; n <= RETARD_MAX; n++) options.push(n);
  return (
    <select
      value={value ?? 0}
      title={title}
      onChange={(e) => onChange(Number(e.target.value) || undefined)}
      style={{
        height: 18, fontSize: 9, borderRadius: 3, padding: "0 2px",
        border: `1px solid ${AMBRE}`, background: value ? `${AMBRE}22` : "#fff",
        color: value ? "#8a5a2b" : "#999", fontFamily: "'Cinzel',serif", cursor: "pointer",
      }}
    >
      {allowNone && <option value={0}>⏳ —</option>}
      {options.map((n) => <option key={n} value={n}>⏳ {n}</option>)}
    </select>
  );
}
