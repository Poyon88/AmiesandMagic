"use client";

/** AURA des héros en ÉDITION LIMITÉE (toute rareté hors Commune) autour de leur médaillon (rond).
 *
 *  Deux couches, arbitrées sur le banc de /card-lab :
 *   - `halo`   — lueur à la couleur de la rareté, qui « respire » (≈ 3,6 s) ;
 *   - `reflet` — trait de lumière qui fait le tour du cadre doré, puis se tait.
 *  Le cartouche de numéro d'exemplaire a été écarté : il alourdissait le visuel.
 *
 *  Le médaillon est passé en `children`, intact : l'aura l'entoure sans le
 *  modifier (même principe que HeroOrbit). Animations coupées si l'utilisateur
 *  demande moins de mouvement. */

const RARETE_TEINTE: Record<string, string> = {
  "Peu Commune": "#4caf50",
  "Rare": "#4fc3f7",
  "Épique": "#ce93d8",
  "Légendaire": "#ffd54f",
};

/** Tout héros en édition limitée porte l'aura : rareté autre que Commune
 *  (absente = Commune, héros de base). */
export function aAuraPremium(rarete?: string | null): boolean {
  return !!rarete && rarete !== "Commune";
}

export function teinteAura(rarete?: string | null): string {
  return RARETE_TEINTE[rarete ?? ""] ?? "#ffd54f";
}

const KEYFRAMES = `
@keyframes am-aura-respire {
  0%, 100% { opacity: .8; transform: scale(.97); }
  50%      { opacity: 1;   transform: scale(1.04); }
}
@keyframes am-aura-reflet {
  0%   { transform: rotate(-40deg); opacity: 0; }
  4%   { opacity: 1; }
  32%  { transform: rotate(320deg); opacity: 1; }
  36%, 100% { transform: rotate(320deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .am-aura-anim { animation: none !important; }
}
`;

export default function PremiumAura({
  rarete, halo = true, reflet = true, actif = true, children,
}: {
  rarete?: string | null;
  halo?: boolean;
  reflet?: boolean;
  /** Aura allumée ? Vrai partout par défaut (collection, révélation). EN
   *  PARTIE, le plateau ne l'allume que le temps du pouvoir héroïque : en
   *  permanence, elle accaparait le regard. Éteinte, elle s'efface en fondu et
   *  ses animations sont mises en pause (aucun coût tant qu'elle dort). */
  actif?: boolean;
  children: React.ReactNode;
}) {
  const teinte = teinteAura(rarete);
  const veille: React.CSSProperties = {
    opacity: actif ? 1 : 0,
    transition: "opacity 0.6s ease-out",
  };
  const lecture = actif ? "running" : "paused";
  return (
    <div className="relative" style={{ isolation: "isolate" }}>
      <style>{KEYFRAMES}</style>

      {halo && (
        <div
          aria-hidden
          className="am-aura-anim absolute rounded-full pointer-events-none"
          style={{
            inset: -30, zIndex: -1,
            background: `radial-gradient(circle, ${teinte} 0%, ${teinte}b3 54%, ${teinte}55 66%, transparent 74%)`,
            animation: "am-aura-respire 3.6s ease-in-out infinite",
            animationPlayState: lecture,
            // L'opacité de veille passe par un filtre : `opacity` est déjà
            // pilotée par l'animation de respiration.
            filter: `blur(5px) saturate(1.3) opacity(${actif ? 1 : 0})`,
            transition: "filter 0.6s ease-out",
          }}
        />
      )}

      {children}

      {reflet && (
        // Anneau restreint au CADRE du médaillon (bande extérieure) par un
        // masque radial ; le dégradé conique y fait courir un éclat qui tourne.
        <div
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            zIndex: 1,
            ...veille,
            WebkitMaskImage: "radial-gradient(closest-side, transparent 82%, #000 86%, #000 98%, transparent 100%)",
            maskImage: "radial-gradient(closest-side, transparent 82%, #000 86%, #000 98%, transparent 100%)",
            mixBlendMode: "screen",
          }}
        >
          <div
            // Remonté à chaque allumage : le reflet repart du début de son tour
            // au lieu de reprendre au milieu d'un cycle, en plein silence.
            key={actif ? "allume" : "eteint"}
            className="am-aura-anim absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(255,250,225,.15) 318deg, rgba(255,250,225,.95) 340deg, rgba(255,250,225,.15) 352deg, transparent 360deg)",
              animation: "am-aura-reflet 6s ease-in-out infinite",
              animationPlayState: lecture,
            }}
          />
        </div>
      )}
    </div>
  );
}
