"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { EntityStat } from "./EntityTable";

interface Props {
  stats: EntityStat[];
  title?: string;
  count?: number; // top + flop count (e.g. 10)
}

export default function EntityBarChart({ stats, title, count = 10 }: Props) {
  if (stats.length === 0) {
    return <div style={{ color: "#888", padding: 20, textAlign: "center" }}>Pas de données</div>;
  }
  const sorted = [...stats].sort((a, b) => b.winrate - a.winrate);
  const top = sorted.slice(0, count).map((s) => ({ ...s, winratePct: +(s.winrate * 100).toFixed(1) }));
  const flop = sorted.slice(-count).reverse().map((s) => ({ ...s, winratePct: +(s.winrate * 100).toFixed(1) }));

  const colorFor = (wr: number) => {
    if (wr >= 60) return "#2ecc71";
    if (wr >= 52) return "#a3d977";
    if (wr >= 48) return "#c8a84e";
    if (wr >= 40) return "#e67e22";
    return "#e74c3c";
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={{ background: "#1a1a2e", border: "1px solid #3d3d5c", borderRadius: 4, padding: 12 }}>
        <h3 style={{ color: "#2ecc71", marginTop: 0, marginBottom: 8 }}>{title ? `${title} — Top ` : "Top "}{count}</h3>
        <ResponsiveContainer width="100%" height={Math.max(220, top.length * 28)}>
          <BarChart data={top} layout="vertical" margin={{ left: 80, right: 10, top: 5, bottom: 5 }}>
            <XAxis type="number" domain={[0, 100]} stroke="#888" fontSize={11} />
            <YAxis dataKey="label" type="category" stroke="#ccc" fontSize={11} width={80} />
            <Tooltip
              contentStyle={{ background: "#0f0f1e", border: "1px solid #3d3d5c" }}
              formatter={(v) => [`${v}%`, "Winrate"]}
            />
            <Bar dataKey="winratePct">
              {top.map((d, i) => <Cell key={i} fill={colorFor(d.winratePct)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ background: "#1a1a2e", border: "1px solid #3d3d5c", borderRadius: 4, padding: 12 }}>
        <h3 style={{ color: "#e74c3c", marginTop: 0, marginBottom: 8 }}>{title ? `${title} — Flop ` : "Flop "}{count}</h3>
        <ResponsiveContainer width="100%" height={Math.max(220, flop.length * 28)}>
          <BarChart data={flop} layout="vertical" margin={{ left: 80, right: 10, top: 5, bottom: 5 }}>
            <XAxis type="number" domain={[0, 100]} stroke="#888" fontSize={11} />
            <YAxis dataKey="label" type="category" stroke="#ccc" fontSize={11} width={80} />
            <Tooltip
              contentStyle={{ background: "#0f0f1e", border: "1px solid #3d3d5c" }}
              formatter={(v) => [`${v}%`, "Winrate"]}
            />
            <Bar dataKey="winratePct">
              {flop.map((d, i) => <Cell key={i} fill={colorFor(d.winratePct)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
