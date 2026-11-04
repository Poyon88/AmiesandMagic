"use client";

// Historique des mouvements d'essence du joueur (/compte/essence).
import { useEffect, useState } from "react";
import EssenceIcon from "@/components/shared/EssenceIcon";
import { RARITY_MAP, getFactionDisplayName } from "@/lib/card-engine/constants";
import type { EssenceTransaction } from "@/lib/economy/types";

const LIBELLES: Record<string, string> = {
  admin_credit: "Crédit",
  admin_debit: "Débit",
  craft: "Forge",
  reward_tournament: "Récompense de tournoi",
};

function detail(tx: EssenceTransaction): string | null {
  if (tx.type !== "craft") return tx.description;
  const m = tx.metadata as { kind?: string; rarity?: string; faction?: string; clan?: string; print_number?: number; max_prints?: number };
  const quoi = m.kind === "hero" ? "Héros légendaire" : m.rarity;
  const ou = [m.faction ? getFactionDisplayName(m.faction) : null, m.clan].filter(Boolean).join(" · ");
  return `${quoi}${ou ? ` — ${ou}` : ""}${m.print_number ? ` (n°${m.print_number}/${m.max_prints})` : ""}`;
}

export default function EssenceHistory() {
  const [etat, setEtat] = useState<{ essence: number; transactions: EssenceTransaction[] } | "indispo" | null>(null);

  useEffect(() => {
    fetch("/api/essence")
      .then((r) => (r.ok ? r.json() : "indispo"))
      .then(setEtat)
      .catch(() => setEtat("indispo"));
  }, []);

  if (etat === null) return <p className="text-center text-sm text-am-ink-3">Chargement…</p>;
  if (etat === "indispo") return <p className="text-center text-sm text-am-ink-3">L&apos;essence n&apos;est pas encore disponible.</p>;

  return (
    <div>
      <p className="mb-6 flex items-center justify-center gap-2 text-2xl font-bold text-violet-200">
        {etat.essence.toLocaleString("fr-FR")} <EssenceIcon size={22} />
      </p>
      {etat.transactions.length === 0 ? (
        <p className="text-center text-sm text-am-ink-3">Aucun mouvement d&apos;essence pour l&apos;instant.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {etat.transactions.map((tx) => {
            const rarete = (tx.metadata as { rarity?: string }).rarity;
            return (
              <li key={tx.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="text-am-ink-1">{LIBELLES[tx.type] ?? tx.type}</div>
                  <div
                    className="truncate text-xs text-am-ink-3"
                    style={tx.type === "craft" && rarete ? { color: RARITY_MAP[rarete]?.color } : undefined}
                  >
                    {detail(tx)}
                  </div>
                  <div className="text-[11px] text-am-ink-3">{new Date(tx.created_at).toLocaleString("fr-FR")}</div>
                </div>
                <div className={`shrink-0 font-semibold ${tx.amount < 0 ? "text-red-300" : "text-violet-200"}`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString("fr-FR")}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
