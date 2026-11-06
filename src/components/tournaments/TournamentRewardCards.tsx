"use client";

// Cartes « récompenses » des deux tournois. Tout est recalculé depuis le
// barème (src/lib/tournaments/config.ts) : changer un chiffre là-bas met à
// jour prize pool, podium et tableau, sans image à régénérer.
import { useState } from "react";
import { useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import {
  CASH_PRIZES_ENABLED,
  GRAND_DEFAULT_SIZE,
  GRAND_SIZES,
  QUALIFICATION_SIZE,
} from "@/lib/tournaments/config";
import { podium, prizePool, rewardTable, rewardedRows } from "@/lib/tournaments/rewards";
import { CosmeticIcon, GoldenTicketIcon } from "./RewardIcons";
import { nombre, Podium, PrizePoolSummary, RewardTable } from "./RewardParts";

function CardHeader({ tag, size, access, gold }: { tag: string; size: React.ReactNode; access: React.ReactNode; gold?: boolean }) {
  return (
    <header>
      <h3
        className={`font-display text-2xl font-bold leading-tight tracking-wide md:text-3xl ${
          gold ? "text-am-gold-bright" : "text-am-arcane-bright"
        }`}
      >
        {tag}
      </h3>
      <p className="mt-2 font-display text-2xl font-bold leading-none text-am-ink">{size}</p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-semibold text-am-ink-soft">
        {access}
      </p>
    </header>
  );
}

function Joueurs({ n }: { n: number }) {
  const t = useTranslations("tournaments");
  return (
    <>
      {nombre(n)} <span className="text-sm font-medium uppercase tracking-widest text-am-ink-faint">{t("players")}</span>
    </>
  );
}

export function QualificationCard() {
  const t = useTranslations("tournaments");
  const rows = rewardTable("qualification", QUALIFICATION_SIZE);
  return (
    <AmPanel corners className="flex min-w-0 flex-col gap-4 p-5 ring-1 ring-am-gold/30">
      <CardHeader
        gold
        tag={t("qualification_title")}
        size={<Joueurs n={QUALIFICATION_SIZE} />}
        access={<><span className="text-am-arcane-bright">◆</span> {t("access_ticket")}</>}
      />
      <PrizePoolSummary pool={prizePool("qualification", QUALIFICATION_SIZE)} withCash={false} />
      <div className="flex items-center gap-3 rounded-xl border border-am-gold/40 bg-am-gold/10 px-4 py-3">
        <GoldenTicketIcon size={34} />
        <div>
          <b className="block font-display text-sm text-am-gold-bright">{t("winner_golden_title")}</b>
          <small className="text-xs text-am-ink-soft">{t("winner_golden_desc")}</small>
        </div>
      </div>
      <RewardTable rows={rewardedRows(rows, false)} firstColumn="ticket" />
    </AmPanel>
  );
}

export function GrandTournamentCard({ initialSize = GRAND_DEFAULT_SIZE }: { initialSize?: number }) {
  const t = useTranslations("tournaments");
  const [size, setSize] = useState<number>(initialSize);
  const rows = rewardTable("grand", size);
  return (
    <AmPanel corners className="flex min-w-0 flex-col gap-4 p-5">
      <CardHeader
        tag={t("grand_title")}
        size={<Joueurs n={size} />}
        access={<><GoldenTicketIcon size={14} /> {t("access_golden")}</>}
      />

      <div>
        <div className="mb-1.5 font-display text-[10px] uppercase tracking-widest text-am-ink-faint">
          {t("bracket_size")}
        </div>
        <div role="radiogroup" aria-label={t("bracket_size_aria")} className="flex flex-wrap gap-1.5">
          {GRAND_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === size}
              onClick={() => setSize(s)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors ${
                s === size
                  ? "border-am-gold bg-am-gold text-[#1a1408]"
                  : "border-am-gold/25 text-am-ink-soft hover:border-am-gold/60 hover:text-am-ink"
              }`}
            >
              {nombre(s)}
            </button>
          ))}
        </div>
      </div>

      <PrizePoolSummary pool={prizePool("grand", size)} withCash={CASH_PRIZES_ENABLED} />
      <Podium rows={podium("grand", size)} withCash={CASH_PRIZES_ENABLED} />
      <RewardTable rows={rewardedRows(rows, CASH_PRIZES_ENABLED)} firstColumn={CASH_PRIZES_ENABLED ? "cash" : null} />

      <div className="flex items-center gap-3 rounded-xl border border-am-arcane/40 bg-am-arcane/10 px-4 py-3">
        <CosmeticIcon size={26} className="text-am-arcane-bright" />
        <div>
          <b className="block font-display text-sm text-am-arcane-bright">{t("participation_rewards")}</b>
          <small className="text-xs text-am-ink-soft">{t("participation_desc")}</small>
        </div>
      </div>
    </AmPanel>
  );
}
