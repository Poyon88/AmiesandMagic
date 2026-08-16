"use client";

// Administration des tournois payants.
//
// ⚠️ Ce qui se règle ICI et ce qui ne s'y règle PAS.
//
// Le PRIX ne se règle pas ici. Il vit dans Stripe, sous le Price
// `STRIPE_PRICE_TOURNAMENT_ENTRY`, et il est le même pour tous les tournois.
// Le champ « prix » de ce formulaire n'est qu'un AFFICHAGE : le modifier change
// ce que le joueur lit, jamais ce qu'il paie. Les deux doivent donc rester
// d'accord à la main — d'où l'avertissement affiché en tête de l'écran.
//
// L'arbre, l'appariement et la distribution des gains ne sont pas ici non plus :
// ce sont des chantiers distincts. Cet écran ne gère que ce dont le PAIEMENT a
// besoin — un tournoi existe, il est ouvert ou non, il a des places.
import { useCallback, useEffect, useState } from "react";

const S = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, fontFamily: "'Cinzel',serif", color: "#777", letterSpacing: 1, display: "block", marginBottom: 4 } as React.CSSProperties,
  input: { width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 12, color: "#222", background: "#fff" } as React.CSSProperties,
  btn: (bg: string, fg = "#fff") => ({
    background: bg, color: fg, border: "none", borderRadius: 4, padding: "6px 12px",
    fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
  } as React.CSSProperties),
};

type Status = "draft" | "open" | "running" | "finished" | "cancelled";

type Kind = "weekly" | "free" | "special";

const KIND_LABEL: Record<Kind, string> = {
  weekly: "Hebdomadaire — 1 ticket",
  free: "Gratuit — sans ticket",
  special: "Spécial — 1 ticket",
};

interface Tournament {
  id: string;
  name: string;
  status: Status;
  kind: Kind;
  capacity: number;
  starts_at: string | null;
  format_code: string | null;
  entries_count: number;
}

const STATUS_LABEL: Record<Status, string> = {
  draft: "Brouillon", open: "Ouvert", running: "En cours",
  finished: "Terminé", cancelled: "Annulé",
};
const STATUS_COLOR: Record<Status, string> = {
  draft: "#9e9e9e", open: "#2e7d32", running: "#1565c0",
  finished: "#5d4037", cancelled: "#c62828",
};

/** Transitions proposées depuis chaque état. Volontairement restrictives :
 *  rouvrir un tournoi terminé n'a pas de sens, et « annulé » est un cul-de-sac
 *  parce que des remboursements ont pu partir derrière.
 *
 *  `open → draft` est le RETOUR EN ARRIÈRE d'une ouverture par erreur : sans
 *  lui, un tournoi ouvert d'un clic de trop ne pouvait plus que partir en
 *  « annulé », état définitif. Il n'est proposé que tant que PERSONNE n'est
 *  inscrit (cf. `transitionsFor`) — refermer sous les pieds d'un joueur qui a
 *  payé n'est pas un retour en arrière, c'est une reprise de vente. */
const NEXT: Record<Status, Status[]> = {
  draft: ["open", "cancelled"],
  open: ["running", "draft", "cancelled"],
  running: ["finished"],
  finished: [],
  cancelled: [],
};

function transitionsFor(t: { status: Status; entries_count: number }): Status[] {
  const list = NEXT[t.status];
  if (t.entries_count > 0) return list.filter((s) => s !== "draft");
  return list;
}

