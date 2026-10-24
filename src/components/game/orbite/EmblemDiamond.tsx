"use client";

import KeywordIcon from "@/components/shared/KeywordIcon";
import { KEYWORD_SYMBOLS, KEYWORD_LABELS } from "@/lib/game/keyword-labels";
import { describeComposedCap, emblemCadence } from "@/lib/game/composed-display";
import type { Capability, Emblem } from "@/lib/game/types";
import { BulleTexte } from "./OrbitTooltip";
import { lent } from "@/lib/fx/overlayMotion";

/** TYPE d'un emblème, qui décide de sa couleur dans l'orbite.
 *  La durée prime : un emblème composé à durée est d'abord un emblème qui VA
 *  DISPARAÎTRE — c'est l'information qui change la décision du joueur. */
export type EmblemType = "permanent" | "ephemere" | "declenche";
export function emblemType(e: Emblem): EmblemType {
  if (e.duration != null) return "ephemere";
  return e.composed ? "declenche" : "permanent";
}

const TEINTE: Record<EmblemType, string> = {
  permanent: "var(--orbit-permanent)",
  ephemere: "var(--orbit-ephemere)",
  declenche: "var(--orbit-declenche)",
};

/** Libellé d'un emblème : le registre pour une aura, la description des
 *  composés (enveloppés dans une Capability minimale) pour les autres. */
export function emblemLabel(e: Emblem): string {
  return e.abilityId
    ? (KEYWORD_LABELS[e.abilityId as keyof typeof KEYWORD_LABELS] ?? e.abilityId)
    : describeComposedCap({
        uid: "", trigger: e.trigger ?? "on_end_of_turn", effectKind: "immediate",
        abilityId: "_composed", composed: e.composed,
      } as Capability);
}

export function EmblemBulle({ e, porteur }: { e: Emblem; porteur: "self" | "opponent" }) {
  const montant = e.params?.amount ?? e.params?.attack;
  return (
    <BulleTexte
      titre={montant != null && e.abilityId ? `${emblemLabel(e)} · ${montant}` : emblemLabel(e)}
      lignes={[
        // CADENCE — à quoi l'emblème réagit. Réservé aux composés : ceux du
        // registre sont des auras permanentes, ils n'ont rien à déclencher.
        e.composed && emblemCadence(e.trigger, porteur),
        e.stacks > 1 && `${e.stacks} exemplaires`,
        <span key="d" style={{ color: e.duration != null && e.duration <= 1 ? "#e08a3c" : undefined }}>
          {e.duration == null ? "Permanent" : e.duration === 1 ? "Dernier tour" : `Encore ${e.duration} tours`}
        </span>,
        e.malediction && <span key="m" style={{ color: "var(--orbit-malediction)" }}>Malédiction posée par l&apos;adversaire</span>,
        // La source a pu disparaître depuis longtemps : seule trace qu'il en reste.
        e.sourceName && <span key="s" style={{ opacity: 0.7, fontStyle: "italic" }}>{e.sourceName}</span>,
      ]}
    />
  );
}

/** Points de DURÉE autour du losange : un par tour restant (6 au plus), le
 *  dernier en orange. */
function PointsDuree({ duree, size }: { duree: number; size: number }) {
  const n = Math.min(6, Math.max(0, duree));
  const r = size / 2 + 3;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        // Arc sous le losange, centré sur midi-et-demie inversé (en bas).
        const a = ((90 + (i - (n - 1) / 2) * 22) * Math.PI) / 180;
        return (
          <span key={i} aria-hidden style={{
            position: "absolute", width: 5, height: 5, borderRadius: "50%",
            left: size / 2 + r * Math.cos(a) - 2.5, top: size / 2 + r * Math.sin(a) - 2.5,
            background: duree <= 1 ? "#e08a3c" : "var(--am-gold-bright)",
            boxShadow: "0 0 3px rgba(0,0,0,0.8)",
          }} />
        );
      })}
    </>
  );
}

export default function EmblemDiamond({ e, size, fireKey, bulle }: {
  e: Emblem;
  size: number;
  /** Change ⇒ le losange pulse (l'emblème vient d'agir). */
  fireKey?: number | null;
  bulle: { attacher: (el: HTMLElement | null) => void; handlers: Record<string, unknown> };
}) {
  const { attacher, handlers: poignees } = bulle;
  const type = emblemType(e);
  const teinte = TEINTE[type];
  const cote = Math.round(size / Math.SQRT2) - 2; // carré qui, tourné, tient dans `size`
  const bord = e.malediction ? "var(--orbit-malediction)" : "var(--am-gold)";
  return (
    <div
      ref={attacher}
      {...poignees}
      role="img"
      aria-label={emblemLabel(e)}
      className="relative"
      style={{ width: size, height: size, touchAction: "manipulation", WebkitTouchCallout: "none" }}
    >
      <div
        key={fireKey ?? "repos"}
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: fireKey ? `orbit-fire ${lent(0.9)}s ease-out` : undefined }}
      >
        <div style={{
          width: cote, height: cote, transform: "rotate(45deg)", borderRadius: 4,
          background: `linear-gradient(135deg, color-mix(in srgb, ${teinte} 75%, white 25%), ${teinte} 50%, color-mix(in srgb, ${teinte} 55%, black 45%))`,
          border: `2px solid ${bord}`,
          boxShadow: `0 0 0 1px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.55)${e.malediction ? ", 0 0 8px rgba(224,71,60,0.55)" : ""}`,
        }} />
        <div className="absolute" style={{ width: size * 0.46, height: size * 0.46 }}>
          <KeywordIcon
            symbol={(e.abilityId && KEYWORD_SYMBOLS[e.abilityId as keyof typeof KEYWORD_SYMBOLS]) || "🏵️"}
            size={Math.round(size * 0.46)}
            keyword={e.abilityId}
            tint="#f4e09a"
            fill
          />
        </div>
      </div>
      {e.duration != null && <PointsDuree duree={e.duration} size={size} />}
      {e.stacks > 1 && (
        <span style={{
          position: "absolute", right: -4, top: -4, minWidth: 16, height: 16, padding: "0 3px",
          borderRadius: 8, background: "#14100a", border: "1px solid var(--am-gold)",
          fontSize: 10, fontWeight: 800, color: "var(--am-gold-bright)", lineHeight: "14px", textAlign: "center",
        }}>×{e.stacks}</span>
      )}
    </div>
  );
}
