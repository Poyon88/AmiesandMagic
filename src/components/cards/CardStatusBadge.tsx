"use client";

// Pastille du statut de cycle de vie d'une carte (brouillon / retirée /
// exclue). Rien pour une carte jouable : c'est l'état normal, le signaler
// partout serait du bruit. Le motif, s'il existe, passe en infobulle.
import { useTranslations } from "next-intl";
import type { CardStatus } from "@/lib/game/types";
import { cardStatusOf } from "@/lib/game/deck-rules";

export const CARD_STATUS_COLORS: Record<CardStatus, string> = {
  draft: "#7b61ff",
  playable: "#2e7d32",
  retired: "#e08a00",
  excluded: "#c0392b",
};

export function CardStatusBadge({
  card,
  style,
  overlay = false,
}: {
  card: { status?: CardStatus | null; status_reason?: string | null };
  style?: React.CSSProperties;
  /** Posée SUR l'illustration d'une carte : fond translucide. À placer sous
   *  le cadre du nom (top ≈ 16 %), jamais par-dessus le nom ni le coût. */
  overlay?: boolean;
}) {
  const t = useTranslations("cardStatus");
  const status = cardStatusOf(card);
  if (status === "playable") return null;
  return (
    <span
      title={card.status_reason ? t("reason", { reason: card.status_reason }) : undefined}
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 999,
        background: overlay ? `${CARD_STATUS_COLORS[status]}59` : CARD_STATUS_COLORS[status],
        color: "#fff",
        ...(overlay ? { textShadow: "0 0 2px #000, 0 0 3px #000", border: `1px solid ${CARD_STATUS_COLORS[status]}99` } : {}),
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
        lineHeight: 1.6,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {t(status)}
    </span>
  );
}
