"use client";

import { useEffect } from "react";

// Dernier filet : cette frontière REMPLACE le layout racine quand celui-ci
// plante. Ni provider i18n, ni globals.css, ni polices du site ne sont garantis
// ici — d'où un texte bilingue FR/EN en dur, des styles en ligne (couleurs
// reprises des jetons --am-*) et un <a> simple plutôt qu'un <Link>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08070f",
          color: "#efe8d6",
          fontFamily: "Georgia, 'Times New Roman', serif",
          padding: 16,
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            padding: 40,
            textAlign: "center",
            background: "#171327",
            border: "1px solid rgba(216, 178, 90, 0.30)",
            borderRadius: 14,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "0.04em", color: "#d8b25a" }}>
            Une erreur est survenue
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 16, color: "rgba(239, 232, 214, 0.68)" }}>
            Something went wrong
          </p>
          {error.digest && (
            <p style={{ margin: "14px 0 0", fontFamily: "monospace", fontSize: 12, color: "rgba(239, 232, 214, 0.42)" }}>
              {error.digest}
            </p>
          )}
          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                padding: "12px 24px",
                fontSize: 15,
                fontFamily: "inherit",
                fontWeight: 600,
                color: "#1a1408",
                background: "#d8b25a",
                border: "1px solid #9a7730",
                borderRadius: 8,
              }}
            >
              Réessayer · Try again
            </button>
            {/* Rechargement complet voulu : le routeur client a pu tomber avec le layout. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                padding: "12px 24px",
                fontSize: 15,
                color: "#efe8d6",
                textDecoration: "none",
                border: "1px solid rgba(239, 232, 214, 0.18)",
                borderRadius: 8,
              }}
            >
              Accueil · Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
