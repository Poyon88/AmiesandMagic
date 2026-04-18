"use client";

import { useState, useEffect, useCallback } from "react";

interface MusicTrack {
  id: number;
  name: string;
  category: string;
  file_url: string;
}

interface GameBoard {
  id: number;
  name: string;
  image_url: string;
  is_active: boolean;
  music_track_id: number | null;
  tense_track_id: number | null;
  victory_track_id: number | null;
  defeat_track_id: number | null;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  created_at: string;
  game_board_music_tracks?: { track_id: number }[] | null;
}

const RARITIES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const DEFAULT_MAX_PRINTS: Record<string, number> = {
  "Légendaire": 1,
  "Épique": 10,
  "Rare": 100,
  "Peu Commune": 1000,
};

const STYLE = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", marginBottom: 12, letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, color: "#888", fontFamily: "'Cinzel',serif", letterSpacing: 0.5 } as React.CSSProperties,
  badge: { fontSize: 9, padding: "2px 8px", borderRadius: 4, fontFamily: "'Cinzel',serif", fontWeight: 700 } as React.CSSProperties,
  button: { padding: "6px 20px", borderRadius: 6, border: "none", background: "#333", color: "#fff", fontSize: 10, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
};

export default function BoardManager() {
  const [boards, setBoards] = useState<GameBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newImage, setNewImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [newMusicTrackId, setNewMusicTrackId] = useState<number | null>(null);
  const [newRarity, setNewRarity] = useState<string>("Commune");
  const [newMaxPrints, setNewMaxPrints] = useState<number | null>(null);
  const [newIsDefault, setNewIsDefault] = useState(false);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  const loadBoards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/boards");
      const data = await res.json();
      setBoards(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement plateaux:", err);
    }
    setLoading(false);
  }, []);

  const loadMusicTracks = useCallback(async () => {
    try {
      const res = await fetch("/api/music");
      const data = await res.json();
      setMusicTracks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur chargement musiques:", err);
    }
  }, []);

  useEffect(() => { loadBoards(); loadMusicTracks(); }, [loadBoards, loadMusicTracks]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new window.Image();
    img.onload = () => {
      const MAX_WIDTH = 1920;
      const MAX_HEIGHT = 1080;
      let { width, height } = img;

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/webp", 0.85);
      const base64 = dataUrl.split(",")[1];
      setNewImage({ base64, mimeType: "image/webp" });
      setNewImagePreview(dataUrl);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newImage) return;
    setSaving(true);
    setError(null);
    try {
      const effectiveMaxPrints = newRarity === "Commune"
        ? null
        : (newMaxPrints ?? DEFAULT_MAX_PRINTS[newRarity] ?? null);
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          imageBase64: newImage.base64,
          imageMimeType: newImage.mimeType,
          music_track_id: newMusicTrackId,
          rarity: newRarity,
          max_prints: effectiveMaxPrints,
          is_default: newIsDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Erreur ${res.status}`);
        setSaving(false);
        return;
      }
      setNewName("");
      setNewImage(null);
      setNewImagePreview(null);
      setNewMusicTrackId(null);
      setNewRarity("Commune");
      setNewMaxPrints(null);
      setNewIsDefault(false);
      await loadBoards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      console.error("Erreur ajout:", err);
    }
    setSaving(false);
  };

  const handleUpdateField = async (board: GameBoard, updates: Record<string, unknown>) => {
    try {
      await fetch("/api/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: board.id, ...updates }),
      });
      await loadBoards();
    } catch (err) {
      console.error("Erreur update:", err);
    }
  };

  const handleGeneratePrints = async (board: GameBoard) => {
    if (!board.rarity || board.rarity === "Commune") return;
    if (!confirm(`Générer les exemplaires manquants pour "${board.name}" ?`)) return;
    setGeneratingId(board.id);
    setGenMessage(null);
    try {
      const res = await fetch("/api/board-prints/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenMessage(`Erreur: ${data.error ?? res.status}`);
      } else {
        setGenMessage(`${data.generated}/${data.total} exemplaire(s) créé(s) pour "${board.name}"`);
      }
    } catch (err) {
      setGenMessage(err instanceof Error ? err.message : "Erreur réseau");
    }
    setGeneratingId(null);
  };

  const handleToggleActive = async (board: GameBoard) => {
    try {
      await fetch("/api/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: board.id, is_active: !board.is_active }),
      });
      await loadBoards();
    } catch (err) {
      console.error("Erreur toggle:", err);
    }
  };

  const handleDelete = async (board: GameBoard) => {
    if (!confirm(`Supprimer le plateau "${board.name}" ?`)) return;
    try {
      await fetch("/api/boards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: board.id }),
      });
      await loadBoards();
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
          Gestion des Plateaux
        </h1>
      </div>

      {/* Add new board */}
      <div style={{ ...STYLE.card, marginBottom: 24 }}>
        <h2 style={STYLE.title}>Ajouter un plateau</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={STYLE.label}>Nom</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Forêt enchantée"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={STYLE.label}>Image (16:9 recommandé)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ width: "100%", fontSize: 10, marginTop: 4 }}
            />
          </div>
          <div style={{ minWidth: 140 }}>
            <label style={STYLE.label}>Musique</label>
            <select
              value={newMusicTrackId ?? ""}
              onChange={(e) => setNewMusicTrackId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            >
              <option value="">Aucune</option>
              {musicTracks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 120 }}>
            <label style={STYLE.label}>Rareté</label>
            <select
              value={newRarity}
              onChange={(e) => {
                const r = e.target.value;
                setNewRarity(r);
                setNewMaxPrints(r === "Commune" ? null : (DEFAULT_MAX_PRINTS[r] ?? null));
              }}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
            >
              {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {newRarity !== "Commune" && (
            <div style={{ minWidth: 90 }}>
              <label style={STYLE.label}>Exemplaires</label>
              <input
                type="number"
                min={1}
                value={newMaxPrints ?? ""}
                onChange={(e) => setNewMaxPrints(e.target.value ? Number(e.target.value) : null)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 5, border: "1px solid #e0e0e0", fontSize: 12, marginTop: 4 }}
              />
            </div>
          )}
          {newRarity === "Commune" && (
            <div style={{ minWidth: 90, display: "flex", alignItems: "center", paddingTop: 18 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#333", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newIsDefault}
                  onChange={(e) => setNewIsDefault(e.target.checked)}
                />
                Par défaut
              </label>
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={saving || !newName.trim() || !newImage}
            style={{ ...STYLE.button, marginTop: 18, opacity: saving || !newName.trim() || !newImage ? 0.5 : 1 }}
          >
            {saving ? "Envoi..." : "Ajouter"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 6, background: "#fde8e8", border: "1px solid #f5a3a3", color: "#e74c3c", fontSize: 11 }}>
            {error}
          </div>
        )}
        {newImagePreview && (
          <div style={{ marginTop: 12 }}>
            <img src={newImagePreview} alt="Aperçu" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 6, border: "1px solid #e0e0e0" }} />
          </div>
        )}
      </div>

      {genMessage && (
        <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 6, background: "#e8f4fd", border: "1px solid #b6daf5", color: "#1e5581", fontSize: 11 }}>
          {genMessage}
        </div>
      )}

      {/* Board list */}
      {boards.map((board) => (
        <div key={board.id} style={STYLE.card}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <img
              src={board.image_url}
              alt={board.name}
              style={{ width: 180, height: 100, objectFit: "cover", borderRadius: 6, border: "1px solid #e0e0e0", flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h3 style={{ ...STYLE.title, margin: 0 }}>{board.name}</h3>
                <span style={{
                  ...STYLE.badge,
                  background: board.is_active ? "#e8f5e9" : "#fde8e8",
                  color: board.is_active ? "#2e7d32" : "#e74c3c",
                  border: `1px solid ${board.is_active ? "#a5d6a7" : "#f5a3a3"}`,
                }}>
                  {board.is_active ? "Actif" : "Inactif"}
                </span>
              </div>
              <p style={{ fontSize: 9, color: "#aaa", marginBottom: 6 }}>
                Ajouté le {new Date(board.created_at).toLocaleDateString("fr-FR")}
              </p>

              {/* Rarity + default + prints */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={STYLE.label}>Rareté :</span>
                  <select
                    value={board.rarity ?? "Commune"}
                    onChange={(e) => {
                      const newR = e.target.value;
                      const mp = newR === "Commune" ? null : (board.max_prints ?? DEFAULT_MAX_PRINTS[newR] ?? null);
                      handleUpdateField(board, { rarity: newR, max_prints: mp, ...(newR !== "Commune" && board.is_default ? { is_default: false } : {}) });
                    }}
                    style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }}
                  >
                    {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {(board.rarity ?? "Commune") !== "Commune" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={STYLE.label}>Exemplaires :</span>
                    <input
                      type="number"
                      min={1}
                      value={board.max_prints ?? ""}
                      onChange={(e) => handleUpdateField(board, { max_prints: e.target.value ? Number(e.target.value) : null })}
                      style={{ width: 70, padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }}
                    />
                    <button
                      onClick={() => handleGeneratePrints(board)}
                      disabled={generatingId === board.id}
                      style={{ ...STYLE.button, background: "#1e88e5", padding: "3px 10px", opacity: generatingId === board.id ? 0.5 : 1 }}
                    >
                      {generatingId === board.id ? "..." : "Générer les exemplaires"}
                    </button>
                  </div>
                )}
                {(board.rarity ?? "Commune") === "Commune" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#333", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={board.is_default}
                      onChange={(e) => handleUpdateField(board, { is_default: e.target.checked })}
                    />
                    Plateau par défaut
                  </label>
                )}
              </div>
              {(() => {
                const selectedPlaylistIds = (board.game_board_music_tracks ?? []).map((r) => r.track_id);
                const boardTracks = musicTracks.filter((t) => t.category === "board");
                const unselected = boardTracks.filter((t) => !selectedPlaylistIds.includes(t.id));
                const updatePlaylist = async (ids: number[]) => {
                  await fetch("/api/boards", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: board.id, music_track_ids: ids }),
                  });
                  await loadBoards();
                };
                return (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6 }}>
                      <span style={{ ...STYLE.label, marginTop: 4, minWidth: 54 }}>Plateau :</span>
                      <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        {selectedPlaylistIds.length === 0 && (
                          <span style={{ fontSize: 10, color: "#bbb", fontStyle: "italic" }}>Aucune musique</span>
                        )}
                        {selectedPlaylistIds.map((tid) => {
                          const track = musicTracks.find((t) => t.id === tid);
                          return (
                            <span
                              key={tid}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "2px 4px 2px 8px", borderRadius: 10,
                                background: "#eef4ff", border: "1px solid #c7dbff", fontSize: 10,
                              }}
                            >
                              {track?.name ?? `#${tid}`}
                              <button
                                onClick={() => updatePlaylist(selectedPlaylistIds.filter((x) => x !== tid))}
                                title="Retirer"
                                style={{ border: "none", background: "transparent", color: "#6b89c2", cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 2px" }}
                              >×</button>
                            </span>
                          );
                        })}
                        {unselected.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              if (!e.target.value) return;
                              updatePlaylist([...selectedPlaylistIds, Number(e.target.value)]);
                            }}
                            style={{ padding: "2px 6px", borderRadius: 4, border: "1px dashed #c0c0c0", fontSize: 10, background: "#fafafa" }}
                          >
                            <option value="">+ Ajouter…</option>
                            {unselected.map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px" }}>
                      {([
                        { key: "tense_track_id", label: "Tension", category: "tense" },
                        { key: "victory_track_id", label: "Victoire", category: "victory" },
                        { key: "defeat_track_id", label: "Défaite", category: "defeat" },
                      ] as const).map(({ key, label, category }) => (
                        <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ ...STYLE.label, marginTop: 0, minWidth: 50 }}>{label} :</span>
                          <select
                            value={board[key] ?? ""}
                            onChange={async (e) => {
                              const value = e.target.value ? Number(e.target.value) : null;
                              await fetch("/api/boards", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: board.id, [key]: value }),
                              });
                              await loadBoards();
                            }}
                            style={{ flex: 1, padding: "3px 8px", borderRadius: 4, border: "1px solid #e0e0e0", fontSize: 11 }}
                          >
                            <option value="">Aucune</option>
                            {musicTracks.filter((t) => t.category === category).map((t) => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleToggleActive(board)}
                  style={{
                    ...STYLE.button,
                    background: board.is_active ? "#fde8e8" : "#e8f5e9",
                    color: board.is_active ? "#e74c3c" : "#2e7d32",
                  }}
                >
                  {board.is_active ? "Désactiver" : "Activer"}
                </button>
                <button
                  onClick={() => handleDelete(board)}
                  style={{ ...STYLE.button, background: "#e74c3c" }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {boards.length === 0 && (
        <div style={STYLE.card}>
          <p style={{ fontSize: 11, color: "#aaa", textAlign: "center" }}>
            Aucun plateau. Ajoutez-en un ci-dessus.
          </p>
        </div>
      )}
    </div>
  );
}
