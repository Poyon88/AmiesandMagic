"use client";

// Briques visuelles des récompenses : prize pool, podium, tableau par
// victoires. Tout est rendu à partir des lignes calculées par
// src/lib/tournaments/rewards.ts — aucune valeur en dur ici.
import { useLocale, useTranslations } from "next-intl";
import EssenceIcon from "@/components/shared/EssenceIcon";
import type { PrizePool, RewardRow } from "@/lib/tournaments/rewards";
import { CreditIcon, GoldenTicketIcon } from "./RewardIcons";

/** 1234567 → « 1 234 567 » (espace fine insécable, stable serveur/client). */
export function nombre(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
const euros = (n: number) => `${nombre(n)} €`;

const Dash = () => <span className="text-am-ink-faint">—</span>;

function RankLabel({ label }: { label: string }) {
  // Les suffixes ordinaux sont propres au français : ailleurs, « 3–4 ».
  const locale = useLocale();
  if (locale !== "fr") return <>{label.replace(/er|e/g, "")}</>;
  // « 3e–4e » → exposants typographiques.
  return (
    <>
      {label.split(/(er|e)/).map((part, i) =>
        part === "er" || part === "e" ? <sup key={i} className="text-[0.7em]">{part}</sup> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

export function PrizePoolSummary({ pool, withCash }: { pool: PrizePool; withCash: boolean }) {
  const t = useTranslations("tournaments");
  return (
    <div className="rounded-xl border border-am-gold/40 bg-gradient-to-b from-am-gold/15 to-am-gold/[0.03] px-4 py-3">
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-am-gold-bright">
        {t("prize_pool")}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
        {withCash && pool.cash > 0 && (
          <Stat value={euros(pool.cash)} label={t("real_money")} className="text-3xl text-am-gold-bright" />
        )}
        {pool.goldenTickets > 0 && (
          <Stat
            value={<><GoldenTicketIcon size={26} /> {pool.goldenTickets}</>}
            label="Golden Ticket"
            className="text-3xl text-am-gold-bright"
          />
        )}
        <Stat
          value={<><CreditIcon size={20} /> {nombre(pool.credits)}</>}
          label={t("market_credits")}
          className="text-2xl text-am-azure"
        />
        <Stat
          value={<><EssenceIcon size={20} /> {nombre(pool.essence)}</>}
          label={t("essences")}
          className="text-2xl text-am-arcane-bright"
        />
      </div>
    </div>
  );
}

function Stat({ value, label, className }: { value: React.ReactNode; label: string; className: string }) {
  return (
    <div className="min-w-0">
      <b className={`flex items-center gap-1.5 whitespace-nowrap font-display font-bold leading-none tabular-nums ${className}`}>
        {value}
      </b>
      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-am-ink-faint">{label}</span>
    </div>
  );
}

/** Marches 2 / 1 / 3. Sans argent réel, la marche met l'essence en avant. */
export function Podium({ rows, withCash }: { rows: RewardRow[]; withCash: boolean }) {
  const t = useTranslations("tournaments");
  const [first, second, third] = rows;
  const order: Array<[RewardRow | undefined, 1 | 2 | 3]> = [[second, 2], [first, 1], [third, 3]];
  return (
    <div className="grid grid-cols-[1fr_1.18fr_1fr] items-end gap-2">
      {order.map(([r, place]) =>
        r ? (
          <div
            key={place}
            className={`min-w-0 overflow-hidden rounded-lg border text-center ${
              place === 1
                ? "border-am-gold/60 bg-am-bg-4 shadow-[0_0_22px_-6px_rgba(216,178,90,0.5)]"
                : "border-am-gold/15 bg-am-bg-3"
            }`}
          >
            <div
              className={`font-display text-[11px] font-bold tracking-widest ${
                place === 1 ? "bg-am-gold text-[#1a1408]" : "bg-am-ink-faint/40 text-am-bg-0"
              }`}
            >
              {place}
            </div>
            <div className={`px-1.5 ${place === 1 ? "py-4" : "py-2.5"}`}>
              <div className="font-display text-[10px] uppercase tracking-wider text-am-ink-faint">
                {t("wins_count", { count: r.wins })}
              </div>
              <div
                className={`my-1 whitespace-nowrap font-display font-bold leading-tight tabular-nums ${
                  place === 1 ? "text-xl" : "text-lg"
                } ${withCash ? "text-am-gold-bright" : "text-am-arcane-bright"}`}
              >
                {withCash ? (r.cash ? euros(r.cash) : "—") : (
                  <span className="inline-flex items-center gap-1"><EssenceIcon size={14} />{nombre(r.essence)}</span>
                )}
              </div>
              <div className="flex items-center justify-center gap-1 whitespace-nowrap text-[11px] font-semibold text-am-azure">
                <CreditIcon size={12} /> {t("credits_count", { count: nombre(r.credits) })}
              </div>
            </div>
          </div>
        ) : (
          <div key={place} />
        ),
      )}
    </div>
  );
}

/**
 * Tableau victoires → récompenses. `firstColumn` : "cash" (grand tournoi, si
 * l'argent est activé), "ticket" (qualification) ou rien.
 */
export function RewardTable({ rows, firstColumn }: { rows: RewardRow[]; firstColumn: "cash" | "ticket" | null }) {
  const t = useTranslations("tournaments");
  // Largeurs FIXES : en-tête et lignes sont des grilles distinctes, une
  // colonne `auto` n'aurait pas la même largeur partout.
  const cols =
    firstColumn === "cash"
      ? "grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_4.5rem]"
      : firstColumn === "ticket"
        ? "grid-cols-[minmax(0,1fr)_2.25rem_3.5rem_4.5rem] sm:grid-cols-[minmax(0,1fr)_7.5rem_3.5rem_4.5rem]"
        : "grid-cols-[minmax(0,1fr)_4rem_5rem]";
  return (
    <div className="text-sm">
      <div className={`grid ${cols} gap-1.5 border-b border-am-gold/15 px-2.5 pb-2 font-display text-[10px] font-bold uppercase tracking-widest text-am-ink-faint`}>
        <span>{t("col_wins")}</span>
        {firstColumn === "cash" && <span className="text-right">{t("col_money")}</span>}
        {firstColumn === "ticket" && <span className="text-right"><span className="hidden sm:inline">{t("col_reward")}</span></span>}
        <span className="text-right">{t("col_credits")}</span>
        <span className="text-right">{t("col_essence")}</span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">
        {rows.map((r) => (
          <div
            key={r.wins}
            className={`grid ${cols} items-center gap-1.5 rounded-md px-2.5 py-1.5 tabular-nums ${
              r.isChampion
                ? "bg-gradient-to-r from-am-gold/20 to-am-gold/[0.04] ring-1 ring-inset ring-am-gold/30"
                : "bg-white/[0.03]"
            }`}
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <b className="w-5 font-display text-base text-am-ink">{r.wins}</b>
              <em className="truncate text-xs not-italic text-am-ink-soft"><RankLabel label={r.rankLabel} /></em>
            </span>
            {firstColumn === "cash" && (
              <span className="text-right font-semibold text-am-gold-bright">{r.cash ? euros(r.cash) : <Dash />}</span>
            )}
            {firstColumn === "ticket" && (
              <span className="flex justify-end">
                {r.goldenTicket ? (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-am-gold/50 bg-am-gold/15 px-2 py-0.5 text-[11px] font-semibold text-am-gold-bright">
                    <GoldenTicketIcon size={13} /><span className="hidden sm:inline">Golden Ticket</span>
                  </span>
                ) : <Dash />}
              </span>
            )}
            <span className="text-right text-am-azure">{r.credits ? nombre(r.credits) : <Dash />}</span>
            <span className="text-right text-am-arcane-bright">{r.essence ? nombre(r.essence) : <Dash />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
