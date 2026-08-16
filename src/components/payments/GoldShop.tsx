"use client";

// Boutique de pièces d'or. Trois paliers, redirection vers Stripe Checkout.
//
// Ce composant n'a AUCUNE notion de prix à facturer : il envoie un code de pack
// et suit l'URL que le serveur lui rend. Un montant qui viendrait d'ici serait
// une faille — c'est précisément ce que Checkout hébergé évite.
import { useEffect, useState } from "react";
import AmPanel from "@/components/ui/AmPanel";
import GoldCoin from "@/components/shared/GoldCoin";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton } from "@/components/ui/AmButton";

interface PublicPack {
  code: string;
  label: string;
  gold: number;
  displayPriceCents: number;
}

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

export default function GoldShop({ packs }: { packs: PublicPack[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debt, setDebt] = useState(0);

  useEffect(() => {
    // Une dette signifie qu'un remboursement a repris plus d'or que le joueur
    // n'en avait. Il faut le lui dire ici : c'est l'écran où il va remettre de
    // l'argent, et il doit savoir que son achat épongera d'abord la dette.
    fetch("/api/wallet")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDebt(d.debt ?? 0))
      .catch(() => {});
  }, []);

  async function buy(code: string) {
    setPending(code);
    setError(null);
    try {
      const res = await fetch("/api/checkout/gold-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_code: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Le paiement n'a pas pu être ouvert.");
        setPending(null);
        return;
      }
      // `assign` et non `location.href = …` : le compilateur React refuse
      // l'affectation d'une valeur définie hors du composant.
      window.location.assign(data.url);
    } catch {
      setError("Le paiement n'a pas pu être ouvert.");
      setPending(null);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <AmHeading eyebrow="Enchères" subtitle="Les pièces d'or servent aux enchères de cartes en édition limitée. Elles n'ouvrent aucun tournoi.">
        Bourses de pièces d&apos;or
      </AmHeading>

      {debt > 0 && (
        <AmPanel className="mt-8 p-5 border border-red-500/40">
          <p className="text-sm text-red-300">
            Vous devez <strong>{debt}</strong> <GoldCoin size={14} /> à la suite d&apos;un remboursement. Vos enchères
            restent bloquées, et tout gain ou achat épongera cette dette en priorité.
          </p>
        </AmPanel>
      )}

      {error && (
        <p className="mt-6 text-center text-sm text-red-300" role="alert">{error}</p>
      )}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {packs.map((p) => (
          <AmPanel key={p.code} corners className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="font-display text-sm uppercase tracking-[0.24em] text-am-arcane-bright/80">
              {p.label}
            </span>
            <span className="flex items-center gap-2 text-4xl font-bold text-am-gold">
              {p.gold}
              <GoldCoin size={30} />
            </span>
            <span className="text-lg text-am-ink-2">{euros(p.displayPriceCents)}</span>
            <AmButton
              onClick={() => buy(p.code)}
              disabled={pending !== null}
              className="mt-2 w-full"
            >
              {pending === p.code ? "Redirection…" : "Acheter"}
            </AmButton>
          </AmPanel>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-am-ink-3">
        Les pièces d&apos;or sont une monnaie interne au jeu. Elles ne sont ni convertibles en
        euros, ni transférables, ni remboursables — hors remboursement du paiement d&apos;origine.
        Paiement traité par Stripe : aucune donnée bancaire ne transite par Armies&nbsp;&amp;&nbsp;Magic.
      </p>
    </section>
  );
}
