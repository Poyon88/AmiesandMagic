"use client";

import { FACTIONS, getFactionForRace, getClanNamesForRace, getAllClanNames, getFactionDisplayName } from "@/lib/card-engine/constants";

const ALL_RACES = Array.from(new Set(Object.values(FACTIONS).flatMap((f) => f.races))).sort();

/** Tous les clans du jeu, groupés par faction — pour le cas « clan seul ». */
const CLANS_BY_FACTION: { faction: string; clans: string[] }[] = Object.keys(FACTIONS)
  .map((f) => ({ faction: f, clans: getAllClanNames(f).sort() }))
  .filter((g) => g.clans.length > 0);

/** Sélecteur Race + Clan, chacun optionnel et choisissable SEUL.
 *  Utilisé par « Renforcement multiple », le filtre de pool et l'appartenance
 *  d'une cible dans les deux forges. Le clan prime sur la race côté moteur.
 *
 *  - race choisie ⇒ la liste des clans se restreint à ceux de cette race ;
 *  - race vide   ⇒ TOUS les clans du jeu, groupés par faction. Auparavant le
 *    sélecteur de clan restait verrouillé tant qu'aucune race n'était choisie,
 *    alors que le moteur accepte un clan sans race sur tous ces chemins. */
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
  const clansForRace = race ? getClanNamesForRace(faction, race) : [];
  const sel: React.CSSProperties = {
    padding: "4px 8px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, background: "#fff",
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <select
        value={race}
        onChange={(e) => {
          const r = e.target.value;
          // Le clan ne survit au changement de race que s'il reste compatible.
          const keep = r ? getClanNamesForRace(getFactionForRace(r), r).includes(clan) : true;
          onChange(r, keep ? clan : "");
        }}
        style={sel}
      >
        <option value="">— Race ciblée —</option>
        {ALL_RACES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <select
        value={clan}
        onChange={(e) => onChange(race, e.target.value)}
        disabled={!!race && clansForRace.length === 0}
        style={sel}
        title="Clan optionnel — prioritaire sur la race s'il est défini"
      >
        <option value="">{race ? (clansForRace.length === 0 ? "aucun clan" : "(clan optionnel)") : "— Clan ciblé —"}</option>
        {race
          ? clansForRace.map((c) => <option key={c} value={c}>{c}</option>)
          : CLANS_BY_FACTION.map((g) => (
              <optgroup key={g.faction} label={getFactionDisplayName(g.faction)}>
                {g.clans.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            ))}
      </select>
    </div>
  );
}
