"use client";

// Onglet « Chartes » de la forge : chartes graphiques par clan (table
// `style_guides`, API /api/style-guides). Une charte décrit l'univers visuel
// commun d'un clan ; elle est injectée dans les prompts d'illustration des
// cartes, jetons, plateaux et héros. Un clan peut en avoir plusieurs, dont une
// par défaut (utilisée par la génération aléatoire et le lot).
import { useCallback, useEffect, useMemo, useState } from "react";
import { FACTIONS, getAllClanNames, getFactionDisplayName } from "@/lib/card-engine/constants";
import { STYLE_GUIDE_FIELDS, formatStyleGuideForPrompt, type StyleGuide, type StyleGuideField } from "@/lib/ai/style-guide";
import { invalidateStyleGuides } from "@/components/card-forge/StyleGuidePicker";

type Brouillon = Partial<Record<StyleGuideField, string>> & { name: string };

const S = {
  carte: { background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 16 } as React.CSSProperties,
  etiq: { fontSize: 9, color: "#999", letterSpacing: 1.2, fontFamily: "'Cinzel',serif" } as React.CSSProperties,
  input: { width: "100%", padding: "6px 8px", borderRadius: 5, border: "1px solid #ddd", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" } as React.CSSProperties,
  bouton: (actif = true): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "'Cinzel',serif", cursor: actif ? "pointer" : "default",
    border: "1px solid #6c5ce7", background: actif ? "#6c5ce7" : "#ddd", color: "#fff", opacity: actif ? 1 : 0.6,
  }),
  secondaire: { padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "'Cinzel',serif", cursor: "pointer", border: "1px solid #ccc", background: "#fff", color: "#555" } as React.CSSProperties,
};

const vide = (): Brouillon => ({ name: "" });

function versBrouillon(g: StyleGuide): Brouillon {
  const b: Brouillon = { name: g.name };
  for (const { key } of STYLE_GUIDE_FIELDS) b[key] = g[key] ?? "";
  return b;
}

