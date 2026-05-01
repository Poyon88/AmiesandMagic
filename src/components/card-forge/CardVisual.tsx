'use client';

import { useState } from 'react';
import { KEYWORDS, FACTIONS, RARITY_MAP } from '@/lib/card-engine/constants';
import KeywordIcon from '@/components/shared/KeywordIcon';
import { SPELL_KEYWORDS, SPELL_KEYWORD_SYMBOLS, SPELL_KEYWORD_LABELS, getSpellKeywordDesc, getSpellKeywordLabel, formatConvocationTokens } from '@/lib/game/spell-keywords';
import { isCreatureKwShadowedBySpell } from '@/lib/game/abilities';
import { KEYWORD_LABELS } from '@/lib/game/keyword-labels';
import type { SpellKeywordInstance, TokenTemplate } from '@/lib/game/types';

// Reverse of KEYWORD_LABELS: FR label → snake_case engine id. Forge state
// stores keywords as FR labels, but the keyword-icon store is keyed by the
// engine id (matches what GameCard / HandCard / etc. pass at runtime).
// Without this we'd query the override map with "Bouclier" instead of
// "divine_shield" and the preview would always fall back to the default
// emoji even when an admin uploaded a custom icon.
const FR_LABEL_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(KEYWORD_LABELS).map(([id, label]) => [label, id]),
);

// ─── KEYWORD → SYMBOL MAP ───────────────────────────────────────────────────

