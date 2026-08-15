"use client";

// Bouton d'inscription à un tournoi payant.
//
// Le prix affiché vient de la base et n'est QU'UN AFFICHAGE : le montant
// facturé est celui du Price Stripe, côté serveur. Ne jamais transmettre ce
// nombre à l'API — elle ne l'accepterait pas, et c'est voulu.
import { useState } from "react";
import { AmButton } from "@/components/ui/AmButton";

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

export default function TournamentSignup({
  tournamentId,
  entryPriceCents,
  seatsLeft,
  alreadyEntered,
}: {
  tournamentId: string;
  entryPriceCents: number;
  seatsLeft: number;
  alreadyEntered: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signup() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout/tournament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "L'inscription n'a pas pu être ouverte.");
        setPending(false);
        return;
      }
      // `assign` et non `location.href = …` : le compilateur React refuse
      // l'affectation d'une valeur définie hors du composant.
      window.location.assign(data.url);
    } catch {
      setError("L'inscription n'a pas pu être ouverte.");
      setPending(false);
    }
  }

  if (alreadyEntered) {
    return <p className="text-sm font-semibold text-emerald-400">Vous êtes inscrit.</p>;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <AmButton onClick={signup} disabled={pending || seatsLeft <= 0}>
        {seatsLeft <= 0
          ? "Complet"
          : pending
            ? "Redirection…"
            : `S'inscrire (${euros(entryPriceCents)})`}
      </AmButton>
      {seatsLeft > 0 && (
        <span className="text-xs text-am-ink-3">
          {seatsLeft} place{seatsLeft > 1 ? "s" : ""} restante{seatsLeft > 1 ? "s" : ""}
        </span>
      )}
      {error && <span className="text-xs text-red-400" role="alert">{error}</span>}
    </div>
  );
}
