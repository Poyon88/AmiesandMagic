"use client";

import { useState } from "react";

interface ProfileRow {
  id: string;
  username: string;
  role: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

interface EconomyManagerProps {
  profiles: ProfileRow[];
}

export default function EconomyManager({ profiles }: EconomyManagerProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  async function fetchWalletData(userId: string) {
    setLoading(true);
    setMessage(null);
    try {
      const [walletRes, txRes] = await Promise.all([
        fetch(`/api/wallet?userId=${userId}`),
        fetch(`/api/wallet/transactions?userId=${userId}&limit=50`),
      ]);
      const walletData = await walletRes.json();
      const txData = await txRes.json();
      setBalance(walletData.balance ?? 0);
      setTransactions(txData.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdjust(type: "admin_credit" | "admin_debit") {
    if (!selectedUserId || !amount) return;
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setMessage({ text: "Montant invalide", type: "error" });
      return;
    }

    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/wallet/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          amount: numAmount,
          type,
          description: description || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ text: data.error ?? "Erreur", type: "error" });
        return;
      }

      setMessage({
        text: `${type === "admin_credit" ? "Crédité" : "Débité"} ${numAmount} pièces d'or. Nouveau solde : ${data.new_balance}`,
        type: "success",
      });
      setBalance(data.new_balance);
      setAmount("");
      setDescription("");
      // Refresh transactions
      const txRes = await fetch(`/api/wallet/transactions?userId=${selectedUserId}&limit=50`);
      const txData = await txRes.json();
      setTransactions(txData.transactions ?? []);
    } finally {
      setActionLoading(false);
    }
  }

  const typeLabels: Record<string, string> = {
    admin_credit: "Crédit admin",
    admin_debit: "Débit admin",
    purchase: "Achat",
    reward_victory: "Récompense victoire",
    reward_quest: "Récompense quête",
    shop_booster: "Achat booster",
    shop_card: "Achat carte",
    shop_cosmetic: "Achat cosmétique",
    refund: "Remboursement",
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <a href="/" style={{
          padding: "5px 12px", borderRadius: 6, cursor: "pointer",
          background: "transparent", border: "1px solid #ddd", color: "#888",
          fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
          textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
          transition: "all 0.2s",
        }}>← Menu</a>
        <h1 style={{ fontSize: 24, fontWeight: "bold", margin: 0 }}>Gestion de l&apos;Économie</h1>
      </div>

      {/* Player selector */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
        <select
          value={selectedUserId}
          onChange={(e) => {
            setSelectedUserId(e.target.value);
            if (e.target.value) fetchWalletData(e.target.value);
            else { setBalance(null); setTransactions([]); }
          }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, minWidth: 300 }}
        >
          <option value="">Choisir un joueur...</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>
              {p.username} ({p.role})
            </option>
          ))}
        </select>

        {balance !== null && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 8,
            background: "#ffd70015", border: "1px solid #ffd70040",
          }}>
            <span style={{ fontSize: 20 }}>🪙</span>
            <span style={{ fontSize: 18, fontWeight: "bold", color: "#d4a017" }}>
              {balance.toLocaleString("fr-FR")}
            </span>
          </div>
        )}
      </div>

      {loading && <p>Chargement...</p>}

      {selectedUserId && !loading && (
        <>
          {/* Credit / Debit form */}
          <div style={{
            background: "white", borderRadius: 12, border: "1px solid #e0e0e0",
            padding: 20, marginBottom: 24,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, margin: 0 }}>
              Créditer / Débiter
            </h3>
            <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Montant</label>
                <input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="100"
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, width: 120 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Description (optionnel)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Raison du crédit/débit..."
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc", fontSize: 14, width: "100%" }}
                />
              </div>
              <button
                onClick={() => handleAdjust("admin_credit")}
                disabled={actionLoading || !amount}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: actionLoading ? "#aaa" : "#27ae60", color: "white",
                  fontWeight: "bold", fontSize: 13, cursor: actionLoading ? "default" : "pointer",
                }}
              >
                + Créditer
              </button>
              <button
                onClick={() => handleAdjust("admin_debit")}
                disabled={actionLoading || !amount}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: actionLoading ? "#aaa" : "#e74c3c", color: "white",
                  fontWeight: "bold", fontSize: 13, cursor: actionLoading ? "default" : "pointer",
                }}
              >
                − Débiter
              </button>
            </div>

            {message && (
              <p style={{
                marginTop: 12, fontSize: 13, fontWeight: 600,
                color: message.type === "success" ? "#27ae60" : "#e74c3c",
              }}>
                {message.text}
              </p>
            )}
          </div>

          {/* Transaction history */}
          <div style={{
            background: "white", borderRadius: 12, border: "1px solid #e0e0e0",
            padding: 20,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", margin: 0, marginBottom: 16 }}>
              Historique des transactions ({transactions.length})
            </h3>

            {transactions.length === 0 ? (
              <p style={{ color: "#aaa", textAlign: "center", padding: 20 }}>Aucune transaction</p>
            ) : (
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e0e0e0", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Date</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Type</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Montant</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Solde après</th>
                      <th style={{ padding: "6px 8px", fontWeight: 700 }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => (
                      <tr key={tx.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "6px 8px", color: "#888" }}>
                          {new Date(tx.created_at).toLocaleString("fr-FR")}
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          {typeLabels[tx.type] ?? tx.type}
                        </td>
                        <td style={{
                          padding: "6px 8px", fontWeight: 700,
                          color: tx.amount >= 0 ? "#27ae60" : "#e74c3c",
                        }}>
                          {tx.amount >= 0 ? "+" : ""}{tx.amount} 🪙
                        </td>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                          {tx.balance_after.toLocaleString("fr-FR")} 🪙
                        </td>
                        <td style={{ padding: "6px 8px", color: "#888" }}>
                          {tx.description ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
