import Link from "next/link";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import { AmLinkButton } from "@/components/ui/AmButton";

export const metadata = { title: "Paiement annulé — Armies & Magic" };

export default function PaiementAnnulePage() {
  return (
    <div className="min-h-screen bg-am-bg-0">
      <div className="mx-auto max-w-2xl px-4 py-20">
        <AmPanel corners className="p-10 text-center">
          <AmHeading>Paiement annulé</AmHeading>
          <p className="mt-4 text-sm text-am-ink-2">
            Rien n&apos;a été débité. La session de paiement a été abandonnée avant sa
            confirmation ; vous pouvez la relancer quand vous le souhaitez.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <AmLinkButton href="/boutique">Retour à la boutique</AmLinkButton>
            <Link href="/play" className="am-btn am-btn-ghost px-6 py-3 text-sm">
              Retour au jeu
            </Link>
          </div>
        </AmPanel>
      </div>
    </div>
  );
}
