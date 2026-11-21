"use client";

// Revue des retours joueurs. Trois onglets :
//   - Sujets : les bugs et améliorations regroupés par l'agent, à accepter,
//     refuser ou reporter ; puis « Livré » quand le changement est en ligne ;
//   - À valider : les réponses que l'agent n'a pas le droit d'envoyer seul ;
//   - Tous les retours : chaque fil, avec ses messages.
// Les sujets acceptés sont ceux que traite la commande /retours de Claude Code.
import { useEffect, useState } from "react";

type Severite = "low" | "medium" | "high" | "critical";
type StatutSujet = "proposed" | "accepted" | "rejected" | "deferred" | "fixed" | "shipped";

interface Sujet {
  id: string;
  kind: "bug" | "improvement" | "balance";
  title: string;
  summary: string;
  repro: string;
  severity: Severite;
  area: string;
  status: StatutSujet;
  decision_note: string;
  commit_sha: string | null;
  updated_at: string;
  threads: number;
  players: number;
}

interface Piece { id: string; url: string }

interface RetourDuSujet {
  id: string;
  username: string;
  title_fr: string;
  excerpt: string;
  context: { path?: string; matchId?: string; turn?: number; viewport?: string; userAgent?: string; commit?: string };
  locale: string;
  created_at: string;
  attachments: Piece[];
}

interface Brouillon {
  thread_id: string;
  username: string;
  kind: string;
  category: string;
  locale: string;
  title_fr: string;
  summary_fr: string;
  excerpt: string;
  last_message_at: string;
  draft: { id: string; body: string } | null;
}

interface LigneFil {
  id: string;
  username: string;
  kind: string;
  status: string;
  severity: Severite | null;
  area: string;
  title_fr: string;
  excerpt: string;
  topic_id: string | null;
  triage_error: string | null;
  last_message_at: string;
}

interface FilComplet extends LigneFil {
  summary_fr: string;
  category: string;
  locale: string;
  context: RetourDuSujet["context"];
  topic: { id: string; title: string; status: string } | null;
  messages: { id: string; author: string; body: string; state: string; created_at: string; attachments: Piece[] }[];
}

interface Compteurs { proposes: number; brouillons: number; attente: number; erreurs: number }

const SEVERITE: Record<Severite, { label: string; color: string }> = {
  critical: { label: "Critique", color: "#c0392b" },
  high: { label: "Élevée", color: "#d35400" },
  medium: { label: "Moyenne", color: "#b7950b" },
  low: { label: "Faible", color: "#7f8c8d" },
};

const STATUT_SUJET: Record<StatutSujet, { label: string; color: string }> = {
  proposed: { label: "À décider", color: "#2471a3" },
  accepted: { label: "Accepté", color: "#1e8449" },
  deferred: { label: "Reporté", color: "#7d6608" },
  rejected: { label: "Refusé", color: "#922b21" },
  fixed: { label: "Corrigé, à livrer", color: "#6c3483" },
  shipped: { label: "Livré", color: "#566573" },
};

const STATUT_FIL: Record<string, string> = {
  new: "Non trié",
  triaged: "Trié",
  awaiting_admin: "À valider",
  awaiting_player: "Précision demandée",
  answered: "Répondu",
  closed: "Clos",
};

const TYPE: Record<string, string> = { bug: "Bug", idea: "Idée", improvement: "Amélioration", balance: "Équilibrage", question: "Question", other: "Autre" };
const COULEUR_SUJET: Record<string, string> = { bug: "#922b21", improvement: "#1a5276", balance: "#7d6608" };
const CATEGORIE: Record<string, string> = {
  rules: "Règles", gameplay: "Jeu", site_usage: "Site", account: "Compte", payment: "Paiement",
  complaint: "Réclamation", moderation: "Modération", legal: "Juridique", other: "Autre",
};

