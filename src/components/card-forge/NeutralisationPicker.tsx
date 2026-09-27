"use client";

import { useTranslations } from "next-intl";
import { capacitesNeutralisables } from "@/lib/game/neutralisation";

/** Choix de la capacité que NEUTRALISATION rend muette chez l'ennemi.
 *  Obligatoire : sans elle la capacité ne fait rien (bordure rouge).
 *  Partagé par la forge et l'éditeur de cartes. */
export default function NeutralisationPicker({ value, onChange }: {
  value: string;
  onChange: (id: string) => void;
}) {
  const tf = useTranslations("forge");
  return (
    <div style={{ marginTop: 6, padding: 6, borderRadius: 6, border: `1px solid ${value ? "#8a6d3b44" : "#e74c3c"}`, background: "#fffdf6" }}>
      <div style={{ fontSize: 8, color: "#8a6d3b", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
        🚷 {tf("label_neutralised_ability")} {!value && <span style={{ color: "#e74c3c" }}>· {tf("required")}</span>}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "4px 8px", borderRadius: 5, border: "1px solid #8a6d3b44", fontSize: 10, fontFamily: "'Cinzel',serif", background: "#fff" }}>
        <option value="">{tf("choose_ability")}</option>
        {capacitesNeutralisables().map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
      <div style={{ fontSize: 9, color: "#8a6d3b", marginTop: 4, fontStyle: "italic" }}>{tf("neutralisation_hint")}</div>
    </div>
  );
}
