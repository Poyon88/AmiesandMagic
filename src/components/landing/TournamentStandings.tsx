"use client";

// Visuel « classement final » du bloc tournois de la page de garde. Il
// remplace une image fixe (leaderboard générique en anglais, en dollars) par
// le vrai barème du grand tournoi, dans le style de la page /tournois :
// mêmes montants, mêmes couleurs (or = argent, azur = crédits, arcane =
// essence), traduit, et à jour dès qu'un chiffre change dans
// src/lib/tournaments/config.ts.
//
// Les JOUEURS sont fictifs — c'est une vitrine. Chacun porte une faction, dont
// le portrait de héros sert d'avatar.
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FACTIONS } from "@/lib/card-engine/constants";
import { GRAND_DEFAULT_SIZE } from "@/lib/tournaments/config";
import { prizePool, rewardTable, type RewardRow } from "@/lib/tournaments/rewards";
import { useCashPrizes } from "@/components/shared/GeoProvider";
import EssenceIcon from "@/components/shared/EssenceIcon";
import { CreditIcon } from "@/components/tournaments/RewardIcons";
import { nombre } from "@/components/tournaments/RewardParts";

/** Huit joueurs de démonstration, du 1er au 8e. */
const JOUEURS: Array<{ pseudo: string; faction: string }> = [
  { pseudo: "Sylvanor", faction: "Elfes" },
  { pseudo: "Nyx_Abyssale", faction: "Elfes Noirs" },
  { pseudo: "LameDeJade", faction: "EmpireDuMilieu" },
  { pseudo: "Kragmar", faction: "Nains" },
  { pseudo: "SoleilNoir", faction: "RoyaumesDuSoleil" },
  { pseudo: "Morgrath", faction: "Morts-Vivants" },
  { pseudo: "Aube_Ardente", faction: "Humains" },
  { pseudo: "Crocsauvage", faction: "Hommes-Bêtes" },
];

/** Dimensions de dessin ; le tout est mis à l'échelle du cadre. */
const LARGEUR = 560;
const HAUTEUR = 448;

const euros = (n: number) => `${nombre(n)} €`;

/** Récompense de la place `p` (1-indexée) : 1er, 2e, 3e–4e, 5e–8e… */
function recompensePourPlace(rows: RewardRow[], p: number): RewardRow {
  let fin = 0;
  for (const r of rows) {
    fin += r.players;
    if (p <= fin) return r;
  }
  return rows[rows.length - 1];
}

function Rang({ n }: { n: number }) {
  const locale = useLocale();
  if (locale !== "fr") return <>{n}</>;
  return <>{n}<sup className="font-sans text-[0.6em] normal-case">{n === 1 ? "er" : "e"}</sup></>;
}