const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const panneau: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 20 };
const bouton = (fond: string, texte = "#fff"): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 6, border: `1px solid ${fond === "#fff" ? "#ccc" : fond}`,
  background: fond, color: texte, fontSize: 13, fontWeight: 600, cursor: "pointer",
});
const champ: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13,
  fontFamily: "inherit", color: "#222", background: "#fff",
};

function Pastille({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${color}1c`, color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function Captures({ pieces }: { pieces: Piece[] }) {
  if (pieces.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {pieces.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title="Ouvrir la capture">
          {/* URL signée du stockage privé, hors des domaines de next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="Capture jointe" style={{ width: 150, height: 96, objectFit: "cover", borderRadius: 6, border: "1px solid #ddd" }} />
        </a>
      ))}
    </div>
  );
}

function Contexte({ ctx, locale }: { ctx: RetourDuSujet["context"]; locale: string }) {
  const morceaux = [
    ctx.path && `page ${ctx.path}`,
    ctx.matchId && `match ${ctx.matchId}${ctx.turn != null ? ` (tour ${ctx.turn})` : ""}`,
    ctx.viewport && `fenêtre ${ctx.viewport}`,
    ctx.commit && `version ${ctx.commit}`,
    `langue ${locale}`,
  ].filter(Boolean);
  return (
    <div style={{ fontSize: 11, color: "#888", marginTop: 6 }} title={ctx.userAgent}>
      {morceaux.join(" · ")}
    </div>
  );
}

async function action(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    if (res.ok) return null;
    return (await res.json().catch(() => ({}))).error ?? `Erreur ${res.status}`;
  } catch {
    return "Réseau indisponible";
  }
}

// ─── Fil complet (fenêtre) ────────────────────────────────────────────────

function FenetreFil({ id, onClose, onChange }: { id: string; onClose: () => void; onChange: () => void }) {
  const [fil, setFil] = useState<FilComplet | null>(null);
  const [reponse, setReponse] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  // `tour` relance la lecture après chaque action.
  const [tour, setTour] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/admin/feedback?thread=${id}`)
      .then(async (res) => {
        if (!vivant) return;
        if (res.ok) setFil((await res.json()).thread);
        else setMessage("Fil introuvable");
      })
      .catch(() => { if (vivant) setMessage("Chargement impossible"); });
    return () => { vivant = false; };
  }, [id, tour]);

  async function faire(corps: Record<string, unknown>, apres?: () => void) {
    setOccupe(true);
    const err = await action(corps);
    setOccupe(false);
    setMessage(err);
    if (!err) { apres?.(); setTour((t) => t + 1); onChange(); }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 100%)", height: "100%", overflowY: "auto", background: "#fafafa", padding: 24, color: "#222" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{fil?.title_fr || "Retour"}</h2>
          <button onClick={onClose} style={{ ...bouton("#fff", "#333") }}>Fermer</button>
        </div>
        {message && <p role="alert" style={{ color: "#c0392b", fontSize: 13 }}>{message}</p>}
        {!fil ? (
          <p style={{ color: "#999" }}>Chargement…</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "10px 0" }}>
              <Pastille label={TYPE[fil.kind] ?? fil.kind} color="#2c3e50" />
              <Pastille label={STATUT_FIL[fil.status] ?? fil.status} color="#2471a3" />
              {fil.category && <Pastille label={CATEGORIE[fil.category] ?? fil.category} color="#7d6608" />}
              {fil.severity && <Pastille label={SEVERITE[fil.severity].label} color={SEVERITE[fil.severity].color} />}
            </div>
            <div style={{ fontSize: 13, color: "#555" }}>
              Joueur : <strong>{fil.username}</strong>
              {fil.topic && <> · Sujet : <em>{fil.topic.title}</em></>}
            </div>
            {fil.summary_fr && <p style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>{fil.summary_fr}</p>}
            <Contexte ctx={fil.context} locale={fil.locale} />
            {fil.triage_error && (
              <p style={{ fontSize: 13, color: "#c0392b" }}>Tri en échec : {fil.triage_error}</p>
            )}

            <div style={{ display: "grid", gap: 10, margin: "18px 0" }}>
              {fil.messages.map((m) => {
                const brouillon = m.state === "draft";
                return (
                  <div
                    key={m.id}
                    style={{
                      ...panneau, padding: "10px 14px",
                      background: brouillon ? "#fff8e1" : m.author === "player" ? "#fff" : "#eef6ff",
                      borderStyle: brouillon ? "dashed" : "solid",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
                      {m.author === "player" ? fil.username : m.author === "agent" ? "Agent" : "Équipe"}
                      {brouillon ? " — brouillon, non envoyé" : ` · ${quand(m.created_at)}`}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
                    <Captures pieces={m.attachments} />
                    {brouillon && (
                      <button
                        disabled={occupe}
                        onClick={() => faire({ action: "draft_send", message_id: m.id })}
                        style={{ ...bouton("#1e8449"), marginTop: 8 }}
                      >
                        Envoyer ce brouillon
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <textarea
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              rows={4}
              placeholder={`Répondre au joueur (dans sa langue : ${fil.locale})…`}
              aria-label="Réponse au joueur"
              style={{ ...champ, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button
                disabled={occupe || !reponse.trim()}
                onClick={() => faire({ action: "reply", thread_id: fil.id, body: reponse }, () => setReponse(""))}
                style={{ ...bouton("#2471a3"), opacity: reponse.trim() ? 1 : 0.5 }}
              >
                Envoyer la réponse
              </button>
              <button disabled={occupe} onClick={() => faire({ action: "thread_retriage", thread_id: fil.id })} style={bouton("#fff", "#333")}>
                Relancer le tri
              </button>
              {fil.topic && (
                <button disabled={occupe} onClick={() => faire({ action: "thread_set_topic", thread_id: fil.id, topic_id: null })} style={bouton("#fff", "#333")}>
                  Détacher du sujet
                </button>
              )}
              {fil.status !== "closed" && (
                <button disabled={occupe} onClick={() => faire({ action: "thread_close", thread_id: fil.id })} style={bouton("#fff", "#922b21")}>
                  Clore sans répondre
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sujets ───────────────────────────────────────────────────────────────

function CarteSujet({
  sujet, autres, onChange, ouvrirFil,
}: {
  sujet: Sujet;
  autres: Sujet[];
  onChange: () => void;
  ouvrirFil: (id: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [retours, setRetours] = useState<RetourDuSujet[] | null>(null);
  const [note, setNote] = useState(sujet.decision_note);
  const [edition, setEdition] = useState<null | { title: string; summary: string; repro: string; severity: Severite }>(null);
  const [fusion, setFusion] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (!ouvert || retours) return;
    fetch(`/api/admin/feedback?topic=${sujet.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRetours(d.threads ?? []))
      .catch(() => setMessage("Retours illisibles"));
  }, [ouvert, retours, sujet.id]);

  async function faire(corps: Record<string, unknown>) {
    setOccupe(true);
    const err = await action(corps);
    setOccupe(false);
    setMessage(err);
    if (!err) { setEdition(null); onChange(); }
  }
  const decider = (status: StatutSujet) => faire({ action: "topic_decide", id: sujet.id, status, note });

  const sev = SEVERITE[sujet.severity];
  const st = STATUT_SUJET[sujet.status];
  return (
    <li style={{ ...panneau, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <Pastille label={TYPE[sujet.kind]} color={COULEUR_SUJET[sujet.kind] ?? "#1a5276"} />
            <Pastille label={sev.label} color={sev.color} />
            <Pastille label={st.label} color={st.color} />
            {sujet.area && <Pastille label={sujet.area} color="#566573" />}
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#222" }}>{sujet.title}</h3>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#444", lineHeight: 1.5 }}>{sujet.summary}</p>
          {sujet.repro && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#666", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              <strong>Reproduction :</strong> {sujet.repro}
            </p>
          )}
          {sujet.commit_sha && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#666" }}>Commit {sujet.commit_sha.slice(0, 10)}</p>}
        </div>
        <div style={{ textAlign: "right", fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#222" }}>{sujet.players}</div>
          joueur{sujet.players > 1 ? "s" : ""}
          <div>{sujet.threads} retour{sujet.threads > 1 ? "s" : ""}</div>
        </div>
      </div>

      {message && <p role="alert" style={{ color: "#c0392b", fontSize: 13, margin: "8px 0 0" }}>{message}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note de décision (facultative, lue par /retours)"
          aria-label="Note de décision"
          style={{ ...champ, flex: "1 1 240px", width: "auto" }}
        />
        {sujet.status !== "accepted" && sujet.status !== "fixed" && sujet.status !== "shipped" && (
          <button disabled={occupe} onClick={() => decider("accepted")} style={bouton("#1e8449")}>Accepter</button>
        )}
        {sujet.status !== "deferred" && sujet.status !== "shipped" && (
          <button disabled={occupe} onClick={() => decider("deferred")} style={bouton("#fff", "#7d6608")}>Reporter</button>
        )}
        {sujet.status !== "rejected" && sujet.status !== "shipped" && (
          <button disabled={occupe} onClick={() => decider("rejected")} style={bouton("#fff", "#922b21")}>Refuser</button>
        )}
        {sujet.status !== "proposed" && sujet.status !== "shipped" && (
          <button disabled={occupe} onClick={() => decider("proposed")} style={bouton("#fff", "#333")}>Remettre à décider</button>
        )}
        {(sujet.status === "fixed" || sujet.status === "accepted") && (
          <button
            disabled={occupe}
            onClick={() => faire({ action: "topic_ship", id: sujet.id })}
            title="Le changement est en ligne : prévient les joueurs concernés"
            style={bouton("#6c3483")}
          >
            Livré — prévenir {sujet.players} joueur{sujet.players > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12 }}>
        <button onClick={() => setOuvert((o) => !o)} style={{ background: "none", border: "none", color: "#2471a3", cursor: "pointer", padding: 0, fontSize: 12 }}>
          {ouvert ? "Masquer les retours" : `Voir les ${sujet.threads} retour${sujet.threads > 1 ? "s" : ""}`}
        </button>
        <button
          onClick={() => setEdition(edition ? null : { title: sujet.title, summary: sujet.summary, repro: sujet.repro, severity: sujet.severity })}
          style={{ background: "none", border: "none", color: "#2471a3", cursor: "pointer", padding: 0, fontSize: 12 }}
        >
          {edition ? "Annuler la modification" : "Modifier la synthèse"}
        </button>
        {autres.length > 0 && (
          <span>
            <select value={fusion} onChange={(e) => setFusion(e.target.value)} aria-label="Fusionner dans un autre sujet" style={{ fontSize: 12, padding: "2px 4px", maxWidth: 260 }}>
              <option value="">Fusionner dans…</option>
              {autres.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
            {fusion && (
              <button disabled={occupe} onClick={() => faire({ action: "topic_merge", from: sujet.id, into: fusion })} style={{ ...bouton("#fff", "#333"), padding: "2px 8px", marginLeft: 6, fontSize: 12 }}>
                Fusionner
              </button>
            )}
          </span>
        )}
      </div>

      {edition && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <input value={edition.title} onChange={(e) => setEdition({ ...edition, title: e.target.value })} aria-label="Titre" style={champ} />
          <textarea value={edition.summary} onChange={(e) => setEdition({ ...edition, summary: e.target.value })} rows={3} aria-label="Résumé" style={{ ...champ, resize: "vertical" }} />
          <textarea value={edition.repro} onChange={(e) => setEdition({ ...edition, repro: e.target.value })} rows={3} placeholder="Étapes de reproduction" aria-label="Reproduction" style={{ ...champ, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <select value={edition.severity} onChange={(e) => setEdition({ ...edition, severity: e.target.value as Severite })} aria-label="Gravité" style={{ ...champ, width: "auto" }}>
              {(Object.keys(SEVERITE) as Severite[]).map((s) => <option key={s} value={s}>{SEVERITE[s].label}</option>)}
            </select>
            <button disabled={occupe} onClick={() => faire({ action: "topic_edit", id: sujet.id, ...edition })} style={bouton("#2471a3")}>Enregistrer</button>
          </div>
        </div>
      )}

      {ouvert && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 8 }}>
          {!retours && <li style={{ color: "#999", fontSize: 13 }}>Chargement…</li>}
          {retours?.map((r) => (
            <li key={r.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: "10px 12px", background: "#fafafa" }}>
              <div style={{ fontSize: 11, color: "#888" }}>{r.username} · {quand(r.created_at)}</div>
              <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5, marginTop: 4, overflowWrap: "anywhere" }}>{r.excerpt}</div>
              <Captures pieces={r.attachments} />
              <Contexte ctx={r.context} locale={r.locale} />
              <button onClick={() => ouvrirFil(r.id)} style={{ background: "none", border: "none", color: "#2471a3", cursor: "pointer", padding: 0, fontSize: 12, marginTop: 6 }}>
                Ouvrir le fil
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

type Onglet = "topics" | "drafts" | "threads";

export default function FeedbackManager() {
  const [onglet, setOnglet] = useState<Onglet>("topics");
  const [compteurs, setCompteurs] = useState<Compteurs>({ proposes: 0, brouillons: 0, attente: 0, erreurs: 0 });
  const [statutSujet, setStatutSujet] = useState<StatutSujet | "all">("proposed");
  const [sujets, setSujets] = useState<Sujet[]>([]);
  const [brouillons, setBrouillons] = useState<Brouillon[]>([]);
  const [textes, setTextes] = useState<Record<string, string>>({});
  const [fils, setFils] = useState<LigneFil[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreType, setFiltreType] = useState("");
  // Clé de la dernière lecture aboutie : tant qu'elle diffère de la vue
  // demandée, la liste affichée est celle d'avant.
  const [lu, setLu] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [filOuvert, setFilOuvert] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const rafraichir = () => setTick((t) => t + 1);

  const cle = [onglet, statutSujet, page, filtreStatut, filtreType].join("|");
  const chargement = lu !== cle;

  useEffect(() => {
    let vivant = true;
    const params = new URLSearchParams({ view: onglet });
    if (onglet === "topics") params.set("status", statutSujet);
    if (onglet === "threads") {
      params.set("page", String(page));
      if (filtreStatut) params.set("status", filtreStatut);
      if (filtreType) params.set("kind", filtreType);
    }
    fetch(`/api/admin/feedback?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!vivant) return;
        if (d.counts) setCompteurs(d.counts);
        if (onglet === "topics") setSujets(d.topics ?? []);
        if (onglet === "drafts") {
          const liste: Brouillon[] = d.drafts ?? [];
          setBrouillons(liste);
          setTextes(Object.fromEntries(liste.map((b) => [b.thread_id, b.draft?.body ?? ""])));
        }
        if (onglet === "threads") { setFils(d.threads ?? []); setTotal(d.total ?? 0); }
        setMessage(null);
      })
      .catch(() => { if (vivant) setMessage("Chargement impossible"); })
      .finally(() => { if (vivant) setLu(cle); });
    return () => { vivant = false; };
  }, [onglet, statutSujet, page, filtreStatut, filtreType, tick, cle]);

  async function envoyerBrouillon(b: Brouillon) {
    const corps = (textes[b.thread_id] ?? "").trim();
    if (!corps) return;
    const err = b.draft
      ? await action({ action: "draft_send", message_id: b.draft.id, body: corps })
      : await action({ action: "reply", thread_id: b.thread_id, body: corps });
    setMessage(err);
    if (!err) rafraichir();
  }

  const onglets: { id: Onglet; label: string; n: number }[] = [
    { id: "topics", label: "Sujets à décider", n: compteurs.proposes },
    { id: "drafts", label: "Réponses à valider", n: compteurs.attente },
    { id: "threads", label: "Tous les retours", n: compteurs.erreurs },
  ];
  const bugs = sujets.filter((s) => s.kind === "bug");
  const idees = sujets.filter((s) => s.kind === "improvement");
  const equilibrage = sujets.filter((s) => s.kind === "balance");
  const pages = Math.max(1, Math.ceil(total / 30));

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", color: "#222" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Retours joueurs</h1>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#666" }}>
        Les sujets acceptés sont codés par la commande <code>/retours</code> dans Claude Code. « Livré » prévient les joueurs une fois le changement en ligne.
      </p>

      <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {onglets.map((o) => {
          const actif = o.id === onglet;
          return (
            <button
              key={o.id}
              role="tab"
              aria-selected={actif}
              onClick={() => setOnglet(o.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
                fontWeight: actif ? 700 : 500,
                background: actif ? "#1a1a2e" : "#fff", color: actif ? "#fff" : "#333",
                border: `1px solid ${actif ? "#1a1a2e" : "#ccc"}`,
              }}
            >
              {o.label}
              {o.n > 0 && (
                <span
                  title={o.id === "threads" ? "Tris en échec" : undefined}
                  style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 10, fontSize: 11, background: o.id === "threads" ? "#c0392b" : "#c8a84e", color: "#fff" }}
                >
                  {o.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {message && <p role="alert" style={{ color: "#c0392b", fontSize: 13 }}>{message}</p>}

      {onglet === "topics" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {(["proposed", "accepted", "fixed", "deferred", "shipped", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatutSujet(s)}
                style={{
                  padding: "4px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer",
                  background: statutSujet === s ? "#e8e8f0" : "transparent",
                  border: "1px solid #ccc", color: "#333", fontWeight: statutSujet === s ? 700 : 400,
                }}
              >
                {s === "all" ? "Tous" : STATUT_SUJET[s].label}
              </button>
            ))}
          </div>
          {chargement ? (
            <p style={{ color: "#999" }}>Chargement…</p>
          ) : sujets.length === 0 ? (
            <div style={{ ...panneau, textAlign: "center", color: "#888" }}>Aucun sujet dans cet état.</div>
          ) : (
            [{ titre: "Bugs", liste: bugs }, { titre: "Équilibrage", liste: equilibrage }, { titre: "Améliorations", liste: idees }].map(({ titre, liste }) =>
              liste.length === 0 ? null : (
                <section key={titre} style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 10px", color: "#333" }}>{titre} ({liste.length})</h2>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
                    {liste.map((s) => (
                      <CarteSujet
                        key={`${s.id}-${s.updated_at}`}
                        sujet={s}
                        autres={sujets.filter((a) => a.id !== s.id && a.kind === s.kind)}
                        onChange={rafraichir}
                        ouvrirFil={setFilOuvert}
                      />
                    ))}
                  </ul>
                </section>
              ),
            )
          )}
        </>
      )}

      {onglet === "drafts" && (
        chargement ? (
          <p style={{ color: "#999" }}>Chargement…</p>
        ) : brouillons.length === 0 ? (
          <div style={{ ...panneau, textAlign: "center", color: "#888" }}>Aucune réponse en attente.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {brouillons.map((b) => (
              <li key={b.thread_id} style={{ ...panneau, padding: 16 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <Pastille label={TYPE[b.kind] ?? b.kind} color="#2c3e50" />
                  {b.category && <Pastille label={CATEGORIE[b.category] ?? b.category} color="#7d6608" />}
                  <Pastille label={`langue ${b.locale}`} color="#566573" />
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{b.title_fr || "Retour"}</h3>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{b.username} · {quand(b.last_message_at)}</div>
                <p style={{ fontSize: 13, color: "#333", lineHeight: 1.5, margin: "8px 0", padding: "8px 12px", background: "#f6f6f6", borderRadius: 8, overflowWrap: "anywhere" }}>
                  {b.excerpt}
                </p>
                {b.summary_fr && <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px", lineHeight: 1.5 }}>{b.summary_fr}</p>}
                <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>
                  {b.draft ? "Réponse proposée par l'agent (modifiable)" : "L'agent n'a rien proposé : votre réponse"}
                </label>
                <textarea
                  value={textes[b.thread_id] ?? ""}
                  onChange={(e) => setTextes((t) => ({ ...t, [b.thread_id]: e.target.value }))}
                  rows={5}
                  aria-label="Réponse au joueur"
                  style={{ ...champ, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => envoyerBrouillon(b)} disabled={!(textes[b.thread_id] ?? "").trim()} style={bouton("#1e8449")}>
                    Envoyer au joueur
                  </button>
                  <button onClick={() => setFilOuvert(b.thread_id)} style={bouton("#fff", "#333")}>Ouvrir le fil</button>
                  <button
                    onClick={async () => { setMessage(await action({ action: "thread_close", thread_id: b.thread_id })); rafraichir(); }}
                    style={bouton("#fff", "#922b21")}
                  >
                    Clore sans répondre
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {onglet === "threads" && (
        <div style={panneau}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <strong style={{ fontSize: 14, flex: 1 }}>Retours ({total})</strong>
            <select value={filtreType} onChange={(e) => { setFiltreType(e.target.value); setPage(1); }} aria-label="Type" style={{ ...champ, width: "auto" }}>
              <option value="">Tous les types</option>
              {["bug", "idea", "balance", "question", "other"].map((k) => <option key={k} value={k}>{TYPE[k]}</option>)}
            </select>
            <select value={filtreStatut} onChange={(e) => { setFiltreStatut(e.target.value); setPage(1); }} aria-label="Statut" style={{ ...champ, width: "auto" }}>
              <option value="">Tous les statuts</option>
              {Object.entries(STATUT_FIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="error">Tri en échec</option>
            </select>
          </div>
          {chargement ? (
            <p style={{ color: "#999", textAlign: "center" }}>Chargement…</p>
          ) : fils.length === 0 ? (
            <p style={{ color: "#999", textAlign: "center" }}>Aucun retour.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #eee", textAlign: "left", color: "#666" }}>
                  <th style={{ padding: "8px 6px" }}>Retour</th>
                  <th style={{ padding: "8px 6px" }}>Joueur</th>
                  <th style={{ padding: "8px 6px" }}>Type</th>
                  <th style={{ padding: "8px 6px" }}>Statut</th>
                  <th style={{ padding: "8px 6px" }}>Dernier message</th>
                </tr>
              </thead>
              <tbody>
                {fils.map((f) => (
                  <tr key={f.id} onClick={() => setFilOuvert(f.id)} style={{ borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}>
                    <td style={{ padding: "8px 6px", maxWidth: 420 }}>
                      <div style={{ fontWeight: 600 }}>{f.title_fr || "(non trié)"}</div>
                      <div style={{ color: "#777", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.excerpt}</div>
                      {f.triage_error && <div style={{ color: "#c0392b", fontSize: 12 }}>Tri en échec : {f.triage_error}</div>}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{f.username}</td>
                    <td style={{ padding: "8px 6px" }}>{TYPE[f.kind] ?? f.kind}</td>
                    <td style={{ padding: "8px 6px" }}>{STATUT_FIL[f.status] ?? f.status}</td>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>{quand(f.last_message_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {pages > 1 && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 14, fontSize: 13 }}>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={bouton("#fff", "#333")}>Précédent</button>
              Page {page} / {pages}
              <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} style={bouton("#fff", "#333")}>Suivant</button>
            </div>
          )}
        </div>
      )}

      {filOuvert && <FenetreFil id={filOuvert} onClose={() => setFilOuvert(null)} onChange={rafraichir} />}
    </div>
  );
}