export default function TournamentManager() {
  const [rows, setRows] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [formats, setFormats] = useState<{ code: string; name: string }[]>([]);

  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(32);
  const [startsAt, setStartsAt] = useState("");
  const [formatCode, setFormatCode] = useState("");
  const [kind, setKind] = useState<Kind>("weekly");
  const [saving, setSaving] = useState(false);

  const fetchTournaments = useCallback(async (): Promise<Tournament[]> => {
    const res = await fetch("/api/admin/tournaments");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Chargement impossible");
    return (data.tournaments ?? []) as Tournament[];
  }, []);

  // Tout le `setState` vit dans les rappels de la promesse, jamais dans le corps
  // synchrone : appelée depuis un effet, une écriture directe déclencherait un
  // rendu en cascade (react-hooks/set-state-in-effect). Effet de bord heureux,
  // le voile de chargement ne réapparaît pas aux rechargements qui suivent une
  // action — la liste ne clignote plus à chaque changement d'état.
  const load = useCallback(() => {
    fetchTournaments()
      .then((list) => { setRows(list); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchTournaments]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/formats")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setFormats(list.map((f: { code?: string; name?: string }) => ({ code: f.code ?? "", name: f.name ?? f.code ?? "" })).filter((f) => f.code));
      })
      .catch(() => {});
  }, []);

  async function create() {
    if (!name.trim()) { setError("Le nom est requis."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          capacity,
          // Créé en BROUILLON : un tournoi n'apparaît aux joueurs qu'une fois
          // ouvert explicitement. On ne met jamais quelque chose en vente par
          // le simple fait de l'avoir saisi.
          status: "draft",
          kind,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          format_code: formatCode || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Création impossible"); setSaving(false); return; }
      setName(""); setStartsAt("");
      load();
    } catch {
      setError("Création impossible");
    }
    setSaving(false);
  }

  async function setStatus(id: string, status: Status) {
    setError(null);
    const res = await fetch("/api/admin/tournaments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Changement d'état impossible");
      return;
    }
    load();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/tournaments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Suppression impossible");
      setConfirmDelete(null);
      return;
    }
    setConfirmDelete(null);
    load();
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "30px 20px" }}>
      <h1 style={{ ...S.title, fontSize: 18, marginBottom: 8 }}>Gestion des Tournois</h1>

      <div style={{ ...S.card, background: "#fff8e1", border: "1px solid #ffe082" }}>
        <p style={{ fontSize: 11, color: "#6d4c00", margin: 0, lineHeight: 1.6 }}>
          <strong>Un tournoi ne se vend pas.</strong> Ce sont les <strong>tickets</strong> qui
          s&apos;achètent, en boutique, et le joueur les dépense dans le tournoi de son choix.
          Un tournoi coûte donc <em>un ticket</em> ou <em>rien</em> — c&apos;est son TYPE qui le dit,
          et il n&apos;y a aucun montant à régler ici. Pour changer le tarif des tickets, il faut
          créer un nouveau Price dans Stripe et mettre à jour la variable correspondante.
        </p>
      </div>

      {error && (
        <div style={{ ...S.card, background: "#ffebee", border: "1px solid #ffcdd2" }}>
          <p style={{ fontSize: 11, color: "#c62828", margin: 0 }} role="alert">{error}</p>
        </div>
      )}

      {/* ─── Création ─────────────────────────────────────────────────── */}
      <div style={S.card}>
        <h2 style={{ ...S.title, marginBottom: 12 }}>Nouveau tournoi</h2>
        <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={S.label} htmlFor="t-name">NOM</label>
            <input id="t-name" style={S.input} value={name} maxLength={80}
              onChange={(e) => setName(e.target.value)} placeholder="Tournoi quotidien du soir" />
          </div>
          <div>
            <label style={S.label} htmlFor="t-cap">PLACES</label>
            <input id="t-cap" type="number" min={2} max={512} style={S.input} value={capacity}
              onChange={(e) => setCapacity(Math.max(2, Math.min(512, parseInt(e.target.value) || 32)))} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={S.label} htmlFor="t-date">DÉBUT (facultatif)</label>
            <input id="t-date" type="datetime-local" style={S.input} value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label style={S.label} htmlFor="t-kind">TYPE</label>
            <select id="t-kind" style={S.input} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={S.label} htmlFor="t-format">FORMAT (facultatif)</label>
            <select id="t-format" style={S.input} value={formatCode} onChange={(e) => setFormatCode(e.target.value)}>
              <option value="">— aucun —</option>
              {formats.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <button onClick={create} disabled={saving} style={{ ...S.btn("#2e7d32"), opacity: saving ? 0.5 : 1 }}>
          {saving ? "Création…" : "Créer en brouillon"}
        </button>
        <span style={{ fontSize: 10, color: "#888", marginLeft: 10 }}>
          Le tournoi n&apos;est visible des joueurs qu&apos;une fois passé à « Ouvert ».
        </span>
      </div>

      {/* ─── Liste ────────────────────────────────────────────────────── */}
      {loading ? (
        <p style={{ textAlign: "center", color: "#888", fontFamily: "'Cinzel',serif", padding: 30 }}>Chargement…</p>
      ) : rows.length === 0 ? (
        <p style={{ textAlign: "center", color: "#888", fontSize: 12, padding: 30 }}>
          Aucun tournoi. Créez-en un ci-dessus.
        </p>
      ) : (
        rows.map((t) => {
          const full = t.entries_count >= t.capacity;
          return (
            <div key={t.id} style={S.card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ ...S.title, margin: 0, fontSize: 14 }}>{t.name}</h3>
                <span style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 4, color: "#fff",
                  background: STATUS_COLOR[t.status], fontFamily: "'Cinzel',serif", fontWeight: 700,
                }}>{STATUS_LABEL[t.status]}</span>
                <span style={{ fontSize: 11, color: full ? "#c62828" : "#555", fontWeight: full ? 700 : 400 }}>
                  {t.entries_count} / {t.capacity} inscrits{full ? " — complet" : ""}
                </span>
                <span style={{ fontSize: 11, color: "#555" }}>
                  {t.kind === "free" ? "Gratuit" : "1 ticket"}
                </span>
                {t.starts_at && (
                  <span style={{ fontSize: 11, color: "#777" }}>
                    {new Date(t.starts_at).toLocaleString("fr-FR")}
                  </span>
                )}
                {t.format_code && <span style={{ fontSize: 10, color: "#999" }}>{t.format_code}</span>}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {transitionsFor(t).map((next) => (
                  <button key={next} onClick={() => setStatus(t.id, next)}
                    style={S.btn(STATUS_COLOR[next])}>
                    {next === "open" ? "Ouvrir les inscriptions"
                      : next === "running" ? "Démarrer"
                      : next === "finished" ? "Clore"
                      : next === "draft" ? "Remettre en brouillon"
                      : "Annuler"}
                  </button>
                ))}
                {transitionsFor(t).length === 0 && (
                  <span style={{ fontSize: 10, color: "#999", alignSelf: "center" }}>
                    État final — plus de transition possible.
                  </span>
                )}

                {/* Suppression réservée aux tournois sans inscrit : sinon des
                    paiements pendraient dans le vide. Le serveur refuse de
                    toute façon, le bouton n'est masqué que pour éviter de le
                    proposer pour rien. */}
                {t.entries_count === 0 && (
                  confirmDelete === t.id ? (
                    <>
                      <button onClick={() => remove(t.id)} style={S.btn("#c62828")}>Confirmer</button>
                      <button onClick={() => setConfirmDelete(null)} style={S.btn("#9e9e9e")}>Annuler</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(t.id)} style={S.btn("#f5f5f5", "#888")}>
                      Supprimer
                    </button>
                  )
                )}
              </div>

              {t.status === "cancelled" && t.entries_count > 0 && (
                <p style={{ fontSize: 10, color: "#c62828", marginTop: 10, marginBottom: 0 }}>
                  ⚠️ {t.entries_count} joueur(s) avaient payé. Les remboursements se font
                  manuellement depuis le tableau de bord Stripe ; le webhook retirera leur
                  inscription automatiquement.
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
