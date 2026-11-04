"use client";

// Forge d'ESSENCE — section de la boutique.
//
// Le coût affiché vient des constantes, mais c'est `craft_with_essence` qui
// tranche : un solde insuffisant est refusé côté serveur quoi qu'affiche le
// bouton. Les chances sont publiées telles qu'appliquées par le SQL.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton } from "@/components/ui/AmButton";
import EssenceIcon from "@/components/shared/EssenceIcon";
import { announceEssence } from "@/components/shared/EssenceBadge";
import EssenceReveal from "@/components/essence/EssenceReveal";
import { ESSENCE_CRAFT_COST, ESSENCE_CRAFT_ODDS } from "@/lib/economy/constants";
import { RARITY_MAP } from "@/lib/card-engine/constants";
import type { CraftResult } from "@/lib/economy/types";

export default function EssenceForge() {
  const [essence, setEssence] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CraftResult | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/essence");
      if (res.ok) setEssence((await res.json()).essence ?? 0);
    } catch {
      /* section masquée */
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function forger() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/essence/craft", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "La forge a échoué.");
        if (typeof data.essence === "number") setEssence(data.essence);
        return;
      }
      const r = data as CraftResult;
      setEssence(r.essence);
      announceEssence(r.essence);
      setResult(r);
    } catch {
      setError("La forge a échoué.");
    } finally {
      setPending(false);
    }
  }

  // Migration absente : rien à proposer.
  if (essence === null) return null;

  const pret = essence >= ESSENCE_CRAFT_COST;
  const progression = Math.min(1, essence / ESSENCE_CRAFT_COST);

  return (
    <section id="forge" className="mx-auto max-w-5xl scroll-mt-28 px-4 py-12">
      <AmHeading
        eyebrow="Essence"
        subtitle="Dépensez votre essence pour forger une carte limitée au hasard parmi les exemplaires encore disponibles."
      >
        La forge d&apos;essence
      </AmHeading>

      <AmPanel corners className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-4 p-8 text-center">
        <span className="flex items-center gap-2 text-4xl font-bold text-violet-200">
          {essence.toLocaleString("fr-FR")}
          <EssenceIcon size={30} />
        </span>

        <div
          className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={ESSENCE_CRAFT_COST}
          aria-valuenow={Math.min(essence, ESSENCE_CRAFT_COST)}
          aria-label="Essence vers la prochaine forge"
        >
          <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progression * 100}%` }} />
        </div>

        <AmButton variant="arcane" onClick={forger} disabled={pending || !pret} className="w-full max-w-xs">
          {pending ? "Forge en cours…" : pret ? (
            <span className="inline-flex items-center gap-2">
              Forger · {ESSENCE_CRAFT_COST.toLocaleString("fr-FR")} <EssenceIcon size={16} />
            </span>
          ) : `Il vous faut ${ESSENCE_CRAFT_COST.toLocaleString("fr-FR")} essence`}
        </AmButton>

        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}

        <table className="mt-4 w-full max-w-xs text-sm">
          <caption className="mb-2 text-xs uppercase tracking-[0.2em] text-am-ink-3">Chances</caption>
          <tbody>
            {ESSENCE_CRAFT_ODDS.map((o) => (
              <tr key={o.key} className="border-t border-white/5">
                <td className="py-1 text-left" style={{ color: RARITY_MAP[o.rarity]?.color }}>{o.label}</td>
                <td className="py-1 text-right text-am-ink-2">{o.odds}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs text-am-ink-3">
          La faction puis le clan sont tirés parmi ceux qui ont encore des exemplaires libres. Si une
          rareté est épuisée, la forge descend d&apos;un cran.
        </p>
        <Link href="/compte/essence" className="text-xs text-violet-300 underline-offset-2 hover:underline">
          Historique de mon essence
        </Link>
      </AmPanel>

      <AnimatePresence>
        {result && <EssenceReveal key="reveal" result={result} onClose={() => setResult(null)} />}
      </AnimatePresence>
    </section>
  );
}
