"use client";

// Point d'entrée des retours joueurs, monté UNE fois dans le layout racine :
// le bouton flottant des pages connectées, et la fenêtre d'envoi.
//
// En partie, dans l'admin et sur les pages publiques (où le visiteur n'a pas
// de compte), le bouton ne s'affiche pas. La fenêtre, elle, reste disponible
// partout : en partie, on l'ouvre depuis les réglages.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import FeedbackComposer, { type Saisie } from "./FeedbackComposer";
import { contexteCourant, useFeedbackStore } from "@/lib/feedback/client";
import { FEEDBACK_KINDS, type FeedbackKindDeclared } from "@/lib/feedback/types";

const SANS_BOUTON = [
  "/game", "/admin", "/card-lab", "/figurine-test",
  "/login", "/auth", "/landing", "/legal", "/news", "/factions",
  // La page des retours a son propre bouton « Nouveau retour ».
  "/compte/retours",
];

const cache = (chemin: string) => SANS_BOUTON.some((p) => chemin === p || chemin.startsWith(`${p}/`));

export default function FeedbackHost() {
  const t = useTranslations("feedback");
  const chemin = usePathname() ?? "/";
  const { open, openModal, closeModal, notifySent } = useFeedbackStore();
  const [kind, setKind] = useState<FeedbackKindDeclared>("bug");
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    if (!open) return;
    const surTouche = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal(); };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [open, closeModal]);

  const fermer = () => { closeModal(); setEnvoye(false); };

  async function envoyer({ body, attachments }: Saisie): Promise<string | null> {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, body, attachments, context: contexteCourant() }),
      });
      if (!res.ok) return (await res.json().catch(() => ({}))).code ?? "generic";
      setEnvoye(true);
      notifySent();
      return null;
    } catch {
      return "generic";
    }
  }

  return (
    <>
      {!cache(chemin) && !open && (
        <button
          type="button"
          onClick={openModal}
          style={{
            position: "fixed",
            right: "max(16px, env(safe-area-inset-right))",
            bottom: "max(16px, env(safe-area-inset-bottom))",
            zIndex: 90,
            background: "var(--am-bg-2)",
            color: "var(--am-ink-soft)",
            border: "1px solid var(--am-line-strong)",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          }}
        >
          {t("button")}
        </button>
      )}

      {open && (
        <div
          onClick={fermer}
          style={{
            position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-titre"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520, maxHeight: "calc(100dvh - 32px)", overflowY: "auto",
              background: "var(--am-bg-2)", color: "var(--am-ink)",
              border: "1px solid var(--am-line-strong)", borderRadius: 12, padding: "22px 24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <h2 id="feedback-titre" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {envoye ? t("sent_title") : t("title")}
              </h2>
              <button
                type="button"
                onClick={fermer}
                aria-label={t("close")}
                style={{ background: "transparent", border: "none", color: "var(--am-ink-faint)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {envoye ? (
              <>
                <p style={{ margin: "12px 0 20px", fontSize: 14, lineHeight: 1.55, color: "var(--am-ink-soft)" }}>
                  {t("sent_body")}
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Link
                    href="/compte/retours"
                    onClick={fermer}
                    style={{
                      border: "1px solid var(--am-line-strong)", borderRadius: 8, padding: "9px 16px",
                      fontSize: 14, color: "var(--am-ink)", textDecoration: "none",
                    }}
                  >
                    {t("see_mine")}
                  </Link>
                  <button
                    type="button"
                    onClick={fermer}
                    style={{
                      background: "var(--am-ink)", color: "var(--am-bg-0)", border: "none", borderRadius: 8,
                      padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    {t("close")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ margin: "8px 0 16px", fontSize: 13, lineHeight: 1.5, color: "var(--am-ink-soft)" }}>
                  {t("intro")}
                </p>
                <div role="radiogroup" aria-label={t("kind_label")} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {FEEDBACK_KINDS.map((k) => {
                    const actif = k === kind;
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={actif}
                        onClick={() => setKind(k)}
                        style={{
                          flex: 1, borderRadius: 8, padding: "9px 8px", fontSize: 13, fontFamily: "inherit",
                          fontWeight: actif ? 600 : 400, cursor: "pointer",
                          background: actif ? "var(--am-ink)" : "transparent",
                          color: actif ? "var(--am-bg-0)" : "var(--am-ink-soft)",
                          border: `1px solid ${actif ? "var(--am-ink)" : "var(--am-line-strong)"}`,
                        }}
                      >
                        {t(`kind_${k}`)}
                      </button>
                    );
                  })}
                </div>
                <FeedbackComposer
                  placeholder={t(`placeholder_${kind}`)}
                  submitLabel={t("send")}
                  autoFocus
                  onSubmit={envoyer}
                />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
