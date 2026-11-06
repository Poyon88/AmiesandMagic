"use client";

// Solde de crédits marché de l'en-tête — se charge lui-même, comme
// EssenceBadge. Invisible tant que la migration n'est pas appliquée (503) ou
// que le joueur n'a jamais eu de crédits : un « 0 » permanent n'apprend rien.
// Les écrans qui dépensent/remboursent annoncent le nouveau solde par
// `CREDITS_EVENT`.
import { useEffect, useState } from "react";
import Link from "next/link";
import CreditIcon from "@/components/shared/CreditIcon";
import type { CreditsSummary } from "@/lib/economy/types";

export const CREDITS_EVENT = "am:credits";

/** À appeler après tout mouvement de crédits côté client. */
export function announceCredits(balance: number) {
  window.dispatchEvent(new CustomEvent<number>(CREDITS_EVENT, { detail: balance }));
}

export default function CreditBadge() {
  const [etat, setEtat] = useState<{ balance: number; nextExpiry: CreditsSummary["nextExpiry"]; vu: boolean } | null>(null);

  useEffect(() => {
    let vivant = true;
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CreditsSummary | null) => {
        if (vivant && d && typeof d.balance === "number") {
          setEtat({ balance: d.balance, nextExpiry: d.nextExpiry, vu: d.grants.length > 0 });
        }
      })
      .catch(() => { /* reste masqué */ });
    const surMaj = (e: Event) =>
      setEtat((prev) => ({ balance: (e as CustomEvent<number>).detail, nextExpiry: prev?.nextExpiry ?? null, vu: true }));
    window.addEventListener(CREDITS_EVENT, surMaj);
    return () => { vivant = false; window.removeEventListener(CREDITS_EVENT, surMaj); };
  }, []);

  if (!etat || (!etat.vu && etat.balance === 0)) return null;

  const echeance = etat.nextExpiry
    ? ` — ${etat.nextExpiry.amount} expire${etat.nextExpiry.amount > 1 ? "nt" : ""} le ${new Date(etat.nextExpiry.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
    : "";

  return (
    <Link
      href="/compte/credits"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-am-bg-0/60 border border-sky-400/40 text-sm font-semibold text-sky-200"
      aria-label={`${etat.balance} crédits marché`}
      title={`Crédits marché — à utiliser aux enchères${echeance}`}
    >
      <CreditIcon size={14} />
      {etat.balance.toLocaleString("fr-FR")}
    </Link>
  );
}
