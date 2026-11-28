"use client";

// Lots et historique des crédits marché (/compte/credits).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CREDIT_LIFETIME_DAYS } from "@/lib/tournaments/config";
import CreditIcon from "@/components/shared/CreditIcon";
import type { CreditGrant, CreditsSummary, CreditTransaction } from "@/lib/economy/types";

/** Date longue dans la langue du joueur, en chiffres latins (l'arabe garde
 *  0-9 dans tout le jeu). */
function useDate() {
  const locale = useLocale();
  return (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" });
}

function joursRestants(iso: string, now: number): number {
  return Math.ceil((Date.parse(iso) - now) / 86_400_000);
}

function Lot({ g, now }: { g: CreditGrant; now: number }) {
  const expire = Date.parse(g.expires_at) <= now;
  const reste = g.amount - g.spent;
  const j = joursRestants(g.expires_at, now);
  const t = useTranslations("account");
  const date = useDate();
  return (
    <li className={`rounded-lg border px-4 py-3 ${expire ? "border-white/5 opacity-50" : "border-sky-400/25 bg-sky-400/[0.04]"}`}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-sky-200">
          {expire ? t("lot_expired") : t("lot_remaining", { n: reste })} <span className="font-normal text-am-ink-faint">/ {g.amount}</span>
        </span>
        <span className={`text-xs ${!expire && j <= 3 ? "font-semibold text-am-ember" : "text-am-ink-faint"}`}>
          {expire
            ? t("lot_expired_on", { date: date(g.expires_at) })
            : j <= 3
              ? t("lot_expires_soon", { date: date(g.expires_at), days: Math.max(j, 0) })
              : t("lot_expires_on", { date: date(g.expires_at) })}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-am-azure" style={{ width: `${(reste / g.amount) * 100}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-am-ink-faint">{t("lot_received", { date: date(g.created_at), source: g.source === "tournament" ? t("source_tournament") : g.source })}</div>
    </li>
  );
}

function Mouvement({ tx }: { tx: CreditTransaction }) {
  const expires = Number((tx.metadata as { expired?: number }).expired ?? 0);
  const t = useTranslations("account");
  const locale = useLocale();
  return (
    <li className="flex items-center justify-between gap-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="text-am-ink">{t.has(`tx_${tx.type}`) ? t(`tx_${tx.type}`) : tx.type}</div>
        {tx.description && <div className="truncate text-xs text-am-ink-faint">{tx.description}</div>}
        {expires > 0 && <div className="text-xs text-am-ember">{t("credits_expired_meanwhile", { count: expires })}</div>}
        <div className="text-[11px] text-am-ink-faint">{new Date(tx.created_at).toLocaleString(locale, { numberingSystem: "latn" })}</div>
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
  const t = useTranslations("account");
  const locale = useLocale();
  const date = useDate();

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : "indispo"))
      .then((d) => { setNow(Date.now()); setEtat(d); })
      .catch(() => setEtat("indispo"));
  }, []);

  if (etat === null) return <p className="text-center text-sm text-am-ink-faint">{t("loading")}</p>;
  if (etat === "indispo") return <p className="text-center text-sm text-am-ink-faint">{t("credits_unavailable")}</p>;

  const actifs = etat.grants.filter((g) => g.spent < g.amount && Date.parse(g.expires_at) > now);
  const expires = etat.grants.filter((g) => Date.parse(g.expires_at) <= now && g.spent < g.amount);

  return (
    <div className="flex flex-col gap-10">
      <div className="text-center">
        <p className="flex items-center justify-center gap-2 text-3xl font-bold text-sky-200">
          {new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(etat.balance)} <CreditIcon size={26} />
        </p>
        {etat.nextExpiry && (
          <p className="mt-2 text-sm text-am-ink-soft">
            {t("next_expiry", { count: etat.nextExpiry.amount, date: date(etat.nextExpiry.at) })}
          </p>
        )}
        <p className="mt-3 text-xs text-am-ink-faint">
          {t.rich("credits_usage", {
            days: CREDIT_LIFETIME_DAYS,
            link: (chunks) => <Link href="/auction" className="underline hover:text-am-gold">{chunks}</Link>,
          })}
        </p>
      </div>

      <section>
        <h2 className="mb-3 font-display text-sm uppercase tracking-widest text-am-gold">{t("lots_active")}</h2>
        {actifs.length === 0 ? (
          <p className="text-sm text-am-ink-faint">{t("lots_none")}</p>
        ) : (
          <ul className="flex flex-col gap-2">{actifs.map((g) => <Lot key={g.id} g={g} now={now} />)}</ul>
        )}
        {expires.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-xs uppercase tracking-widest text-am-ink-faint">{t("lots_expired_recent")}</h3>
            <ul className="flex flex-col gap-2">{expires.map((g) => <Lot key={g.id} g={g} now={now} />)}</ul>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-display text-sm uppercase tracking-widest text-am-gold">{t("history")}</h2>
        {etat.transactions.length === 0 ? (
          <p className="text-sm text-am-ink-faint">{t("history_empty")}</p>
        ) : (
          <ul className="divide-y divide-white/5">{etat.transactions.map((tx) => <Mouvement key={tx.id} tx={tx} />)}</ul>
        )}
      </section>
    </div>
  );
}
