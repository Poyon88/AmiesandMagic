"use client";

// Fond de la tuile « Tournois » de l'accueil : les récompenses par rang du grand
// tournoi mensuel à 1 024 joueurs (prize pool, podium, tableau), sans l'en-tête
// de sa carte. Vraies briques et non capture : elles suivent le barème
// (src/lib/tournaments/config.ts) sans image à régénérer.
//
// L'ensemble est plus haut que la tuile : il est calé EN HAUT et le reste est
// coupé. Mise en page à 150 % de la largeur puis réduite de 2/3 pour tenir dans
// la tuile : la composition reste celle du bureau quelle que soit sa taille,
// sans mesure en JavaScript.
//
// Pas de zoom au survol, contrairement aux images : il rognerait le texte.
//
// `inert` + `pointer-events-none` : purement décoratif ici. Un clic ou une
// tabulation doit rester celui du lien de la tuile.
import { useCashPrizes } from "@/components/shared/GeoProvider";
import { podium, prizePool, rewardedRows, rewardTable } from "@/lib/tournaments/rewards";
import { Podium, PrizePoolSummary, RewardTable } from "./RewardParts";

const TAILLE_AFFICHEE = 1024;

export default function TournamentTileBackdrop() {
  const cash = useCashPrizes();
  return (
    <div
      aria-hidden="true"
      inert
      className="absolute inset-0 overflow-hidden pointer-events-none select-none opacity-40"
    >
      <div
        className="flex flex-col gap-4 p-5"
        style={{ width: "150%", marginLeft: "-25%", transform: "scale(0.6667)", transformOrigin: "top center" }}
      >
        <PrizePoolSummary pool={prizePool("grand", TAILLE_AFFICHEE)} withCash={cash} />
        <Podium rows={podium("grand", TAILLE_AFFICHEE)} withCash={cash} />
        <RewardTable
          rows={rewardedRows(rewardTable("grand", TAILLE_AFFICHEE), cash)}
          firstColumn={cash ? "cash" : null}
        />
      </div>
    </div>
  );
}
