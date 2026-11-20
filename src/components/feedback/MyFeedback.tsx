"use client";

// « Mes retours » : la liste des retours du joueur, et le fil de l'un d'eux.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import FeedbackComposer, { type Saisie } from "./FeedbackComposer";
import { useFeedbackStore } from "@/lib/feedback/client";
import type { PlayerOutcome, PlayerThreadDetail, PlayerThreadState, PlayerThreadSummary } from "@/lib/feedback/types";

const carte: React.CSSProperties = {
  border: "1px solid var(--am-line-strong)",
  borderRadius: 10,
  background: "var(--am-bg-2)",
};

function Etiquette({ state, outcome }: { state: PlayerThreadState; outcome: PlayerOutcome }) {
  const t = useTranslations("feedback");
  const texte = outcome ? t(`outcome_${outcome}`) : t(`state_${state}`);
  const fort = outcome != null || state === "answered";
  return (
    <span
      style={{
        fontSize: 12, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap",
        border: `1px solid ${fort ? "var(--am-ink-soft)" : "var(--am-line-strong)"}`,
        color: fort ? "var(--am-ink)" : "var(--am-ink-faint)",
      }}
    >
      {texte}
    </span>
  );
}

function useDate() {
  const locale = useLocale();
  return (iso: string, heure = false) =>
    new Date(iso).toLocaleString(locale, heure
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "long", year: "numeric" });
}

export function FeedbackList() {
  const t = useTranslations("feedback");
  const date = useDate();
  const { openModal, sent } = useFeedbackStore();
  const [threads, setThreads] = useState<PlayerThreadSummary[] | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let vivant = true;
    fetch("/api/feedback")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (vivant) { setThreads(d.threads ?? []); setErreur(false); } })
      .catch(() => { if (vivant) setErreur(true); });
    return () => { vivant = false; };
  }, [sent]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          type="button"
          onClick={openModal}
          style={{
            background: "var(--am-ink)", color: "var(--am-bg-0)", border: "none", borderRadius: 8,
            padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          {t("new")}
        </button>
      </div>

      {erreur && <p role="alert" style={{ color: "var(--am-ember, #ff8a70)", fontSize: 14 }}>{t("err_load")}</p>}
      {!erreur && threads === null && <p style={{ color: "var(--am-ink-faint)", fontSize: 14 }}>{t("loading")}</p>}
      {threads?.length === 0 && (
        <p style={{ ...carte, padding: "28px 20px", textAlign: "center", color: "var(--am-ink-soft)", fontSize: 14 }}>
          {t("empty")}
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {threads?.map((th) => (
          <li key={th.id}>
            <Link
              href={`/compte/retours/${th.id}`}
              style={{ ...carte, display: "block", padding: "14px 16px", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                {th.unread && (
                  <span
                    aria-label={t("unread")}
                    style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--am-ember, #ff8a70)", flexShrink: 0 }}
                  />
                )}
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t(`kind_${th.kind}`)}</span>
                <span style={{ fontSize: 12, color: "var(--am-ink-faint)" }}>{date(th.created_at)}</span>
                <span style={{ marginLeft: "auto" }}><Etiquette state={th.state} outcome={th.outcome} /></span>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "var(--am-ink-soft)", fontWeight: th.unread ? 600 : 400 }}>
                {th.excerpt}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FeedbackThread({ id }: { id: string }) {
  const t = useTranslations("feedback");
  const date = useDate();
  const [thread, setThread] = useState<PlayerThreadDetail | null>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "introuvable" | "erreur">("chargement");

  // `tour` relance la lecture après une réponse envoyée.
  const [tour, setTour] = useState(0);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/feedback/${id}`)
      .then(async (res) => {
        if (!vivant) return;
        if (res.status === 404) { setEtat("introuvable"); return; }
        if (!res.ok) { setEtat("erreur"); return; }
        setThread((await res.json()).thread);
        setEtat("ok");
      })
      .catch(() => { if (vivant) setEtat("erreur"); });
    return () => { vivant = false; };
  }, [id, tour]);

  async function repondre({ body, attachments }: Saisie): Promise<string | null> {
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachments }),
      });
      if (!res.ok) return (await res.json().catch(() => ({}))).code ?? "generic";
      setTour((t) => t + 1);
      return null;
    } catch {
      return "generic";
    }
  }

  if (etat === "chargement") return <p style={{ color: "var(--am-ink-faint)", fontSize: 14 }}>{t("loading")}</p>;
  if (etat === "introuvable") return <p style={{ color: "var(--am-ink-soft)", fontSize: 14 }}>{t("not_found")}</p>;
  if (etat === "erreur" || !thread) return <p role="alert" style={{ color: "var(--am-ember, #ff8a70)", fontSize: 14 }}>{t("err_load")}</p>;

  const dernier = thread.messages[thread.messages.length - 1];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t(`kind_${thread.kind}`)}</span>
        <span style={{ fontSize: 13, color: "var(--am-ink-faint)" }}>{date(thread.created_at)}</span>
        <span style={{ marginLeft: "auto" }}><Etiquette state={thread.state} outcome={thread.outcome} /></span>
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
        {thread.messages.map((m) => {
          const moi = m.author === "player";
          return (
            <li
              key={m.id}
              style={{
                ...carte,
                padding: "12px 16px",
                marginLeft: moi ? 32 : 0,
                marginRight: moi ? 0 : 32,
                background: moi ? "var(--am-bg-3, var(--am-bg-2))" : "var(--am-bg-2)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--am-ink-faint)", marginBottom: 6 }}>
                {moi ? t("you") : t("team")} · {date(m.created_at, true)}
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {m.body}
              </p>
              {m.attachments.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {m.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer" aria-label={t("open_screenshot")}>
                      {/* URL signée du stockage privé, hors des domaines de next/image. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url}
                        alt=""
                        style={{ width: 140, height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid var(--am-line-strong)" }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Tant que personne n'a répondu, dire au joueur que son message est bien arrivé. */}
      {dernier?.author === "player" && thread.state === "received" && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--am-ink-faint)" }}>{t("received_hint")}</p>
      )}

      <div style={{ marginTop: 24 }}>
        <FeedbackComposer placeholder={t("reply_placeholder")} submitLabel={t("reply")} rows={3} onSubmit={repondre} />
      </div>
    </div>
  );
}
