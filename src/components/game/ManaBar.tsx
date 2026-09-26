"use client";

import { EXPLORATION_PALIER } from "@/lib/game/constants";

interface ManaBarProps {
  current: number;
  max: number;
  /** Mana ENGAGÉ par une carte en cours de jeu, tant que le joueur enchaîne ses
   *  choix (ciblage, sélection « 1 parmi 3 », paiement alternatif…). Le moteur
   *  ne débite qu'au dispatch, une fois tous les choix faits : sans cette
   *  réserve, la jauge affichait encore le mana plein pendant qu'on choisissait
   *  la cible d'un sort déjà engagé — et laissait croire qu'il restait de quoi
   *  en jouer un second. Purement visuel : annuler le ciblage rend la réserve. */
  reserved?: number;
  /** Compteur d'Épargne. `null` = la capacité ne s'est jamais déclenchée pour ce
   *  joueur → pastille masquée. Une fois apparue elle ne disparaît plus, même à
   *  0, pour que le joueur garde le repère visuel de sa ressource. */
  epargne?: number | null;
  /** Épargne dépensable MAINTENANT (mon tour, compteur ≥ 1, offre possible).
   *  Faux ⇒ la pastille reste lisible mais inerte. */
  canSpendEpargne?: boolean;
  onSpendEpargne?: () => void;
  /** Camp de cette barre. Sert d'ancre DOM (`data-epargne-badge`) à
   *  EpargneGainOverlay, qui vient poser le « +N » sur le losange. La barre est
   *  montée en double (variantes de gabarit) : l'overlay retient celle qui est
   *  réellement visible. */
  side?: "mine" | "theirs";
  /** Compteur de Foi — mêmes conventions que `epargne` (null = masqué). */
  foi?: number | null;
  /** Foi dépensable MAINTENANT (mon tour, compteur ≥ 1, place en main). */
  canSpendFoi?: boolean;
  onSpendFoi?: () => void;
  /** Compteur de Conquête. Contrairement aux deux autres, il est MASQUÉ à 0 et
   *  à null : il n'apparaît qu'entre 1 et le palier (spec du clan). */
  conquete?: number | null;
  /** Conquête déclenchable MAINTENANT (mon tour, compteur AU PALIER, place en
   *  main, deck adverse non vide). */
  canSpendConquete?: boolean;
  onSpendConquete?: () => void;
  /** Compteur d'Exploration. Masqué à 0 et à null, comme la Conquête. Purement
   *  INFORMATIF : le palier se règle tout seul dans le moteur (pioche
   *  automatique), il n'y a donc rien à cliquer. */
  exploration?: number | null;
  /** SINGULIER : deck de départ sans doublon. `true`/`false` pour SON propre
   *  camp (toujours connu), `true` pour l'adversaire une fois RÉVÉLÉ, `null`
   *  tant qu'il ne l'est pas (rien n'est affiché). */
  singleton?: boolean | null;
  /** CONTRESORT armé par un sort : nombre de contres en attente. Masqué à 0
   *  ou absent ; visible dans les DEUX camps (comme la garde d'une unité sur le
   *  plateau), pour que l'adversaire sache que son prochain sort sera annulé. */
  contresort?: number | null;
  /** Exclusions armées par un sort Exclusion X (PlayerState.exclusion). */
  exclusion?: number | null;
}

