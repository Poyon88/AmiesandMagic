// STATUTS VIVANTS — ce qui affecte une créature se VOIT sur elle tant que ça
// dure : le poison goutte, la paralysie l'enchaîne, l'Ombre fume.
//
// Tout est en CSS (keyframes `statut-*` de globals.css), sur `transform` et
// `opacity` seulement : aucune horloge JS, aucun rendu React par image — une
// douzaine de créatures affectées ne coûtent rien au fil principal. Les
// positions viennent de `hashRandom` : stables d'un rendu à l'autre et
// identiques chez les deux joueurs. Coupé par `prefers-reduced-motion`.

import { hashRandom } from "@/lib/fx/overlayMotion";

const COUCHE: React.CSSProperties = {
  position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden",
};

/** Gouttes vertes qui perlent du haut de la carte, et bulles qui remontent. */
export function PoisonVivant() {
  return (
    <div aria-hidden style={COUCHE}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={`g${i}`}
          className="statut-anim"
          style={{
            position: "absolute", top: 0, left: `${10 + hashRandom(i, 11) * 80}%`,
            width: 4, height: 7, borderRadius: "50% 50% 50% 50% / 35% 35% 65% 65%",
            background: "linear-gradient(180deg, #d9f99d, #22c55e 55%, #15803d)",
            boxShadow: "0 0 4px rgba(34,197,94,0.9)",
            opacity: 0,
            animation: `statut-goutte ${2.2 + hashRandom(i, 12) * 1.4}s cubic-bezier(0.55, 0, 0.9, 0.4) ${hashRandom(i, 13) * 2.4}s infinite`,
          }}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <span
          key={`b${i}`}
          className="statut-anim"
          style={{
            position: "absolute", bottom: 4, left: `${18 + hashRandom(i, 14) * 64}%`,
            width: 6, height: 6, borderRadius: "50%",
            border: "1px solid rgba(187,247,208,0.9)",
            background: "rgba(34,197,94,0.25)",
            opacity: 0,
            animation: `statut-bulle ${2.8 + hashRandom(i, 15) * 1.2}s ease-out ${hashRandom(i, 16) * 2.6}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/** Deux chaînes en croix qui se tendent sur la carte, puis frémissent. */
export function ParalysieVivante() {
  // Maillons : ovales répétés, dessinés en dégradé (pas d'image à charger).
  const maillons =
    "repeating-linear-gradient(90deg, rgba(221,214,254,0.95) 0 5px, rgba(91,33,182,0.9) 5px 7px, transparent 7px 9px)";
  return (
    <div aria-hidden style={COUCHE}>
      {[34, -34].map((angle, i) => (
        <div
          key={angle}
          style={{ position: "absolute", left: "-25%", top: "50%", width: "150%", height: 0, transform: `rotate(${angle}deg)` }}
        >
          <div
            className="statut-anim"
            style={{
              height: 6, marginTop: -3, borderRadius: 3,
              background: maillons,
              boxShadow: "0 0 6px rgba(139,92,246,0.9), 0 1px 2px rgba(0,0,0,0.7)",
              transformOrigin: i === 0 ? "0% 50%" : "100% 50%",
              animation: `statut-chaine-tend 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2) ${i * 0.12}s both, statut-chaine-fremit 2.6s ease-in-out ${0.6 + i * 0.3}s infinite`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Volutes sombres qui montent du pied de la carte et dérivent. */
export function OmbreVivante() {
  return (
    <div aria-hidden style={COUCHE}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="statut-anim"
          style={{
            position: "absolute", bottom: -14, left: `${-8 + hashRandom(i, 21) * 78}%`,
            width: 46 + hashRandom(i, 22) * 26, height: 46 + hashRandom(i, 22) * 26, borderRadius: "50%",
            // Dégradé déjà flou : pas de filter: blur(), coûteux et capricieux sur Safari.
            background: "radial-gradient(closest-side, rgba(20,18,48,0.85), rgba(49,46,129,0.45) 45%, rgba(49,46,129,0) 72%)",
            opacity: 0,
            ["--derive" as string]: `${(hashRandom(i, 23) - 0.5) * 34}px`,
            animation: `statut-volute ${4.2 + hashRandom(i, 24) * 2.2}s ease-in-out ${hashRandom(i, 25) * 4}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
