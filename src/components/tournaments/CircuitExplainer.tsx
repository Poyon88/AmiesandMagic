"use client";

// Le circuit en quatre étapes + les règles clés. Les chiffres viennent du
// barème (config.ts) pour ne jamais contredire les tableaux de récompenses.
import EssenceIcon from "@/components/shared/EssenceIcon";
import AmPanel from "@/components/ui/AmPanel";
import {
  CREDIT_LIFETIME_DAYS,
  FORGE_COST,
  GRAND_MIN_SIZE,
  QUALIFICATION_SIZE,
} from "@/lib/tournaments/config";
import { roundsFor } from "@/lib/tournaments/rewards";
import { CreditIcon, GoldenTicketIcon } from "./RewardIcons";
import { nombre } from "./RewardParts";

const TicketIcon = () => (
  <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden className="text-am-ink-soft">
    <path d="M3 6.5 H21 V10 A2 2 0 0 0 21 14 V17.5 H3 V14 A2 2 0 0 0 3 10 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M15.5 7 V17" stroke="currentColor" strokeWidth="1" strokeDasharray="1.3 1.3" />
  </svg>
);
const SwordsIcon = ({ className }: { className?: string }) => (
  <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden className={className}>
    <path d="M4 4 L14 14 M20 4 L10 14 M12.5 15.5 L8.5 19.5 M11.5 15.5 L15.5 19.5 M6 18 L4 20 M18 18 L20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
  </svg>
);
const CrownIcon = () => (
  <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden className="text-am-gold-bright">
    <path d="M3 8 L7.5 12 L12 5 L16.5 12 L21 8 L19 18 H5 Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M5 20.5 H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function CircuitExplainer() {
  const qualRounds = roundsFor(QUALIFICATION_SIZE);
  const steps = [
    { icon: <TicketIcon />, title: "Ticket de tournoi", text: "Acheté en boutique — un ticket gratuit mensuel est prévu pour les joueurs actifs." },
    {
      icon: <SwordsIcon className="text-am-arcane-bright" />,
      title: "Qualification",
      text: `${QUALIFICATION_SIZE} joueurs, élimination directe en ${qualRounds} manches, en direct dès que les ${QUALIFICATION_SIZE} sont prêts.`,
    },
    { icon: <GoldenTicketIcon size={30} />, title: "Golden Ticket", text: "Le vainqueur décroche sa place au grand tournoi mensuel." },
    { icon: <CrownIcon />, title: "Grand tournoi mensuel", text: "Les détenteurs de Golden Ticket s'affrontent, une manche à jouer avant chaque échéance." },
  ];

  const rules: Array<{ icon?: React.ReactNode; text: React.ReactNode }> = [
    { text: <>Les récompenses dépendent du <b>nombre de victoires</b>, pas du classement final : deux victoires rapportent la même chose dans tous les tableaux. Seul le champion touche davantage.</> },
    { text: <>Le grand tournoi se joue sur un tableau complet (16, 32, 64… joueurs). Les qualifiés en surplus sont <b>reportés en priorité</b> au mois suivant ; sous {GRAND_MIN_SIZE} qualifiés, toute l&apos;édition est reportée.</> },
    { icon: <GoldenTicketIcon size={16} />, text: <>Plusieurs Golden Tickets ? Une seule inscription par édition : les tickets en trop valent pour les éditions suivantes.</> },
    { icon: <SwordsIcon className="h-4 w-4 text-am-ember" />, text: <>Un joueur absent à l&apos;échéance perd par forfait ; si les deux sont absents, double forfait et leur prochain adversaire passe sans jouer.</> },
    { icon: <CreditIcon size={16} />, text: <>Les <b>crédits marché</b> servent à enchérir sur les éditions limitées et expirent {CREDIT_LIFETIME_DAYS} jours après leur gain.</> },
    { icon: <EssenceIcon size={16} />, text: <>L&apos;<b>essence</b> est permanente : {nombre(FORGE_COST)} essences = une forge d&apos;une carte limitée au hasard.</> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ol className="grid gap-3 md:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="relative">
            <AmPanel className="flex h-full flex-col items-center gap-2 p-4 text-center">
              <span className="font-display text-[10px] tracking-[0.3em] text-am-ink-faint">ÉTAPE {i + 1}</span>
              {s.icon}
              <b className="font-display text-sm text-am-gold">{s.title}</b>
              <p className="text-xs leading-relaxed text-am-ink-soft">{s.text}</p>
            </AmPanel>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-1/2 top-full z-10 -translate-x-1/2 text-am-gold/70 md:left-full md:top-1/2 md:-translate-y-1/2 md:translate-x-[-25%] md:-rotate-90"
              >
                ▼
              </span>
            )}
          </li>
        ))}
      </ol>

      <AmPanel className="p-5">
        <h3 className="font-display text-base text-am-gold">Comment ça marche</h3>
        <ul className="mt-3 grid gap-x-8 gap-y-3 text-sm text-am-ink-soft md:grid-cols-2">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-0.5 flex w-4 shrink-0 justify-center text-am-gold">{r.icon ?? "◆"}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </AmPanel>
    </div>
  );
}
