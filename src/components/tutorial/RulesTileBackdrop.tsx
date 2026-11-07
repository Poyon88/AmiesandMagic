"use client";

// Fond de la tuile « Comment jouer » de l'accueil : la vraie section d'ouverture
// du guide, traduite et chiffrée comme lui. Même principe que le fond de la tuile
// Tournois : calée en haut, mise en page au double de la largeur puis réduite de
// moitié pour tenir dans la tuile, décorative (`inert`).
import { GoalSection } from "./TutorialParts";

export default function RulesTileBackdrop() {
  return (
    <div
      aria-hidden="true"
      inert
      className="absolute inset-0 overflow-hidden pointer-events-none select-none opacity-40"
    >
      <div
        className="p-6"
        style={{ width: "200%", marginLeft: "-50%", transform: "scale(0.5)", transformOrigin: "top center" }}
      >
        <GoalSection />
      </div>
    </div>
  );
}
