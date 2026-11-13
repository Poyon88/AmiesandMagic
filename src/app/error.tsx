"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton, AmLinkButton } from "@/components/ui/AmButton";

// Frontière d'erreur des pages. Elle est rendue DANS le layout racine, donc le
// provider i18n est disponible (à la différence de global-error.tsx).
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-am-bg-0">
      <div className="mx-auto max-w-2xl px-4 py-20">
        <AmPanel corners className="p-10 text-center">
          <AmHeading>{t("title")}</AmHeading>
          <p className="mt-4 text-sm text-am-ink-soft">{t("body")}</p>
          {error.digest && (
            <p className="mt-3 font-mono text-xs text-am-ink-faint">{error.digest}</p>
          )}
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <AmButton onClick={() => reset()}>{t("retry")}</AmButton>
            <AmLinkButton href="/" variant="ghost">{t("home")}</AmLinkButton>
          </div>
        </AmPanel>
      </div>
    </div>
  );
}
