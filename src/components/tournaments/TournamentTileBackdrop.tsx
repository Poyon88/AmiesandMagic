"use client";

// Fond de la tuile « Tournois » de l'accueil : la vraie carte du grand tournoi
// mensuel à 1 024 joueurs, et non une capture. Elle suit donc le barème
// (src/lib/tournaments/config.ts) sans image à régénérer.
//
// La carte est plus haute que la tuile : elle est calée EN HAUT et le reste est
// coupé. Mise en page à 150 % de la largeur puis réduite de 2/3 pour tenir dans
// la tuile : la carte garde sa composition de bureau quelle que soit la taille
// de la tuile, sans mesure en JavaScript.
//
// `inert` + `pointer-events-none` : ses boutons de taille sont décoratifs ici.
// Un clic ou une tabulation doit rester celui du lien de la tuile.
import { GrandTournamentCard } from "./TournamentRewardCards";

const TAILLE_AFFICHEE = 1024;

export default function TournamentTileBackdrop() {
  return (
    <div
      aria-hidden="true"
      inert
      className="absolute inset-0 overflow-hidden pointer-events-none select-none transition-transform duration-700 group-hover:scale-105"
    >
      <div style={{ width: "150%", marginLeft: "-25%", transform: "scale(0.6667)", transformOrigin: "top center" }}>
        <GrandTournamentCard initialSize={TAILLE_AFFICHEE} />
      </div>
      {/* La carte est du TEXTE : le voile de la tuile, pensé pour des images, ne
          suffit pas à séparer le titre des chiffres. D'où un halo sombre
          derrière le bloc central, qui laisse le haut et les bords lisibles. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 62% 42% at 50% 54%, rgba(8,8,20,0.92) 0%, rgba(8,8,20,0.72) 55%, transparent 100%)" }}
      />
    </div>
  );
}
