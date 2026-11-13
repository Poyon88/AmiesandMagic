"use client";

// Ce que le pays de connexion ouvre au visiteur, calculé par le serveur dans
// le layout racine et mis à disposition de tous les écrans. Sert l'AFFICHAGE
// uniquement : chaque route serveur concernée refait le contrôle.
import { createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { CASH_PRIZES_ENABLED } from "@/lib/tournaments/config";

export interface GeoInfo {
  country: string;
  features: { gold_purchases: boolean; tickets: boolean; auctions: boolean; cash_prizes: boolean };
  minAge: number;
}

/** Sans fournisseur (test, rendu isolé) : tout fermé, comme le filet serveur. */
const FERME: GeoInfo = {
  country: "ZZ",
  features: { gold_purchases: false, tickets: false, auctions: false, cash_prizes: false },
  minAge: 18,
};

const GeoContext = createContext<GeoInfo>(FERME);

export function GeoProvider({ value, children }: { value: GeoInfo; children: React.ReactNode }) {
  return <GeoContext.Provider value={value}>{children}</GeoContext.Provider>;
}

export function useGeo(): GeoInfo {
  return useContext(GeoContext);
}

/** Les prix en euros des tournois s'affichent-ils ici ? Interrupteur global du
 *  code ET réglage du pays. */
export function useCashPrizes(): boolean {
  const geo = useGeo();
  return CASH_PRIZES_ENABLED && geo.features.cash_prizes;
}

/** « Pas encore disponible dans votre pays » — remplace un bouton d'achat. */
export function GeoNotice({ className = "" }: { className?: string }) {
  const t = useTranslations("geo");
  return (
    <p role="note" className={`rounded-lg border border-am-gold/25 bg-am-bg-0/60 px-4 py-3 text-center text-sm text-am-ink-2 ${className}`}>
      {t("unavailable")}
    </p>
  );
}
