"use client";

import { useState, useMemo } from "react";

interface ProfileRow {
  id: string;
  username: string;
  role: string;
}

interface CardRow {
  id: number;
  name: string;
  mana_cost: number;
  rarity: string | null;
  faction: string | null;
  race: string | null;
  card_type: string;
  set_id: number | null;
}

interface CollectionManagerProps {
  profiles: ProfileRow[];
  allCards: CardRow[];
}

export default function CollectionManager({ profiles, allCards }: CollectionManagerProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [collectedCardIds, setCollectedCardIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [profileList, setProfileList] = useState(profiles);

  // Only collectible cards (no set)
  const collectibleCards = useMemo(() => allCards.filter(c => c.set_id == null), [allCards]);

  const filteredCards = useMemo(() => {
    if (!search) return collectibleCards;
    const q = search.toLowerCase();
    return collectibleCards.filter(c => c.name.toLowerCase().includes(q));
  }, [collectibleCards, search]);

  const ownedCards = useMemo(() => filteredCards.filter(c => collectedCardIds.has(c.id)), [filteredCards, collectedCardIds]);
  const unownedCards = useMemo(() => filteredCards.filter(c => !collectedCardIds.has(c.id)), [filteredCards, collectedCardIds]);

  async function fetchCollection(userId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/collections?userId=${userId}`);
      const data = await res.json();
      setCollectedCardIds(new Set(data.cardIds ?? []));
    } finally {
      setLoading(false);
    }
  }

  async function addCards(cardIds: number[]) {
    if (!selectedUserId || !cardIds.length) return;
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, cardIds }),
    });
    setCollectedCardIds(prev => {
      const next = new Set(prev);
      cardIds.forEach(id => next.add(id));
      return next;
    });
  }

  async function removeCards(cardIds: number[]) {
    if (!selectedUserId || !cardIds.length) return;
    await fetch("/api/collections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, cardIds }),
    });
    setCollectedCardIds(prev => {
      const next = new Set(prev);
      cardIds.forEach(id => next.delete(id));
      return next;
    });
  }

  async function toggleRole() {
    if (!selectedUserId) return;
    const profile = profileList.find(p => p.id === selectedUserId);
    if (!profile) return;
    const newRole = profile.role === "testeur" ? "player" : "testeur";

    await fetch("/api/collections/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, role: newRole }),
    });

    setProfileList(prev => prev.map(p => p.id === selectedUserId ? { ...p, role: newRole } : p));
  }

  const selectedProfile = profileList.find(p => p.id === selectedUserId);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 24 }}>Gestion des Collections</h1>

      {/* Player selector */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
        <select
          value={selectedUserId}
          onChange={(e) => {
            setSelectedUserId(e.target.value);
            if (e.target.value) fetchCollection(e.target.value);
          }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, minWidth: 300 }}
        >
          <option value="">Choisir un joueur...</option>
          {profileList.map(p => (
            <option key={p.id} value={p.id}>
              {p.username} ({p.role})
            </option>
          ))}
        </select>

        {selectedProfile && (
          <button
            onClick={toggleRole}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: selectedProfile.role === "testeur" ? "#e74c3c" : "#27ae60",
              color: "white",
              fontWeight: "bold",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {selectedProfile.role === "testeur" ? "Retirer le role Testeur" : "Passer en Testeur"}
          </button>
        )}
      </div>

      {loading && <p>Chargement...</p>}

      {selectedUserId && !loading && (
        <>
          {collectibleCards.length === 0 ? (
            <p style={{ color: "#888" }}>Aucune carte collectible (set_id = NULL) en base.</p>
          ) : (
            <>
              {/* Search + bulk actions */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une carte..."
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, width: 300 }}
                />
                <button
                  onClick={() => addCards(unownedCards.map(c => c.id))}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#27ae60", color: "white", fontWeight: "bold", fontSize: 13, cursor: "pointer" }}
                >
                  Ajouter tout ({unownedCards.length})
                </button>
                <button
                  onClick={() => removeCards(ownedCards.map(c => c.id))}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#e74c3c", color: "white", fontWeight: "bold", fontSize: 13, cursor: "pointer" }}
                >
                  Retirer tout ({ownedCards.length})
                </button>
                <span style={{ color: "#888", fontSize: 13 }}>
                  {collectedCardIds.size} / {collectibleCards.length} cartes collectibles possedees
                </span>
              </div>

              {/* Two-panel layout */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                {/* Owned */}
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8, color: "#27ae60" }}>
                    Possedees ({ownedCards.length})
                  </h3>
                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", maxHeight: 500, overflowY: "auto" }}>
                    {ownedCards.length === 0 ? (
                      <p style={{ padding: 16, color: "#aaa", textAlign: "center" }}>Aucune carte</p>
                    ) : (
                      ownedCards.map(card => (
                        <div
                          key={card.id}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}
                        >
                          <div>
                            <span style={{ fontSize: 12, color: "#4fc3f7", fontWeight: "bold", marginRight: 8 }}>{card.mana_cost}</span>
                            <span style={{ fontSize: 13 }}>{card.name}</span>
                            {card.rarity && (
                              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({card.rarity})</span>
                            )}
                          </div>
                          <button
                            onClick={() => removeCards([card.id])}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#e74c3c22", color: "#e74c3c", fontSize: 11, fontWeight: "bold", cursor: "pointer" }}
                          >
                            Retirer
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Unowned */}
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8, color: "#e74c3c" }}>
                    Non possedees ({unownedCards.length})
                  </h3>
                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", maxHeight: 500, overflowY: "auto" }}>
                    {unownedCards.length === 0 ? (
                      <p style={{ padding: 16, color: "#aaa", textAlign: "center" }}>Toutes les cartes sont possedees</p>
                    ) : (
                      unownedCards.map(card => (
                        <div
                          key={card.id}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}
                        >
                          <div>
                            <span style={{ fontSize: 12, color: "#4fc3f7", fontWeight: "bold", marginRight: 8 }}>{card.mana_cost}</span>
                            <span style={{ fontSize: 13 }}>{card.name}</span>
                            {card.rarity && (
                              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({card.rarity})</span>
                            )}
                          </div>
                          <button
                            onClick={() => addCards([card.id])}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#27ae6022", color: "#27ae60", fontSize: 11, fontWeight: "bold", cursor: "pointer" }}
                          >
                            Ajouter
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
