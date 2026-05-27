"use client";

import { useCallback, useEffect, useState } from "react";
import EntityTable, { EntityStat } from "./EntityTable";
import EntityBarChart from "./EntityBarChart";
import EvolutionChart from "./EvolutionChart";
import MatchupHeatmap from "./MatchupHeatmap";
import BackfillButton from "./BackfillButton";

type EntityKind = "factions" | "races" | "clans" | "cards" | "heroes" | "abilities" | "matchups";

const TABS: Array<{ id: EntityKind; label: string; icon: string }> = [
  { id: "factions", label: "Factions", icon: "🏛️" },
  { id: "races", label: "Races", icon: "🧬" },
  { id: "clans", label: "Clans", icon: "🛡️" },
  { id: "cards", label: "Cartes", icon: "🃏" },
  { id: "heroes", label: "Héros", icon: "🤴" },
  { id: "abilities", label: "Capacités", icon: "✨" },
  { id: "matchups", label: "Matchups", icon: "⚔️" },
];

const PERIODS = [
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "all", label: "Tout" },
] as const;

type Period = typeof PERIODS[number]["id"];

const ENTITY_MAP: Record<Exclude<EntityKind, "matchups">, "card" | "hero" | "faction" | "race" | "clan" | "ability"> = {
  factions: "faction",
  races: "race",
  clans: "clan",
  cards: "card",
  heroes: "hero",
  abilities: "ability",
};

export default function AnalyticsTabs() {
  const [tab, setTab] = useState<EntityKind>("factions");
  const [period, setPeriod] = useState<Period>("all");
  const [minGames, setMinGames] = useState(10);
  const [showLowSample, setShowLowSample] = useState(false);
  const [stats, setStats] = useState<EntityStat[] | null>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EntityStat | null>(null);
  const [matchups, setMatchups] = useState<{ factions: string[]; cells: Parameters<typeof MatchupHeatmap>[0]["cells"] } | null>(null);

  const fetchData = useCallback(async () => {
    setStats(null);
    setMatchups(null);
    setError(null);
    setSelected(null);
    const effMin = showLowSample ? 1 : minGames;
    try {
      if (tab === "matchups") {
        const r = await fetch(`/api/admin/analytics/matchups?period=${period}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setMatchups(j);
        setTotalMatches(j.total_matches ?? 0);
      } else {
        const r = await fetch(`/api/admin/analytics/${tab}?period=${period}&minGames=${effMin}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setStats(j.stats ?? []);
        setTotalMatches(j.total_matches ?? 0);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab, period, minGames, showLowSample]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, color: "#fff" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, color: "#c8a84e", fontFamily: "var(--font-cinzel), serif" }}>Équilibrage du jeu</h1>
          <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
            {totalMatches} partie{totalMatches > 1 ? "s" : ""} analysée{totalMatches > 1 ? "s" : ""}
            {!showLowSample && ` · seuil ≥ ${minGames} parties`}
          </div>
        </div>
        <BackfillButton onDone={fetchData} />
      </header>

      <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? "#c8a84e" : "#1a1a2e",
              color: tab === t.id ? "#1a1a2e" : "#ccc",
              border: "1px solid #3d3d5c",
              padding: "8px 14px",
              borderRadius: 4,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              style={{
                background: period === p.id ? "#3d3d5c" : "transparent",
                color: period === p.id ? "#fff" : "#888",
                border: "1px solid #3d3d5c",
                padding: "4px 12px",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer",
              }}
            >{p.label}</button>
          ))}
        </div>
        {tab !== "matchups" && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#ccc" }}>
              Seuil min :
              <input
                type="number"
                min={1}
                max={1000}
                value={minGames}
                onChange={(e) => setMinGames(Math.max(1, Number(e.target.value) || 1))}
                style={{
                  width: 60, padding: "2px 6px", background: "#2a2a3e",
                  border: "1px solid #3d3d5c", borderRadius: 4, color: "#fff", fontSize: 13,
                }}
                disabled={showLowSample}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#ccc", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showLowSample}
                onChange={(e) => setShowLowSample(e.target.checked)}
              />
              Afficher faible échantillon
            </label>
          </>
        )}
      </div>

      {error && (
        <div style={{ background: "#3a1a1a", color: "#e74c3c", padding: 12, borderRadius: 4, border: "1px solid #e74c3c" }}>
          {error}
        </div>
      )}

      {tab === "matchups" ? (
        matchups ? (
          <MatchupHeatmap factions={matchups.factions} cells={matchups.cells} />
        ) : <div style={{ color: "#888" }}>Chargement…</div>
      ) : (
        <>
          {stats === null && !error && <div style={{ color: "#888" }}>Chargement…</div>}
          {stats && (
            <>
              <EntityBarChart stats={stats} title={TABS.find((t) => t.id === tab)?.label} />
              <EntityTable
                stats={stats}
                onRowClick={setSelected}
                selectedKey={selected?.key}
                showImage={tab === "cards" || tab === "heroes"}
              />
              {selected && (
                <EvolutionChart
                  entity={ENTITY_MAP[tab as Exclude<EntityKind, "matchups">]}
                  entityKey={selected.key}
                  entityLabel={selected.label}
                  period={period}
                  onClose={() => setSelected(null)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
