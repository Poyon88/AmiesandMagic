"use client";

// Page de retour après Checkout.
//
// ⚠️ Cette page NE CONFIRME RIEN par elle-même. Être redirigé ici ne prouve pas
// qu'on a payé : l'URL est devinable, et le webhook peut arriver avant comme
// après. Elle SONDE donc `/api/payments/status`, qui lit l'état écrit par le
// webhook — seul à faire foi — et n'annonce le succès qu'une fois le paiement
// passé en `completed`.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AmPanel from "@/components/ui/AmPanel";
import GoldCoin from "@/components/shared/GoldCoin";
import AmHeading from "@/components/ui/AmHeading";
import { AmLinkButton } from "@/components/ui/AmButton";

type Status = "pending" | "completed" | "refunded" | "failed";

interface PaymentInfo {
  status: Status;
  type: "tournament_entry" | "gold_pack" | "ticket_pack";
  gold_amount: number;
  ticket_amount: number;
}

/** Sondage court et espacé : le webhook arrive en général en quelques secondes,
 *  mais rien ne le garantit. Au bout du compte on cesse de sonder plutôt que
 *  d'annoncer un échec — le paiement peut très bien aboutir après. */
const POLL_MS = 2000;
const MAX_POLLS = 15;

export default function PaymentResult({ sessionId }: { sessionId: string | null }) {
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const [givenUp, setGivenUp] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    async function tick() {
      if (stopped) return;
      polls.current += 1;
      try {
        const res = await fetch(`/api/payments/status?session_id=${encodeURIComponent(sessionId!)}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (res.ok) {
          const data = (await res.json()) as PaymentInfo;
          setInfo(data);
          if (data.status !== "pending") return; // état définitif, on arrête
        }
      } catch { /* réseau : on retentera */ }

      if (polls.current >= MAX_POLLS) { setGivenUp(true); return; }
      setTimeout(tick, POLL_MS);
    }

    tick();
    return () => { stopped = true; };
  }, [sessionId]);

  const done = info?.status === "completed";

  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <AmPanel corners className="p-10 text-center">
        {!sessionId ? (
          <AmHeading>Paiement introuvable</AmHeading>
        ) : notFound ? (
          <>
            <AmHeading>Paiement introuvable</AmHeading>
            <p className="mt-4 text-sm text-am-ink-2">
              Aucun paiement ne correspond à cette session pour votre compte.
            </p>
          </>
        ) : done ? (
          <>
            <AmHeading eyebrow="Merci">Paiement confirmé</AmHeading>
            <p className="mt-4 text-am-ink-2">
              {info!.type === "gold_pack" ? (
                <>Vos <strong className="text-am-gold">{info!.gold_amount}</strong> <GoldCoin size={16} /> ont été crédités.</>
              ) : info!.type === "ticket_pack" ? (
                <>Vos <strong className="text-am-gold">{info!.ticket_amount} 🎟️</strong> vous attendent — valables un an, dans le tournoi de votre choix.</>
              ) : (
                <>Votre inscription au tournoi est enregistrée.</>
              )}
            </p>
          </>
        ) : info?.status === "refunded" ? (
          <>
            <AmHeading>Paiement remboursé</AmHeading>
            <p className="mt-4 text-sm text-am-ink-2">
              La contrepartie n&apos;était plus disponible — un tournoi complet, le plus souvent.
              Votre paiement a été remboursé automatiquement ; comptez quelques jours ouvrés
              pour le voir apparaître sur votre relevé.
            </p>
          </>
        ) : info?.status === "failed" ? (
          <>
            <AmHeading>Paiement non abouti</AmHeading>
            <p className="mt-4 text-sm text-am-ink-2">La session a expiré. Rien n&apos;a été débité.</p>
          </>
        ) : givenUp ? (
          <>
            <AmHeading>Confirmation en attente</AmHeading>
            <p className="mt-4 text-sm text-am-ink-2">
              Votre banque n&apos;a pas encore confirmé le paiement. Il n&apos;y a rien à refaire :
              dès la confirmation reçue, la contrepartie sera créditée automatiquement.
              L&apos;état est consultable dans votre historique de paiements.
            </p>
          </>
        ) : (
          <>
            <AmHeading eyebrow="Un instant">Paiement en cours de confirmation</AmHeading>
            <p className="mt-4 text-sm text-am-ink-2">
              Ne fermez pas cette page. La confirmation vient de votre banque via Stripe,
              elle prend en général quelques secondes.
            </p>
            <div className="mt-6 flex justify-center" aria-hidden>
              <span className="h-2 w-2 animate-ping rounded-full bg-am-gold" />
            </div>
          </>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <AmLinkButton href="/play">Retour au jeu</AmLinkButton>
          <Link href="/boutique" className="am-btn am-btn-ghost px-6 py-3 text-sm">
            Boutique
          </Link>
        </div>
      </AmPanel>
    </div>
  );
}
