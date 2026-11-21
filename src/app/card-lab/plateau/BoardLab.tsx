"use client";

// Banc d'essai de la MISE EN PAGE du plateau.
//
// Rend le VRAI GameBoard sur un état fabriqué sur place : aucune partie, aucun
// adversaire, aucune écriture en base. Sert à juger le plateau à toutes les
// largeurs de fenêtre (16:9, ultra-large, tablette) sans risquer de jouer un
// coup dans une vraie partie — il suffit de redimensionner la fenêtre.
//
// Réglages par l'adresse :
//   ?disposition=mtgo|classic   disposition du plateau (défaut : mtgo)
//   ?main=7                     cartes en main (défaut : 7)
//   ?terrain=5                  unités par rangée (défaut : 5, 8 au plus)
//   ?historique=7               vignettes dans la bande d'historique (défaut : 3)
//   ?image=<url>                illustration du plateau à essayer
//   ?large=<url>                sa version 21:9 (centre identique à ?image)
import { useEffect } from "react";
import GameBoard from "@/components/game/GameBoard";
import { useGameStore } from "@/lib/store/gameStore";
import { mkCard, mkInstance, mkState } from "@/lib/game/test-harness";
import { MAX_BOARD_SIZE } from "@/lib/game/constants";

const unite = (i: number, cout: number) =>
  mkInstance(mkCard({
    name: `Unité d'essai ${i}`, mana_cost: cout, attack: 1 + (i % 5), health: 2 + (i % 4),
    faction: "Mercenaires", rarity: "Commune", card_type: "creature",
  }));

export default function BoardLab() {
  // Le plateau n'est monté qu'une fois l'état d'essai posé dans le store.
  const pret = useGameStore((s) => s.gameState !== null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const borne = (cle: string, defaut: number, max: number) =>
      Math.max(0, Math.min(max, Number(q.get(cle) ?? defaut) || 0));
    const main = borne("main", 7, 14);
    const terrain = borne("terrain", 5, MAX_BOARD_SIZE);

    const etat = mkState();
    const [moi, adversaire] = etat.players;
    for (let i = 0; i < terrain; i++) {
      moi.board.push(unite(i, 2));
      adversaire.board.push(unite(i + 20, 3));
    }
    // `?etats=1` : montre les états empilés (Peste seule, Peste + Poison,
    // Peste + Poison + Paralysie) pour régler pastilles et voiles.
    if (q.get("etats")) {
      const [a, b, c] = moi.board;
      if (a) a.isPlagued = true;
      if (b) { b.isPlagued = true; b.isPoisoned = true; }
      if (c) { c.isPlagued = true; c.isPoisoned = true; c.isParalyzed = true; }
    }
    for (let i = 0; i < main; i++) moi.hand.push(unite(i + 40, 1 + (i % 6)));
    for (let i = 0; i < 5; i++) adversaire.hand.push(unite(i + 60, 2));
    for (let i = 0; i < 30; i++) {
      moi.deck.push(unite(i + 100, 2));
      adversaire.deck.push(unite(i + 200, 2));
    }
    etat.turnStartedAt = Date.now();
    const historique = borne("historique", 3, 7);

    useGameStore.setState({
      gameState: etat,
      localPlayerId: moi.id,
      isAnimating: false,
      boardLayout: q.get("disposition") === "classic" ? "classic" : "mtgo",
      actionHistory: Array.from({ length: historique }, (_, i) => ({
        id: `essai-${i}`,
        kind: i % 2 ? ("attack" as const) : ("spell" as const),
        side: i % 3 ? ("friendly" as const) : ("enemy" as const),
        card: unite(i + 300, 2).card,
        timestamp: Date.now() - i * 1000,
      })),
      boardImageUrl: q.get("image"),
      boardImageWideUrl: q.get("large"),
    });
    return () => useGameStore.setState({ gameState: null });
  }, []);

  return pret ? <GameBoard /> : null;
}
