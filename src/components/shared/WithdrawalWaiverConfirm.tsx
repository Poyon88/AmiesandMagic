"use client";

// Accord sur le crédit immédiat, demandé avant CHAQUE achat en euros.
//
// Le joueur demande que son achat soit crédité tout de suite et reconnaît
// perdre son droit de rétractation dès qu'il l'est. La case n'est jamais
// précochée : c'est ce geste exprès qui rend la clause des CGV opposable. Le
// serveur refuse l'achat sans lui (`waiver_required`) — cf.
// src/lib/payments/retractation.ts.
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import { AmButton } from "@/components/ui/AmButton";

export default function WithdrawalWaiverConfirm({
  onConfirmed,
  onCancel,
}: {
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("retractation");
  const [coche, setCoche] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="waiver-confirm-title"
    >
      <AmPanel corners className="w-full max-w-md p-6">
        <h2 id="waiver-confirm-title" className="font-display text-lg text-am-gold">{t("title")}</h2>
        <p className="mt-2 text-sm text-am-ink-2">{t("intro")}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-am-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={coche}
            onChange={(e) => setCoche(e.target.checked)}
          />
          <span>{t("checkbox")}</span>
        </label>
        <p className="mt-3 text-xs">
          <Link href="/legal/cgv" target="_blank" className="text-am-ink-3 underline hover:text-am-ink">
            {t("terms")}
          </Link>
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-am-ink-3 hover:text-am-ink">
            {t("cancel")}
          </button>
          <AmButton onClick={onConfirmed} disabled={!coche}>
            {t("confirm")}
          </AmButton>
        </div>
      </AmPanel>
    </div>
  );
}
