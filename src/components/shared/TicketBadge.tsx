"use client";

// Tickets de tournoi disponibles, dans l'en-tête — se charge lui-même, comme
// EssenceBadge et CreditBadge. Masqué tant que le joueur n'a ni ticket ni
// dette de tickets : un « 0 » permanent n'apprend rien. L'inscription à un
// tournoi recharge la page, le compte est donc relu à la source.
import { useEffect, useState } from "react";
import Link from "next/link";

interface TicketsResponse {
  available: number;
  debt: number;
  tickets: { last_day: string }[];
}

function TicketIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        d="M3 6.5 H21 V10 A2 2 0 0 0 21 14 V17.5 H3 V14 A2 2 0 0 0 3 10 Z"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15.5 7 V17" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.4 1.4" />
    </svg>
  );
}

export default function TicketBadge() {
  const [etat, setEtat] = useState<TicketsResponse | null>(null);

  useEffect(() => {
    let vivant = true;
    fetch("/api/tickets")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TicketsResponse | null) => {
        if (vivant && d && typeof d.available === "number") setEtat(d);
      })
      .catch(() => { /* reste masqué */ });
    return () => { vivant = false; };
  }, []);

  if (!etat || (etat.available === 0 && etat.debt === 0)) return null;

  const prochain = etat.tickets[0]?.last_day;
  const echeance = prochain
    ? ` — le prochain expire le ${new Date(prochain).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
    : "";

  return (
    <Link
      href="/boutique"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-am-bg-0/60 border text-sm font-semibold text-amber-200 ${
        etat.debt > 0 ? "border-red-500/60" : "border-amber-400/40"
      }`}
      aria-label={`${etat.available} ticket${etat.available > 1 ? "s" : ""} de tournoi`}
      title={
        etat.debt > 0
          ? `Dette de ${etat.debt} ticket${etat.debt > 1 ? "s" : ""} de tournoi`
          : `Tickets de tournoi${echeance}`
      }
    >
      <TicketIcon />
      {etat.available.toLocaleString("fr-FR")}
      {etat.debt > 0 && <span className="text-xs text-red-400">−{etat.debt}</span>}
    </Link>
  );
}