export default function StyleGuidesForge() {
  const [guides, setGuides] = useState<StyleGuide[]>([]);
  const [clan, setClan] = useState<string>("");
  const [selection, setSelection] = useState<number | "nouvelle" | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon>(vide());
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  // Clans regroupés par faction, dans l'ordre du code.
  const clansParFaction = useMemo(
    () => Object.keys(FACTIONS).map((f) => ({ faction: f, clans: getAllClanNames(f) })).filter((g) => g.clans.length > 0),
    [],
  );

  const charger = useCallback(async () => {
    const r = await fetch("/api/style-guides");
    const d = await r.json().catch(() => []);
    if (Array.isArray(d)) setGuides(d);
    else setMessage({ ok: false, texte: d?.error ?? "Lecture impossible" });
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const duClan = guides.filter((g) => g.clan === clan);
  const nbParClan = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of guides) m.set(g.clan, (m.get(g.clan) ?? 0) + 1);
    return m;
  }, [guides]);

  const choisirClan = (c: string) => {
    setClan(c);
    setMessage(null);
    const def = guides.find((g) => g.clan === c && g.is_default) ?? guides.find((g) => g.clan === c);
    if (def) { setSelection(def.id); setBrouillon(versBrouillon(def)); }
    else { setSelection("nouvelle"); setBrouillon({ name: "Charte d'origine" }); }
  };

  const ouvrir = (g: StyleGuide) => { setSelection(g.id); setBrouillon(versBrouillon(g)); setMessage(null); };

  const envoyer = async (methode: "POST" | "PUT" | "DELETE", corps: Record<string, unknown>) => {
    setOccupe(true);
    setMessage(null);
    try {
      const r = await fetch("/api/style-guides", { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error ?? `Erreur ${r.status}`);
      invalidateStyleGuides();
      await charger();
      return d;
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Erreur" });
      return null;
    } finally {
      setOccupe(false);
    }
  };

  const enregistrer = async () => {
    if (!brouillon.name.trim()) { setMessage({ ok: false, texte: "Donnez un nom à la charte." }); return; }
    const d = selection === "nouvelle"
      ? await envoyer("POST", { clan, ...brouillon })
      : await envoyer("PUT", { id: selection, ...brouillon });
    if (d?.id) { setSelection(d.id); setMessage({ ok: true, texte: "Charte enregistrée" }); }
  };

  const dupliquer = () => {
    setSelection("nouvelle");
    setBrouillon((b) => ({ ...b, name: `${b.name} (copie)` }));
    setMessage({ ok: true, texte: "Copie prête : modifiez-la puis enregistrez." });
  };

  const parDefaut = async () => {
    if (typeof selection !== "number") return;
    const d = await envoyer("PUT", { id: selection, is_default: true });
    if (d) setMessage({ ok: true, texte: "Charte par défaut du clan" });
  };

  const supprimer = async () => {
    if (typeof selection !== "number") return;
    const d = await envoyer("DELETE", { id: selection });
    if (d) {
      setMessage({ ok: true, texte: "Charte supprimée" });
      setSelection(null);
      setBrouillon(vide());
    }
  };

  const actuelle = typeof selection === "number" ? guides.find((g) => g.id === selection) : undefined;
  // Aperçu tel que le reçoivent les CARTES (obligatoire / accents / répertoire) ;
  // jetons, plateaux et héros reçoivent le bloc unique.
  const apercu = formatStyleGuideForPrompt({ clan, ...Object.fromEntries(STYLE_GUIDE_FIELDS.map(({ key }) => [key, brouillon[key] ?? null])) } as never, { mode: "repertoire" });

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
      {/* Clans */}
      <div style={{ ...S.carte, width: 260, flexShrink: 0, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ ...S.etiq, marginBottom: 10 }}>CHARTES GRAPHIQUES PAR CLAN</div>
        {clansParFaction.map(({ faction, clans }) => (
          <div key={faction} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase", marginBottom: 3 }}>{getFactionDisplayName(faction)}</div>
            {clans.map((c) => (
              <button
                key={c}
                onClick={() => choisirClan(c)}
                style={{
                  display: "flex", justifyContent: "space-between", width: "100%", textAlign: "left", fontSize: 11,
                  padding: "4px 8px", marginBottom: 2, borderRadius: 5, cursor: "pointer",
                  border: `1px solid ${clan === c ? "#6c5ce7" : "#eee"}`, background: clan === c ? "#f0eeff" : "#fff", color: "#444",
                }}
              >
                <span>{c}</span>
                <span style={{ color: (nbParClan.get(c) ?? 0) ? "#6c5ce7" : "#e08a00", fontWeight: 700 }}>{nbParClan.get(c) ?? 0}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Chartes du clan + formulaire */}
      <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 14 }}>
        {!clan ? (
          <div style={{ ...S.carte, color: "#888", fontSize: 12 }}>
            Choisissez un clan. Sa charte par défaut (★) sert à toutes les générations de prompt du clan — cartes, jetons,
            plateaux, héros ; les autres se choisissent au moment de générer.
          </div>
        ) : (
          <>
            <div style={{ ...S.carte, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ ...S.etiq, marginRight: 6 }}>{clan.toUpperCase()}</span>
              {duClan.map((g) => (
                <button key={g.id} onClick={() => ouvrir(g)} style={{
                  ...S.secondaire, borderColor: selection === g.id ? "#6c5ce7" : "#ccc", color: selection === g.id ? "#6c5ce7" : "#555",
                }}>
                  {g.is_default ? "★ " : ""}{g.name}
                </button>
              ))}
              <button onClick={() => { setSelection("nouvelle"); setBrouillon(vide()); setMessage(null); }} style={S.secondaire}>+ Nouvelle charte</button>
            </div>

            {selection !== null && (
              <div style={S.carte}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <input value={brouillon.name} onChange={(e) => setBrouillon({ ...brouillon, name: e.target.value })}
                    placeholder="Nom de la charte" style={{ ...S.input, fontWeight: 700, maxWidth: 360 }} />
                  {actuelle?.is_default && <span style={{ fontSize: 10, color: "#6c5ce7", fontWeight: 700 }}>★ par défaut</span>}
                  {selection === "nouvelle" && <span style={{ fontSize: 10, color: "#e08a00" }}>nouvelle</span>}
                </div>
                {STYLE_GUIDE_FIELDS.map(({ key, label, aide }) => (
                  <div key={key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#555", fontWeight: 700, marginBottom: 3 }}>
                      {label} <span style={{ fontWeight: 400, color: "#aaa" }}>— {aide}</span>
                    </div>
                    <textarea
                      value={brouillon[key] ?? ""}
                      onChange={(e) => setBrouillon({ ...brouillon, [key]: e.target.value })}
                      rows={key === "notes" || key === "avoid" ? 2 : 3}
                      style={{ ...S.input, resize: "vertical", lineHeight: 1.5 }}
                    />
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button disabled={occupe} onClick={enregistrer} style={S.bouton(!occupe)}>Enregistrer</button>
                  {typeof selection === "number" && <button onClick={dupliquer} style={S.secondaire}>Dupliquer</button>}
                  {typeof selection === "number" && !actuelle?.is_default && (
                    <button disabled={occupe} onClick={parDefaut} style={S.secondaire}>★ Définir par défaut</button>
                  )}
                  {typeof selection === "number" && (
                    <button disabled={occupe} onClick={supprimer} style={{ ...S.secondaire, color: "#c0392b", borderColor: "#e6b0aa" }}>Supprimer</button>
                  )}
                  {message && <span style={{ fontSize: 11, color: message.ok ? "#27ae60" : "#c0392b" }}>{message.texte}</span>}
                </div>
              </div>
            )}

            {selection !== null && apercu && (
              <details style={S.carte}>
                <summary style={{ ...S.etiq, cursor: "pointer" }}>APERÇU DU BLOC INJECTÉ DANS LES PROMPTS DE CARTE</summary>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 10, color: "#555", marginTop: 8 }}>{apercu}</pre>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
