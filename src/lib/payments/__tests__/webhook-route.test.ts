// ROUTE du webhook Stripe, exécutée pour de bon — le pendant COMPORTEMENTAL de
// payment-surface.test.ts, qui ne fait que lire le source.
//
// Stripe et Supabase sont remplacés par des doublures : ce qu'on éprouve ici
// est l'aiguillage de la route (quel événement appelle quelle fonction, et
// surtout lequel n'en appelle AUCUNE), pas le PL/pgSQL, couvert par
// webhook-handlers.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const refundsCreate = vi.fn();
let nextEvent: unknown;

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({
    // La signature n'est pas l'objet de ce fichier : l'événement est rendu tel quel.
    webhooks: { constructEvent: () => nextEvent },
    refunds: { create: refundsCreate },
  }),
  getAdminClient: () => ({ rpc }),
}));

import { POST } from "@/app/api/stripe/webhook/route";

function send(type: string, object: Record<string, unknown>) {
  nextEvent = { type, data: { object } };
  return POST(new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=x" },
    body: "{}",
  }));
}

const session = (payment_status: string) => ({
  id: "cs_1",
  payment_intent: "pi_1",
  amount_total: 499,
  currency: "eur",
  payment_status,
  customer_details: { address: { country: "FR" } },
});

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { status: "credited" }, error: null });
  refundsCreate.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("checkout.session.completed", () => {
  it("session PAYÉE ⇒ crédit", async () => {
    const res = await send("checkout.session.completed", session("paid"));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("apply_checkout_completed", {
      p_session_id: "cs_1",
      p_payment_intent_id: "pi_1",
      p_amount_cents: 499,
      p_currency: "eur",
      p_country: "FR",
    });
  });

  it.each(["unpaid", "no_payment_required"])(
    "session complétée mais `%s` ⇒ AUCUN crédit, et 200 pour que Stripe ne retente pas",
    async (status) => {
      const res = await send("checkout.session.completed", session(status));
      expect(res.status).toBe(200);
      expect(rpc).not.toHaveBeenCalled();
      expect(refundsCreate).not.toHaveBeenCalled();
    },
  );
});

describe("checkout.session.async_payment_succeeded", () => {
  it("paiement différé abouti ⇒ même crédit que `completed`", async () => {
    const res = await send("checkout.session.async_payment_succeeded", session("paid"));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("apply_checkout_completed");
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_session_id: "cs_1", p_payment_intent_id: "pi_1" });
  });

  it("garde la même prudence : sans `paid`, rien n'est crédité", async () => {
    const res = await send("checkout.session.async_payment_succeeded", session("unpaid"));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
});
