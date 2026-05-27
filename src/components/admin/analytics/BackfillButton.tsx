"use client";

import { useState } from "react";

interface Props {
  onDone?: () => void;
}

export default function BackfillButton({ onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/analytics/backfill", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMsg(`Traité ${j.processed} parties (échec : ${j.failed}, total scanné : ${j.scanned})`);
      onDone?.();
    } catch (e) {
      setMsg(`Erreur : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        onClick={run}
        disabled={busy}
        style={{
          background: busy ? "#3d3d5c" : "#c8a84e",
          color: busy ? "#888" : "#1a1a2e",
          border: "none",
          padding: "8px 16px",
          borderRadius: 4,
          fontWeight: 600,
          cursor: busy ? "not-allowed" : "pointer",
          fontSize: 13,
        }}
      >
        {busy ? "Recalcul en cours…" : "Recalculer les parties manquantes"}
      </button>
      {msg && <span style={{ color: "#ccc", fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
