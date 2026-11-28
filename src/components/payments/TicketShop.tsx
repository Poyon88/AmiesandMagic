"use client";

// Boutique de TICKETS de tournoi.
//
// Un ticket est un bien détenu : on l'achète ici, on le garde jusqu'à un an, et
// on le dépense dans le tournoi de son choix. Comme pour l'or, ce composant
// n'envoie qu'un code de pack — aucun montant ne part du navigateur.
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton } from "@/components/ui/AmButton";
import { GeoNotice, useGeo } from "@/components/shared/GeoProvider";
import AdultConfirm from "@/components/shared/AdultConfirm";
import WithdrawalWaiverConfirm from "@/components/shared/WithdrawalWaiverConfirm";

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

export default function TicketShop({ packs }: { packs: PublicTicketPack[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("shop");
  const locale = useLocale();
  // Chiffres latins partout : l'arabe garde 0-9 dans tout le jeu.
  const euros = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", numberingSystem: "latn" }).format(cents / 100);
  const jour = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" });
  const gras = { b: (chunks: React.ReactNode) => <strong>{chunks}</strong> };
  const geo = useGeo();
  const ouvert = geo.features.tickets;
  // Achat mis en attente par la déclaration de majorité : relancé une fois
  // celle-ci enregistrée.
  const [majorite, setMajorite] = useState<{ code: string; minAge: number } | null>(null);
  // Pack dont l'achat attend l'accord sur le crédit immédiat (renonciation au
  // droit de rétractation). Demandé à CHAQUE achat : `buy` n'est appelé qu'après.
  const [accord, setAccord] = useState<string | null>(null);
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
        body: JSON.stringify({ pack_code: code, withdrawal_waiver: true }),
      });
      const data = await res.json();
      if (data.code === "age_required") {
        setMajorite({ code, minAge: data.minAge ?? geo.minAge });
        setPending(null);
        return;
      }
      if (!res.ok || !data.url) {
        setError(data.error ?? t("payment_error"));
        setPending(null);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError(t("payment_error"));
      setPending(null);
    }
  }

  // Le ticket qui périme le PLUS TÔT : c'est celui qui sera dépensé en premier,
  // et c'est donc la seule échéance qui intéresse vraiment le joueur.
  const prochain = state?.tickets?.[0];

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <AmHeading
        eyebrow={t("tickets_eyebrow")}
        subtitle={t("tickets_subtitle")}
      >
        {t("tickets_title")}
      </AmHeading>

      {state && state.debt > 0 && (
        <AmPanel className="mt-8 border border-red-500/40 p-5">
          <p className="text-sm text-red-300">
            {t.rich("ticket_debt", { ...gras, count: state.debt })}
          </p>
        </AmPanel>
      )}

      {state && (
        <p className="mt-6 text-center text-sm text-am-ink-2">
          {t.rich(prochain ? "tickets_held_expiry" : "tickets_held", {
            b: (chunks) => <strong className="text-am-gold">{chunks}</strong>,
            count: state.available,
            date: prochain ? jour(prochain.last_day) : "",
          })}
        </p>
      )}

      {error && <p className="mt-6 text-center text-sm text-red-300" role="alert">{error}</p>}

      {!ouvert && <GeoNotice className="mx-auto mt-8 max-w-xl" />}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {packs.map((p) => (
          <AmPanel key={p.code} corners className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="font-display text-sm uppercase tracking-[0.24em] text-am-arcane-bright/80">
              {t.has(`pack_${p.code}`) ? t(`pack_${p.code}`) : p.label}
            </span>
            <span className="text-4xl font-bold text-am-gold">
              {p.tickets} 🎟️
            </span>
            <span className="text-lg text-am-ink-2">{euros(p.displayPriceCents)}</span>
            {p.tickets > 1 && (
              <span className="text-xs text-am-ink-3">
                {t("per_ticket", { price: euros(Math.round(p.displayPriceCents / p.tickets)) })}
              </span>
            )}
            {ouvert && (
              <AmButton onClick={() => setAccord(p.code)} disabled={pending !== null} className="mt-2 w-full">
                {pending === p.code ? t("redirecting") : t("buy")}
              </AmButton>
            )}
          </AmPanel>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-am-ink-3">
        {t.rich("tickets_note", gras)}
      </p>
      {accord && (
        <WithdrawalWaiverConfirm
          onCancel={() => setAccord(null)}
          onConfirmed={() => { const code = accord; setAccord(null); void buy(code); }}
        />
      )}
      {majorite && (
        <AdultConfirm
          minAge={majorite.minAge}
          onCancel={() => setMajorite(null)}
          onConfirmed={() => { const { code } = majorite; setMajorite(null); void buy(code); }}
        />
      )}
    </section>
  );
}
