"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ABILITIES, creatureEngineId } from "@/lib/game/abilities";

/** Bruitage par CAPACITÉ.
 *
 *  Complète les deux registres existants : les sons GLOBAUX par évènement
 *  (SfxManager) et les sons PAR CARTE (forge, à la pose et à la mort). Ici, une
 *  capacité sonne de la même façon sur toutes les cartes qui la portent —
 *  l'oreille apprend à reconnaître la mécanique.
 *
 *  La liste des capacités est DÉRIVÉE du registre `ABILITIES`, jamais recopiée :
 *  une capacité ajoutée demain apparaît d'elle-même. */

const MAX_SIZE_MB = 5;

interface Row {
  id: string;
  label: string;
  symbol: string;
  side: "creature" | "spell";
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const a of Object.values(ABILITIES)) {
    if (a.applicable_to.includes("creature")) {
      rows.push({ id: creatureEngineId(a), label: a.creature?.label ?? a.label, symbol: a.symbol, side: "creature" });
    }
    // Une capacité polymorphe a DEUX ids moteur (créature / sort) et donc deux
    // sons possibles : c'est voulu, un Impact lancé par un sort n'a pas la même
    // scène qu'un Impact de créature. On n'ajoute la ligne « sort » que si son
    // id diffère, sinon on doublonnerait la même clé.
    if (a.applicable_to.includes("spell") && a.id !== creatureEngineId(a)) {
      rows.push({ id: a.id, label: `${a.label} (sort)`, symbol: a.symbol, side: "spell" });
    }
  }
  return rows.sort((x, y) => x.label.localeCompare(y.label, "fr"));
}

const S = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 4, letterSpacing: 1 } as React.CSSProperties,
  hint: { fontSize: 10, color: "#888", marginBottom: 12, lineHeight: 1.5 } as React.CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #f4f4f4" } as React.CSSProperties,
  label: { fontSize: 11, fontFamily: "'Cinzel',serif" } as React.CSSProperties,
  btn: { fontSize: 9, padding: "3px 10px", borderRadius: 4, border: "1px solid #e0e0e0", background: "#fff", cursor: "pointer", fontFamily: "'Cinzel',serif" } as React.CSSProperties,
};

export default function AbilitySfxManager() {
  const rows = useMemo(() => buildRows(), []);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [onlyWithSound, setOnlyWithSound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keyword-sfx", { cache: "no-store" });
      const data = await res.json();
      if (data && typeof data === "object" && !Array.isArray(data)) setUrls(data);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (keyword: string, file: File) => {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`Fichier trop volumineux (max ${MAX_SIZE_MB} Mo)`);
      return;
    }
    setBusy(keyword);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/keyword-sfx", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, audioBase64: base64, mimeType: file.type || "audio/mpeg" }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || `Erreur ${res.status}`);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }
    setBusy(null);
  };

  const remove = async (keyword: string) => {
    if (!confirm("Retirer le bruitage de cette capacité ?")) return;
    setBusy(keyword);
    try {
      await fetch("/api/keyword-sfx", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      await load();
    } catch { /* ignore */ }
    setBusy(null);
  };

  const preview = (url: string) => {
    audioRef.current?.pause();
    const el = new Audio(url);
    el.volume = 0.6;
    el.play().catch(() => {});
    audioRef.current = el;
  };

  const visible = rows.filter(r => {
    if (onlyWithSound && !urls[r.id]) return false;
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return r.label.toLowerCase().includes(q) || r.id.includes(q);
  });
  const withSound = rows.filter(r => urls[r.id]).length;

  return (
    <div style={S.card}>
      <h3 style={S.title}>Bruitages par capacité</h3>
      <p style={S.hint}>
        Vaut pour <strong>toutes les cartes</strong> qui portent la capacité. Le son s&apos;enchaîne
        après celui de la carte (pose, mort) — il ne se superpose jamais.
        <br />
        {withSound} / {rows.length} capacités sonorisées.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Rechercher une capacité…"
          style={{ flex: 1, minWidth: 180, padding: "5px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 11, fontFamily: "'Cinzel',serif" }} />
        <label style={{ fontSize: 10, color: "#666", display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyWithSound} onChange={e => setOnlyWithSound(e.target.checked)} />
          Sonorisées seulement
        </label>
      </div>

      {error && <div style={{ fontSize: 10, color: "#e74c3c", marginBottom: 8 }}>{error}</div>}

      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {visible.map(r => {
          const url = urls[r.id];
          return (
            <div key={`${r.side}:${r.id}`} style={S.row}>
              <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>
                {r.symbol.startsWith("/") ? "🔧" : r.symbol}
              </span>
              <span style={{ ...S.label, flex: 1 }}>{r.label}</span>
              {url ? (
                <>
                  <button onClick={() => preview(url)} style={S.btn}>▶ Écouter</button>
                  <button onClick={() => remove(r.id)} disabled={busy === r.id}
                    style={{ ...S.btn, borderColor: "#f5a3a3", background: "#fde8e8", color: "#e74c3c" }}>
                    Retirer
                  </button>
                </>
              ) : (
                <span style={{ fontSize: 9, color: "#bbb", fontStyle: "italic" }}>aucun son</span>
              )}
              <label style={{ ...S.btn, opacity: busy === r.id ? 0.5 : 1 }}>
                {busy === r.id ? "…" : url ? "Remplacer" : "Importer"}
                <input type="file" accept="audio/*" style={{ display: "none" }} disabled={busy === r.id}
                  onChange={async e => {
                    // `currentTarget` est nul après le premier await : on capture
                    // l'input avant.
                    const input = e.currentTarget;
                    const f = input.files?.[0];
                    input.value = "";
                    if (f) await upload(r.id, f);
                  }} />
              </label>
            </div>
          );
        })}
        {visible.length === 0 && <p style={{ fontSize: 10, color: "#aaa", padding: "10px 0" }}>Aucune capacité ne correspond.</p>}
      </div>
    </div>
  );
}
