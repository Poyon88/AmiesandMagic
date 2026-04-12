"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { useAudioStore } from "@/lib/store/audioStore";

const LOW_HP_THRESHOLD = 10;

export default function useGameMusic() {
  const phase = useGameStore((s) => s.gameState?.phase);
  const winner = useGameStore((s) => s.gameState?.winner);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const boardMusicUrl = useGameStore((s) => s.boardMusicUrl);
  const boardTenseMusicUrl = useGameStore((s) => s.boardTenseMusicUrl);
  const boardVictoryMusicUrl = useGameStore((s) => s.boardVictoryMusicUrl);
  const boardDefeatMusicUrl = useGameStore((s) => s.boardDefeatMusicUrl);

  const myHeroHp = useGameStore((s) => {
    const gs = s.gameState;
    if (!gs || !s.localPlayerId) return 30;
    const me = gs.players.find((p) => p.id === s.localPlayerId);
    return me?.hero.hp ?? 30;
  });

  const setMusicContext = useAudioStore((s) => s.setMusicContext);
  const tenseTrackUrl = useAudioStore((s) => s.tenseTrackUrl);
  const victoryTrackUrl = useAudioStore((s) => s.victoryTrackUrl);
  const defeatTrackUrl = useAudioStore((s) => s.defeatTrackUrl);

  const prevContextRef = useRef<string | null>(null);

  useEffect(() => {
    let ctx: Parameters<typeof setMusicContext>[0] = null;
    let url: string | undefined;

    if (phase === "finished") {
      const won = winner === localPlayerId;
      ctx = won ? "victory" : "defeat";
      // Per-board track takes priority, fallback to global
      url = (won ? boardVictoryMusicUrl : boardDefeatMusicUrl)
        ?? (won ? victoryTrackUrl : defeatTrackUrl)
        ?? undefined;
    } else if ((phase === "playing" || phase === "mulligan") && myHeroHp <= LOW_HP_THRESHOLD) {
      ctx = "tense";
      url = boardTenseMusicUrl ?? tenseTrackUrl ?? undefined;
    } else if (phase === "playing" || phase === "mulligan") {
      ctx = "board";
      url = boardMusicUrl ?? undefined;
    }

    // Avoid redundant updates
    const key = `${ctx}:${url ?? ""}`;
    if (key !== prevContextRef.current && ctx) {
      prevContextRef.current = key;
      setMusicContext(ctx, url);
    }
  }, [
    phase, winner, localPlayerId, myHeroHp,
    boardMusicUrl, boardTenseMusicUrl, boardVictoryMusicUrl, boardDefeatMusicUrl,
    tenseTrackUrl, victoryTrackUrl, defeatTrackUrl,
    setMusicContext,
  ]);
}
