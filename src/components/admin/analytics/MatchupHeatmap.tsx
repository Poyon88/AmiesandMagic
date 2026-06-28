"use client";

import { getFactionDisplayName } from "@/lib/card-engine/constants";

interface Cell {
  faction_a: string;
  faction_b: string;
  wins_a: number;
  total: number;
  winrate_a: number;
}

interface Props {
  factions: string[];
  cells: Cell[];
  /** Transforme une clé en libellé affiché (par défaut : nom de faction). */
  labelFor?: (key: string) => string;
  /** Phrase d'explication au-dessus de la grille. */
  legend?: string;
}

export default function MatchupHeatmap({
  factions,
  cells,
  labelFor = getFactionDisplayName,
  legend = "Lecture : la ligne = faction du gagnant potentiel, la colonne = faction adverse. Cellule colorée = winrate de la ligne contre la colonne.",
}: Props) {
  if (factions.length === 0) {
    return <div style={{ color: "#888", padding: 20, textAlign: "center" }}>Aucun matchup enregistré.</div>;
  }
  const map = new Map<string, Cell>();
  for (const c of cells) map.set(`${c.faction_a}__${c.faction_b}`, c);

  const colorFor = (wr: number, total: number) => {
    if (total === 0) return "#1a1a2e";
    // Interpolate red (0) -> gold (0.5) -> green (1)
    const r = wr < 0.5 ? 231 : Math.round(231 - (wr - 0.5) * 2 * (231 - 46));
    const g = wr < 0.5 ? Math.round(76 + wr * 2 * (204 - 76)) : Math.round(204 - (wr - 0.5) * 2 * (204 - 204));
    const b = wr < 0.5 ? Math.round(60 + wr * 2 * (113 - 60)) : Math.round(113 - (wr - 0.5) * 2 * (113 - 113));
    return `rgb(${r}, ${g}, ${b})`;
  };

  const cellSize = 90;

  return (
    <div style={{ overflow: "auto", border: "1px solid #3d3d5c", borderRadius: 4, padding: 12, background: "#1a1a2e" }}>
      <div style={{ marginBottom: 8, color: "#ccc", fontSize: 13 }}>
        {legend}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: `120px repeat(${factions.length}, ${cellSize}px)`,
        gap: 2,
      }}>
        <div />
        {factions.map((f) => (
          <div key={`col-${f}`} style={{
            color: "#c8a84e", fontSize: 11, textAlign: "center", padding: "4px 2px",
            transform: "rotate(-30deg)", transformOrigin: "center", whiteSpace: "nowrap",
          }}>{labelFor(f)}</div>
        ))}
        {factions.flatMap((row) => [
          <div key={`row-${row}`} style={{
            color: "#c8a84e", fontSize: 12, padding: "4px 8px", textAlign: "right", alignSelf: "center",
          }}>{labelFor(row)}</div>,
          ...factions.map((col) => {
            const c = map.get(`${row}__${col}`);
            const wr = c?.winrate_a ?? 0;
            const total = c?.total ?? 0;
            return (
              <div
                key={`${row}-${col}`}
                title={total > 0 ? `${labelFor(row)} vs ${labelFor(col)} : ${c!.wins_a}/${total} (${(wr * 100).toFixed(1)}%)` : "Aucun matchup"}
                style={{
                  background: colorFor(wr, total),
                  height: cellSize,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#0f0f1e", fontWeight: 600, fontSize: 12, borderRadius: 4,
                }}
              >
                {total > 0 ? `${(wr * 100).toFixed(0)}%` : "—"}
                {total > 0 && <div style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>({total})</div>}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}
