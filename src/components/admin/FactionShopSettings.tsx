"use client";

// Tarifs de la boutique de FACTIONS.
//
// Écran volontairement minuscule : deux nombres. Il existe parce que le prix du
// forfait est un prix de LANCEMENT, prévu pour monter une fois la promotion
// close — et qu'un redéploiement pour changer un nombre serait le mauvais outil.
//
// La hausse n'est jamais rétroactive : chaque déblocage garde le `price_paid`
// du jour de l'achat, et c'est lui, pas le tarif courant, qui sert de référence
// si un remboursement oblige à reprendre la faction.
import { useCallback, useEffect, useState } from "react";

const S = {
  card: { background: "#fff", borderRadius: 8, border: "1px solid #e0e0e0", padding: 16, marginBottom: 14 } as React.CSSProperties,
  title: { fontSize: 13, fontFamily: "'Cinzel',serif", fontWeight: 700, color: "#333", letterSpacing: 1 } as React.CSSProperties,
  label: { fontSize: 10, fontFamily: "'Cinzel',serif", color: "#777", letterSpacing: 1, display: "block", marginBottom: 4 } as React.CSSProperties,
  input: { width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 12, color: "#222", background: "#fff" } as React.CSSProperties,
  btn: {
    background: "#7c5cbf", color: "#fff", border: "none", borderRadius: 4, padding: "6px 12px",
    fontSize: 11, fontFamily: "'Cinzel',serif", fontWeight: 700, cursor: "pointer", letterSpacing: 0.5,
  } as React.CSSProperties,
  note: { fontSize: 11, color: "#777", marginTop: 8, lineHeight: 1.5 } as React.CSSProperties,
};

interface Settings {
  faction_price: number;
  bundle_price: number;
  updated_at: string;
}

interface Stats {
  factionsVendues: number;
  forfaitsVendus: number;
  orDepense: number;
}

export default function FactionShopSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [faction, setFaction] = useState("");
  const [bundle, setBundle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const charger = useCallback(async () => {
    const res = await fetch("/api/admin/faction-shop");
    if (!res.ok) return;
    const data = await res.json();
    if (data.settings) {
      setSettings(data.settings);
      setFaction(String(data.settings.faction_price));
      setBundle(String(data.settings.bundle_price));
    }
    setStats(data.stats ?? null);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function enregistrer() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/faction-shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faction_price: Number(faction),
          bundle_price: Number(bundle),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Enregistrement impossible.");
        return;
      }
      setSettings(data.settings);
      setMessage("Tarifs enregistrés.");
    } finally {
      setSaving(false);
    }
  }

  // La migration n'est pas appliquée : rien à régler, et un formulaire vide
  // laisserait croire à des tarifs à zéro.
  if (!settings) return null;

  const f = Number(faction);
  const b = Number(bundle);
  const forfaitPlusCherQueDeux = Number.isFinite(f) && Number.isFinite(b) && b >= f * 2;

  return (
    <div style={S.card}>
      <div style={S.title}>BOUTIQUE DE FACTIONS — TARIFS</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={S.label}>UNE FACTION (OR)</label>
          <input style={S.input} type="number" min={0} value={faction}
                 onChange={(e) => setFaction(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>FORFAIT — TOUTES (OR)</label>
          <input style={S.input} type="number" min={0} value={bundle}
                 onChange={(e) => setBundle(e.target.value)} />
        </div>
      </div>

      {forfaitPlusCherQueDeux && (
        // Pas un blocage : ce sera peut-être voulu une fois la promotion close.
        // Mais c'est le genre de bascule qu'on ne veut pas franchir sans le voir.
        <p style={{ ...S.note, color: "#b8860b" }}>
          ⚠ Le forfait coûte désormais autant ou plus que deux factions achetées séparément.
          Il n&apos;est plus une affaire pour qui n&apos;en veut que deux.
        </p>
      )}

      <button style={{ ...S.btn, marginTop: 12, opacity: saving ? 0.6 : 1 }}
              onClick={enregistrer} disabled={saving}>
        {saving ? "ENREGISTREMENT…" : "ENREGISTRER"}
      </button>

      {message && <p style={S.note}>{message}</p>}

      {stats && (
        <p style={S.note}>
          Vendu à ce jour : <strong>{stats.factionsVendues}</strong> faction
          {stats.factionsVendues > 1 ? "s" : ""} et <strong>{stats.forfaitsVendus}</strong> forfait
          {stats.forfaitsVendus > 1 ? "s" : ""}, pour <strong>{stats.orDepense}</strong> or dépensé.
        </p>
      )}

      <p style={S.note}>
        Une hausse ne touche PAS les achats déjà faits : chaque déblocage conserve le prix payé
        le jour de l&apos;achat, et c&apos;est ce montant qui sert de référence si un remboursement
        oblige à reprendre la faction.
      </p>
    </div>
  );
}
