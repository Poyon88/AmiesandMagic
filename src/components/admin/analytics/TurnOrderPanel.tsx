"use client";

// ÉQUILIBRAGE — l'initiative avantage-t-elle, ou désavantage-t-elle ?
//
// Deux camps seulement, donc pas de tableau d'entités : une comparaison face à
// face, et surtout une lecture de la SIGNIFICATIVITÉ. Sur quinze parties, un
// écart de dix points ne veut rien dire, et un module d'équilibrage qui laisse
// croire le contraire fait plus de mal que de bien — on rééquilibre alors sur
// du bruit.
//
// Le premier joueur n'est stocké nulle part : il se dérive de l'identifiant de
// la partie. La mesure porte donc aussi sur toutes les parties enregistrées
// AVANT que la question ne se pose.

export interface TurnOrderStat {
  key: "first" | "second";
  label: string;
  wins: number;
  losses: number;
  winrate: number;
  games_count: number;
}

export interface TurnOrderReport {
  stats: TurnOrderStat[];
  total_matches: number;
  skipped_snapshots: number;
}

/** Marge d'erreur à ~95 % sur une proportion, en points de pourcentage.
 *
 *  `1.96 × √(p(1−p)/n)`, avec p figé à 0,5 : c'est le cas le plus défavorable,
 *  donc la marge la plus large. Mieux vaut annoncer une incertitude un peu trop
 *  grande que trop petite quand on s'apprête à rééquilibrer un jeu. */
function marginOfError(n: number): number {
  if (n <= 0) return 100;
  return 1.96 * Math.sqrt(0.25 / n) * 100;
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

export default function TurnOrderPanel({ report }: { report: TurnOrderReport }) {
  const first = report.stats.find((s) => s.key === "first");
  const second = report.stats.find((s) => s.key === "second");
  if (!first || !second) return null;

  const n = report.total_matches;
  const marge = marginOfError(n);
  const ecart = Math.abs(first.winrate - 0.5) * 100;
  // Un écart plus petit que la marge d'erreur ne se distingue pas du hasard.
  const significatif = n > 0 && ecart > marge;

  const verdict =
    n === 0
      ? "Aucune partie analysée sur cette période."
      : !significatif
        ? `Aucun déséquilibre décelable : l'écart (${ecart.toFixed(1)} pt) reste sous la marge d'erreur (± ${marge.toFixed(1)} pt) sur ${n} partie${n > 1 ? "s" : ""}.`
        : first.winrate > 0.5
          ? `Commencer AVANTAGE de ${ecart.toFixed(1)} pt, au-delà de la marge d'erreur (± ${marge.toFixed(1)} pt).`
          : `Commencer DÉSAVANTAGE de ${ecart.toFixed(1)} pt, au-delà de la marge d'erreur (± ${marge.toFixed(1)} pt).`;

  const card = (s: TurnOrderStat, accent: string) => (
    <div
      key={s.key}
      style={{
        flex: 1, minWidth: 220, background: "#1a1a2e", border: `1px solid ${accent}55`,
        borderRadius: 8, padding: 20, textAlign: "center",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#888" }}>
        {s.label}
      </div>
      <div style={{ fontSize: 40, fontWeight: 700, color: accent, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
        {s.games_count > 0 ? pct(s.winrate) : "—"}
      </div>
      <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>
        {s.wins} victoire{s.wins > 1 ? "s" : ""} · {s.losses} défaite{s.losses > 1 ? "s" : ""}
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
        {s.games_count} partie{s.games_count > 1 ? "s" : ""}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {card(first, "#e8a33d")}
        {card(second, "#5b9bd5")}
      </div>

      {/* Barre de comparaison : la moitié exacte est matérialisée, parce que
          c'est d'elle qu'on mesure l'écart. */}
      {n > 0 && (
        <div style={{ position: "relative", height: 26, borderRadius: 4, overflow: "hidden", background: "#5b9bd5" }}>
          <div style={{ width: `${first.winrate * 100}%`, height: "100%", background: "#e8a33d" }} />
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#fff", opacity: 0.85 }} />
          <span style={{ position: "absolute", left: 8, top: 4, fontSize: 11, color: "#1a1a2e", fontWeight: 700 }}>
            Commence
          </span>
          <span style={{ position: "absolute", right: 8, top: 4, fontSize: 11, color: "#fff", fontWeight: 700 }}>
            Joue en second
          </span>
        </div>
      )}

      <div
        style={{
          background: significatif ? "#3a2a10" : "#1a1a2e",
          border: `1px solid ${significatif ? "#e8a33d" : "#333"}`,
          borderRadius: 6, padding: 14, fontSize: 13, color: significatif ? "#f0c987" : "#aaa",
        }}
      >
        {verdict}
      </div>

      <p style={{ fontSize: 11, color: "#666", margin: 0, lineHeight: 1.7 }}>
        Le joueur qui commence démarre avec <strong>une carte de moins</strong>, et celui qui joue
        en second reçoit une <strong>Étincelle de mana</strong> : ce panneau mesure l&apos;effet
        combiné de ces deux compensations. L&apos;ordre de jeu est déduit de l&apos;identifiant de
        la partie, donc la mesure couvre aussi les parties antérieures à ces règles — un écart
        mesuré sur « Tout » mélange donc les époques. Comparez les périodes avant de conclure.
        {report.skipped_snapshots > 0 && (
          <>
            {" "}
            <strong style={{ color: "#e8a33d" }}>
              {report.skipped_snapshots} instantané{report.skipped_snapshots > 1 ? "s" : ""} écarté
              {report.skipped_snapshots > 1 ? "s" : ""}
            </strong>{" "}
            (partie introuvable ou joueur non rattaché) : ils ne comptent dans aucun des deux camps.
          </>
        )}
      </p>
    </div>
  );
}
