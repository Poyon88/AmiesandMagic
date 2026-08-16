"use client";

// Boutique de TICKETS de tournoi.
//
// Un ticket est un bien détenu : on l'achète ici, on le garde jusqu'à un an, et
// on le dépense dans le tournoi de son choix. Comme pour l'or, ce composant
// n'envoie qu'un code de pack — aucun montant ne part du navigateur.
import { useEffect, useState } from "react";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton } from "@/components/ui/AmButton";

interface PublicTicketPack {
  code: string;
  label: string;
  tickets: number;
  displayPriceCents: number;
}

interface TicketState {
  available: number;
  debt: number;
  tickets: { id: string; last_day: string }[];
}

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

const jour = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function TicketShop({ packs }: { packs: PublicTicketPack[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<TicketState | null>(null);

  useEffect(() => {
    fetch("/api/tickets")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
  }, []);

  async function buy(code: string) {
    setPending(code);
    setError(null);
    try {
      const res = await fetch("/api/checkout/ticket-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_code: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Le paiement n'a pas pu être ouvert.");
        setPending(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Le paiement n'a pas pu être ouvert.");
      setPending(null);
    }
  }

  // Le ticket qui périme le PLUS TÔT : c'est celui qui sera dépensé en premier,
  // et c'est donc la seule échéance qui intéresse vraiment le joueur.
  const prochain = state?.tickets?.[0];

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <AmHeading
        eyebrow="Tournois"
        subtitle="Un ticket ouvre l'entrée d'un tournoi, au choix, pendant un an."
      >
        Tickets de tournoi
      </AmHeading>

      {state && state.debt > 0 && (
        <AmPanel className="mt-8 border border-red-500/40 p-5">
          <p className="text-sm text-red-300">
            Un remboursement a laissé <strong>{state.debt} ticket{state.debt > 1 ? "s" : ""}</strong> à
            régulariser. Vos inscriptions sont bloquées, et votre prochain achat servira d&apos;abord
            à solder ce reliquat.
          </p>
        </AmPanel>
      )}

      {state && (
        <p className="mt-6 text-center text-sm text-am-ink-2">
          Vous détenez <strong className="text-am-gold">{state.available}</strong> ticket
          {state.available > 1 ? "s" : ""}
          {prochain && <> — le premier à expirer est valable jusqu&apos;au {jour(prochain.last_day)}.</>}
        </p>
      )}

      {error && <p className="mt-6 text-center text-sm text-red-300" role="alert">{error}</p>}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {packs.map((p) => (
          <AmPanel key={p.code} corners className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="font-display text-sm uppercase tracking-[0.24em] text-am-arcane-bright/80">
              {p.label}
            </span>
            <span className="text-4xl font-bold text-am-gold">
              {p.tickets} 🎟️
            </span>
            <span className="text-lg text-am-ink-2">{euros(p.displayPriceCents)}</span>
            {p.tickets > 1 && (
              <span className="text-xs text-am-ink-3">
                soit {euros(Math.round(p.displayPriceCents / p.tickets))} le ticket
              </span>
            )}
            <AmButton onClick={() => buy(p.code)} disabled={pending !== null} className="mt-2 w-full">
              {pending === p.code ? "Redirection…" : "Acheter"}
            </AmButton>
          </AmPanel>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-am-ink-3">
        Chaque ticket est valable <strong>365 jours</strong> à compter de l&apos;achat. Il n&apos;est ni
        transférable, ni revendable, ni convertible en euros. Un ticket dépensé dans un tournoi qui
        est ensuite annulé vous est rendu, avec sa date d&apos;expiration d&apos;origine.
      </p>
    </section>
  );
}
