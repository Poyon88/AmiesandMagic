"use client";

import { useMemo } from "react";
import type { TokenTemplate } from "@/lib/game/types";
import { getFactionForRace, FACTIONS } from "@/lib/card-engine/constants";

interface TokenCascadePickerProps {
  /** Currently selected token id (null = nothing picked yet). */
  value: number | null;
  onChange: (tokenId: number | null) => void;
  /** Full registry of saved tokens (load once via /api/token-templates). */
  tokens: TokenTemplate[];
  /** Compact size hint — used by tightly packed forms (e.g. multi-summon rows). */
  compact?: boolean;
  disabled?: boolean;
}

const NO_CLAN_KEY = "__no_clan__";

// Three cascading <select>s : Race → Clan → Token.
// Each next select is filtered by the previous one's value. Selecting a
// token sets the parent state via onChange. Switching race/clan upstream
// resets the downstream value if it no longer matches.
export default function TokenCascadePicker({
  value,
  onChange,
  tokens,
  compact = false,
  disabled = false,
}: TokenCascadePickerProps) {
  // Resolve current selection back into (race, clan, token_id) for the UI.
  const selected = useMemo(
    () => tokens.find((t) => t.id === value) ?? null,
    [tokens, value],
  );
  const currentRace = selected?.race ?? "";
  const currentClanKey = selected ? (selected.clan ?? NO_CLAN_KEY) : "";

  // Distinct races that have at least one token.
  const races = useMemo(() => {
    return Array.from(new Set(tokens.map((t) => t.race))).sort();
  }, [tokens]);

  // Distinct clan keys (NULL clan represented by a sentinel) for the picked race.
  const clans = useMemo(() => {
    if (!currentRace) return [] as { key: string; label: string }[];
    const out = new Map<string, string>();
    for (const t of tokens) {
      if (t.race !== currentRace) continue;
      const key = t.clan ?? NO_CLAN_KEY;
      const label = t.clan ?? "Sans clan";
      if (!out.has(key)) out.set(key, label);
    }
    return Array.from(out.entries()).map(([key, label]) => ({ key, label }));
  }, [tokens, currentRace]);

  // Tokens matching race + clan.
  const matchingTokens = useMemo(() => {
    if (!currentRace || !currentClanKey) return [] as TokenTemplate[];
    return tokens.filter(
      (t) => t.race === currentRace && (t.clan ?? NO_CLAN_KEY) === currentClanKey,
    );
  }, [tokens, currentRace, currentClanKey]);

  function handleRace(race: string) {
    if (!race) {
      onChange(null);
      return;
    }
    // Pick the first matching token (any clan) when race changes — the user
    // can refine via the clan select afterwards.
    const candidates = tokens.filter((t) => t.race === race);
    onChange(candidates[0]?.id ?? null);
  }

  function handleClan(clanKey: string) {
    if (!currentRace) return;
    if (!clanKey) {
      onChange(null);
      return;
    }
    const candidates = tokens.filter(
      (t) => t.race === currentRace && (t.clan ?? NO_CLAN_KEY) === clanKey,
    );
    onChange(candidates[0]?.id ?? null);
  }

  function handleToken(tokenId: string) {
    if (!tokenId) {
      onChange(null);
      return;
    }
    onChange(parseInt(tokenId, 10));
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: compact ? "3px 6px" : "6px 8px",
    borderRadius: 6,
    border: "1px solid #ddd",
    fontSize: compact ? 10 : 11,
    fontFamily: "'Cinzel',serif",
    marginTop: 2,
    background: disabled ? "#f5f5f5" : "#fff",
    color: disabled ? "#999" : "#333",
    cursor: disabled ? "not-allowed" : "pointer",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 8,
    color: "#888",
    letterSpacing: 1,
    fontFamily: "'Cinzel',serif",
  };

  // Faction is implied by race (each race lives in exactly one faction).
  // Surface it read-only so the admin sees what banner the spawned token
  // will fly on the board.
  const factionId = getFactionForRace(currentRace);
  const factionDef = factionId ? FACTIONS[factionId] : null;

  return (
    <div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 6 }}>
      <div>
        <label style={labelStyle}>RACE</label>
        <select
          value={currentRace}
          onChange={(e) => handleRace(e.target.value)}
          style={fieldStyle}
          disabled={disabled || races.length === 0}
        >
          <option value="">{races.length === 0 ? "Aucun token" : "-- Choisir --"}</option>
          {races.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>CLAN</label>
        <select
          value={currentClanKey}
          onChange={(e) => handleClan(e.target.value)}
          style={fieldStyle}
          disabled={disabled || !currentRace || clans.length === 0}
        >
          <option value="">{!currentRace ? "—" : clans.length === 0 ? "Aucun clan" : "-- Choisir --"}</option>
          {clans.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label style={labelStyle}>TOKEN</label>
        <select
          value={value ?? ""}
          onChange={(e) => handleToken(e.target.value)}
          style={fieldStyle}
          disabled={disabled || matchingTokens.length === 0}
        >
          <option value="">{matchingTokens.length === 0 ? "—" : "-- Choisir --"}</option>
          {matchingTokens.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.attack}/{t.health}
            </option>
          ))}
        </select>
      </div>
    </div>
    {currentRace && (
      <div style={{
        marginTop: 4, fontSize: 9, fontFamily: "'Crimson Text', serif",
        color: factionDef ? factionDef.accent : "#999",
        display: "flex", alignItems: "center", gap: 4,
      }}>
        <span style={{ ...labelStyle }}>FACTION :</span>
        {factionDef ? (
          <>
            <span>{factionDef.emoji}</span>
            <strong style={{ fontFamily: "'Cinzel', serif", letterSpacing: 0.5 }}>{factionId}</strong>
          </>
        ) : (
          <em>aucune (race hors registre — héritera de la faction du lanceur)</em>
        )}
      </div>
    )}
    </div>
  );
}