function toRoman(n: number): string {
  const vals = [10, 9, 5, 4, 1];
  const syms = ["X", "IX", "V", "IV", "I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result || "0";
}

export const KEYWORD_SYMBOLS: Record<string, string> = {
  // Tier 0
  "Loyauté":          "🤝",
  "Ancré":            "⚓",
  "Résistance X":     "🛡️",
  "Provocation":      "🎯",
  "Traque":           "⚡",
  "Première Frappe":  "🗡️",
  "Berserk":          "😤",
  "Bouclier":         "🔰",
  // Tier 1
  "Vol":              "🦅",
  "Précision":        "🏹",
  "Drain de vie":     "🩸",
  "Esquive":          "💨",
  "Poison":           "☠️",
  "Célérité":         "💫",
  "Augure":           "📖",
  "Bénédiction":      "✝️",
  "Bravoure":         "🦁",
  "Pillage":          "💰",
  "Riposte X":        "↩️",
  "Rappel":           "🔄",
  "Combustion":       "🔥",
  // Tier 2
  "Terreur":          "👁️",
  "Armure":           "/icons/armure.png",
  "Commandement":     "👑",
  "Fureur":           "💢",
  "Double Attaque":   "⚔️",
  "Invisible":        "👻",
  "Canalisation":     "🔮",
  "Catalyse":         "⚗️",
  "Contresort":       "🚫",
  "Convocation X":    "📣",
  "Malédiction":      "💀",
  "Nécrophagie":      "🦴",
  "Paralysie":        "⛓️",
  "Permutation":      "🔀",
  "Persécution X":    "🩻",
  "Ombre du passé":   "👤",
  "Profanation X":    "⚰️",
  "Prescience X":     "🃏",
  "Suprématie":       "👊",
  "Divination":       "🔍",
  // Tier 3
  "Liaison de vie":   "🔗",
  "Ombre":            "🌑",
  "Sacrifice":        "💔",
  "Maléfice":         "🕯️",
  "Indestructible":   "♾️",
  "Régénération":     "💚",
  "Corruption":       "🖤",
  "Carnage X":        "💥",
  "Héritage X":       "📜",
  "Mimique":          "🪞",
  "Métamorphose":     "🦎",
  "Tactique X":       "📋",
  "Exhumation X":     "🪦",
  "Héritage du cimetière": "🏚️",
  // Tier 4
  "Pacte de sang":    "🩸",
  "Souffle de feu X": "🐲",
  "Domination":       "👁️‍🗨️",
  "Résurrection":     "✨",
  "Transcendance":    "🌟",
  "Vampirisme X":     "🧛",
  // Deck / Race / Clan
  "Traque du destin X": "🔮",
  "Cycle éternel":    "♻️",
  "Sang mêlé":        "🧬",
  "Martyr":           "⚱️",
  "Instinct de meute X": "🐺",
  "Totem":            "🗿",
  "Fierté du clan":   "🏰",
  "Appel du clan X":  "📯",
  "Solidarité X":     "🤜",
  "Rassemblement X":  "🏴",
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface CardData {
  name: string;
  faction: string;
  race?: string;
  clan?: string;
  cardAlignment?: string;
  type: string;
  rarity: string;
  mana: number;
  attack: number | null;
  defense: number | null;
  power: number | null;
  keywords: string[];
  keywordXValues?: Record<string, number>;
  ability: string;
  flavorText: string;
  budgetUsed: number;
  convocationTokenId?: number | null;
  convocationTokenName?: string;
  convocationTokens?: { token_id: number; attack?: number; health?: number }[];
  lycanthropieTokenId?: number | null;
  lycanthropieTokenName?: string;
  entraideRace?: string;
  setName?: string;
  setIcon?: string;
  cardYear?: number;
  cardMonth?: number;
  spellKeywords?: SpellKeywordInstance[];
  budgetTotal: number;
  printNumber?: number;
  maxPrints?: number;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function CardVisual({ card, loading, compact = false, imageUrl, onImageChange, tokens }: { card: CardData | null; loading: boolean; compact?: boolean; imageUrl?: string | null; onImageChange?: (url: string) => void; tokens?: TokenTemplate[] }) {
  const [hovered, setHovered] = useState(false);
  const W = compact ? 180 : 300;
  const H = compact ? 252 : 420;
  const s = compact ? 0.6 : 1;

  if (!card && !loading) return (
    <div style={{
      width: W, height: H, borderRadius: 12 * s,
      background: "linear-gradient(135deg,#1a1a2e,#0d0d1a)",
      border: "2px dashed #1a1a3a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: "#2a2a4a", fontFamily: "'Cinzel',serif", gap: 10,
    }}>
      <div style={{ fontSize: 40 * s }}>⚗️</div>
      {!compact && <div style={{ fontSize: 11 }}>Forgez votre première carte</div>}
    </div>
  );

  if (loading) return (
    <div style={{
      width: W, height: H, borderRadius: 12 * s,
      background: "linear-gradient(135deg,#1a1a2e,#0d0d1a)",
      border: "2px solid #1a1a3a",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: "#2a2a4a", fontFamily: "'Cinzel',serif", gap: 12,
    }}>
      <div style={{ fontSize: 36 * s, animation: "spin 2s linear infinite" }}>⚙️</div>
      {!compact && <div style={{ fontSize: 10 }}>Forge en cours…</div>}
    </div>
  );

  const fac = FACTIONS[card!.faction] || FACTIONS.Humains;
  const rar = RARITY_MAP[card!.rarity];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: W, height: H, borderRadius: 12 * s, position: "relative",
        background: `linear-gradient(160deg,${fac.bg} 0%,#0d0d1a 100%)`,
        border: `${compact ? 1.5 : 2}px solid ${rar.color}`,
        boxShadow: `0 0 ${20 * s}px ${rar.glow}44,0 0 ${50 * s}px ${rar.glow}11,inset 0 0 ${30 * s}px ${fac.color}18`,
        fontFamily: "'Cinzel',serif",
        overflow: "hidden",
        transition: "all 0.3s ease",
        cursor: "default",
      }}
    >
      {/* ── Full-bleed art area ── */}
      <div style={{
        position: "absolute", inset: 0,
        background: `linear-gradient(135deg,${fac.bg},${fac.color}33,${fac.bg})`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={card!.name}
            style={{
              width: "100%", height: "100%",
              objectFit: "cover", objectPosition: "center",
            }}
          />
        ) : (
          <div style={{
            fontSize: 90 * s, opacity: 0.55,
            filter: `drop-shadow(0 0 ${25 * s}px ${fac.accent})`,
            transition: "all 0.4s ease",
          }}>{fac.emoji}</div>
        )}
      </div>

      {/* ── Image upload button (non-compact only) ── */}
      {!compact && onImageChange && (
        <label style={{
          position: "absolute", top: 8 * s, right: 46 * s, zIndex: 5,
          width: 22 * s, height: 22 * s, borderRadius: "50%",
          background: "#0d0d1acc", border: `1px solid ${fac.color}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11 * s, cursor: "pointer",
          opacity: 0.6,
          transition: "opacity 0.2s",
        }}
          onMouseEnter={(e) => { e.stopPropagation(); setHovered(false); }}
        >
          🖼
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageChange(URL.createObjectURL(file));
              e.target.value = "";
            }}
          />
        </label>
      )}


      {/* ── Top bar: name + mana ── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 2,
        padding: `${8 * s}px ${12 * s}px`,
        background: `linear-gradient(180deg, ${fac.bg}aa 0%, transparent 60%)`,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
      }}>
        <span style={{
          fontSize: 13 * s, color: fac.accent, fontWeight: 700,
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textShadow: `0 1px 6px ${fac.bg}`,
        }}>
          {card!.name}
        </span>
        {/* Mana orb */}
        <div style={{
          width: 28 * s, height: 28 * s, borderRadius: "50%", flexShrink: 0,
          background: "radial-gradient(circle,#1a3a6a,#0d1f3c)",
          border: `${2 * s}px solid #74b9ff`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13 * s, color: "#74b9ff", fontWeight: 700,
          boxShadow: "0 0 8px #74b9ff55",
        }}>{card!.mana}</div>
      </div>

      {/* ── Bottom bar: stats + keywords + rarity ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2,
        padding: `${10 * s}px ${10 * s}px ${8 * s}px`,
        background: `linear-gradient(0deg, ${fac.bg}dd 0%, ${fac.bg}88 40%, transparent 65%)`,
        display: "flex", flexDirection: "column", gap: 6 * s,
      }}>
        {/* Keyword symbols row */}
        {card!.keywords?.length > 0 && (
          <div style={{ display: "flex", gap: 4 * s, flexWrap: "wrap" }}>
            {card!.keywords.filter(kw => !isCreatureKwShadowedBySpell(kw, card!.spellKeywords)).map(kw => {
              const xVal = card!.keywordXValues?.[kw];
              let displayName = xVal != null ? kw.replace(/ X$/, ` ${toRoman(xVal)}`) : kw;
              let displayDesc = xVal != null ? KEYWORDS[kw]?.desc.replace(/X/g, String(xVal)) : KEYWORDS[kw]?.desc;
              if (kw === "Convocation X" && card!.convocationTokenId) {
                const tokenLabel = card!.convocationTokenName || "token";
                displayDesc = `Invocation : crée un token ${tokenLabel} ${xVal ?? "X"}/${xVal ?? "X"}.`;
              }
              if (kw === "Convocations multiples" && card!.convocationTokens?.length) {
                displayDesc = `Invocation : crée ${formatConvocationTokens(card!.convocationTokens, tokens)}.`;
              }
              if (kw === "Lycanthropie X" && card!.lycanthropieTokenId) {
                const tokenLabel = card!.lycanthropieTokenName || "forme transformée";
                displayDesc = `Début de tour : se transforme en ${tokenLabel} ${xVal ?? "X"}/${xVal ?? "X"} avec Traque.`;
              }
              if (kw === "Entraide (Race)" && card!.entraideRace) {
                displayName = `Entraide (${card!.entraideRace})`;
                displayDesc = `En main : coûte 1 mana de moins par allié ${card!.entraideRace} présent en jeu (cumulable, plancher 0).`;
              }
              return (
                <div key={kw} title={`${displayName}: ${displayDesc}`} style={{
                  minWidth: 19 * s, height: 19 * s, borderRadius: 6 * s,
                  padding: `0 ${xVal != null ? 5 * s : 0}px`,
                  background: `${fac.color}33`, border: `1px solid ${fac.color}88`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 3 * s,
                  fontSize: 13 * s, cursor: "default",
                  boxShadow: `0 0 6px ${fac.color}44`,
                  transition: "all 0.2s",
                }}>
                  <KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} keyword={FR_LABEL_TO_ID[kw] ?? kw} />
                  {xVal != null && (
                    <span style={{
                      fontSize: 10 * s, fontWeight: 900, lineHeight: 1,
                      color: "#fff", fontFamily: "'Cinzel',serif",
                      textShadow: `0 0 4px ${fac.accent}`,
                    }}>{toRoman(xVal)}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Spell keyword symbols row */}
        {card!.spellKeywords && card!.spellKeywords.length > 0 && (
          <div style={{ display: "flex", gap: 4 * s, flexWrap: "wrap" }}>
            {card!.spellKeywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              if (!def) return null;
              const fakeCard = { convocation_tokens: card!.convocationTokens?.map(t => ({ token_id: t.token_id, attack: t.attack, health: t.health })) } as import("@/lib/game/types").Card;
              const label = getSpellKeywordLabel(spellKw);
              const desc = getSpellKeywordDesc(spellKw, fakeCard, tokens);
              const usesAtkHp = def.params.includes("attack") && def.params.includes("health");
              const usesAmount = def.params.includes("amount");
              const hasValue = usesAmount || usesAtkHp;
              const useStatBuffFormat = usesAtkHp && def.label.includes("+X");
              const valueText = usesAtkHp
                ? useStatBuffFormat
                  ? `+${spellKw.attack ?? 0}/+${spellKw.health ?? 0}`
                  : `${spellKw.attack ?? 0}/${spellKw.health ?? 0}`
                : usesAmount ? toRoman(spellKw.amount ?? 1) : null;
              return (
                <div key={`sk_${i}`} title={`${label}: ${desc}`} style={{
                  minWidth: 19 * s, height: 19 * s, borderRadius: 6 * s,
                  padding: `0 ${hasValue ? 5 * s : 0}px`,
                  background: `${fac.color}33`, border: `1px solid ${fac.color}88`,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 0,
                  fontSize: 13 * s, cursor: "default",
                  boxShadow: `0 0 6px ${fac.color}44`,
                  transition: "all 0.2s",
                }}>
                  <KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} keyword={`spell_${spellKw.id}`} />
                  {valueText && (
                    <span style={{
                      fontSize: 10 * s, fontWeight: 900, lineHeight: 1,
                      color: "#fff", fontFamily: "'Cinzel',serif",
                      textShadow: `0 0 4px ${fac.accent}`,
                      marginLeft: -4 * s,
                    }}>{valueText}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Stats + rarity row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {/* Faction · Type */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
            <span style={{ fontSize: 7.5 * s, color: `${fac.accent}aa` }}>{card!.faction}</span>
            {card!.cardAlignment && card!.cardAlignment !== "spéciale" && fac.alignment === "spéciale" && (() => {
              const alColors: Record<string, string> = { bon: "#4caf50", neutre: "#ffd54f", maléfique: "#e74c3c" };
              const alEmojis: Record<string, string> = { bon: "✨", neutre: "⚖️", maléfique: "💀" };
              const col = alColors[card!.cardAlignment!] || fac.accent;
              return (
                <>
                  <span style={{ fontSize: 6 * s, color: "#333" }}>·</span>
                  <span style={{ fontSize: 7 * s, color: col }}>{alEmojis[card!.cardAlignment!] || ""} {card!.cardAlignment}</span>
                </>
              );
            })()}
            <span style={{ fontSize: 6 * s, color: "#333" }}>·</span>
            <span style={{ fontSize: 7 * s, color: rar.color, border: `1px solid ${rar.color}44`, padding: `${1 * s}px ${4 * s}px`, borderRadius: 3 * s }}>{rar.code}</span>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 6 * s, alignItems: "center" }}>
            {card!.type === "Unité" && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 3 * s,
                  padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s,
                  background: "#ff6b6b18", border: "1px solid #ff6b6b55",
                }}>
                  <span style={{ fontSize: 8 * s, color: "#ff6b6b88" }}>⚔</span>
                  <span style={{ fontSize: 14 * s, color: "#ff6b6b", fontWeight: 700 }}>{card!.attack}</span>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 3 * s,
                  padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s,
                  background: "#74b9ff18", border: "1px solid #74b9ff55",
                }}>
                  <span style={{ fontSize: 8 * s, color: "#74b9ff88" }}>🛡</span>
                  <span style={{ fontSize: 14 * s, color: "#74b9ff", fontWeight: 700 }}>{card!.defense}</span>
                </div>
              </>
            )}
            {card!.power != null && (
              <div style={{
                display: "flex", alignItems: "center", gap: 3 * s,
                padding: `${2 * s}px ${6 * s}px`, borderRadius: 4 * s,
                background: `${fac.accent}18`, border: `1px solid ${fac.accent}55`,
              }}>
                <span style={{ fontSize: 8 * s, color: `${fac.accent}88` }}>✨</span>
                <span style={{ fontSize: 14 * s, color: fac.accent, fontWeight: 700 }}>{card!.power}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Hover overlay: ability + flavor text ── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        background: `${fac.bg}f8`,
        opacity: hovered ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: hovered ? "auto" : "none",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: `${18 * s}px ${16 * s}px`,
        gap: 10 * s,
        overflowY: "auto",
      }}>
        {/* Card name */}
        <div style={{
          fontSize: 18 * s, color: fac.accent, fontWeight: 700,
          textAlign: "center", letterSpacing: 1,
          borderBottom: `1px solid ${fac.color}55`, paddingBottom: 8 * s,
        }}>
          {card!.name}
        </div>

        {/* Race / Clan / Alignment */}
        {(card!.race || card!.clan || (card!.cardAlignment && card!.cardAlignment !== "spéciale" && fac.alignment === "spéciale")) && (
          <div style={{ display: "flex", justifyContent: "center", gap: 6 * s, fontSize: 13 * s, color: "#ddd", fontFamily: "'Crimson Text',serif" }}>
            {card!.race && <span>{card!.race}</span>}
            {card!.race && card!.clan && <span style={{ color: "#888" }}>·</span>}
            {card!.clan && <span style={{ fontStyle: "italic" }}>{card!.clan}</span>}
            {card!.cardAlignment && card!.cardAlignment !== "spéciale" && fac.alignment === "spéciale" && (
              <>
                {(card!.race || card!.clan) && <span style={{ color: "#888" }}>·</span>}
                <span style={{ color: { bon: "#4caf50", neutre: "#ffd54f", maléfique: "#e74c3c" }[card!.cardAlignment] || "#ddd" }}>
                  {{ bon: "✨", neutre: "⚖️", maléfique: "💀" }[card!.cardAlignment] || ""} {card!.cardAlignment}
                </span>
              </>
            )}
          </div>
        )}

        {/* Set / Year */}
        {(card!.setName || card!.cardYear) && (
          <div style={{ textAlign: "center", fontSize: 11 * s, color: "#aaa", fontFamily: "'Crimson Text',serif" }}>
            {card!.setName ? `${card!.setIcon || "📦"} ${card!.setName}` : `📅 ${card!.cardMonth ? ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"][card!.cardMonth - 1] + " " : ""}${card!.cardYear}`}
          </div>
        )}

        {/* Capacités detail */}
        {card!.keywords?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * s }}>
            {card!.keywords.filter(kw => !isCreatureKwShadowedBySpell(kw, card!.spellKeywords)).map(kw => {
              const xVal = card!.keywordXValues?.[kw];
              let displayName = xVal != null ? kw.replace(/ X$/, ` ${toRoman(xVal)}`) : kw;
              let displayDesc = xVal != null ? KEYWORDS[kw]?.desc.replace(/X/g, String(xVal)) : KEYWORDS[kw]?.desc;
              if (kw === "Convocation X" && card!.convocationTokenId) {
                const tokenLabel = card!.convocationTokenName || "token";
                displayDesc = `Invocation : crée un token ${tokenLabel} ${xVal ?? "X"}/${xVal ?? "X"}.`;
              }
              if (kw === "Convocations multiples" && card!.convocationTokens?.length) {
                displayDesc = `Invocation : crée ${formatConvocationTokens(card!.convocationTokens, tokens)}.`;
              }
              if (kw === "Lycanthropie X" && card!.lycanthropieTokenId) {
                const tokenLabel = card!.lycanthropieTokenName || "forme transformée";
                displayDesc = `Début de tour : se transforme en ${tokenLabel} ${xVal ?? "X"}/${xVal ?? "X"} avec Traque.`;
              }
              if (kw === "Entraide (Race)" && card!.entraideRace) {
                displayName = `Entraide (${card!.entraideRace})`;
                displayDesc = `En main : coûte 1 mana de moins par allié ${card!.entraideRace} présent en jeu (cumulable, plancher 0).`;
              }
              return (
                <div key={kw} style={{ display: "flex", alignItems: "flex-start", gap: 7 * s }}>
                  <span style={{ flexShrink: 0 }}><KeywordIcon symbol={KEYWORD_SYMBOLS[kw] || "✦"} size={18 * s} keyword={FR_LABEL_TO_ID[kw] ?? kw} /></span>
                  <div>
                    <div style={{ fontSize: 14 * s, color: fac.accent, fontWeight: 700 }}>{displayName}</div>
                    <div style={{ fontSize: 12 * s, color: "#ddd", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>{displayDesc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Spell keyword details */}
        {card!.spellKeywords && card!.spellKeywords.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * s }}>
            {card!.spellKeywords.map((spellKw, i) => {
              const def = SPELL_KEYWORDS[spellKw.id];
              if (!def) return null;
              const fakeCard = { convocation_tokens: card!.convocationTokens?.map(t => ({ token_id: t.token_id, attack: t.attack, health: t.health })) } as import("@/lib/game/types").Card;
              const label = getSpellKeywordLabel(spellKw);
              const desc = getSpellKeywordDesc(spellKw, fakeCard, tokens);
              return (
                <div key={`sk_${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 7 * s }}>
                  <span style={{ flexShrink: 0 }}><KeywordIcon symbol={SPELL_KEYWORD_SYMBOLS[spellKw.id] || "✦"} size={18 * s} keyword={`spell_${spellKw.id}`} /></span>
                  <div>
                    <div style={{ fontSize: 14 * s, color: fac.accent, fontWeight: 700 }}>{label}</div>
                    <div style={{ fontSize: 12 * s, color: "#ddd", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>{desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ability text */}
        {card!.ability && card!.ability !== "—" && (() => {
          let abilityText = card!.ability;
          // Replace X/Y from creature keyword values
          if (card!.keywordXValues) {
            const vals = Object.values(card!.keywordXValues);
            for (const v of vals) {
              abilityText = abilityText.replace(/\bX\b/, String(v));
            }
          }
          // Replace X/Y from spell keyword values
          if (card!.spellKeywords) {
            for (const kw of card!.spellKeywords) {
              const skDef = SPELL_KEYWORDS[kw.id];
              if (!skDef) continue;
              if (skDef.params.includes("attack") && kw.attack != null) abilityText = abilityText.replace(/\bX\b/, String(kw.attack));
              else if (skDef.params.includes("amount") && kw.amount != null) abilityText = abilityText.replace(/\bX\b/, String(kw.amount));
              if (skDef.params.includes("health") && kw.health != null) abilityText = abilityText.replace(/\bY\b/, String(kw.health));
            }
          }
          return (
          <div style={{
            padding: `${8 * s}px ${10 * s}px`,
            background: `${fac.color}18`, borderRadius: 5 * s,
            border: `1px solid ${fac.color}44`,
          }}>
            <p style={{
              margin: 0, fontSize: 13 * s, color: "#eee",
              lineHeight: 1.5, fontFamily: "'Crimson Text',serif",
            }}>
              {abilityText}
            </p>
          </div>
          );
        })()}

        {/* Flavor text */}
        {card!.flavorText && (
          <p style={{
            margin: 0, fontSize: 12 * s, color: `${fac.accent}dd`,
            fontStyle: "italic", lineHeight: 1.4, fontFamily: "'Crimson Text',serif",
            textAlign: "center",
          }}>
            &ldquo;{card!.flavorText}&rdquo;
          </p>
        )}

        {/* Stats recap */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 10 * s, flexWrap: "wrap",
          fontSize: 13 * s, color: "#ccc",
          borderTop: `1px solid ${fac.color}33`, paddingTop: 7 * s,
        }}>
          {card!.faction && <span style={{ color: fac.accent, fontWeight: 600 }}>{card!.faction}</span>}
          <span style={{ color: "#74b9ff" }}>💧{card!.mana}</span>
          {card!.attack != null && <span style={{ color: "#e74c3c" }}>⚔{card!.attack}</span>}
          {card!.defense != null && <span style={{ color: "#f1c40f" }}>❤{card!.defense}</span>}
          {card!.power != null && <span style={{ color: fac.accent }}>✨{card!.power}</span>}
          <span style={{ color: rar.color, fontSize: 12 * s }}>{card!.rarity}</span>
          {card!.printNumber && card!.maxPrints && (
            <span style={{ color: "#ffd700", fontSize: 10 * s, fontWeight: 700, letterSpacing: 0.5 }}>
              #{card!.printNumber}/{card!.maxPrints}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
