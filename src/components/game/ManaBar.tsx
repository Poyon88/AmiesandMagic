"use client";

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
}

export default function ManaBar({
  current, max, reserved = 0, epargne = null, canSpendEpargne = false, onSpendEpargne,
}: ManaBarProps) {
  const held = Math.max(0, Math.min(reserved, current));
  const available = current - held;

  return (
    <div className="flex items-center gap-3">
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
    </div>
  );
}
