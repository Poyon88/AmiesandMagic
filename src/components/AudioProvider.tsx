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
    currentPlaylistUrls,
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

    fetch("/api/music?category=menu,tense,victory,defeat", { cache: "no-store" })
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
    fetch("/api/sfx", { cache: "no-store" })
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

  // Global button-click SFX placeholder. Reserves the `button_click` event
  // type — the listener fires on any <button> click anywhere in the app
  // and plays whatever URL the admin uploaded under that key. While the
  // admin hasn't uploaded anything yet, the lookup returns undefined and
  // the listener is a silent no-op (no error, no console spam). Wire the
  // admin SFX form to use event_type="button_click" and the sound starts
  // playing on every button automatically.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Walk up to find a `<button>` ancestor (icons / spans inside button
      // are common click targets). Stop at document body.
      const btn = target.closest("button");
      if (!btn) return;
      // Disabled buttons don't fire onClick handlers in React but DOM
      // events still bubble — skip them so the click sound doesn't
      // contradict the visual disabled state.
      if (btn.disabled) return;
      // `data-no-global-click-sfx` lets a button opt out of the global
      // sound (used when its onClick handler plays the SFX explicitly to
      // avoid a double-play).
      if (btn.dataset.noGlobalClickSfx === "true") return;
      const url = useAudioStore.getState().standardSfxUrls["button_click"];
      if (url) SfxEngine.getInstance().play(url);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

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

    // Board context: if multiple tracks are configured, play them as a shuffled
    // playlist; otherwise fall back to the single-track path below.
    if (musicContext === "board" && currentPlaylistUrls.length > 1) {
      engine.playPlaylist(currentPlaylistUrls);
      return;
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
    currentPlaylistUrls,
    menuTrackUrl,
    tenseTrackUrl,
    victoryTrackUrl,
    defeatTrackUrl,
  ]);

  return null;
}
