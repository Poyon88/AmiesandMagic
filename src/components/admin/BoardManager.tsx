"use client";

import { useState, useEffect, useCallback } from "react";

interface GameBoard {
  id: number;
  name: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

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
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => { loadBoards(); }, [loadBoards]);

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
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), imageBase64: newImage.base64, imageMimeType: newImage.mimeType }),
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
      await loadBoards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      console.error("Erreur ajout:", err);
    }
    setSaving(false);
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
              <p style={{ fontSize: 9, color: "#aaa", marginBottom: 10 }}>
                Ajouté le {new Date(board.created_at).toLocaleDateString("fr-FR")}
              </p>
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
