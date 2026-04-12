"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAudioStore } from "@/lib/store/audioStore";
import AudioEngine from "@/lib/audio/AudioEngine";
import SfxEngine from "@/lib/audio/SfxEngine";

const GAME_ROUTE_PREFIX = "/game/";
const SILENT_PREFIXES = ["/admin", "/card-forge"];

export default function AudioProvider() {
  const pathname = usePathname();
  const hasSetupRef = useRef(false);
  const contextTracksLoadedRef = useRef(false);

  const {
    settings,
    musicContext,
    currentTrackUrl,
    userHasInteracted,
    menuTrackUrl,
    tenseTrackUrl,
    victoryTrackUrl,
    defeatTrackUrl,
    setMusicContext,
    setUserHasInteracted,
    setContextTracks,
    setStandardSfxUrls,
  } = useAudioStore();

  // Load context tracks once
  useEffect(() => {
    if (contextTracksLoadedRef.current) return;
    contextTracksLoadedRef.current = true;

    fetch("/api/music?category=menu,tense,victory,defeat")
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const tracks: Record<string, string> = {};
        for (const t of data) {
          if (!tracks[t.category]) {
            tracks[t.category] = t.file_url;
          }
        }
        setContextTracks(tracks);
      })
      .catch(() => {});
  }, [setContextTracks]);

  // Load standard SFX once
  useEffect(() => {
    fetch("/api/sfx")
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const urls: Record<string, string> = {};
        for (const t of data) {
          urls[t.event_type] = t.file_url;
        }
        setStandardSfxUrls(urls);
        SfxEngine.getInstance().preload(Object.values(urls));
      })
      .catch(() => {});
  }, [setStandardSfxUrls]);

  // Sync SFX volume/mute
  useEffect(() => {
    const engine = SfxEngine.getInstance();
    engine.setVolume(settings.sfxVolume);
    engine.setMuted(settings.sfxMuted);
  }, [settings.sfxVolume, settings.sfxMuted]);

  // Listen for first user interaction to unlock audio
  useEffect(() => {
    if (userHasInteracted) return;

    const unlock = () => {
      setUserHasInteracted();
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };

    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });

    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, [userHasInteracted, setUserHasInteracted]);

  // Set music context based on route
  useEffect(() => {
    if (SILENT_PREFIXES.some((p) => pathname?.startsWith(p))) {
      setMusicContext(null);
    } else if (!pathname?.startsWith(GAME_ROUTE_PREFIX)) {
      setMusicContext("menu", menuTrackUrl ?? undefined);
    }
  }, [pathname, menuTrackUrl, setMusicContext]);

  // Apply volume/mute changes immediately
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    engine.setVolume(settings.musicVolume);
    engine.setMuted(settings.musicMuted);
  }, [settings.musicVolume, settings.musicMuted]);

  // Drive AudioEngine based on store state
  useEffect(() => {
    if (!userHasInteracted) return;

    const engine = AudioEngine.getInstance();

    if (!musicContext) {
      engine.stopMusic();
      return;
    }

    // Resolve the URL for the current context
    let url: string | null = null;
    switch (musicContext) {
      case "menu":
        url = currentTrackUrl ?? menuTrackUrl;
        break;
      case "board":
        url = currentTrackUrl;
        break;
      case "tense":
        url = currentTrackUrl ?? tenseTrackUrl;
        break;
      case "victory":
        url = currentTrackUrl ?? victoryTrackUrl;
        break;
      case "defeat":
        url = currentTrackUrl ?? defeatTrackUrl;
        break;
    }

    if (!url) {
      return;
    }

    const noLoop = musicContext === "victory" || musicContext === "defeat";
    engine.playMusic(url, { loop: !noLoop });
  }, [
    userHasInteracted,
    musicContext,
    currentTrackUrl,
    menuTrackUrl,
    tenseTrackUrl,
    victoryTrackUrl,
    defeatTrackUrl,
  ]);

  return null;
}
