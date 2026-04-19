"use client";

import { useState, useMemo, useCallback } from "react";

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
  card_year: number | null;
  card_month: number | null;
}

interface PrintRow {
  id: number;
  card_id: number;
  print_number: number;
  max_prints: number;
  owner_id: string | null;
  owner_username: string | null;
  is_tradeable: boolean;
  assigned_at: string | null;
}

interface BoardRow {
  id: number;
  name: string;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  is_active: boolean;
}

interface BoardPrintRow {
  id: number;
  board_id: number;
  print_number: number;
  max_prints: number;
  owner_id: string | null;
  owner_username: string | null;
  is_tradeable: boolean;
  assigned_at: string | null;
}

interface CardBackRow {
  id: number;
  name: string;
  rarity: string | null;
  max_prints: number | null;
  is_default: boolean;
  is_active: boolean;
}

interface CardBackPrintRow {
  id: number;
  card_back_id: number;
  print_number: number;
  max_prints: number;
  owner_id: string | null;
  owner_username: string | null;
  is_tradeable: boolean;
  assigned_at: string | null;
}

interface CollectionManagerProps {
  profiles: ProfileRow[];
  allCards: CardRow[];
  allBoards: BoardRow[];
  allCardBacks: CardBackRow[];
}

export default function CollectionManager({ profiles, allCards, allBoards, allCardBacks }: CollectionManagerProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [collectedCardIds, setCollectedCardIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [profileList, setProfileList] = useState(profiles);

  // Limited prints state
  const [selectedLimitedCard, setSelectedLimitedCard] = useState<CardRow | null>(null);
  const [prints, setPrints] = useState<PrintRow[]>([]);
  const [printsLoading, setPrintsLoading] = useState(false);
  const [limitedSearch, setLimitedSearch] = useState("");

  // Board prints state
  const [selectedBoard, setSelectedBoard] = useState<BoardRow | null>(null);
  const [boardPrints, setBoardPrints] = useState<BoardPrintRow[]>([]);
  const [boardPrintsLoading, setBoardPrintsLoading] = useState(false);
  const [boardSearch, setBoardSearch] = useState("");
  const limitedBoards = useMemo(() => allBoards.filter((b) => (b.rarity ?? "Commune") !== "Commune"), [allBoards]);
  const filteredLimitedBoards = useMemo(() => {
    if (!boardSearch) return limitedBoards;
    const q = boardSearch.toLowerCase();
    return limitedBoards.filter((b) => b.name.toLowerCase().includes(q));
  }, [limitedBoards, boardSearch]);

  // Card back prints state
  const [selectedCardBack, setSelectedCardBack] = useState<CardBackRow | null>(null);
  const [cardBackPrints, setCardBackPrints] = useState<CardBackPrintRow[]>([]);
  const [cardBackPrintsLoading, setCardBackPrintsLoading] = useState(false);
  const [cardBackSearch, setCardBackSearch] = useState("");
  const limitedCardBacks = useMemo(() => allCardBacks.filter((cb) => (cb.rarity ?? "Commune") !== "Commune"), [allCardBacks]);
  const filteredLimitedCardBacks = useMemo(() => {
    if (!cardBackSearch) return limitedCardBacks;
    const q = cardBackSearch.toLowerCase();
    return limitedCardBacks.filter((cb) => cb.name.toLowerCase().includes(q));
  }, [limitedCardBacks, cardBackSearch]);

  // Regular collectible cards (no set, no date = not limited)
  const collectibleCards = useMemo(() => allCards.filter(c => c.set_id == null && !c.card_year), [allCards]);
  // Limited series cards (no set, with date)
  const limitedCards = useMemo(() => allCards.filter(c => c.set_id == null && c.card_year), [allCards]);

  const filteredCards = useMemo(() => {
    if (!search) return collectibleCards;
    const q = search.toLowerCase();
    return collectibleCards.filter(c => c.name.toLowerCase().includes(q));
  }, [collectibleCards, search]);

  const filteredLimitedCards = useMemo(() => {
    if (!limitedSearch) return limitedCards;
    const q = limitedSearch.toLowerCase();
    return limitedCards.filter(c => c.name.toLowerCase().includes(q));
  }, [limitedCards, limitedSearch]);

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

  const loadPrints = useCallback(async (cardId: number) => {
    setPrintsLoading(true);
    try {
      const res = await fetch(`/api/card-prints?cardId=${cardId}`);
      const data = await res.json();
      setPrints(Array.isArray(data) ? data : []);
    } finally {
      setPrintsLoading(false);
    }
  }, []);

  async function assignPrint(printId: number, ownerId: string | null) {
    await fetch("/api/card-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, ownerId }),
    });
    if (selectedLimitedCard) loadPrints(selectedLimitedCard.id);
  }

  async function toggleTradeable(printId: number, current: boolean) {
    await fetch("/api/card-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, isTradeable: !current }),
    });
    if (selectedLimitedCard) loadPrints(selectedLimitedCard.id);
  }

  const loadBoardPrints = useCallback(async (boardId: number) => {
    setBoardPrintsLoading(true);
    try {
      const res = await fetch(`/api/board-prints?boardId=${boardId}`);
      const data = await res.json();
      setBoardPrints(Array.isArray(data) ? data : []);
    } finally {
      setBoardPrintsLoading(false);
    }
  }, []);

  async function assignBoardPrint(printId: number, ownerId: string | null) {
    await fetch("/api/board-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, ownerId }),
    });
    if (selectedBoard) loadBoardPrints(selectedBoard.id);
  }

  async function toggleBoardTradeable(printId: number, current: boolean) {
    await fetch("/api/board-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, isTradeable: !current }),
    });
    if (selectedBoard) loadBoardPrints(selectedBoard.id);
  }

  const assignedBoardCount = boardPrints.filter((p) => p.owner_id).length;
  const availableBoardCount = boardPrints.length - assignedBoardCount;

  const loadCardBackPrints = useCallback(async (cardBackId: number) => {
    setCardBackPrintsLoading(true);
    try {
      const res = await fetch(`/api/card-back-prints?cardBackId=${cardBackId}`);
      const data = await res.json();
      setCardBackPrints(Array.isArray(data) ? data : []);
    } finally {
      setCardBackPrintsLoading(false);
    }
  }, []);

  async function assignCardBackPrint(printId: number, ownerId: string | null) {
    await fetch("/api/card-back-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, ownerId }),
    });
    if (selectedCardBack) loadCardBackPrints(selectedCardBack.id);
  }

  async function toggleCardBackTradeable(printId: number, current: boolean) {
    await fetch("/api/card-back-prints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printId, isTradeable: !current }),
    });
    if (selectedCardBack) loadCardBackPrints(selectedCardBack.id);
  }

  const assignedCardBackCount = cardBackPrints.filter((p) => p.owner_id).length;
  const availableCardBackCount = cardBackPrints.length - assignedCardBackCount;

  const selectedProfile = profileList.find(p => p.id === selectedUserId);
  const assignedCount = prints.filter(p => p.owner_id).length;
  const availableCount = prints.length - assignedCount;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <a href="/" style={{
          padding: "5px 12px", borderRadius: 6, cursor: "pointer",
          background: "transparent", border: "1px solid #ddd", color: "#888",
          fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
          transition: "all 0.2s",
        }}>← Menu</a>
        <h1 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>Gestion des Collections</h1>
      </div>

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
          {/* ── REGULAR COLLECTION ── */}
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

          {/* ── LIMITED SERIES ── */}
          {limitedCards.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16, color: "#ffd700", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                Séries Limitées ({limitedCards.length} cartes)
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
                {/* Left: card list */}
                <div>
                  <input
                    type="text"
                    value={limitedSearch}
                    onChange={(e) => setLimitedSearch(e.target.value)}
                    placeholder="Rechercher une carte limitée..."
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, width: "100%", marginBottom: 12 }}
                  />
                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", maxHeight: 500, overflowY: "auto" }}>
                    {filteredLimitedCards.map(card => (
                      <div
                        key={card.id}
                        onClick={() => { setSelectedLimitedCard(card); loadPrints(card.id); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                          background: selectedLimitedCard?.id === card.id ? "#ffd70015" : "transparent",
                          borderLeft: selectedLimitedCard?.id === card.id ? "3px solid #ffd700" : "3px solid transparent",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 12, color: "#4fc3f7", fontWeight: "bold", marginRight: 8 }}>{card.mana_cost}</span>
                          <span style={{ fontSize: 13 }}>{card.name}</span>
                          {card.rarity && (
                            <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({card.rarity})</span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: "#aaa" }}>{card.card_year}/{String(card.card_month).padStart(2, "0")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: prints detail */}
                <div>
                  {!selectedLimitedCard ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#aaa", background: "white", borderRadius: 12, border: "1px solid #e0e0e0" }}>
                      Sélectionner une carte limitée pour voir ses exemplaires
                    </div>
                  ) : printsLoading ? (
                    <p>Chargement des exemplaires...</p>
                  ) : (
                    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: "bold", margin: 0 }}>{selectedLimitedCard.name}</h3>
                          <span style={{ fontSize: 12, color: "#888" }}>
                            {selectedLimitedCard.rarity} — {prints.length} exemplaires — {assignedCount} attribués, {availableCount} disponibles
                          </span>
                        </div>
                      </div>

                      <div style={{ maxHeight: 420, overflowY: "auto" }}>
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                              <th style={{ padding: "6px 8px", fontWeight: 700 }}>#</th>
                              <th style={{ padding: "6px 8px", fontWeight: 700 }}>Propriétaire</th>
                              <th style={{ padding: "6px 8px", fontWeight: 700 }}>Échangeable</th>
                              <th style={{ padding: "6px 8px", fontWeight: 700 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prints.map(p => (
                              <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                                <td style={{ padding: "6px 8px", fontWeight: 700, color: "#ffd700" }}>
                                  #{p.print_number}/{p.max_prints}
                                </td>
                                <td style={{ padding: "6px 8px" }}>
                                  {p.owner_username ? (
                                    <span style={{ color: "#27ae60", fontWeight: 600 }}>{p.owner_username}</span>
                                  ) : (
                                    <span style={{ color: "#aaa" }}>— disponible —</span>
                                  )}
                                </td>
                                <td style={{ padding: "6px 8px" }}>
                                  <button
                                    onClick={() => toggleTradeable(p.id, p.is_tradeable)}
                                    style={{
                                      padding: "2px 8px", borderRadius: 4, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                                      background: p.is_tradeable ? "#27ae6022" : "#e74c3c22",
                                      color: p.is_tradeable ? "#27ae60" : "#e74c3c",
                                    }}
                                  >
                                    {p.is_tradeable ? "Oui" : "Non"}
                                  </button>
                                </td>
                                <td style={{ padding: "6px 8px" }}>
                                  {p.owner_id ? (
                                    <button
                                      onClick={() => assignPrint(p.id, null)}
                                      style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: "#e74c3c22", color: "#e74c3c", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                                    >
                                      Retirer
                                    </button>
                                  ) : (
                                    <select
                                      value=""
                                      onChange={(e) => { if (e.target.value) assignPrint(p.id, e.target.value); }}
                                      style={{ padding: "3px 6px", borderRadius: 5, border: "1px solid #ddd", fontSize: 10 }}
                                    >
                                      <option value="">Attribuer à...</option>
                                      {profileList.map(prof => (
                                        <option key={prof.id} value={prof.id}>{prof.username}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── LIMITED BOARDS ── */}
          {limitedBoards.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16, color: "#10b981", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                Plateaux limités ({limitedBoards.length})
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
                {/* Left: board list */}
                <div>
                  <input
                    type="text"
                    value={boardSearch}
                    onChange={(e) => setBoardSearch(e.target.value)}
                    placeholder="Rechercher un plateau limité..."
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, width: "100%", marginBottom: 12 }}
                  />
                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", maxHeight: 500, overflowY: "auto" }}>
                    {filteredLimitedBoards.map((board) => (
                      <div
                        key={board.id}
                        onClick={() => { setSelectedBoard(board); loadBoardPrints(board.id); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                          background: selectedBoard?.id === board.id ? "#10b98115" : "transparent",
                          borderLeft: selectedBoard?.id === board.id ? "3px solid #10b981" : "3px solid transparent",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{board.name}</span>
                          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({board.rarity})</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#aaa" }}>{board.max_prints ?? "?"} ex.</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: board prints detail */}
                <div>
                  {!selectedBoard ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#aaa", background: "white", borderRadius: 12, border: "1px solid #e0e0e0" }}>
                      Sélectionner un plateau limité pour voir ses exemplaires
                    </div>
                  ) : boardPrintsLoading ? (
                    <p>Chargement des exemplaires...</p>
                  ) : (
                    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: "bold", margin: 0 }}>{selectedBoard.name}</h3>
                          <span style={{ fontSize: 12, color: "#888" }}>
                            {selectedBoard.rarity} — {boardPrints.length} exemplaires — {assignedBoardCount} attribués, {availableBoardCount} disponibles
                          </span>
                        </div>
                      </div>

                      {boardPrints.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", color: "#aaa", fontStyle: "italic", fontSize: 12 }}>
                          Aucun exemplaire généré. Utilise le bouton "Générer les exemplaires" dans /admin/boards.
                        </div>
                      ) : (
                        <div style={{ maxHeight: 420, overflowY: "auto" }}>
                          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>#</th>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Propriétaire</th>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Échangeable</th>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {boardPrints.map((p) => (
                                <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#10b981" }}>
                                    #{p.print_number}/{p.max_prints}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {p.owner_username ? (
                                      <span style={{ color: "#27ae60", fontWeight: 600 }}>{p.owner_username}</span>
                                    ) : (
                                      <span style={{ color: "#aaa" }}>— disponible —</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    <button
                                      onClick={() => toggleBoardTradeable(p.id, p.is_tradeable)}
                                      style={{
                                        padding: "2px 8px", borderRadius: 4, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                                        background: p.is_tradeable ? "#27ae6022" : "#e74c3c22",
                                        color: p.is_tradeable ? "#27ae60" : "#e74c3c",
                                      }}
                                    >
                                      {p.is_tradeable ? "Oui" : "Non"}
                                    </button>
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {p.owner_id ? (
                                      <button
                                        onClick={() => assignBoardPrint(p.id, null)}
                                        style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: "#e74c3c22", color: "#e74c3c", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                                      >
                                        Retirer
                                      </button>
                                    ) : (
                                      <select
                                        value=""
                                        onChange={(e) => { if (e.target.value) assignBoardPrint(p.id, e.target.value); }}
                                        style={{ padding: "3px 6px", borderRadius: 5, border: "1px solid #ddd", fontSize: 10 }}
                                      >
                                        <option value="">Attribuer à...</option>
                                        {profileList.map((prof) => (
                                          <option key={prof.id} value={prof.id}>{prof.username}</option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── LIMITED CARD BACKS ── */}
          {limitedCardBacks.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16, color: "#8b5cf6", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                Dos de cartes limités ({limitedCardBacks.length})
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
                <div>
                  <input
                    type="text"
                    value={cardBackSearch}
                    onChange={(e) => setCardBackSearch(e.target.value)}
                    placeholder="Rechercher un dos limité..."
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, width: "100%", marginBottom: 12 }}
                  />
                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", maxHeight: 500, overflowY: "auto" }}>
                    {filteredLimitedCardBacks.map((cb) => (
                      <div
                        key={cb.id}
                        onClick={() => { setSelectedCardBack(cb); loadCardBackPrints(cb.id); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                          background: selectedCardBack?.id === cb.id ? "#8b5cf615" : "transparent",
                          borderLeft: selectedCardBack?.id === cb.id ? "3px solid #8b5cf6" : "3px solid transparent",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{cb.name}</span>
                          <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>({cb.rarity})</span>
                        </div>
                        <span style={{ fontSize: 10, color: "#aaa" }}>{cb.max_prints ?? "?"} ex.</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  {!selectedCardBack ? (
                    <div style={{ padding: 40, textAlign: "center", color: "#aaa", background: "white", borderRadius: 12, border: "1px solid #e0e0e0" }}>
                      Sélectionner un dos limité pour voir ses exemplaires
                    </div>
                  ) : cardBackPrintsLoading ? (
                    <p>Chargement des exemplaires...</p>
                  ) : (
                    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e0e0e0", padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: "bold", margin: 0 }}>{selectedCardBack.name}</h3>
                          <span style={{ fontSize: 12, color: "#888" }}>
                            {selectedCardBack.rarity} — {cardBackPrints.length} exemplaires — {assignedCardBackCount} attribués, {availableCardBackCount} disponibles
                          </span>
                        </div>
                      </div>

                      {cardBackPrints.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", color: "#aaa", fontStyle: "italic", fontSize: 12 }}>
                          Aucun exemplaire généré. Utilise le bouton "Générer les exemplaires" dans /admin/card-backs.
                        </div>
                      ) : (
                        <div style={{ maxHeight: 420, overflowY: "auto" }}>
                          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>#</th>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Propriétaire</th>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Échangeable</th>
                                <th style={{ padding: "6px 8px", fontWeight: 700 }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cardBackPrints.map((p) => (
                                <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                                  <td style={{ padding: "6px 8px", fontWeight: 700, color: "#8b5cf6" }}>
                                    #{p.print_number}/{p.max_prints}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {p.owner_username ? (
                                      <span style={{ color: "#27ae60", fontWeight: 600 }}>{p.owner_username}</span>
                                    ) : (
                                      <span style={{ color: "#aaa" }}>— disponible —</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    <button
                                      onClick={() => toggleCardBackTradeable(p.id, p.is_tradeable)}
                                      style={{
                                        padding: "2px 8px", borderRadius: 4, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                                        background: p.is_tradeable ? "#27ae6022" : "#e74c3c22",
                                        color: p.is_tradeable ? "#27ae60" : "#e74c3c",
                                      }}
                                    >
                                      {p.is_tradeable ? "Oui" : "Non"}
                                    </button>
                                  </td>
                                  <td style={{ padding: "6px 8px" }}>
                                    {p.owner_id ? (
                                      <button
                                        onClick={() => assignCardBackPrint(p.id, null)}
                                        style={{ padding: "3px 10px", borderRadius: 5, border: "none", background: "#e74c3c22", color: "#e74c3c", fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                                      >
                                        Retirer
                                      </button>
                                    ) : (
                                      <select
                                        value=""
                                        onChange={(e) => { if (e.target.value) assignCardBackPrint(p.id, e.target.value); }}
                                        style={{ padding: "3px 6px", borderRadius: 5, border: "1px solid #ddd", fontSize: 10 }}
                                      >
                                        <option value="">Attribuer à...</option>
                                        {profileList.map((prof) => (
                                          <option key={prof.id} value={prof.id}>{prof.username}</option>
                                        ))}
                                      </select>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
