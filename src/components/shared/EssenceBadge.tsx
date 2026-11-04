"use client";

// Solde d'essence de l'en-tête. Il se charge LUI-MÊME (comme NotificationBell)
// plutôt que de passer par les props de HomeHeader : cinq pages construisent
// l'en-tête, et aucune n'aurait à apprendre une nouvelle requête.
//
// Invisible tant que la migration n'est pas appliquée (la route répond 503) :
// afficher « 0 » mentirait. La forge annonce chaque nouveau solde par
// l'événement `ESSENCE_EVENT`, ce qui évite un rechargement de page.
import { useEffect, useState } from "react";
import Link from "next/link";
import EssenceIcon from "@/components/shared/EssenceIcon";

export const ESSENCE_EVENT = "am:essence";

/** À appeler après tout mouvement d'essence côté client. */
export function announceEssence(balance: number) {
  window.dispatchEvent(new CustomEvent<number>(ESSENCE_EVENT, { detail: balance }));
}

export default function EssenceBadge() {
  const [essence, setEssence] = useState<number | null>(null);

  useEffect(() => {
    let vivant = true;
    fetch("/api/essence")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivant && d && typeof d.essence === "number") setEssence(d.essence); })
      .catch(() => { /* reste masqué */ });
    const surMaj = (e: Event) => setEssence((e as CustomEvent<number>).detail);
    window.addEventListener(ESSENCE_EVENT, surMaj);
    return () => { vivant = false; window.removeEventListener(ESSENCE_EVENT, surMaj); };
  }, []);

  if (essence === null) return null;

  return (
    <Link
      href="/boutique#forge"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-am-bg-0/60 border border-violet-400/40 text-sm font-semibold text-violet-200"
      aria-label={`${essence} essence`}
      title="Essence — forgez une carte limitée à la boutique"
    >
      <EssenceIcon size={14} />
      {essence.toLocaleString("fr-FR")}
    </Link>
  );
}
