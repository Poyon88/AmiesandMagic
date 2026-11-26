// Email de confirmation d'un achat crédité.
//
// Il sert de confirmation du contrat sur support durable, et rappelle au joueur
// l'accord qu'il a donné avant de payer : crédit immédiat, donc plus de droit
// de rétractation (cf. src/lib/payments/retractation.ts et les CGV).
//
// Envoyé par l'API HTTP de Resend — le même prestataire que les emails de
// compte, qui partent eux de Supabase Auth. Deux variables d'environnement :
// `RESEND_API_KEY` et `PAYMENT_EMAIL_FROM` (« Nom <adresse@domaine-vérifié> »).
// Sans elles, rien ne part et l'absence est journalisée.
//
// ⚠️ Ne lève JAMAIS : l'appelant est le webhook Stripe, et un échec d'email ne
// doit ni annuler un crédit déjà fait, ni faire rejouer l'événement.
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { EDITEUR, SERVICE } from "@/content/legal/editeur";

export interface PurchaseConfirmation {
  to: string | null | undefined;
  locale: string | null | undefined;
  /** Date ISO de l'accord sur le crédit immédiat ; absente ⇒ phrase omise. */
  waiverAt: string | null | undefined;
  amountCents: number;
  currency: string;
  gold?: number;
  tickets?: number;
  /** Identifiant de session Stripe : clé d'idempotence de l'envoi. */
  sessionId: string;
}

export async function sendPurchaseConfirmation(p: PurchaseConfirmation): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.PAYMENT_EMAIL_FROM;
    if (!key || !from) {
      console.error("[paiement/email] RESEND_API_KEY ou PAYMENT_EMAIL_FROM absent — confirmation non envoyée", p.sessionId);
      return;
    }
    if (!p.to) {
      console.error("[paiement/email] aucune adresse pour la session", p.sessionId);
      return;
    }

    const { subject, lines } = await purchaseConfirmationContent(p);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // Un rejeu du webhook ne doit pas produire un second email.
        "Idempotency-Key": `purchase-confirmation/${p.sessionId}`,
      },
      body: JSON.stringify({
        from,
        to: [p.to],
        reply_to: EDITEUR.emailContact,
        subject,
        text: lines.join("\n\n"),
        html: lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(""),
      }),
    });
    if (!res.ok) {
      console.error("[paiement/email] envoi refusé", p.sessionId, res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[paiement/email] échec de l'envoi", p.sessionId, err);
  }
}

/** Objet et paragraphes de l'email, dans la langue du joueur au moment de
 *  l'achat. Séparé de l'envoi pour pouvoir être éprouvé sans réseau. */
export async function purchaseConfirmationContent(
  p: Pick<PurchaseConfirmation, "locale" | "waiverAt" | "amountCents" | "currency" | "gold" | "tickets">,
): Promise<{ subject: string; lines: string[] }> {
  const locale = isLocale(p.locale) ? p.locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "retractation" });

  const produit = p.tickets
    ? t("email_product_tickets", { count: p.tickets })
    : t("email_product_gold", { count: p.gold ?? 0 });
  const montant = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: p.currency.toUpperCase(),
  }).format(p.amountCents / 100);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    p.waiverAt ? new Date(p.waiverAt) : new Date(),
  );

  const lines = [t("email_intro", { date, produit, montant })];
  if (p.waiverAt) lines.push(t("email_waiver"));
  lines.push(t("email_contact", { email: EDITEUR.emailContact }));
  lines.push(`${SERVICE} — ${EDITEUR.denomination}, ${EDITEUR.siege}`);
  return { subject: t("email_subject", { service: SERVICE }), lines };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
