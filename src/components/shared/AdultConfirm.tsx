"use client";

// Déclaration de majorité, demandée une fois avant le premier achat.
//
// Le serveur refuse l'achat avec `age_required` tant qu'elle manque ; l'écran
// ouvre alors cette fenêtre, enregistre la déclaration puis relance l'achat.
// Déclaration sur l'honneur, pas une vérification d'identité.
import { useState } from "react";
import { useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import { AmButton } from "@/components/ui/AmButton";

export default function AdultConfirm({
  minAge,
  onConfirmed,
  onCancel,
}: {
  minAge: number;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("geo");
  const [coche, setCoche] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(false);

  async function confirmer() {
    setEnvoi(true);
    setErreur(false);
    try {
      const res = await fetch("/api/account/adult-declaration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error();
      onConfirmed();
    } catch {
      setErreur(true);
      setEnvoi(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adult-confirm-title"
    >
      <AmPanel corners className="w-full max-w-md p-6">
        <h2 id="adult-confirm-title" className="font-display text-lg text-am-gold">{t("age_title")}</h2>
        <p className="mt-2 text-sm text-am-ink-2">{t("age_intro", { age: minAge })}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-am-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={coche}
            onChange={(e) => setCoche(e.target.checked)}
          />
          <span>{t("age_checkbox", { age: minAge })}</span>
        </label>
        {erreur && <p className="mt-3 text-sm text-red-300" role="alert">{t("age_error")}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-am-ink-3 hover:text-am-ink">
            {t("age_cancel")}
          </button>
          <AmButton onClick={confirmer} disabled={!coche || envoi}>
            {t("age_confirm")}
          </AmButton>
        </div>
      </AmPanel>
    </div>
  );
}
