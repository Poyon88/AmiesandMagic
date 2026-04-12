"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface MusicTrack {
  id: number;
  name: string;
  category: string;
  file_url: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "menu", label: "Menu" },
  { value: "board", label: "Plateau" },
  { value: "tense", label: "Tension" },
  { value: "victory", label: "Victoire" },
  { value: "defeat", label: "Défaite" },
];

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5 } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
  button: { padding: "6px 20px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function MusicManager() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("menu");
  const [newAudio, setNewAudio] = useState<{ base64: string; mimeType: string } | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement>(null);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/music");
      const data = await res.json();
      setTracks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement musiques:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTracks(); }, [loadTracks]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError("Fichier trop volumineux (max 10 Mo)");
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
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          category: newCategory,
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

  const handleDelete = async (track: MusicTrack) => {
    if (!confirm(`Supprimer la piste "${track.name}" ?`)) return;
    try {
      await fetch("/api/music", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id }),
      });
      await loadTracks();
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

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
          transition: "all 0.2s",
        }}>← Menu</a>
        <h1 style={{ fontSize: 18, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1, margin: 0 }}>
          Gestion des Musiques
        </h1>
      </div>

      {/* Add new track */}
      <div style={{ ...STYLE.card, marginBottom: 24 }}>
        <h2 style={STYLE.title}>Ajouter une piste</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={STYLE.label}>Nom</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Forêt mystique"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            />
          </div>
          <div style={{ minWidth: 120 }}>
            <label style={STYLE.label}>Catégorie</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={STYLE.label}>Fichier audio (max 10 Mo)</label>
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
            {saving ? "Envoi..." : "Ajouter"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 11 }}>
            {error}
          </div>
        )}
      </div>

      {/* Track list */}
      {tracks.map((track) => {
        const cat = CATEGORIES.find((c) => c.value === track.category);
        return (
          <div key={track.id} style={STYLE.card}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <h3 style={{ ...STYLE.title, margin: 0 }}>{track.name}</h3>
                  <span style={{
                    ...STYLE.badge,
                    background: "#e8f0fe",
                    color: "#1a73e8",
                    border: "1px solid #a8c7fa",
                  }}>
                    {cat?.label || track.category}
                  </span>
                </div>
                <p style={{ fontSize: 9, color: "#aaa", marginBottom: 8 }}>
                  Ajouté le {new Date(track.created_at).toLocaleDateString("fr-FR")}
                </p>
                <audio
                  ref={previewRef}
                  src={track.file_url}
                  controls
                  style={{ width: "100%", height: 32 }}
                  preload="none"
                />
              </div>
              <button
                onClick={() => handleDelete(track)}
                style={{ ...STYLE.button, background: "#e74c3c", flexShrink: 0 }}
              >
                Supprimer
              </button>
            </div>
          </div>
        );
      })}

      {tracks.length === 0 && (
        <div style={STYLE.card}>
          <p style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>
            Aucune piste. Ajoutez-en une ci-dessus.
          </p>
        </div>
      )}
    </div>
  );
}
