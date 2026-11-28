"use client";

// Boutique de pièces d'or. Trois paliers, redirection vers Stripe Checkout.
//
// Ce composant n'a AUCUNE notion de prix à facturer : il envoie un code de pack
// et suit l'URL que le serveur lui rend. Un montant qui viendrait d'ici serait
// une faille — c'est précisément ce que Checkout hébergé évite.
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import AmPanel from "@/components/ui/AmPanel";
import GoldCoin from "@/components/shared/GoldCoin";
import AmHeading from "@/components/ui/AmHeading";
import { AmButton } from "@/components/ui/AmButton";
import { GeoNotice, useGeo } from "@/components/shared/GeoProvider";
import AdultConfirm from "@/components/shared/AdultConfirm";
import WithdrawalWaiverConfirm from "@/components/shared/WithdrawalWaiverConfirm";

interface PublicPack {
  code: string;
  label: string;
  gold: number;
  displayPriceCents: number;
}

export default function GoldShop({ packs }: { packs: PublicPack[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("shop");
  const locale = useLocale();
  // Chiffres latins partout : l'arabe garde 0-9 dans tout le jeu.
  const euros = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", numberingSystem: "latn" }).format(cents / 100);
  const geo = useGeo();
  const ouvert = geo.features.gold_purchases;
  // Achat mis en attente par la déclaration de majorité : relancé une fois
  // celle-ci enregistrée.
  const [majorite, setMajorite] = useState<{ code: string; minAge: number } | null>(null);
  // Pack dont l'achat attend l'accord sur le crédit immédiat (renonciation au
  // droit de rétractation). Demandé à CHAQUE achat : `buy` n'est appelé qu'après.
  const [accord, setAccord] = useState<string | null>(null);
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
        body: JSON.stringify({ pack_code: code, withdrawal_waiver: true }),
      });
      const data = await res.json();
      if (data.code === "age_required") {
        setMajorite({ code, minAge: data.minAge ?? geo.minAge });
        setPending(null);
        return;
      }
      if (!res.ok || !data.url) {
        setError(data.error ?? t("payment_error"));
        setPending(null);
        return;
      }
      // `assign` et non `location.href = …` : le compilateur React refuse
      // l'affectation d'une valeur définie hors du composant.
      window.location.assign(data.url);
    } catch {
      setError(t("payment_error"));
      setPending(null);
    }
  }

  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <AmHeading eyebrow={t("gold_eyebrow")} subtitle={t("gold_subtitle")}>
        {t("gold_title")}
      </AmHeading>

      {debt > 0 && (
        <AmPanel className="mt-8 p-5 border border-red-500/40">
          <p className="text-sm text-red-300">
            {t.rich("gold_debt", {
              b: (chunks) => <strong>{chunks}</strong>,
              coin: () => <GoldCoin size={14} />,
              debt,
            })}
          </p>
        </AmPanel>
      )}

      {error && (
        <p className="mt-6 text-center text-sm text-red-300" role="alert">{error}</p>
      )}

      {!ouvert && <GeoNotice className="mx-auto mt-8 max-w-xl" />}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {packs.map((p) => (
          <AmPanel key={p.code} corners className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="font-display text-sm uppercase tracking-[0.24em] text-am-arcane-bright/80">
              {t.has(`pack_${p.code}`) ? t(`pack_${p.code}`) : p.label}
            </span>
            <span className="flex items-center gap-2 text-4xl font-bold text-am-gold">
              {p.gold}
              <GoldCoin size={30} />
            </span>
            <span className="text-lg text-am-ink-2">{euros(p.displayPriceCents)}</span>
            {ouvert && (
              <AmButton
                onClick={() => setAccord(p.code)}
                disabled={pending !== null}
                className="mt-2 w-full"
              >
                {pending === p.code ? t("redirecting") : t("buy")}
              </AmButton>
            )}
          </AmPanel>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-am-ink-3">
        {t("gold_note")}
      </p>
      {accord && (
        <WithdrawalWaiverConfirm
          onCancel={() => setAccord(null)}
          onConfirmed={() => { const code = accord; setAccord(null); void buy(code); }}
        />
      )}
      {majorite && (
        <AdultConfirm
          minAge={majorite.minAge}
          onCancel={() => setMajorite(null)}
          onConfirmed={() => { const { code } = majorite; setMajorite(null); void buy(code); }}
        />
      )}
    </section>
  );
}
