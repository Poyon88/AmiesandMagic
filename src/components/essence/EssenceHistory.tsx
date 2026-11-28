"use client";

// Historique des mouvements d'essence du joueur (/compte/essence).
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useVocab } from "@/i18n/useVocab";
import EssenceIcon from "@/components/shared/EssenceIcon";
import { RARITY_MAP } from "@/lib/card-engine/constants";
import type { EssenceTransaction } from "@/lib/economy/types";

export default function EssenceHistory() {
  const [etat, setEtat] = useState<{ essence: number; transactions: EssenceTransaction[] } | "indispo" | null>(null);
  const t = useTranslations("account");
  const tShop = useTranslations("shop");
  const vocab = useVocab();
  const locale = useLocale();
  // Chiffres latins partout : l'arabe garde 0-9 dans tout le jeu.
  const nombre = new Intl.NumberFormat(locale, { numberingSystem: "latn" });

  function detail(tx: EssenceTransaction): string | null {
    // La victoire du jour n'a rien à ajouter à son libellé : sa description
    // en base le répète, en français.
    if (tx.type === "reward_daily_win") return null;
    if (tx.type !== "craft") return tx.description;
    const m = tx.metadata as { kind?: string; rarity?: string; faction?: string; clan?: string; print_number?: number; max_prints?: number };
    const quoi = m.kind === "hero" ? tShop("odds_hero") : vocab.rarityLabel(m.rarity);
    const ou = [m.faction ? vocab.factionName(m.faction) : null, m.clan ? vocab.clanName(m.clan) : null].filter(Boolean).join(" · ");
    const numero = m.print_number ? ` ${t("print_ref", { n: m.print_number, max: m.max_prints ?? 0 })}` : "";
    return `${quoi}${ou ? ` — ${ou}` : ""}${numero}`;
  }

  useEffect(() => {
    fetch("/api/essence")
      .then((r) => (r.ok ? r.json() : "indispo"))
      .then(setEtat)
      .catch(() => setEtat("indispo"));
  }, []);

  if (etat === null) return <p className="text-center text-sm text-am-ink-3">{t("loading")}</p>;
  if (etat === "indispo") return <p className="text-center text-sm text-am-ink-3">{t("essence_unavailable")}</p>;

  return (
    <div>
      <p className="mb-6 flex items-center justify-center gap-2 text-2xl font-bold text-violet-200">
        {nombre.format(etat.essence)} <EssenceIcon size={22} />
      </p>
      {etat.transactions.length === 0 ? (
        <p className="text-center text-sm text-am-ink-3">{t("essence_empty")}</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {etat.transactions.map((tx) => {
            const rarete = (tx.metadata as { rarity?: string }).rarity;
            return (
              <li key={tx.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="text-am-ink-1">{t.has(`tx_${tx.type}`) ? t(`tx_${tx.type}`) : tx.type}</div>
                  <div
                    className="truncate text-xs text-am-ink-3"
                    style={tx.type === "craft" && rarete ? { color: RARITY_MAP[rarete]?.color } : undefined}
                  >
                    {detail(tx)}
                  </div>
                  <div className="text-[11px] text-am-ink-3">{new Date(tx.created_at).toLocaleString(locale, { numberingSystem: "latn" })}</div>
                </div>
                <div className={`shrink-0 font-semibold ${tx.amount < 0 ? "text-red-300" : "text-violet-200"}`}>
                  {tx.amount > 0 ? "+" : ""}{nombre.format(tx.amount)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
