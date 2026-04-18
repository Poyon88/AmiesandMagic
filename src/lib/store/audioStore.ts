import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MusicContext = "menu" | "board" | "tense" | "victory" | "defeat";

interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

interface AudioStore {
  // Settings (persisted to localStorage)
  settings: AudioSettings;
  setMusicVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  toggleMusicMute: () => void;
  toggleSfxMute: () => void;

  // Playback state (not persisted)
  musicContext: MusicContext | null;
  currentTrackUrl: string | null;
  currentPlaylistUrls: string[];
  userHasInteracted: boolean;

  // Context track URLs (fetched once)
  menuTrackUrl: string | null;
  tenseTrackUrl: string | null;
  victoryTrackUrl: string | null;
  defeatTrackUrl: string | null;

  // Standard SFX URLs (fetched once)
  standardSfxUrls: Record<string, string>;
  setStandardSfxUrls: (urls: Record<string, string>) => void;

  // Actions
  setMusicContext: (ctx: MusicContext | null, trackUrl?: string, playlistUrls?: string[]) => void;
  setUserHasInteracted: () => void;
  setContextTracks: (tracks: {
    menu?: string;
    tense?: string;
    victory?: string;
    defeat?: string;
  }) => void;
}

export const useAudioStore = create<AudioStore>()(
  persist(
    (set) => ({
      // Settings defaults
      settings: {
        musicVolume: 0.5,
        sfxVolume: 0.5,
        musicMuted: false,
        sfxMuted: false,
      },

      setMusicVolume: (v) =>
        set((s) => ({ settings: { ...s.settings, musicVolume: Math.max(0, Math.min(1, v)) } })),
      setSfxVolume: (v) =>
        set((s) => ({ settings: { ...s.settings, sfxVolume: Math.max(0, Math.min(1, v)) } })),
      toggleMusicMute: () =>
        set((s) => ({ settings: { ...s.settings, musicMuted: !s.settings.musicMuted } })),
      toggleSfxMute: () =>
        set((s) => ({ settings: { ...s.settings, sfxMuted: !s.settings.sfxMuted } })),

      // Playback state
      musicContext: null,
      currentTrackUrl: null,
      currentPlaylistUrls: [],
      userHasInteracted: false,

      // Standard SFX
      standardSfxUrls: {},
      setStandardSfxUrls: (urls) => set({ standardSfxUrls: urls }),

      // Context tracks
      menuTrackUrl: null,
      tenseTrackUrl: null,
      victoryTrackUrl: null,
      defeatTrackUrl: null,

      setMusicContext: (ctx, trackUrl, playlistUrls) =>
        set({
          musicContext: ctx,
          currentTrackUrl: trackUrl ?? null,
          currentPlaylistUrls: playlistUrls ?? [],
        }),
      setUserHasInteracted: () => set({ userHasInteracted: true }),
      setContextTracks: (tracks) =>
        set({
          menuTrackUrl: tracks.menu ?? null,
          tenseTrackUrl: tracks.tense ?? null,
          victoryTrackUrl: tracks.victory ?? null,
          defeatTrackUrl: tracks.defeat ?? null,
        }),
    }),
    {
      name: "audio-settings",
      // Only persist settings, not playback state
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
