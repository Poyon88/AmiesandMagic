"use client";

import { useEffect, useMemo, useState } from "react";
import { KEYWORDS } from "@/lib/game/abilities";
import { STAT_COST, ADDITIONAL_COST_POINTS, BUDGET, RARITIES } from "@/lib/card-engine/constants";
import {
  applyBalanceOverrides, balanceDefaults, countBalanceChanges,
  loadBalanceOverrides, saveBalanceOverrides, type BalanceOverrides,
} from "@/lib/card-engine/balance";

/** BARÈME — le modèle de coût complet, consultable et réglable.
 *
 *  Les écarts sont mémorisés dans le navigateur et réappliqués au chargement.
 *  Rien n'est envoyé en base : c'est un banc d'essai personnel, pas un réglage
 *  partagé — et « Rétablir » rend les valeurs compilées, à la valeur près.
 *
 *  Sans effet sur les parties en cours : ces coûts ne servent qu'à CRÉER des
 *  cartes (jauge d'auteur, générateur), jamais à en jouer une. */

const ZONES = ["Terrain", "Mixte", "Cimetière", "Main", "Deck", "Race", "Clan"] as const;
const RARETES = ["Commune", "Peu Commune", "Rare", "Épique", "Légendaire"];
const COUTS_ADD: { k: keyof typeof ADDITIONAL_COST_POINTS; nom: string; unite: string; note: string }[] = [
  { k: "life", nom: "Vie", unite: "par PV", note: "Ancré sur Douleur X" },
  { k: "discard", nom: "Défausse", unite: "par carte", note: "Ancré sur Inspiration X / Pillage X" },
  { k: "topdeck", nom: "Repli", unite: "par carte", note: "La carte revient : seul le tempo est payé" },
  { k: "exile", nom: "Exil", unite: "par carte", note: "Perte aveugle, cartes du deck" },
  { k: "sacrifice", nom: "Sacrifice", unite: "par allié", note: "Une unité déjà en jeu" },
];

const ETIQ: React.CSSProperties = { fontSize: 9, color: "#999", letterSpacing: 1.2 };
const CHAMP: React.CSSProperties = {
  width: 62, padding: "4px 6px", borderRadius: 5, border: "1px solid #ddd",
  fontFamily: "'Cinzel',serif", fontSize: 13, textAlign: "center", background: "#fff",
};

function Champ({ valeur, defaut, onChange, pas = 1 }: {
  valeur: number; defaut: number; onChange: (n: number) => void; pas?: number;
}) {
  const modifie = valeur !== defaut;
  return (
    <input
      type="number" step={pas} value={valeur}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      title={modifie ? `Valeur d'origine : ${defaut}` : undefined}
      style={{
        ...CHAMP,
        borderColor: modifie ? "#b3541e" : "#ddd",
        background: modifie ? "#fff6ef" : "#fff",
        color: modifie ? "#b3541e" : "#333",
        fontWeight: modifie ? 700 : 400,
      }}
    />
  );
}

