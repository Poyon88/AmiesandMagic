"use client";

// Règles par pays : jouer partout, vendre sur liste blanche.
//
// Une ligne par pays RÉGLÉ. La première, « Tous les autres pays », vaut pour
// tout pays qui n'a pas la sienne. Chaque interrupteur s'enregistre au clic :
// le jour où une loi change, on veut fermer un pays en une seconde.
import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAUT = "ZZ";

const S = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1 } as React.CSSProperties,
  th: { fontSize: 10, fontFamily: "'Cinzel',serif", color: "#777", letterSpacing: 1, textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #e0e0e0" } as React.CSSProperties,
  td: { fontSize: 12, color: "#222", padding: "6px 8px", borderBottom: "1px solid #f0f0f0", verticalAlign: "middle" } as React.CSSProperties,
  input: { padding: "5px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 12, color: "#222", background: "#fff" } as React.CSSProperties,
  btn: {
    background: "#7c5cbf", color: "#fff", border: "none", borderRadius: 4, padding: "6px 12px",
    fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
  } as React.CSSProperties,
  note: { fontSize: 11, color: "#777", marginTop: 8, lineHeight: 1.5 } as React.CSSProperties,
};

interface Rule {
  country_code: string;
  gold_purchases: boolean;
  tickets: boolean;
  auctions: boolean;
  cash_prizes: boolean;
  min_age: number;
  note: string | null;
}

const FONCTIONS: Array<{ cle: "gold_purchases" | "tickets" | "auctions" | "cash_prizes"; titre: string; aide: string }> = [
  { cle: "gold_purchases", titre: "ACHATS D'OR", aide: "Bourses d'or payées en euros (Stripe)" },
  { cle: "tickets", titre: "TICKETS", aide: "Achat de tickets et inscription aux tournois à ticket" },
  { cle: "auctions", titre: "ENCHÈRES", aide: "Mettre en vente et enchérir" },
  { cle: "cash_prizes", titre: "GAINS EN €", aide: "Affichage des prix en argent des tournois" },
];

const noms = new Intl.DisplayNames(["fr"], { type: "region", fallback: "none" });
const nomPays = (code: string) => (code === DEFAUT ? "Tous les autres pays" : noms.of(code) ?? code);

/** Tous les pays connus du navigateur, triés par nom. */
function tousLesPays(): Array<{ code: string; nom: string }> {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const exclus = new Set(["ZZ", "EU", "UN", "EZ", "QO"]);
  const out: Array<{ code: string; nom: string }> = [];
  for (const a of A) for (const b of A) {
    const code = a + b;
    if (a === "X" || exclus.has(code)) continue;
    const nom = noms.of(code);
    if (nom) out.push({ code, nom });
  }
  return out.sort((x, y) => x.nom.localeCompare(y.nom, "fr"));
}

export default function CountryRulesManager() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [ajout, setAjout] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch("/api/admin/country-rules");
    if (!res.ok) {
      setMessage("Lecture impossible — la migration supabase-migration-country-rules.sql est-elle appliquée ?");
      return;
    }
    setRules((await res.json()).rules);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function enregistrer(rule: Rule) {
    setEnCours(rule.country_code);
    setMessage(null);
    const res = await fetch("/api/admin/country-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    const data = await res.json().catch(() => ({}));
    setEnCours(null);
    if (!res.ok) {
      setMessage(data.error ?? "Enregistrement impossible.");
      void charger(); // l'écran ne doit pas montrer un réglage qui n'a pas pris
      return;
    }
    setRules((prev) => {
      const reste = (prev ?? []).filter((r) => r.country_code !== data.rule.country_code);
      return [...reste, data.rule];
    });
  }

  async function supprimer(code: string) {
    setEnCours(code);
    setMessage(null);
    const res = await fetch(`/api/admin/country-rules?country=${code}`, { method: "DELETE" });
    setEnCours(null);
    if (!res.ok) {
      setMessage((await res.json().catch(() => ({}))).error ?? "Suppression impossible.");
      return;
    }
    setRules((prev) => (prev ?? []).filter((r) => r.country_code !== code));
  }

  const tries = useMemo(() => {
    const liste = [...(rules ?? [])];
    return liste.sort((a, b) => {
      if (a.country_code === DEFAUT) return -1;
      if (b.country_code === DEFAUT) return 1;
      return nomPays(a.country_code).localeCompare(nomPays(b.country_code), "fr");
    });
  }, [rules]);

  const defaut = tries.find((r) => r.country_code === DEFAUT);
  const disponibles = useMemo(() => {
    const pris = new Set((rules ?? []).map((r) => r.country_code));
    return tousLesPays().filter((p) => !pris.has(p.code));
  }, [rules]);

  if (!rules) return <div style={S.card}><div style={S.title}>RÈGLES PAR PAYS</div>{message && <p style={S.note}>{message}</p>}</div>;

  return (
    <div style={S.card}>
      <div style={S.title}>RÈGLES PAR PAYS</div>
      <p style={S.note}>
        Le jeu gratuit est ouvert partout. Ces interrupteurs décident, selon le pays de connexion du
        joueur, des fonctions à enjeu. Un pays absent de la liste suit la première ligne. Chaque
        changement s&apos;enregistre aussitôt et s&apos;applique en moins d&apos;une minute.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr>
            <th style={S.th}>PAYS</th>
            {FONCTIONS.map((f) => <th key={f.cle} style={{ ...S.th, textAlign: "center" }} title={f.aide}>{f.titre}</th>)}
            <th style={{ ...S.th, textAlign: "center" }} title="Âge minimum pour acheter">ÂGE MIN.</th>
            <th style={S.th}>NOTE</th>
            <th style={S.th} />
          </tr>
        </thead>
        <tbody>
          {tries.map((r) => {
            const estDefaut = r.country_code === DEFAUT;
            return (
              <tr key={r.country_code} style={{ background: estDefaut ? "#faf7ff" : undefined, opacity: enCours === r.country_code ? 0.5 : 1 }}>
                <td style={{ ...S.td, fontWeight: estDefaut ? 700 : 400 }}>
                  {nomPays(r.country_code)}{!estDefaut && <span style={{ color: "#999" }}> · {r.country_code}</span>}
                </td>
                {FONCTIONS.map((f) => (
                  <td key={f.cle} style={{ ...S.td, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={r[f.cle]}
                      aria-label={`${f.titre} — ${nomPays(r.country_code)}`}
                      onChange={(e) => enregistrer({ ...r, [f.cle]: e.target.checked })}
                    />
                  </td>
                ))}
                <td style={{ ...S.td, textAlign: "center" }}>
                  <input
                    key={r.min_age}
                    style={{ ...S.input, width: 56, textAlign: "center" }}
                    type="number" min={13} max={25} defaultValue={r.min_age}
                    aria-label={`Âge minimum — ${nomPays(r.country_code)}`}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== r.min_age) void enregistrer({ ...r, min_age: v });
                    }}
                  />
                </td>
                <td style={S.td}>
                  <input
                    key={r.note ?? ""}
                    style={{ ...S.input, width: "100%" }}
                    defaultValue={r.note ?? ""}
                    placeholder="Raison, date, source…"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== r.note) void enregistrer({ ...r, note: v });
                    }}
                  />
                </td>
                <td style={{ ...S.td, textAlign: "right" }}>
                  {!estDefaut && (
                    <button
                      style={{ ...S.btn, background: "#fff", color: "#b33", border: "1px solid #e3b5b5" }}
                      title="Retirer : ce pays suivra la règle « Tous les autres pays »"
                      onClick={() => supprimer(r.country_code)}
                    >
                      RETIRER
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
        <select style={{ ...S.input, minWidth: 240 }} value={ajout} onChange={(e) => setAjout(e.target.value)} aria-label="Pays à ajouter">
          <option value="">Ajouter un pays…</option>
          {disponibles.map((p) => <option key={p.code} value={p.code}>{p.nom} ({p.code})</option>)}
        </select>
        <button
          style={{ ...S.btn, opacity: ajout ? 1 : 0.5 }}
          disabled={!ajout || !defaut}
          onClick={() => {
            // Part de la règle par défaut : l'ajout seul ne change rien pour le
            // pays, on ouvre ensuite ce qu'on veut.
            if (!defaut) return;
            void enregistrer({ ...defaut, country_code: ajout, note: null });
            setAjout("");
          }}
        >
          AJOUTER
        </button>
      </div>

      {message && <p style={{ ...S.note, color: "#b33" }}>{message}</p>}

      <p style={S.note}>
        Le pays est celui de la connexion (géolocalisation Vercel), sans contrôle anti-VPN. À l&apos;achat,
        Stripe exige l&apos;adresse de facturation ; son pays est conservé avec le paiement (preuve TVA),
        ainsi que le pays de connexion, l&apos;âge minimum appliqué et la date de la déclaration de majorité.
      </p>
    </div>
  );
}
