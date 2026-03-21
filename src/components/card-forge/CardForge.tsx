'use client';

import { useState, useCallback, useRef } from "react";
import { generateCardStats, pickMana, pickRarityForMana, buildId } from "@/lib/card-engine/generator";
import { RARITIES, FACTIONS, TYPES, KEYWORDS, RARITY_WEIGHTS_BY_MANA, RARITY_MAP } from "@/lib/card-engine/constants";
import { createClient } from "@/lib/supabase/client";
import CardVisual from "./CardVisual";
import type { CardType, Keyword } from "@/lib/game/types";

// ─── API CALL ────────────────────────────────────────────────────────────────

interface CardText {
  name: string;
  ability: string;
  flavorText: string;
  illustrationPrompt: string;
}

async function generateCardText(factionId: string, type: string, rarityId: string, stats: ReturnType<typeof generateCardStats>): Promise<CardText> {
  const response = await fetch('/api/cards/generate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factionId, type, rarityId, stats }),
  });
  if (!response.ok) return { name: 'Inconnu', ability: '—', flavorText: '', illustrationPrompt: '' };
  return response.json();
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── HELPERS ─────────────────────────────────────────────────────────────────

interface ForgeCard {
  id: string;
  name: string;
  faction: string;
  type: string;
  rarity: string;
  mana: number;
  attack: number | null;
  defense: number | null;
  power: number | null;
  keywords: string[];
  ability: string;
  flavorText: string;
  illustrationPrompt: string;
  budgetTotal: number;
  budgetUsed: number;
  generatedAt: string;
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 7.5, color: "#2a2a4a", letterSpacing: 2, marginBottom: 7, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#08081a", border: "1px solid #0f0f24", borderRadius: 7, padding: 16 }}>
      <div style={{ fontSize: 8, color: "#333", letterSpacing: 1.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Btn({ onClick, label, color }: { onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 13px", borderRadius: 4, cursor: "pointer",
      background: `${color}10`, border: `1px solid ${color}44`,
      color, fontFamily: "'Cinzel',serif", fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
      transition: "all 0.2s",
    }}>{label}</button>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function CardForge() {
  const [faction, setFaction] = useState("Nains");
  const [type, setType] = useState("Unité");
  const [rarity, setRarity] = useState("Rare");
  const [card, setCard] = useState<ForgeCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ForgeCard[]>([]);
  const [bulkCount, setBulkCount] = useState(20);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkCards, setBulkCards] = useState<ForgeCard[]>([]);
  const [tab, setTab] = useState("forge");
  const [cardImages, setCardImages] = useState<Record<string, string>>({});
  const abortRef = useRef(false);

  const forgeCard = useCallback(async (f = faction, t = type, r = rarity) => {
    setLoading(true);
    const stats = generateCardStats(f, t, r);
    let text: CardText = { name: "Inconnu", ability: "—", flavorText: "", illustrationPrompt: "" };
    try { text = await generateCardText(f, t, r, stats); } catch { /* fallback above */ }
    const newCard: ForgeCard = {
      id: buildId(), name: text.name || "Inconnu",
      faction: f, type: t, rarity: r, ...stats,
      ability: text.ability || "—",
      flavorText: text.flavorText || "",
      illustrationPrompt: text.illustrationPrompt || "",
      generatedAt: new Date().toISOString(),
    };
    setCard(newCard);
    setHistory(h => [newCard, ...h].slice(0, 30));
    setLoading(false);
    return newCard;
  }, [faction, type, rarity]);

  const startBulk = useCallback(async () => {
    abortRef.current = false;
    setBulkProgress({ done: 0, total: bulkCount });
    setBulkCards([]);
    const results: ForgeCard[] = [];
    for (let i = 0; i < bulkCount; i++) {
      if (abortRef.current) break;
      const f = pick(Object.keys(FACTIONS));
      const t = pick(TYPES);
      const mana = pickMana();
      const r = pickRarityForMana(mana);
      const stats = generateCardStats(f, t, r, mana);
      let text: CardText = { name: "Inconnu", ability: "—", flavorText: "", illustrationPrompt: "" };
      try { text = await generateCardText(f, t, r, stats); } catch { /* fallback above */ }
      const c: ForgeCard = {
        id: buildId(), name: text.name || "Inconnu",
        faction: f, type: t, rarity: r, ...stats,
        ability: text.ability || "—", flavorText: text.flavorText || "",
        illustrationPrompt: text.illustrationPrompt || "",
        generatedAt: new Date().toISOString(),
      };
      results.push(c);
      setBulkCards([...results]);
      setBulkProgress({ done: i + 1, total: bulkCount });
    }
    setBulkProgress(null);
  }, [bulkCount]);

  const exportJSON = (cards: ForgeCard[]) => {
    const blob = new Blob([JSON.stringify(cards, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `am-cards-${Date.now()}.json`,
    });
    a.click();
  };

  // ─── SAVE TO GAME DB ─────────────────────────────────────────────────────

  const FORGE_TO_GAME_TYPE: Record<string, CardType> = {
    "Unité": "creature", "Sort": "spell", "Artefact": "spell", "Magie": "spell",
  };

  const FORGE_TO_GAME_KEYWORD: Record<string, Keyword> = {
    "Traque": "charge",
    "Provocation": "taunt",
    "Bouclier": "divine_shield",
    "Vol": "ranged",
  };

  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const saveToGame = useCallback(async (forgeCard: ForgeCard) => {
    setSaving(true);
    setSaveResult(null);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Map keywords
      const gameKeywords: Keyword[] = forgeCard.keywords
        .map(k => FORGE_TO_GAME_KEYWORD[k])
        .filter((k): k is Keyword => !!k);

      // Upload image if exists
      let image_url: string | null = null;
      const blobUrl = cardImages[forgeCard.id];
      if (blobUrl) {
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        const ext = blob.type.split("/")[1] || "webp";
        const filePath = `forge_${forgeCard.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("card-images")
          .upload(filePath, blob, { upsert: true, contentType: blob.type });
        if (uploadErr) throw new Error(`Image: ${uploadErr.message}`);
        const { data: urlData } = supabase.storage.from("card-images").getPublicUrl(filePath);
        image_url = urlData.publicUrl;
      }

      // Build effect text with all forge keywords
      const kwDescs = forgeCard.keywords.map(k => `${k}: ${KEYWORDS[k]?.desc || ""}`).join(" ");
      const effectText = [forgeCard.ability, kwDescs].filter(Boolean).join(" — ");

      // Insert
      const { error: insertErr } = await supabase.from("cards").insert({
        name: forgeCard.name,
        mana_cost: forgeCard.mana,
        card_type: FORGE_TO_GAME_TYPE[forgeCard.type] || "creature",
        attack: forgeCard.attack,
        health: forgeCard.defense,
        effect_text: effectText,
        keywords: gameKeywords,
        spell_effect: null,
        image_url,
      });
      if (insertErr) throw new Error(insertErr.message);

      setSaveResult({ ok: true, msg: `"${forgeCard.name}" ajoutée au jeu !` });
    } catch (err) {
      setSaveResult({ ok: false, msg: err instanceof Error ? err.message : "Erreur inconnue" });
    } finally {
      setSaving(false);
    }
  }, [cardImages]);

  const fac = FACTIONS[faction];

  return (
    <>
      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0;transform:translateY(6px); } to { opacity:1;transform:none; } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.45} }
        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background:#0d0d1a; }
        ::-webkit-scrollbar-thumb { background:#1a1a3a; border-radius:2px; }
        .hist-row:hover { background:rgba(255,255,255,0.03) !important; }
        .bulk-row:hover { border-color:rgba(255,255,255,0.12) !important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#07070f", fontFamily: "'Cinzel',serif", color: "#ccc", display: "flex", flexDirection: "column" }}>

        {/* Topbar */}
        <div style={{ padding: "11px 20px", borderBottom: "1px solid #0f0f24", background: "linear-gradient(90deg,#0a0a1f,#07070f)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚗️</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#ffd54f", letterSpacing: 2.5 }}>CARD FORGE</span>
            <span style={{ fontSize: 8, color: "#2a2a4a", letterSpacing: 2 }}>ARMIES & MAGIC</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["forge", "⚒ Forge"], ["bulk", "📦 Masse"], ["budget", "⚖ Budget"], ["schema", "📋 Schéma"]] as const).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "4px 12px", borderRadius: 4, cursor: "pointer",
                background: tab === t ? "#ffd54f15" : "transparent",
                border: `1px solid ${tab === t ? "#ffd54f44" : "#111122"}`,
                color: tab === t ? "#ffd54f" : "#333",
                fontFamily: "'Cinzel',serif", fontSize: 8.5, fontWeight: 700, letterSpacing: 0.8,
                transition: "all 0.2s",
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* ── FORGE ── */}
        {tab === "forge" && (
          <div style={{ display: "flex", flex: 1 }}>

            {/* Controls */}
            <div style={{ width: 235, padding: "16px 13px", borderRight: "1px solid #0f0f24", background: "#08081a", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
              <Sec title="Faction">
                {Object.entries(FACTIONS).map(([f, fc]) => (
                  <button key={f} onClick={() => setFaction(f)} style={{
                    padding: "5px 10px", borderRadius: 4, cursor: "pointer", width: "100%",
                    background: faction === f ? `${fc.color}22` : "transparent",
                    border: `1px solid ${faction === f ? fc.color + "88" : "#111122"}`,
                    color: faction === f ? fc.accent : "#2e2e55",
                    fontFamily: "'Cinzel',serif", fontSize: 9.5, fontWeight: faction === f ? 700 : 400,
                    textAlign: "left", transition: "all 0.15s", marginBottom: 3,
                    display: "flex", alignItems: "center", gap: 7,
                  }}>
                    <span>{fc.emoji}</span><span style={{ flex: 1 }}>{f}</span>
                  </button>
                ))}
              </Sec>

              <Sec title="Type">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                  {TYPES.map(t => (
                    <button key={t} onClick={() => setType(t)} style={{
                      padding: "5px 4px", borderRadius: 4, cursor: "pointer",
                      background: type === t ? "#ffffff0f" : "transparent",
                      border: `1px solid ${type === t ? "#44446a" : "#111122"}`,
                      color: type === t ? "#ddd" : "#2e2e55",
                      fontFamily: "'Cinzel',serif", fontSize: 9, transition: "all 0.15s",
                    }}>{t}</button>
                  ))}
                </div>
              </Sec>

              <Sec title="Rareté">
                {RARITIES.map(r => (
                  <button key={r.id} onClick={() => setRarity(r.id)} style={{
                    padding: "5px 10px", borderRadius: 4, cursor: "pointer", width: "100%",
                    background: rarity === r.id ? `${r.color}15` : "transparent",
                    border: `1px solid ${rarity === r.id ? r.color + "77" : "#111122"}`,
                    color: rarity === r.id ? r.color : "#2e2e55",
                    fontFamily: "'Cinzel',serif", fontSize: 9.5, fontWeight: rarity === r.id ? 700 : 400,
                    textAlign: "left", transition: "all 0.15s", marginBottom: 3,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <span>{r.label}</span>
                    <span style={{ fontSize: 7.5, opacity: 0.55 }}>×{r.multiplier.toFixed(2)}</span>
                  </button>
                ))}
              </Sec>

              <button onClick={() => forgeCard()} disabled={loading} style={{
                padding: "10px", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer",
                background: loading ? "#1a1a2a" : `linear-gradient(135deg,${fac.color},${fac.accent}77)`,
                border: `1px solid ${loading ? "#1a1a2a" : fac.accent + "88"}`,
                color: loading ? "#333" : "#fff",
                fontFamily: "'Cinzel',serif", fontSize: 10.5, fontWeight: 700, letterSpacing: 2,
                boxShadow: loading ? "none" : `0 0 16px ${fac.color}33`,
                animation: loading ? "pulse 1.5s infinite" : "none",
                transition: "all 0.3s",
              }}>
                {loading ? "FORGE EN COURS…" : `${fac.emoji}  FORGER`}
              </button>
            </div>

            {/* Preview */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 28 }}>
              <div style={{ animation: card ? "fadeIn 0.35s ease" : "none" }}>
                <CardVisual
                  card={card}
                  loading={loading}
                  imageUrl={card ? cardImages[card.id] || null : null}
                  onImageChange={(url) => { if (card) setCardImages(prev => ({ ...prev, [card.id]: url })); }}
                />
              </div>
              {card && !loading && (
                <div style={{ display: "flex", gap: 7 }}>
                  <Btn onClick={() => forgeCard()} label="🎲 Re-roll" color="#74b9ff" />
                  <Btn onClick={() => exportJSON([card])} label="📤 JSON" color="#55efc4" />
                  <Btn onClick={() => saveToGame(card)} label={saving ? "⏳ …" : "💾 Sauvegarder"} color="#ffd54f" />
                </div>
              )}
              {saveResult && !loading && (
                <div style={{
                  padding: "6px 12px", borderRadius: 5, fontSize: 9,
                  background: saveResult.ok ? "#55efc411" : "#ff6b6b11",
                  border: `1px solid ${saveResult.ok ? "#55efc444" : "#ff6b6b44"}`,
                  color: saveResult.ok ? "#55efc4" : "#ff6b6b",
                  fontFamily: "'Crimson Text',serif", maxWidth: 380, textAlign: "center",
                }}>
                  {saveResult.msg}
                </div>
              )}
              {card?.illustrationPrompt && (
                <div style={{ maxWidth: 380, padding: "9px 12px", borderRadius: 6, background: "#08081a", border: "1px solid #0f0f24", fontFamily: "'Crimson Text',serif" }}>
                  <div style={{ fontSize: 7.5, color: "#2a2a4a", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'Cinzel',serif" }}>MIDJOURNEY PROMPT</div>
                  <div style={{ fontSize: 10, color: "#555", lineHeight: 1.5 }}>{card.illustrationPrompt}</div>
                  <button onClick={() => navigator.clipboard.writeText(card.illustrationPrompt)} style={{
                    marginTop: 5, fontSize: 8.5, background: "none", border: "none",
                    color: "#55efc4", cursor: "pointer", fontFamily: "'Cinzel',serif",
                  }}>[copier]</button>
                </div>
              )}
            </div>

            {/* History */}
            <div style={{ width: 190, padding: "14px 10px", borderLeft: "1px solid #0f0f24", background: "#08081a", overflowY: "auto" }}>
              <div style={{ fontSize: 7.5, color: "#2a2a4a", letterSpacing: 2, marginBottom: 10 }}>HISTORIQUE</div>
              {history.length === 0 && <div style={{ fontSize: 9, color: "#1a1a3a", textAlign: "center", marginTop: 30 }}>Aucune carte</div>}
              {history.map(c => {
                const f = FACTIONS[c.faction] || FACTIONS.Humains;
                const r = RARITY_MAP[c.rarity];
                return (
                  <div key={c.id} className="hist-row" onClick={() => setCard(c)} style={{
                    padding: "6px 8px", borderRadius: 4, marginBottom: 4,
                    background: `${f.color}08`, border: `1px solid ${r.color}22`,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <div style={{ fontSize: 9, color: f.accent, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 7.5, color: "#333", display: "flex", justifyContent: "space-between" }}>
                      <span>{c.faction}</span>
                      <span style={{ color: r.color }}>{r.code} · {c.mana}💧</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BULK ── */}
        {tab === "bulk" && (
          <div style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#08081a", borderRadius: 7, border: "1px solid #0f0f24" }}>
              <span style={{ fontSize: 9, color: "#444", letterSpacing: 1 }}>NOMBRE</span>
              <input type="number" value={bulkCount} min={1} max={500}
                onChange={e => setBulkCount(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                style={{ width: 60, padding: "3px 8px", background: "#0d0d1a", border: "1px solid #1a1a3a", borderRadius: 4, color: "#ffd54f", fontFamily: "'Cinzel',serif", fontSize: 12, textAlign: "center" }}
              />
              <span style={{ fontSize: 8.5, color: "#222" }}>Tous paramètres aléatoires</span>
              <div style={{ flex: 1 }} />
              {bulkProgress
                ? <Btn onClick={() => { abortRef.current = true; setBulkProgress(null); }} label="✕ Annuler" color="#ff6b6b" />
                : <Btn onClick={startBulk} label="▶ Lancer" color="#ffd54f" />
              }
              {bulkCards.length > 0 && !bulkProgress && (
                <Btn onClick={() => exportJSON(bulkCards)} label={`📤 JSON (${bulkCards.length})`} color="#55efc4" />
              )}
            </div>

            {bulkProgress && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 2, background: "#111122", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: "linear-gradient(90deg,#ffd54f,#ffb300)", width: `${(bulkProgress.done / bulkProgress.total) * 100}%`, transition: "width 0.2s" }} />
                </div>
                <span style={{ fontSize: 9, color: "#ffd54f", fontWeight: 700, whiteSpace: "nowrap" }}>{bulkProgress.done}/{bulkProgress.total}</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(185px,1fr))", gap: 7, overflowY: "auto", flex: 1 }}>
              {bulkCards.map(c => {
                const f = FACTIONS[c.faction] || FACTIONS.Humains;
                const r = RARITY_MAP[c.rarity];
                return (
                  <div key={c.id} className="bulk-row" style={{
                    padding: "8px 10px", borderRadius: 6,
                    background: `${f.color}08`, border: `1px solid ${r.color}22`,
                    animation: "fadeIn 0.2s ease", transition: "border-color 0.2s",
                  }}>
                    <div style={{ fontSize: 9.5, color: f.accent, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 8, color: "#444", display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span>{c.faction} · {c.type}</span>
                      <span style={{ color: r.color }}>{c.rarity}</span>
                    </div>
                    <div style={{ fontSize: 8.5, color: "#3a3a5a", lineHeight: 1.4, fontFamily: "'Crimson Text',serif" }}>
                      {c.ability?.slice(0, 85)}{c.ability?.length > 85 ? "…" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 7.5, color: "#74b9ff" }}>💧{c.mana}</span>
                      {c.attack != null && <><span style={{ fontSize: 7.5, color: "#ff6b6b" }}>⚔{c.attack}</span><span style={{ fontSize: 7.5, color: "#74b9ff" }}>🛡{c.defense}</span></>}
                      {c.power != null && <span style={{ fontSize: 7.5, color: f.accent }}>✨{c.power}</span>}
                      <span style={{ fontSize: 7, color: "#222", marginLeft: "auto" }}>{c.budgetUsed}/{c.budgetTotal}pt</span>
                    </div>
                    {c.keywords?.length > 0 && (
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {c.keywords.map(kw => (
                          <span key={kw} style={{ fontSize: 6.5, padding: "1px 4px", borderRadius: 3, background: `${f.color}18`, color: f.accent, border: `1px solid ${f.color}44` }}>{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── BUDGET ── */}
        {tab === "budget" && (
          <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
            <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ fontSize: 8, color: "#2a2a4a", letterSpacing: 2 }}>SYSTÈME DE BUDGET — RÉFÉRENCE</div>

              {/* Mana-Rarity distribution */}
              <Panel title="DISTRIBUTION RARETÉ PAR COÛT DE MANA (MODE BULK)">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "5px 10px", textAlign: "left", color: "#333", fontWeight: 400, borderBottom: "1px solid #111122" }}>Mana</th>
                        {RARITIES.map(r => (
                          <th key={r.id} style={{ padding: "5px 10px", textAlign: "center", color: r.color, fontWeight: 700, borderBottom: "1px solid #111122", whiteSpace: "nowrap" }}>
                            {r.code} {r.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {RARITY_WEIGHTS_BY_MANA.map((weights, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #0a0a1a" }}>
                          <td style={{ padding: "5px 10px", color: "#74b9ff", fontWeight: 700 }}>{i + 1}</td>
                          {weights.map((w, j) => {
                            const rar = RARITIES[j];
                            const pct = Math.round(w * 100);
                            const intensity = Math.min(1, w / 0.40);
                            return (
                              <td key={j} style={{
                                padding: "5px 10px", textAlign: "center",
                                color: pct >= 20 ? rar.color : pct >= 10 ? rar.color + "aa" : "#333",
                                fontWeight: pct >= 20 ? 700 : 400,
                                background: pct >= 5 ? `${rar.color}${Math.round(intensity * 18).toString(16).padStart(2, "0")}` : "transparent",
                              }}>
                                {pct}%
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 10, fontSize: 8, color: "#333", lineHeight: 1.8 }}>
                  En mode Bulk : le mana est tiré en premier (1–10), puis la rareté est tirée selon ces probabilités. &nbsp;
                  Une carte à 10 mana a <strong style={{ color: "#ffd54f" }}>10× plus de chances</strong> d&apos;être Légendaire qu&apos;une carte à 1 mana, tout en restant possible à toutes les raretés.
                </div>
              </Panel>

              {/* Rarity grid */}
              <Panel title="MULTIPLICATEURS PAR RARETÉ">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                  {RARITIES.map(r => (
                    <div key={r.id} style={{ textAlign: "center", padding: "10px 6px", borderRadius: 5, border: `1px solid ${r.color}33`, background: `${r.color}08` }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: r.color, marginBottom: 3 }}>{r.code}</div>
                      <div style={{ fontSize: 8.5, color: r.color, marginBottom: 6 }}>{r.label}</div>
                      <div style={{ fontSize: 13, color: "#aaa", fontWeight: 700 }}>×{r.multiplier.toFixed(2)}</div>
                      <div style={{ fontSize: 7.5, color: "#333", marginTop: 3 }}>+{((r.multiplier - 1) * 100).toFixed(0)}%</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 8.5, color: "#333", lineHeight: 1.9 }}>
                  Budget = mana × 10 × multiplicateur (±10%) &nbsp;·&nbsp; Ex: 5 mana Épique → <strong style={{ color: "#ce93d8" }}>57.5 pts</strong> (fourchette 51–63)
                </div>
              </Panel>

              {/* Stat costs */}
              <Panel title="COÛT DES STATISTIQUES">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([["ATK", "#ff6b6b", "2.5 pts par point"], ["DEF", "#74b9ff", "2.0 pts par point"]] as const).map(([stat, color, desc]) => (
                    <div key={stat} style={{ padding: "10px 14px", borderRadius: 5, background: `${color}0a`, border: `1px solid ${color}33` }}>
                      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 3 }}>{stat}</div>
                      <div style={{ fontSize: 9, color: "#555" }}>{desc}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 8.5, color: "#333", lineHeight: 1.8 }}>
                  L&apos;algorithme alloue d&apos;abord ATK (45% du budget restant), puis DEF (55%), puis tente d&apos;ajouter des keywords jusqu&apos;à épuisement.
                  Les multiplicateurs de faction (ATK weight, DEF weight) modifient les plages de tirage.
                </div>
              </Panel>

              {/* Keyword costs */}
              <Panel title="COÛT DES KEYWORDS">
                <div style={{ fontSize: 8, color: "#333", lineHeight: 1.9, marginBottom: 10 }}>
                  <strong style={{ color: "#aaa" }}>1 SE (stat équivalent)</strong> = ~4.5 pts de budget = 1 point de stat vanilla que le keyword remplace.
                  &nbsp;ATK coûte <strong style={{ color: "#ff6b6b" }}>5 pts</strong>, DEF coûte <strong style={{ color: "#74b9ff" }}>4 pts</strong>.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 5 }}>
                  {Object.entries(KEYWORDS).map(([id, kw]) => {
                    const tierRar = RARITIES[kw.minTier];
                    return (
                      <div key={id} style={{ padding: "6px 9px", borderRadius: 4, background: `${tierRar.color}07`, border: `1px solid ${tierRar.color}28`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9.5, color: tierRar.color, fontWeight: 700 }}>{id}</div>
                          <div style={{ fontSize: 7.5, color: "#333", lineHeight: 1.4, marginTop: 1, fontFamily: "'Crimson Text',serif" }}>{kw.desc}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>{kw.cost}pt</div>
                          <div style={{ fontSize: 7.5, color: "#555" }}>{kw.se} SE</div>
                          <div style={{ fontSize: 7, color: tierRar.color }}>{tierRar.code}+</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              {/* Faction profiles */}
              <Panel title="PROFILS DE FACTION">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(235px,1fr))", gap: 8 }}>
                  {Object.entries(FACTIONS).map(([f, fc]) => (
                    <div key={f} style={{ padding: "10px 12px", borderRadius: 5, background: `${fc.color}09`, border: `1px solid ${fc.color}28` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                        <span style={{ fontSize: 15 }}>{fc.emoji}</span>
                        <span style={{ fontSize: 10, color: fc.accent, fontWeight: 700 }}>{f}</span>
                      </div>
                      <div style={{ fontSize: 8.5, color: "#3a3a5a", fontFamily: "'Crimson Text',serif", marginBottom: 6 }}>{fc.description}</div>
                      <div style={{ fontSize: 8, color: "#333", lineHeight: 1.8 }}>
                        <div>⚔ ATK ×{fc.statWeights.atk.toFixed(2)} &nbsp;·&nbsp; 🛡 DEF ×{fc.statWeights.def.toFixed(2)}</div>
                        {fc.guaranteedKeywords.length > 0 && <div style={{ color: fc.accent }}>★ Garanti : {fc.guaranteedKeywords.join(", ")}</div>}
                        <div style={{ color: "#222" }}>✕ Interdit : {fc.forbiddenKeywords.join(", ")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}

        {/* ── SCHEMA ── */}
        {tab === "schema" && (
          <div style={{ flex: 1, padding: 22, overflowY: "auto" }}>
            <div style={{ maxWidth: 660 }}>
              <div style={{ fontSize: 8, color: "#2a2a4a", letterSpacing: 2, marginBottom: 12 }}>CARD SCHEMA — JSON</div>
              <pre style={{ background: "#08081a", border: "1px solid #0f0f24", borderRadius: 7, padding: 18, fontSize: 11, color: "#a29bfe", lineHeight: 1.75, fontFamily: "monospace", overflow: "auto" }}>
{JSON.stringify({
  id: "am_1711234567_ab12",
  name: "Forgeron de l'Abîme",
  faction: "Nains|Elfes|Humains|Morts-vivants|Démons|Dragons",
  type: "Unité|Sort|Artefact|Magie",
  rarity: "Commune|Peu Commune|Rare|Épique|Légendaire",
  mana: "1–10",
  attack: "int (Unité) | null",
  defense: "int (Unité) | null",
  power: "int (Sort/Magie) | null",
  keywords: ["Armure", "Résistance"],
  ability: "Texte de capacité (IA)",
  flavorText: "Texte narratif (IA)",
  illustrationPrompt: "Midjourney prompt EN (IA)",
  budgetTotal: 44,
  budgetUsed: 41,
  generatedAt: "2026-03-21T10:00:00.000Z"
}, null, 2)}
              </pre>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
