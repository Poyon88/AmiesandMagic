"use client";

// Détail du score d'une carte selon le barème calibré : une ligne par
// capacité (déclencheur et multiplicateurs déjà appliqués), stats, socle et
// coûts additionnels. Replié par défaut — la jauge suffit le plus souvent.
import type { ScoreCarte } from "@/lib/card-engine/card-points";

export function couleurBudget(ratio: number): string {
  return ratio <= 0.85 ? "#27ae60" : ratio <= 1.0 ? "#f39c12" : "#e74c3c";
}

export function BudgetGauge({ score }: { score: ScoreCarte }) {
  const couleur = couleurBudget(score.ratio);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9 }}>
      <div style={{ flex: 1, height: 4, background: "#e8e8e8", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: couleur, width: `${Math.min(120, score.ratio * 100)}%`, transition: "width 0.2s" }} />
      </div>
      <span style={{ color: couleur, fontWeight: 700, fontFamily: "'Cinzel',serif" }}>
        {Math.round(score.utilise)}/{Math.round(score.budget)}
      </span>
    </div>
  );
}

export default function BudgetDetail({ score }: { score: ScoreCarte }) {
  if (score.lignes.length === 0) return null;
  return (
    <details style={{ fontSize: 8, color: "#666", marginTop: 2 }}>
      <summary style={{ cursor: "pointer", userSelect: "none" }}>
        Détail du barème · {Math.round(score.ratio * 100)} % du budget
      </summary>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 3 }}>
        <tbody>
          {score.lignes.map((l) => (
            <tr key={l.libelle} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "1px 2px" }}>{l.libelle}</td>
              <td style={{ padding: "1px 2px", textAlign: "right", fontWeight: 700, color: l.points < 0 ? "#27ae60" : "#444" }}>
                {l.points > 0 ? "+" : ""}{l.points}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: "2px", fontWeight: 700 }}>Total / budget</td>
            <td style={{ padding: "2px", textAlign: "right", fontWeight: 700 }}>{score.utilise} / {score.budget}</td>
          </tr>
        </tbody>
      </table>
    </details>
  );
}