export default function ManaBar({
  current, max, reserved = 0, epargne = null, canSpendEpargne = false, onSpendEpargne, side,
  foi = null, canSpendFoi = false, onSpendFoi,
  conquete = null, canSpendConquete = false, onSpendConquete,
  exploration = null,
  singleton = null,
  contresort = null,
  exclusion = null,
}: ManaBarProps) {
  const held = Math.max(0, Math.min(reserved, current));
  const available = current - held;

  return (
    <div className="flex items-center gap-3" data-mana-bar={side}>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => {
          // Trois états : disponible, engagé (le cristal se vide mais reste
          // signalé par un contour pointillé), vide.
          const isAvailable = i < available;
          const isHeld = !isAvailable && i < current;
          return (
            <div
              key={i}
              className={`w-6 h-6 rounded-full border transition-colors ${
                isAvailable
                  ? "bg-mana-blue border-mana-blue shadow-sm shadow-mana-blue/50"
                  : isHeld
                    ? "bg-mana-blue/20 border-dashed border-mana-blue/60"
                    : "bg-background/30 border-card-border"
              }`}
            />
          );
        })}
      </div>
      <span className="text-base font-bold text-mana-blue">
        {available}/{max}
      </span>
      {epargne !== null && (
        // Losange, et non pastille ronde : le badge d'armure du héros est déjà
        // un rond doré (HeroPortrait / Hero3DViewer). Forme distincte pour que
        // les deux ne se confondent pas d'un coup d'œil.
        <button
          type="button"
          data-epargne-badge={side}
          onClick={canSpendEpargne ? onSpendEpargne : undefined}
          disabled={!canSpendEpargne}
          aria-label={`Épargne : ${epargne}`}
          title={
            canSpendEpargne
              ? `Épargne ${epargne} — révéler 3 cartes de coût ${epargne}`
              : `Épargne ${epargne}`
          }
          className={`relative w-7 h-7 rotate-45 rounded-[6px] border-2 transition-all ${
            canSpendEpargne
              ? "border-am-gold-bright bg-am-gold/30 cursor-pointer hover:scale-110 shadow-[0_0_8px_var(--am-gold)]"
              : "border-am-gold/50 bg-am-gold/10 cursor-default opacity-70"
          }`}
        >
          <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[13px] font-bold text-am-gold-bright leading-none">
            {epargne}
          </span>
        </button>
      )}
      {(contresort ?? 0) > 0 && (
        // Contre(s) armé(s) par un sort Contresort : pastille rouge, un nombre
        // seulement au-delà d'un contre.
        <span
          data-contresort-badge={side}
          aria-label={`Contresort armé : ${contresort}`}
          title={(contresort ?? 0) > 1
            ? `Contresort armé — les ${contresort} prochaines actions adverses sont annulées`
            : "Contresort armé — la prochaine action adverse est annulée"}
          className="relative inline-flex items-center justify-center gap-0.5 h-7 min-w-7 px-1 rounded-full border-2 border-red-400/70 bg-red-900/40 text-red-100 text-[13px] font-bold leading-none shadow-[0_0_8px_rgba(248,113,113,0.6)]"
        >
          <span aria-hidden>🚫</span>
          {(contresort ?? 0) > 1 && <span>{contresort}</span>}
        </span>
      )}
      {(exclusion ?? 0) > 0 && (
        // Même pastille que Contresort, pour les invocations d'unités.
        <span
          data-exclusion-badge={side}
          aria-label={`Exclusion armée : ${exclusion}`}
          title={(exclusion ?? 0) > 1
            ? `Exclusion armée — les ${exclusion} prochaines invocations d'unités adverses sont annulées`
            : "Exclusion armée — la prochaine invocation d'unité adverse est annulée"}
          className="relative inline-flex items-center justify-center gap-0.5 h-7 min-w-7 px-1 rounded-full border-2 border-orange-400/70 bg-orange-900/40 text-orange-100 text-[13px] font-bold leading-none shadow-[0_0_8px_rgba(251,146,60,0.6)]"
        >
          <span aria-hidden>⛔</span>
          {(exclusion ?? 0) > 1 && <span>{exclusion}</span>}
        </span>
      )}
      {foi !== null && (
        // Même losange que l'Épargne, en teinte d'aube (blanc doré) pour que
        // les deux compteurs ne se confondent pas côte à côte.
        <button
          type="button"
          data-foi-badge={side}
          onClick={canSpendFoi ? onSpendFoi : undefined}
          disabled={!canSpendFoi}
          aria-label={`Foi : ${foi}`}
          title={
            canSpendFoi
              ? `Foi ${foi} — découvrir 1 carte parmi 3 de votre deck (coût ≤ ${foi})`
              : `Foi ${foi}`
          }
          className={`relative w-7 h-7 rotate-45 rounded-[6px] border-2 transition-all ${
            canSpendFoi
              ? "border-amber-100 bg-amber-50/30 cursor-pointer hover:scale-110 shadow-[0_0_8px_#fde68a]"
              : "border-amber-100/50 bg-amber-50/10 cursor-default opacity-70"
          }`}
        >
          <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[13px] font-bold text-amber-50 leading-none">
            {foi}
          </span>
        </button>
      )}
      {(conquete ?? 0) >= 1 && (
        // Losange rouge sang : la conquête prend à l'adversaire. Il ne vit
        // qu'entre 1 et le palier — un joueur sans carte Conquête ne le voit
        // jamais.
        <button
          type="button"
          data-conquete-badge={side}
          onClick={canSpendConquete ? onSpendConquete : undefined}
          disabled={!canSpendConquete}
          aria-label={`Conquête : ${conquete}`}
          title={
            canSpendConquete
              ? `Conquête ${conquete} — découvrir 1 carte parmi 3 du deck adverse et la prendre en main`
              : `Conquête ${conquete}`
          }
          className={`relative w-7 h-7 rotate-45 rounded-[6px] border-2 transition-all ${
            canSpendConquete
              ? "border-red-300 bg-red-600/40 cursor-pointer hover:scale-110 shadow-[0_0_8px_#f87171]"
              : "border-red-300/50 bg-red-600/15 cursor-default opacity-70"
          }`}
        >
          <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[13px] font-bold text-red-50 leading-none">
            {conquete}
          </span>
        </button>
      )}
      {(exploration ?? 0) >= 1 && (
        // Losange vert tendre : le seul compteur qui ne se CLIQUE pas. Au
        // palier le moteur fait piocher et retranche le palier dans la même
        // action — on n'y lit donc jamais que 1 ou 2.
        <span
          data-exploration-badge={side}
          aria-label={`Exploration : ${exploration} sur ${EXPLORATION_PALIER}`}
          title={`Exploration ${exploration}/${EXPLORATION_PALIER} — à ${EXPLORATION_PALIER}, pioche une carte`}
          className="relative w-7 h-7 rotate-45 rounded-[6px] border-2 cursor-default border-lime-300/70 bg-lime-600/25"
        >
          <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[11px] font-bold text-lime-50 leading-none">
            {exploration}/{EXPLORATION_PALIER}
          </span>
        </span>
      )}
      {singleton !== null && (
        // Losange turquoise (couleur réservée à Singulier) : plein si les
        // capacités Singulier de ce camp sont actives, barré sinon.
        <span
          data-singulier-badge={side}
          aria-label={singleton ? "Deck singulier" : "Deck non singulier"}
          title={
            side === "theirs"
              ? "Deck singulier révélé : les capacités Singulier adverses sont actives"
              : singleton
                ? "Deck singulier : vos capacités Singulier sont actives"
                : "Deck non singulier (une carte en double) : vos capacités Singulier sont inertes"
          }
          className="relative w-7 h-7 rotate-45 rounded-[6px] border-2 cursor-default"
          style={{
            borderColor: singleton ? "#0D9488" : "#0D948866",
            background: singleton ? "#0D948855" : "#0D948814",
            opacity: singleton ? 1 : 0.7,
          }}
        >
          <span className="absolute inset-0 -rotate-45 flex items-center justify-center text-[13px] font-bold leading-none" style={{ color: singleton ? "#ccfbf1" : "#5eead4" }}>
            {singleton ? "S" : "S̶"}
          </span>
        </span>
      )}
    </div>
  );
}
