"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton, AmLinkButton } from "@/components/ui/AmButton";

// Frontière d'erreur de la PARTIE. Le bouton recharge la page entière plutôt
// que d'appeler `reset()` : un simple re-rendu repartirait d'un store et d'un
// canal realtime dans un état inconnu, alors que le chargement complet reprend
// la partie par l'instantané serveur et le journal des actions.
export default function GameError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error("[match] erreur de rendu", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-am-bg-0">
      <div className="mx-auto max-w-2xl px-4 py-20">
        <AmPanel corners className="p-10 text-center">
          <AmHeading>{t("game_title")}</AmHeading>
          <p className="mt-4 text-sm text-am-ink-soft">{t("game_body")}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <AmButton onClick={() => window.location.reload()}>{t("game_reload")}</AmButton>
            <AmLinkButton href="/" variant="ghost">{t("home")}</AmLinkButton>
          </div>
        </AmPanel>
      </div>
    </div>
  );
}
