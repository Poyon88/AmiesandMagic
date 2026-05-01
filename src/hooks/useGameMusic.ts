"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store/gameStore";
import { useAudioStore } from "@/lib/store/audioStore";

const LOW_HP_THRESHOLD = 10;

export default function useGameMusic() {
  const phase = useGameStore((s) => s.gameState?.phase);
  const winner = useGameStore((s) => s.gameState?.winner);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const boardMusicUrls = useGameStore((s) => s.boardMusicUrls);
  const boardTenseMusicUrl = useGameStore((s) => s.boardTenseMusicUrl);
  const boardVictoryMusicUrl = useGameStore((s) => s.boardVictoryMusicUrl);
  const boardDefeatMusicUrl = useGameStore((s) => s.boardDefeatMusicUrl);

  const lowestHeroHp = useGameStore((s) => {
    const gs = s.gameState;
    if (!gs) return 30;
    return Math.min(...gs.players.map((p) => p.hero.hp));
  });

  const setMusicContext = useAudioStore((s) => s.setMusicContext);
  const tenseTrackUrl = useAudioStore((s) => s.tenseTrackUrl);
  const victoryTrackUrl = useAudioStore((s) => s.victoryTrackUrl);
  const defeatTrackUrl = useAudioStore((s) => s.defeatTrackUrl);

  const prevContextRef = useRef<string | null>(null);

  useEffect(() => {
    let ctx: Parameters<typeof setMusicContext>[0] = null;
    let url: string | undefined;
    let playlist: string[] | undefined;

    if (phase === "finished") {
      const won = winner === localPlayerId;
      ctx = won ? "victory" : "defeat";
      url = (won ? boardVictoryMusicUrl : boardDefeatMusicUrl)
        ?? (won ? victoryTrackUrl : defeatTrackUrl)
        ?? undefined;
    } else if ((phase === "playing" || phase === "mulligan") && lowestHeroHp <= LOW_HP_THRESHOLD) {
      ctx = "tense";
      url = boardTenseMusicUrl ?? tenseTrackUrl ?? undefined;
    } else if ((phase === "playing" || phase === "mulligan") && boardMusicUrls.length > 0) {
      // Only commit to the "board" context once we actually have at least one
      // track. Switching with an empty playlist would call setMusicContext
      // with url=undefined, the AudioProvider drive effect would early-return
      // on `if (!url)`, and the menu track would keep playing while the ref
      // was already locked on `board::` — preventing later re-trigger.
      ctx = "board";
      playlist = boardMusicUrls;
      url = boardMusicUrls[0];
    }

    const key = `${ctx}:${url ?? ""}:${(playlist ?? []).join(",")}`;
    if (key !== prevContextRef.current && ctx) {
      prevContextRef.current = key;
      setMusicContext(ctx, url, playlist);
    }
  }, [
    phase, winner, localPlayerId, lowestHeroHp,
    boardMusicUrls, boardTenseMusicUrl, boardVictoryMusicUrl, boardDefeatMusicUrl,
    tenseTrackUrl, victoryTrackUrl, defeatTrackUrl,
    setMusicContext,
  ]);
}