export default function BalanceEditor() {
  const [ov, setOv] = useState<BalanceOverrides>({});
  const [filtre, setFiltre] = useState("");
  const [pret, setPret] = useState(false);
  const d = balanceDefaults();

  // Au montage : relire le navigateur et APPLIQUER, pour que la jauge et le
  // générateur voient les mêmes valeurs que ce tableau dès la première seconde.
  useEffect(() => {
    const stocke = loadBalanceOverrides();
    applyBalanceOverrides(stocke);
    setOv(stocke);
    setPret(true);
  }, []);

  const maj = (suite: BalanceOverrides) => {
    setOv(suite);
    applyBalanceOverrides(suite);
    saveBalanceOverrides(suite);
  };
  const majKw = (label: string, champ: "cost" | "costPerX", n: number) =>
    maj({ ...ov, keywords: { ...ov.keywords, [label]: { ...ov.keywords?.[label], [champ]: n } } });

  const ecarts = countBalanceChanges(ov);

  const capacites = useMemo(() => {
    const t = filtre.trim().toLowerCase();
    return Object.entries(KEYWORDS)
      .filter(([label, k]) => !t || label.toLowerCase().includes(t) || k.desc.toLowerCase().includes(t))
      .sort((a, b) => b[1].cost - a[1].cost || a[0].localeCompare(b[0], "fr"));
  }, [filtre, ov]); // `ov` en dépendance : les coûts changent, l'ordre aussi.

  if (!pret) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={ETIQ}>BARÈME DU MODÈLE DE COÛT</div>
        <div style={{ flex: 1 }} />
        {ecarts > 0 && (
          <span style={{ fontSize: 10, color: "#b3541e", fontWeight: 700 }}>
            {ecarts} valeur{ecarts > 1 ? "s" : ""} modifiée{ecarts > 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={() => maj({})}
          disabled={ecarts === 0}
          style={{
            padding: "5px 12px", borderRadius: 6, fontSize: 10, fontFamily: "'Cinzel',serif",
            border: `1px solid ${ecarts ? "#b3541e" : "#ddd"}`, background: "#fff",
            color: ecarts ? "#b3541e" : "#ccc", cursor: ecarts ? "pointer" : "default",
          }}
        >
          Rétablir l&apos;origine
        </button>
      </div>

      <p style={{ fontSize: 10, color: "#888", margin: 0, maxWidth: 700, lineHeight: 1.6 }}>
        Les valeurs modifiées sont mémorisées dans <b>ce navigateur</b> et se superposent aux
        constantes du moteur : la jauge de la forge et le générateur automatique les prennent en
        compte immédiatement. Rien n&apos;est envoyé en base, et les parties en cours ne sont pas
        touchées — ces coûts servent à créer des cartes, jamais à en jouer.
      </p>

      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18 }}>
        <div style={{ ...ETIQ, marginBottom: 12 }}>BUDGET — mana × base × multiplicateur de rareté</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "#666" }}>Base</span>
          <Champ valeur={BUDGET.base} defaut={d.budgetBase} onChange={(n) => maj({ ...ov, budgetBase: n })} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr>
              <th style={{ ...ETIQ, textAlign: "left", padding: "4px 14px 8px 0" }}>RARETÉ</th>
              <th style={{ ...ETIQ, textAlign: "left", padding: "4px 14px 8px 0" }}>MULTIPLICATEUR</th>
              <th style={{ ...ETIQ, textAlign: "left", padding: "4px 0 8px" }}>À 5 MANAS</th>
            </tr></thead>
            <tbody>
              {RARITIES.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: "3px 14px 3px 0", color: r.color, fontWeight: 700 }}>{r.label}</td>
                  <td style={{ padding: "3px 14px 3px 0" }}>
                    <Champ
                      valeur={r.multiplier} defaut={d.rarityMultipliers[r.id]} pas={0.05}
                      onChange={(n) => maj({ ...ov, rarityMultipliers: { ...ov.rarityMultipliers, [r.id]: n } })}
                    />
                  </td>
                  <td style={{ padding: "3px 0", fontFamily: "'Cinzel',serif", color: "#666" }}>
                    {Math.round(5 * BUDGET.base * r.multiplier)} pts
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18 }}>
        <div style={{ ...ETIQ, marginBottom: 12 }}>CARACTÉRISTIQUES — payées sur le même budget</div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#666" }}>
            ⚔️ Attaque
            <Champ valeur={STAT_COST.atk} defaut={d.stat.atk} onChange={(n) => maj({ ...ov, stat: { ...ov.stat, atk: n } })} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#666" }}>
            🛡️ Points de vie
            <Champ valeur={STAT_COST.def} defaut={d.stat.def} onChange={(n) => maj({ ...ov, stat: { ...ov.stat, def: n } })} />
          </label>
        </div>
        <p style={{ fontSize: 10, color: "#999", margin: "12px 0 0" }}>
          La puissance d&apos;un sort suit le coût de l&apos;attaque. Calibration d&apos;origine : 1 SE ≈ 4,5 pts.
        </p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18 }}>
        <div style={{ ...ETIQ, marginBottom: 12 }}>COÛTS ADDITIONNELS — ils RENDENT des points</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <tbody>
              {COUTS_ADD.map(({ k, nom, unite, note }) => (
                <tr key={k}>
                  <td style={{ padding: "4px 14px 4px 0", fontWeight: 600, color: "#444", whiteSpace: "nowrap" }}>{nom}</td>
                  <td style={{ padding: "4px 10px 4px 0" }}>
                    <Champ
                      valeur={ADDITIONAL_COST_POINTS[k]} defaut={d.additional[k]}
                      onChange={(n) => maj({ ...ov, additional: { ...ov.additional, [k]: n } })}
                    />
                  </td>
                  <td style={{ padding: "4px 14px 4px 0", color: "#999", whiteSpace: "nowrap" }}>{unite}</td>
                  <td style={{ padding: "4px 0", color: "#aaa", fontSize: 10 }}>{note}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "4px 14px 4px 0", fontWeight: 600, color: "#bbb", whiteSpace: "nowrap" }}>Éveil</td>
                <td style={{ padding: "4px 10px 4px 0", color: "#ccc", fontFamily: "'Cinzel',serif", fontSize: 13 }}>—</td>
                <td colSpan={2} style={{ padding: "4px 0", color: "#aaa", fontSize: 10 }}>
                  Coût <b>alternatif</b> : il remplace le mana, qui fixe le budget. Lui donner une valeur le compterait deux fois.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={ETIQ}>CAPACITÉS DE CRÉATURE</div>
          <div style={{ flex: 1 }} />
          <input
            value={filtre} onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer…"
            style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid #ddd", fontSize: 11, width: 200 }}
          />
          <span style={{ fontSize: 10, color: "#aaa" }}>{capacites.length} / {Object.keys(KEYWORDS).length}</span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
            <thead style={{ position: "sticky", top: 0, background: "#fafafa" }}>
              <tr>
                <th style={{ ...ETIQ, textAlign: "left", padding: "6px 14px 6px 0" }}>CAPACITÉ</th>
                <th style={{ ...ETIQ, textAlign: "left", padding: "6px 10px 6px 0" }}>COÛT</th>
                <th style={{ ...ETIQ, textAlign: "left", padding: "6px 14px 6px 0" }}>PAR X</th>
                <th style={{ ...ETIQ, textAlign: "left", padding: "6px 14px 6px 0" }}>À PARTIR DE</th>
                <th style={{ ...ETIQ, textAlign: "left", padding: "6px 0" }}>ZONE</th>
              </tr>
            </thead>
            <tbody>
              {capacites.map(([label, k]) => (
                <tr key={label} style={{ borderTop: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "4px 14px 4px 0", color: "#444", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</td>
                  <td style={{ padding: "4px 10px 4px 0" }}>
                    <Champ valeur={k.cost} defaut={d.keywords[label].cost} onChange={(n) => majKw(label, "cost", n)} />
                  </td>
                  <td style={{ padding: "4px 14px 4px 0" }}>
                    {k.scalable
                      ? <Champ valeur={k.costPerX} defaut={d.keywords[label].costPerX} onChange={(n) => majKw(label, "costPerX", n)} />
                      : <span style={{ color: "#ddd" }}>—</span>}
                  </td>
                  <td style={{ padding: "4px 14px 4px 0", color: "#888", whiteSpace: "nowrap" }}>{RARETES[k.minTier]}</td>
                  <td style={{ padding: "4px 0", color: "#aaa" }}>{ZONES.includes(k.zone as never) ? k.zone : k.zone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
