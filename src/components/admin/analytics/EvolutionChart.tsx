"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Point {
  week: string;
  wins: number;
  losses: number;
  games: number;
  winrate: number;
}

interface Props {
  entity: "card" | "hero" | "faction" | "race" | "clan" | "ability";
  entityKey: string;
  entityLabel: string;
  period: string;
  onClose?: () => void;
}

export default function EvolutionChart({ entity, entityKey, entityLabel, period, onClose }: Props) {
  const [series, setSeries] = useState<Point[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSeries(null);
    setError(null);
    fetch(`/api/admin/analytics/evolution?entity=${entity}&key=${encodeURIComponent(entityKey)}&period=${period}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setSeries(d.series ?? []))
      .catch((e) => setError(e.message));
  }, [entity, entityKey, period]);

  const data = (series ?? []).map((p) => ({ ...p, winratePct: +(p.winrate * 100).toFixed(1) }));

  return (
    <div style={{
      background: "#1a1a2e", border: "1px solid #3d3d5c", borderRadius: 4, padding: 16, marginTop: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ color: "#c8a84e", margin: 0 }}>Évolution — {entityLabel}</h3>
        {onClose && (
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #3d3d5c", color: "#ccc",
            padding: "4px 10px", borderRadius: 4, cursor: "pointer",
          }}>Fermer</button>
        )}
      </div>
      {error && <div style={{ color: "#e74c3c" }}>Erreur : {error}</div>}
      {!series && !error && <div style={{ color: "#888" }}>Chargement…</div>}
      {series && series.length === 0 && (
        <div style={{ color: "#888" }}>Pas assez de données pour tracer une évolution.</div>
      )}
      {series && series.length > 0 && (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3d3d5c" />
            <XAxis dataKey="week" stroke="#888" fontSize={11} />
            <YAxis domain={[0, 100]} stroke="#888" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "#0f0f1e", border: "1px solid #3d3d5c" }}
              formatter={(v, name) => name === "winratePct" ? [`${v}%`, "Winrate"] : [v as number, name as string]}
            />
            <Line type="monotone" dataKey="winratePct" stroke="#c8a84e" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
