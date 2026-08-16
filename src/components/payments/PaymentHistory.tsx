"use client";

// Historique des paiements du joueur. Lecture seule.
//
// Pas de bouton « demander un remboursement » : en V1 les remboursements sont
// manuels, depuis le tableau de bord Stripe. Un bouton laisserait croire à un
// libre-service qui n'existe pas.
import { useEffect, useState } from "react";
import AmPanel from "@/components/ui/AmPanel";
import GoldCoin from "@/components/shared/GoldCoin";

interface PaymentRow {
  id: string;
  type: "tournament_entry" | "gold_pack" | "ticket_pack";
  reference: string | null;
  amount_cents: number;
  currency: string;
  status: "pending" | "completed" | "refunded" | "failed";
  gold_amount: number;
  ticket_amount: number;
  created_at: string;
}

const STATUS_LABEL: Record<PaymentRow["status"], string> = {
  pending: "En attente",
  completed: "Réglé",
  refunded: "Remboursé",
  failed: "Non abouti",
};

const STATUS_CLASS: Record<PaymentRow["status"], string> = {
  pending: "text-am-ink-3",
  completed: "text-emerald-400",
  refunded: "text-amber-400",
  failed: "text-red-400",
};

export default function PaymentHistory() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);

  useEffect(() => {
    fetch("/api/payments")
      .then((r) => (r.ok ? r.json() : { payments: [] }))
      .then((d) => setRows(d.payments ?? []))
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <p className="text-sm text-am-ink-3">Chargement…</p>;
  if (rows.length === 0) return <p className="text-sm text-am-ink-3">Aucun paiement.</p>;

  return (
    <AmPanel className="overflow-x-auto p-1">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.18em] text-am-ink-3">
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Objet</th>
            <th className="px-4 py-3 text-right">Montant</th>
            <th className="px-4 py-3">État</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-white/5">
              <td className="px-4 py-3 text-am-ink-2">
                {new Date(p.created_at).toLocaleDateString("fr-FR")}
              </td>
              <td className="px-4 py-3 text-am-ink-2">
                {p.type === "gold_pack" ? (
                  <span className="inline-flex items-center gap-1">
                    Pack de {p.gold_amount} <GoldCoin size={13} />
                  </span>
                ) : p.type === "ticket_pack" ? (
                  `${p.ticket_amount} ticket${p.ticket_amount > 1 ? "s" : ""} de tournoi`
                ) : (
                  // Chemin historique : plus aucun paiement de ce type n'est créé.
                  "Inscription à un tournoi"
                )}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-am-ink-2">
                {/* Un paiement en attente n'a pas encore de montant : il n'est
                    copié depuis Stripe qu'à la confirmation. Afficher « 0,00 € »
                    laisserait croire à un achat gratuit. */}
                {p.status === "pending"
                  ? <span className="text-am-ink-3">—</span>
                  : new Intl.NumberFormat("fr-FR", {
                      style: "currency",
                      currency: (p.currency || "eur").toUpperCase(),
                    }).format(p.amount_cents / 100)}
              </td>
              <td className={`px-4 py-3 font-semibold ${STATUS_CLASS[p.status]}`}>
                {STATUS_LABEL[p.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AmPanel>
  );
}
