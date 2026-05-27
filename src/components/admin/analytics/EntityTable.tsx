"use client";

import { useMemo, useState } from "react";

export interface EntityStat {
  key: string;
  label: string;
  wins: number;
  losses: number;
  winrate: number;
  games_count: number;
  copies_total: number;
  image_url?: string | null;
}

type SortKey = "winrate" | "games_count" | "copies_total" | "label";

interface Props {
  stats: EntityStat[];
  onRowClick?: (stat: EntityStat) => void;
  selectedKey?: string | null;
  showImage?: boolean;
}

export default function EntityTable({ stats, onRowClick, selectedKey, showImage }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("winrate");
  const [asc, setAsc] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const arr = stats.filter((s) =>
      s.label.toLowerCase().includes(search.toLowerCase())
    );
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [stats, sortKey, asc, search]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setAsc(!asc);
    else { setSortKey(k); setAsc(false); }
  };

  const colorFor = (wr: number) => {
    if (wr >= 0.6) return "#2ecc71";
    if (wr >= 0.52) return "#a3d977";
    if (wr >= 0.48) return "#c8a84e";
    if (wr >= 0.4) return "#e67e22";
    return "#e74c3c";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        placeholder="Rechercher..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: "8px 12px",
          background: "#2a2a3e",
          border: "1px solid #3d3d5c",
          borderRadius: 4,
          color: "#fff",
          fontSize: 14,
        }}
      />
      <div style={{ overflow: "auto", border: "1px solid #3d3d5c", borderRadius: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#1a1a2e", color: "#c8a84e", textAlign: "left" }}>
              {showImage && <th style={th}>&nbsp;</th>}
              <th style={{ ...th, cursor: "pointer" }} onClick={() => handleSort("label")}>
                Nom {sortKey === "label" ? (asc ? "↑" : "↓") : ""}
              </th>
              <th style={{ ...th, cursor: "pointer" }} onClick={() => handleSort("winrate")}>
                Winrate {sortKey === "winrate" ? (asc ? "↑" : "↓") : ""}
              </th>
              <th style={{ ...th, cursor: "pointer" }} onClick={() => handleSort("games_count")}>
                Parties {sortKey === "games_count" ? (asc ? "↑" : "↓") : ""}
              </th>
              <th style={{ ...th, cursor: "pointer" }} onClick={() => handleSort("copies_total")}>
                Copies vues {sortKey === "copies_total" ? (asc ? "↑" : "↓") : ""}
              </th>
              <th style={th}>V / D</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={showImage ? 6 : 5} style={{ ...td, color: "#888", textAlign: "center" }}>
                Aucune donnée — pas encore assez de parties pour le seuil de fiabilité.
              </td></tr>
            )}
            {filtered.map((s) => (
              <tr
                key={s.key}
                onClick={() => onRowClick?.(s)}
                style={{
                  cursor: onRowClick ? "pointer" : "default",
                  background: selectedKey === s.key ? "#3d3d5c" : "transparent",
                  borderTop: "1px solid #2a2a3e",
                }}
              >
                {showImage && (
                  <td style={td}>
                    {s.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image_url} alt={s.label} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, background: "#2a2a3e", borderRadius: 4 }} />
                    )}
                  </td>
                )}
                <td style={{ ...td, color: "#fff" }}>{s.label}</td>
                <td style={{ ...td, color: colorFor(s.winrate), fontWeight: 600 }}>
                  {(s.winrate * 100).toFixed(1)}%
                </td>
                <td style={td}>{s.games_count}</td>
                <td style={td}>{s.copies_total}</td>
                <td style={{ ...td, color: "#888", fontSize: 12 }}>
                  {s.wins} / {s.losses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, borderBottom: "1px solid #3d3d5c" };
const td: React.CSSProperties = { padding: "8px 12px", color: "#ccc" };
