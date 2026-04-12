"use client";

import { useAudioStore } from "@/lib/store/audioStore";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, setMusicVolume, toggleMusicMute, setSfxVolume, toggleSfxMute } = useAudioStore();

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1a1a2e",
          border: "1px solid #333",
          borderRadius: 12,
          padding: "24px 28px",
          minWidth: 320,
          maxWidth: 400,
          color: "#e0e0e0",
          fontFamily: "'Cinzel', serif",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            Réglages
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#888",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Music Volume */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 12, letterSpacing: 0.5 }}>
              Musique
            </label>
            <button
              onClick={toggleMusicMute}
              style={{
                background: settings.musicMuted ? "#e74c3c33" : "#2e7d3233",
                border: `1px solid ${settings.musicMuted ? "#e74c3c66" : "#2e7d3266"}`,
                color: settings.musicMuted ? "#e74c3c" : "#2e7d32",
                borderRadius: 4,
                padding: "2px 10px",
                fontSize: 9,
                fontFamily: "'Cinzel', serif",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {settings.musicMuted ? "Muet" : "Actif"}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.musicVolume * 100)}
            onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
            disabled={settings.musicMuted}
            style={{
              width: "100%",
              accentColor: "#4a90d9",
              opacity: settings.musicMuted ? 0.4 : 1,
            }}
          />
          <div style={{ textAlign: "right", fontSize: 10, color: "#888" }}>
            {Math.round(settings.musicVolume * 100)}%
          </div>
        </div>

        {/* SFX Volume */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 12, letterSpacing: 0.5 }}>
              Effets sonores
            </label>
            <button
              onClick={toggleSfxMute}
              style={{
                background: settings.sfxMuted ? "#e74c3c33" : "#2e7d3233",
                border: `1px solid ${settings.sfxMuted ? "#e74c3c66" : "#2e7d3266"}`,
                color: settings.sfxMuted ? "#e74c3c" : "#2e7d32",
                borderRadius: 4,
                padding: "2px 10px",
                fontSize: 9,
                fontFamily: "'Cinzel', serif",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {settings.sfxMuted ? "Muet" : "Actif"}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(settings.sfxVolume * 100)}
            onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
            disabled={settings.sfxMuted}
            style={{
              width: "100%",
              accentColor: "#4a90d9",
              opacity: settings.sfxMuted ? 0.4 : 1,
            }}
          />
          <div style={{ textAlign: "right", fontSize: 10, color: "#888" }}>
            {Math.round(settings.sfxVolume * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}
