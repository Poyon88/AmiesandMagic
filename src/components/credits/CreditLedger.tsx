"use client";

// Lots et historique des crédits marché (/compte/credits).
import { useEffect, useState } from "react";
import Link from "next/link";
import CreditIcon from "@/components/shared/CreditIcon";
import type { CreditGrant, CreditsSummary, CreditTransaction } from "@/lib/economy/types";

const LIBELLES: Record<string, string> = {
  admin_credit: "Crédit",
  admin_debit: "Débit",
  reward_tournament: "Récompense de tournoi",
  auction_escrow: "Mise aux enchères",
  auction_refund: "Remboursement de mise",
};

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function joursRestants(iso: string, now: number): number {
  return Math.ceil((Date.parse(iso) - now) / 86_400_000);
}

function Lot({ g, now }: { g: CreditGrant; now: number }) {
  const expire = Date.parse(g.expires_at) <= now;
  const reste = g.amount - g.spent;
  const j = joursRestants(g.expires_at, now);
  return (
    <li className={`rounded-lg border px-4 py-3 ${expire ? "border-white/5 opacity-50" : "border-sky-400/25 bg-sky-400/[0.04]"}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-sky-200">
          {expire ? "Expiré" : `Reste ${reste}`} <span className="font-normal text-am-ink-faint">/ {g.amount}</span>
        </span>
        <span className={`text-xs ${!expire && j <= 3 ? "font-semibold text-am-ember" : "text-am-ink-faint"}`}>
          {expire ? `le ${date(g.expires_at)}` : `expire le ${date(g.expires_at)}${j <= 3 ? ` (J−${Math.max(j, 0)})` : ""}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-am-azure" style={{ width: `${(reste / g.amount) * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-am-ink-faint">Reçu le {date(g.created_at)} · {g.source === "tournament" ? "tournoi" : g.source}</div>
    </li>
  );
}

function Mouvement({ tx }: { tx: CreditTransaction }) {
  const expires = Number((tx.metadata as { expired?: number }).expired ?? 0);
  return (
    <li className="flex items-center justify-between gap-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="text-am-ink">{LIBELLES[tx.type] ?? tx.type}</div>
        {tx.description && <div className="truncate text-xs text-am-ink-faint">{tx.description}</div>}
        {expires > 0 && <div className="text-xs text-am-ember">{expires} crédit{expires > 1 ? "s" : ""} expiré{expires > 1 ? "s" : ""} entre-temps</div>}
        <div className="text-[11px] text-am-ink-faint">{new Date(tx.created_at).toLocaleString("fr-FR")}</div>
      </div>
      <div className={`shrink-0 font-semibold ${tx.amount < 0 ? "text-red-300" : "text-sky-200"}`}>
        {tx.amount > 0 ? "+" : ""}{tx.amount}
      </div>
    </li>
  );
}

export default function CreditLedger() {
  const [etat, setEtat] = useState<CreditsSummary | "indispo" | null>(null);
  // Instant de référence figé au chargement (le rendu doit rester pur).
  const [now, setNow] = useState(0);

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : "indispo"))
      .then((d) => { setNow(Date.now()); setEtat(d); })
      .catch(() => setEtat("indispo"));
  }, []);

  if (etat === null) return <p className="text-center text-sm text-am-ink-faint">Chargement…</p>;
  if (etat === "indispo") return <p className="text-center text-sm text-am-ink-faint">Les crédits marché ne sont pas encore disponibles.</p>;

  const actifs = etat.grants.filter((g) => g.spent < g.amount && Date.parse(g.expires_at) > now);
  const expires = etat.grants.filter((g) => Date.parse(g.expires_at) <= now && g.spent < g.amount);

  return (
    <div className="flex flex-col gap-10">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-3xl font-bold text-sky-200">
          {etat.balance.toLocaleString("fr-FR")} <CreditIcon size={26} />
        </p>
        {etat.nextExpiry && (
          <p className="mt-2 text-sm text-am-ink-soft">
            Prochaine échéance : {etat.nextExpiry.amount} crédit{etat.nextExpiry.amount > 1 ? "s" : ""} le {date(etat.nextExpiry.at)}
          </p>
        )}
        <p className="mt-3 text-xs text-am-ink-faint">
          Utilisables sur les <Link href="/auction" className="underline hover:text-am-gold">enchères des éditions limitées</Link>,
          toujours avant l&apos;or. Chaque lot expire 30 jours après son gain.
        </p>
      </div>

      <section>
        <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-am-gold">Lots actifs</h2>
        {actifs.length === 0 ? (
          <p className="text-sm text-am-ink-faint">Aucun lot actif. Les tournois rapportent des crédits marché.</p>
        ) : (
          <ul className="flex flex-col gap-2">{actifs.map((g) => <Lot key={g.id} g={g} now={now} />)}</ul>
        )}
        {expires.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-xs uppercase tracking-widest text-am-ink-faint">Expirés récemment</h3>
            <ul className="flex flex-col gap-2">{expires.map((g) => <Lot key={g.id} g={g} now={now} />)}</ul>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-display text-sm uppercase tracking-widest text-am-gold">Historique</h2>
        {etat.transactions.length === 0 ? (
          <p className="text-sm text-am-ink-faint">Aucun mouvement pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-white/5">{etat.transactions.map((tx) => <Mouvement key={tx.id} tx={tx} />)}</ul>
        )}
      </section>
    </div>
  );
}
