"use client";

// Inscription à un tournoi PAR TICKET.
//
// Aucun paiement ici : l'argent est entré à l'achat du ticket, et l'inscription
// ne fait que le dépenser. Le bouton n'ouvre donc jamais Stripe — c'est ce
// découplage qui a supprimé le cas « tournoi rempli pendant le paiement ».
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { AmButton } from "@/components/ui/AmButton";
import { GeoNotice, useGeo } from "@/components/shared/GeoProvider";

export default function TournamentSignup({
  tournamentId,
  requiresTicket,
  seatsLeft,
  alreadyEntered,
  ticketsAvailable,
  ticketDebt,
}: {
  tournamentId: string;
  requiresTicket: boolean;
  seatsLeft: number;
  alreadyEntered: boolean;
  ticketsAvailable: number;
  ticketDebt: number;
}) {
  const t = useTranslations("tournaments");
  const geo = useGeo();
  const [pending, setPending] = useState(false);
  const [entered, setEntered] = useState(alreadyEntered);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("signup_error"));
        setPending(false);
        return;
      }
      // Inscription confirmée par le serveur. On rafraîchit la page pour que le
      // décompte des places et le nombre de tickets restants soient relus à la
      // source plutôt que devinés ici.
      setEntered(true);
      window.location.reload();
    } catch {
      setError(t("signup_error"));
      setPending(false);
    }
  }

  if (entered) {
    return <p className="text-sm font-semibold text-emerald-400">{t("signup_done")}</p>;
  }

  // Tournois à ticket fermés dans ce pays : inutile d'envoyer à la boutique.
  if (requiresTicket && !geo.features.tickets) {
    return <GeoNotice className="max-w-xs" />;
  }

  if (seatsLeft <= 0) {
    return <p className="text-sm text-am-ink-3">{t("signup_full")}</p>;
  }

  // Dette : on n'affiche pas un bouton qui va forcément échouer.
  if (requiresTicket && ticketDebt > 0) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-sm text-red-400">{t("signup_blocked")}</p>
        <Link href="/boutique" className="text-xs text-am-ink-3 underline">
          {t("signup_debt", { count: ticketDebt })}
        </Link>
      </div>
    );
  }

  // Sans ticket, on envoie à la boutique plutôt que de laisser cliquer dans le
  // vide.
  if (requiresTicket && ticketsAvailable <= 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Link href="/boutique" className="am-btn am-btn-gold am-btn-sheen px-6 py-3 text-sm">
          {t("signup_get_ticket")}
        </Link>
        <span className="text-xs text-am-ink-3">{t("signup_no_ticket")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <AmButton onClick={enter} disabled={pending}>
        {pending
          ? t("signup_pending")
          : requiresTicket
            ? t("signup_with_ticket")
            : t("signup_free")}
      </AmButton>
      <span className="text-xs text-am-ink-3">
        {t("signup_seats", { count: seatsLeft })}
        {requiresTicket && ` · ${t("signup_tickets_in_hand", { count: ticketsAvailable })}`}
      </span>
      {error && <span className="text-xs text-red-400" role="alert">{error}</span>}
    </div>
  );
}
