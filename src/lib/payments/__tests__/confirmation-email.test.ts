// Email de confirmation d'achat : son contenu, et le fait qu'il ne lève jamais
// — il est appelé par le webhook Stripe APRÈS le crédit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { purchaseConfirmationContent, sendPurchaseConfirmation } from "@/lib/payments/confirmation-email";
import { SUPPORTED_LOCALES } from "@/i18n/config";

const achat = { waiverAt: "2026-11-26T10:00:00Z", amountCents: 499, currency: "eur", gold: 55 };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.PAYMENT_EMAIL_FROM;
});

describe("contenu", () => {
  it("rappelle l'achat, l'accord sur le crédit immédiat et le contact", async () => {
    const { subject, lines } = await purchaseConfirmationContent({ ...achat, locale: "fr" });
    const texte = lines.join("\n");
    expect(subject).toContain("Armies of Legends");
    expect(texte).toContain("26 novembre 2026");
    expect(texte).toContain("pièces d'or : 55");
    expect(texte).toMatch(/4,99\s€/);
    expect(texte).toContain("droit de rétractation");
    expect(texte).toContain("contacts@totem.lu");
  });

  it("tickets : le produit est le nombre de tickets", async () => {
    const { lines } = await purchaseConfirmationContent({ ...achat, gold: undefined, tickets: 5, locale: "fr" });
    expect(lines.join("\n")).toContain("tickets de tournoi : 5");
  });

  it("sans accord enregistré, la phrase sur la rétractation est omise", async () => {
    const { lines } = await purchaseConfirmationContent({ ...achat, waiverAt: undefined, locale: "fr" });
    expect(lines.join("\n")).not.toContain("rétractation");
  });

  it("se compose dans chacune des langues du jeu, sans variable oubliée", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { subject, lines } = await purchaseConfirmationContent({ ...achat, locale });
      expect(lines.length, locale).toBe(4);
      expect(`${subject}\n${lines.join("\n")}`, locale).not.toMatch(/[{}]/);
    }
  });

  it("langue inconnue ⇒ français", async () => {
    const { lines } = await purchaseConfirmationContent({ ...achat, locale: "xx" });
    expect(lines[0]).toContain("Nous confirmons");
  });
});

describe("envoi", () => {
  const envoi = { ...achat, to: "joueur@example.test", locale: "fr", sessionId: "cs_1" };

  it("sans clé ni expéditeur : rien ne part, rien ne lève", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendPurchaseConfirmation(envoi)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envoie une fois par session (clé d'idempotence) à l'adresse du joueur", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.PAYMENT_EMAIL_FROM = "Jeu <jeu@example.test>";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await sendPurchaseConfirmation(envoi);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe("purchase-confirmation/cs_1");
    const corps = JSON.parse(init.body);
    expect(corps.to).toEqual(["joueur@example.test"]);
    expect(corps.text).toContain("droit de rétractation");
  });

  it("une panne du prestataire ne lève pas", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.PAYMENT_EMAIL_FROM = "Jeu <jeu@example.test>";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("réseau")));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendPurchaseConfirmation(envoi)).resolves.toBeUndefined();
  });
});
