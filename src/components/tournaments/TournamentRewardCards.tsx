"use client";

// Cartes « récompenses » des deux tournois. Tout est recalculé depuis le
// barème (src/lib/tournaments/config.ts) : changer un chiffre là-bas met à
// jour prize pool, podium et tableau, sans image à régénérer.
import { useState } from "react";
import AmPanel from "@/components/ui/AmPanel";
import {
  CASH_PRIZES_ENABLED,
  GRAND_DEFAULT_SIZE,
  GRAND_PARTICIPATION_COSMETICS,
  GRAND_SIZES,
  QUALIFICATION_SIZE,
} from "@/lib/tournaments/config";
import { podium, prizePool, rewardTable, rewardedRows } from "@/lib/tournaments/rewards";
import { CosmeticIcon, GoldenTicketIcon } from "./RewardIcons";
import { nombre, Podium, PrizePoolSummary, RewardTable } from "./RewardParts";

function CardHeader({ tag, size, access, gold }: { tag: string; size: React.ReactNode; access: React.ReactNode; gold?: boolean }) {
  return (
    <header>
      <span
        className={`inline-block rounded border px-2.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] ${
          gold ? "border-am-gold/50 bg-am-gold/15 text-am-gold-bright" : "border-am-arcane/50 bg-am-arcane/15 text-am-arcane-bright"
        }`}
      >
        {tag}
      </span>
      <h3 className="mt-2 font-display text-4xl font-bold leading-none text-am-ink">{size}</h3>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-semibold text-am-ink-soft">
        {access}
      </p>
    </header>
  );
}

const Joueurs = ({ n }: { n: number }) => (
  <>
    {nombre(n)} <span className="text-base font-medium uppercase tracking-widest text-am-ink-faint">joueurs</span>
  </>
);

export function QualificationCard() {
  const rows = rewardTable("qualification", QUALIFICATION_SIZE);
  return (
    <AmPanel corners className="flex min-w-0 flex-col gap-4 p-5 ring-1 ring-am-gold/30">
      <CardHeader
        gold
        tag="Tournoi de qualification"
        size={<Joueurs n={QUALIFICATION_SIZE} />}
        access={<><span className="text-am-arcane-bright">◆</span> Accessible avec un ticket de tournoi</>}
      />
      <PrizePoolSummary pool={prizePool("qualification", QUALIFICATION_SIZE)} withCash={false} />
      <div className="flex items-center gap-3 rounded-xl border border-am-gold/40 bg-am-gold/10 px-4 py-3">
        <GoldenTicketIcon size={34} />
        <div>
          <b className="block font-display text-sm text-am-gold-bright">Le vainqueur remporte le Golden Ticket</b>
          <small className="text-xs text-am-ink-soft">La seule clé d&apos;entrée du grand tournoi mensuel</small>
        </div>
      </div>
      <RewardTable rows={rewardedRows(rows, false)} firstColumn="ticket" />
    </AmPanel>
  );
}

export function GrandTournamentCard({ initialSize = GRAND_DEFAULT_SIZE }: { initialSize?: number }) {
  const [size, setSize] = useState<number>(initialSize);
  const rows = rewardTable("grand", size);
  return (
    <AmPanel corners className="flex min-w-0 flex-col gap-4 p-5">
      <CardHeader
        tag="Grand tournoi mensuel"
        size={<Joueurs n={size} />}
        access={<><GoldenTicketIcon size={14} /> Accessible uniquement avec un Golden Ticket</>}
      />

      <div>
        <div className="mb-1.5 font-display text-[10px] uppercase tracking-widest text-am-ink-faint">
          Taille du tableau
        </div>
        <div role="radiogroup" aria-label="Taille du grand tournoi" className="flex flex-wrap gap-1.5">
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
          <b className="block font-display text-sm text-am-arcane-bright">{GRAND_PARTICIPATION_COSMETICS}</b>
          <small className="text-xs text-am-ink-soft">Pour chaque participant, quel que soit son résultat</small>
        </div>
      </div>
    </AmPanel>
  );
}