function Avatar({ url, couleur, taille }: { url?: string; couleur: string; taille: number }) {
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full bg-am-bg-3"
      style={{
        width: taille,
        height: taille,
        boxShadow: `0 0 0 2px ${couleur}, 0 0 10px -2px ${couleur}`,
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    />
  );
}

export default function TournamentStandings({
  factionHeroUrls,
  factionNames,
}: {
  factionHeroUrls?: Record<string, string>;
  factionNames?: Record<string, { displayName?: string }>;
}) {
  const t = useTranslations("tournaments");
  const tl = useTranslations("landing");
  const cash = useCashPrizes();
  const rows = rewardTable("grand", GRAND_DEFAULT_SIZE);
  const pool = prizePool("grand", GRAND_DEFAULT_SIZE);
  const places = JOUEURS.map((j, i) => {
    const def = FACTIONS[j.faction];
    return {
      ...j,
      place: i + 1,
      reward: recompensePourPlace(rows, i + 1),
      couleur: def?.color ?? "#c8a84e",
      // Teinte d'ACCENT pour le texte : la couleur de base de certaines
      // factions (Légions du Chaos) est illisible sur ce fond sombre.
      teinte: def?.accent ?? def?.color ?? "#c8a84e",
      nomFaction: factionNames?.[j.faction]?.displayName ?? def?.displayName ?? j.faction,
      avatar: factionHeroUrls?.[j.faction],
    };
  });
  const [premier, second, troisieme] = places;
  const suite = places.slice(3);

  // Mise à l'échelle du dessin dans le cadre (même principe que la carte du
  // bloc « lisibilité ») : le visuel garde ses proportions à toute largeur.
  const ref = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setEchelle(Math.min(1.25, (width * 0.92) / LARGEUR, (height * 0.92) / HAUTEUR));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative flex h-full w-full items-center justify-center">
      <div
        aria-label={`${t("grand_title")} — ${tl("f4_standings")}`}
        role="img"
        className="flex shrink-0 flex-col gap-3 rounded-2xl border border-am-gold/25 bg-am-bg-1/90 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
        style={{ width: LARGEUR, height: HAUTEUR, transform: `scale(${echelle})` }}
      >
        {/* En-tête : titre + prize pool */}
        <div className="flex items-center justify-between gap-4 rounded-xl border border-am-gold/40 bg-gradient-to-b from-am-gold/15 to-am-gold/[0.03] px-4 py-2.5">
          <div className="min-w-0">
            <div className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-am-gold-bright">
              {tl("f4_standings")}
            </div>
            <div className="mt-0.5 truncate font-display text-base font-bold text-am-ink">
              {t("grand_title")} · {nombre(GRAND_DEFAULT_SIZE)} {t("players")}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-[9px] font-bold uppercase tracking-[0.22em] text-am-ink-faint">
              {t("prize_pool")}
            </div>
            <div className="font-display text-2xl font-bold leading-none tabular-nums text-am-gold-bright">
              {cash && pool.cash > 0 ? euros(pool.cash) : nombre(pool.credits)}
            </div>
          </div>
        </div>

        {/* Podium 2 / 1 / 3 */}
        <div className="grid grid-cols-[1fr_1.18fr_1fr] items-end gap-2">
          {([[second, 2], [premier, 1], [troisieme, 3]] as const).map(([j, place]) => (
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
              <div className={`flex flex-col items-center px-1.5 ${place === 1 ? "py-2.5" : "py-2"}`}>
                <Avatar url={j.avatar} couleur={j.couleur} taille={place === 1 ? 40 : 32} />
                <div className="mt-1 max-w-full truncate font-display text-[13px] font-bold text-am-ink">{j.pseudo}</div>
                <div className="max-w-full truncate text-[9px] uppercase tracking-wider" style={{ color: j.teinte }}>
                  {j.nomFaction}
                </div>
                <div
                  className={`mt-1 whitespace-nowrap font-display font-bold leading-tight tabular-nums text-am-gold-bright ${
                    place === 1 ? "text-lg" : "text-base"
                  }`}
                >
                  {cash && j.reward.cash ? euros(j.reward.cash) : "—"}
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-am-azure">
                  <CreditIcon size={11} /> {t("credits_count", { count: nombre(j.reward.credits) })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Suite du classement */}
        <div className="flex min-h-0 flex-1 flex-col text-[12px]">
          <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_3.5rem_3.75rem] gap-1.5 border-b border-am-gold/15 px-2.5 pb-1.5 font-display text-[9px] font-bold uppercase tracking-widest text-am-ink-faint">
            <span />
            <span />
            {cash ? <span className="text-right">{t("col_money")}</span> : <span />}
            <span className="text-right">{t("col_credits")}</span>
            <span className="text-right">{t("col_essence")}</span>
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            {suite.map((j) => (
              <div
                key={j.place}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_3.5rem_3.75rem] items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 py-1 tabular-nums"
              >
                <b className="font-display text-sm text-am-ink"><Rang n={j.place} /></b>
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar url={j.avatar} couleur={j.couleur} taille={18} />
                  <span className="truncate font-semibold text-am-ink">{j.pseudo}</span>
                  <span className="hidden truncate text-[9px] uppercase tracking-wider sm:inline" style={{ color: j.teinte }}>
                    {j.nomFaction}
                  </span>
                </span>
                <span className="text-right font-semibold text-am-gold-bright">
                  {cash && j.reward.cash ? euros(j.reward.cash) : "—"}
                </span>
                <span className="text-right text-am-azure">{nombre(j.reward.credits)}</span>
                <span className="flex items-center justify-end gap-1 text-am-arcane-bright">
                  <EssenceIcon size={11} />{nombre(j.reward.essence)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
