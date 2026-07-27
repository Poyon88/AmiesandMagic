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
}

export default function ManaBar({ current, max, reserved = 0 }: ManaBarProps) {
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
    </div>
  );
}
