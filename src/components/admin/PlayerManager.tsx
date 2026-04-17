"use client";

import { useState, useEffect, useCallback } from "react";

interface Player {
  id: string;
  username: string;
  email: string | null;
  role: string;
  banned: boolean;
  banned_until: string | null;
  gold: number;
  cards_collected: number;
  prints_owned: number;
  last_sign_in: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "#e74c3c",
  testeur: "#f39c12",
  player: "#2ecc71",
};

export default function PlayerManager() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Action form state
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("");
  const [suspendDuration, setSuspendDuration] = useState("7");

  const fetchPlayers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/players");
    const data = await res.json();
    setPlayers(data.players ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  async function performAction(action: string, value?: string) {
    if (!selectedPlayer) return;
    setActionLoading(true);
    setMessage(null);

    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId: selectedPlayer.id, value }),
    });
    const data = await res.json();

    if (data.error) {
      setMessage({ text: data.error, type: "error" });
    } else {
      setMessage({ text: data.message, type: "success" });
      fetchPlayers();
      // Refresh selected player
      const updated = (await (await fetch("/api/admin/players")).json()).players as Player[];
      setSelectedPlayer(updated.find(p => p.id === selectedPlayer.id) ?? null);
    }
    setActionLoading(false);
  }

  function selectPlayer(p: Player) {
    setSelectedPlayer(p);
    setNewUsername(p.username);
    setNewEmail(p.email ?? "");
    setNewRole(p.role);
    setNewPassword("");
    setMessage(null);
  }

  const filtered = search
    ? players.filter(p =>
        p.username.toLowerCase().includes(search.toLowerCase()) ||
        (p.email ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : players;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#333", marginBottom: 24 }}>
        Gestion des Joueurs
      </h1>

      {message && (
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            borderRadius: 8,
            background: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
            fontSize: 14,
          }}
        >
          {message.text}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: player list */}
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 12 }}>
            Joueurs ({players.length})
          </h2>
          <input
            type="text"
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />

          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: "#999" }}>Chargement...</div>
          ) : (
            <div style={{ maxHeight: 600, overflow: "auto", marginTop: 12 }}>
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => selectPlayer(p)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                    background: selectedPlayer?.id === p.id ? "#e3f2fd" : "transparent",
                    borderRadius: 6,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, color: "#333", fontSize: 14 }}>{p.username}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 8,
                          background: `${ROLE_COLORS[p.role] ?? "#999"}22`,
                          color: ROLE_COLORS[p.role] ?? "#999",
                          fontWeight: 600,
                        }}
                      >
                        {p.role}
                      </span>
                      {p.banned && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 8,
                            background: "#f4433622",
                            color: "#f44336",
                            fontWeight: 600,
                          }}
                        >
                          SUSPENDU
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                      {p.email ?? "Pas d'email"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 11, color: "#999" }}>
                    <div style={{ color: "#f1c40f", fontWeight: 600 }}>{p.gold} or</div>
                    <div>{p.cards_collected + p.prints_owned} cartes</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: player details & actions */}
        <div>
          {!selectedPlayer ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                color: "#999",
              }}
            >
              Sélectionnez un joueur pour voir ses détails
            </div>
          ) : (
            <>
              {/* Player info card */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 16,
                }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "#333", marginBottom: 16 }}>
                  {selectedPlayer.username}
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                  <div><span style={{ color: "#999" }}>Email:</span> <span style={{ color: "#333" }}>{selectedPlayer.email ?? "—"}</span></div>
                  <div><span style={{ color: "#999" }}>Rôle:</span> <span style={{ color: ROLE_COLORS[selectedPlayer.role], fontWeight: 600 }}>{selectedPlayer.role}</span></div>
                  <div><span style={{ color: "#999" }}>Or:</span> <span style={{ color: "#f1c40f", fontWeight: 600 }}>{selectedPlayer.gold}</span></div>
                  <div><span style={{ color: "#999" }}>Statut:</span> <span style={{ color: selectedPlayer.banned ? "#f44336" : "#2ecc71", fontWeight: 600 }}>{selectedPlayer.banned ? "Suspendu" : "Actif"}</span></div>
                  <div><span style={{ color: "#999" }}>Cartes (collection):</span> {selectedPlayer.cards_collected}</div>
                  <div><span style={{ color: "#999" }}>Cartes (prints):</span> {selectedPlayer.prints_owned}</div>
                  <div><span style={{ color: "#999" }}>Dernière connexion:</span> {selectedPlayer.last_sign_in ? new Date(selectedPlayer.last_sign_in).toLocaleString("fr-FR") : "Jamais"}</div>
                  <div><span style={{ color: "#999" }}>Inscription:</span> {new Date(selectedPlayer.created_at).toLocaleString("fr-FR")}</div>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 20,
                }}
              >
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#333", marginBottom: 16 }}>Actions</h3>

                {/* Change username */}
                <div style={actionRow}>
                  <label style={labelStyle}>Nom d'utilisateur</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                    />
                    <button
                      onClick={() => performAction("change_username", newUsername)}
                      disabled={actionLoading || newUsername === selectedPlayer.username}
                      style={actionBtn("#2196f3", actionLoading || newUsername === selectedPlayer.username)}
                    >
                      Modifier
                    </button>
                  </div>
                </div>

                {/* Change email */}
                <div style={actionRow}>
                  <label style={labelStyle}>Email</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                    />
                    <button
                      onClick={() => performAction("change_email", newEmail)}
                      disabled={actionLoading || newEmail === (selectedPlayer.email ?? "")}
                      style={actionBtn("#2196f3", actionLoading || newEmail === (selectedPlayer.email ?? ""))}
                    >
                      Modifier
                    </button>
                  </div>
                </div>

                {/* Reset password */}
                <div style={actionRow}>
                  <label style={labelStyle}>Nouveau mot de passe</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 8 caractères"
                      style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                    />
                    <button
                      onClick={() => performAction("reset_password", newPassword)}
                      disabled={actionLoading || newPassword.length < 8}
                      style={actionBtn("#ff9800", actionLoading || newPassword.length < 8)}
                    >
                      Réinitialiser
                    </button>
                  </div>
                </div>

                {/* Change role */}
                <div style={actionRow}>
                  <label style={labelStyle}>Rôle</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                    >
                      <option value="player">Player</option>
                      <option value="testeur">Testeur</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => performAction("change_role", newRole)}
                      disabled={actionLoading || newRole === selectedPlayer.role}
                      style={actionBtn("#9c27b0", actionLoading || newRole === selectedPlayer.role)}
                    >
                      Changer
                    </button>
                  </div>
                </div>

                {/* Suspend / Unsuspend */}
                <div style={actionRow}>
                  <label style={labelStyle}>Suspension</label>
                  {selectedPlayer.banned ? (
                    <button
                      onClick={() => performAction("unsuspend")}
                      disabled={actionLoading}
                      style={actionBtn("#2ecc71", actionLoading)}
                    >
                      Lever la suspension
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        value={suspendDuration}
                        onChange={(e) => setSuspendDuration(e.target.value)}
                        style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
                      >
                        <option value="1">1 jour</option>
                        <option value="3">3 jours</option>
                        <option value="7">7 jours</option>
                        <option value="30">30 jours</option>
                        <option value="permanent">Permanent</option>
                      </select>
                      <button
                        onClick={() => {
                          const val = suspendDuration === "permanent"
                            ? "permanent"
                            : new Date(Date.now() + parseInt(suspendDuration) * 86400000).toISOString();
                          performAction("suspend", val);
                        }}
                        disabled={actionLoading}
                        style={actionBtn("#f44336", actionLoading)}
                      >
                        Suspendre
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete */}
                <div style={{ ...actionRow, borderBottom: "none", paddingTop: 16 }}>
                  <button
                    onClick={() => {
                      if (confirm(`Voulez-vous vraiment supprimer le joueur "${selectedPlayer.username}" ? Cette action est irréversible.`)) {
                        performAction("delete");
                        setSelectedPlayer(null);
                      }
                    }}
                    disabled={actionLoading}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: actionLoading ? "#ccc" : "#f4433622",
                      border: "1px solid #f4433644",
                      borderRadius: 6,
                      color: "#f44336",
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: actionLoading ? "default" : "pointer",
                    }}
                  >
                    Supprimer ce joueur
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#666",
  marginBottom: 4,
};

const actionRow: React.CSSProperties = {
  paddingBottom: 14,
  marginBottom: 14,
  borderBottom: "1px solid #f0f0f0",
};

function actionBtn(color: string, disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 16px",
    background: disabled ? "#ccc" : color,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontWeight: 600,
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
    whiteSpace: "nowrap",
  };
}
