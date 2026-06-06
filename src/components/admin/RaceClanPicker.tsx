"use client";

import { FACTIONS, getFactionForRace, getClanNamesForRace } from "@/lib/card-engine/constants";

const ALL_RACES = Array.from(new Set(Object.values(FACTIONS).flatMap((f) => f.races))).sort();

/** Sélecteur Race + Clan (clan optionnel, filtré par la faction de la race).
 *  Utilisé par « Renforcement multiple » dans les deux forges. Le clan prime
 *  sur la race côté moteur ; ici on choisit une race, puis éventuellement un
 *  clan de cette race. */
export default function RaceClanPicker({
  race,
  clan,
  onChange,
}: {
  race: string;
  clan: string;
  onChange: (race: string, clan: string) => void;
}) {
  const faction = getFactionForRace(race);
  const clans = race ? getClanNamesForRace(faction, race) : [];
  const sel: React.CSSProperties = {
    padding: "4px 8px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, background: "#fff",
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <select value={race} onChange={(e) => onChange(e.target.value, "")} style={sel}>
        <option value="">— Race ciblée —</option>
        {ALL_RACES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <select
        value={clan}
        onChange={(e) => onChange(race, e.target.value)}
        disabled={!race || clans.length === 0}
        style={sel}
        title="Clan optionnel — prioritaire sur la race s'il est défini"
      >
        <option value="">{!race ? "—" : clans.length === 0 ? "aucun clan" : "(clan optionnel)"}</option>
        {clans.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}
