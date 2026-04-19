"use client";

import { useState, useEffect, useCallback } from "react";

interface SfxTrack {
  id: number;
  event_type: string;
  name: string;
  file_url: string;
  created_at: string;
}

const EVENT_TYPES = [
  { value: "play_card", label: "Jouer une carte" },
  { value: "attack", label: "Attaquer" },
  { value: "damage", label: "Dégâts" },
  { value: "creature_death", label: "Mort de créature" },
  { value: "end_turn", label: "Fin de tour" },
  { value: "draw_card", label: "Pioche" },
  { value: "spell_cast", label: "Sort lancé" },
  { value: "hero_power", label: "Pouvoir héros" },
  { value: "divine_shield", label: "Bouclier divin" },
  { value: "poison", label: "Poison" },
  { value: "heal", label: "Guérison" },
  { value: "dodge", label: "Esquive" },
  { value: "paralyze", label: "Paralysie" },
  { value: "resurrect", label: "Résurrection" },
  { value: "counter_spell", label: "Contresort" },
  { value: "fire_breath", label: "Souffle de feu" },
  { value: "buff", label: "Buff" },
  { value: "debuff", label: "Debuff" },
  { value: "summon", label: "Invocation" },
  { value: "timer_warning", label: "Timer — alerte 15s" },
  { value: "mulligan_flip", label: "Mulligan — retournement de carte" },
  { value: "mulligan_pick", label: "Mulligan — sélection de carte" },
];

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5 } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
  button: { padding: "6px 20px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
};

export default function SfxManager() {
  const [tracks, setTracks] = useState<SfxTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEventType, setNewEventType] = useState("play_card");
  const [newName, setNewName] = useState("");
  const [newAudio, setNewAudio] = useState<{ base64: string; mimeType: string } | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sfx");
      const data = await res.json();
      setTracks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement SFX:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Fichier trop volumineux (max 5 Mo)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setNewAudio({ base64, mimeType: file.type });
      setNewFileName(file.name);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newAudio) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/sfx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: newEventType,
          name: newName.trim(),
          audioBase64: newAudio.base64,
          audioMimeType: newAudio.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        setSaving(false);
        return;
      }
      setNewName("");
      setNewAudio(null);
      setNewFileName(null);
      await loadTracks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    }
    setSaving(false);
  };

  const handleDelete = async (track: SfxTrack) => {
    if (!confirm(`Supprimer le bruitage "${track.name}" ?`)) return;
    try {
      await fetch("/api/sfx", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id }),
      });
      await loadTracks();
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

  // Group tracks by event type for display
  const tracksByType = new Map<string, SfxTrack>();
  for (const t of tracks) {
    tracksByType.set(t.event_type, t);
  }

  // Available event types (those not yet assigned)
  const usedTypes = new Set(tracks.map((t) => t.event_type));

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888", fontFamily: "'Cinzel',serif" }}>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "30px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <a href="/" style={{
          padding: "5px 12px", borderRadius: 6, cursor: "pointer",
          background: "transparent", border: "1px solid #ddd", color: "#888",
          fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
        }}>← Menu</a>
        <h1 style={{ fontSize: 18, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1, margin: 0 }}>
          Gestion des Bruitages
        </h1>
      </div>

      {/* Add / replace SFX */}
      <div style={{ ...STYLE.card, marginBottom: 24 }}>
        <h2 style={STYLE.title}>Ajouter / remplacer un bruitage</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 160 }}>
            <label style={STYLE.label}>Événement</label>
            <select
              value={newEventType}
              onChange={(e) => setNewEventType(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            >
              {EVENT_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {et.label}{usedTypes.has(et.value) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={STYLE.label}>Nom</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Épée clash"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={STYLE.label}>Fichier audio (max 5 Mo)</label>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              style={{ width: "100%", fontSize: 10, marginTop: 4 }}
            />
            {newFileName && (
              <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>{newFileName}</div>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !newName.trim() || !newAudio}
            style={{ ...STYLE.button, marginTop: 18, opacity: saving || !newName.trim() || !newAudio ? 0.5 : 1 }}
          >
            {saving ? "Envoi..." : usedTypes.has(newEventType) ? "Remplacer" : "Ajouter"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 11 }}>
            {error}
          </div>
        )}
      </div>

      {/* SFX list by event type */}
      {EVENT_TYPES.map((et) => {
        const track = tracksByType.get(et.value);
        return (
          <div key={et.value} style={{ ...STYLE.card, opacity: track ? 1 : 0.5 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h3 style={{ ...STYLE.title, margin: 0 }}>{et.label}</h3>
                  {track ? (
                    <span style={{ ...STYLE.badge, background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7" }}>
                      {track.name}
                    </span>
                  ) : (
                    <span style={{ ...STYLE.badge, background: "#f5f5f5", color: "#aaa", border: "1px solid #e0e0e0" }}>
                      Aucun
                    </span>
                  )}
                </div>
                {track && (
                  <audio
                    src={track.file_url}
                    controls
                    style={{ width: "100%", height: 28, marginTop: 6 }}
                    preload="none"
                  />
                )}
              </div>
              {track && (
                <button
                  onClick={() => handleDelete(track)}
                  style={{ ...STYLE.button, background: "#e74c3c", flexShrink: 0 }}
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
