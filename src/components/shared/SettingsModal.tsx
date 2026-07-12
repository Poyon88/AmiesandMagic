"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAudioStore } from "@/lib/store/audioStore";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Renders the "Concéder le match" section. Omit it (or pass undefined)
   *  in non-game contexts (home menu, etc.). Two-click confirmation pattern
   *  guards against fat-finger forfeits. */
  onConcede?: () => void;
}

export default function SettingsModal({ isOpen, onClose, onConcede }: SettingsModalProps) {
  const t = useTranslations("common");
  const { settings, setMusicVolume, toggleMusicMute, setSfxVolume, toggleSfxMute } = useAudioStore();
  const [concedeArmed, setConcedeArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConcedeArmed(false);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConcedeClick = () => {
    if (!onConcede) return;
    if (!concedeArmed) {
      setConcedeArmed(true);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setConcedeArmed(false), 5000);
      return;
    }
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setConcedeArmed(false);
    onConcede();
  };

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
            {t('settings_title')}
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
              {t('music')}
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
              {settings.musicMuted ? t('muted') : t('active')}
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
              {t('sound_effects')}
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
              {settings.sfxMuted ? t('muted') : t('active')}
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

        {/* Concede — game contexts only. Two-click confirm: first click
            arms (button reveals "Confirmer concession"), second click within
            5s actually forfeits. Auto-disarms otherwise. */}
        {onConcede && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #333" }}>
            <button
              onClick={handleConcedeClick}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 6,
                border: concedeArmed
                  ? "1px solid #e74c3c"
                  : "1px solid #e74c3c55",
                background: concedeArmed ? "#e74c3c" : "#e74c3c22",
                color: concedeArmed ? "#fff" : "#e74c3c",
                fontFamily: "'Cinzel', serif",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s, border 0.15s",
              }}
            >
              {concedeArmed ? t('concede_confirm') : t('concede_match')}
            </button>
            {concedeArmed && (
              <p style={{
                margin: "8px 0 0",
                fontSize: 9,
                color: "#888",
                textAlign: "center",
                fontFamily: "'Cinzel', serif",
                letterSpacing: 0.5,
              }}>
                {t('concede_hint')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
