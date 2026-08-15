import PaymentResult from "@/components/payments/PaymentResult";

export const metadata = { title: "Paiement — Armies & Magic" };

export default async function PaiementSuccesPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  // Arriver sur cette URL ne prouve rien — c'est le webhook qui fait foi. La
  // page se contente de sonder l'état réel du paiement.
  return (
    <div className="min-h-screen bg-am-bg-0">
      <PaymentResult sessionId={session_id ?? null} />
    </div>
  );
}
