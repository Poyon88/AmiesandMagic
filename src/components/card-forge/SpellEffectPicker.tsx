"use client";

// Menu « ajouter un effet » de la forge des sorts. Remplace un <select> natif :
// une <option> ne sait afficher que du texte, donc les entrées portaient
// l'emoji de secours du registre et jamais l'icône du jeu (override en base,
// clé `spell_<id>`). Même liste, mêmes deux groupes, mais chaque ligne passe
// par KeywordIcon — et l'ordre devient alphabétique français, comme les puces
// de l'éditeur.

import { useEffect, useRef, useState } from "react";
import KeywordIcon from "@/components/shared/KeywordIcon";
import type { SpellEffectCatalogEntry } from "@/lib/card-forge/spell-effect-catalog";

interface Props {
  placeholder: string;
  groups: { label: string; entries: SpellEffectCatalogEntry[] }[];
  onPick: (id: string) => void;
  border: string;
}

const trier = (entries: SpellEffectCatalogEntry[]) =>
  [...entries].sort((a, b) => a.label.localeCompare(b.label, "fr"));

export default function SpellEffectPicker({ placeholder, groups, onPick, border }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur + Échap (même recette que LanguageSelector).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          padding: "4px 10px", borderRadius: 5, border, fontSize: 11, fontFamily: "'Cinzel',serif",
          background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, color: "#333",
        }}
      >
        <span>{placeholder}</span>
        <span aria-hidden="true" style={{ fontSize: 8, opacity: 0.6 }}>▼</span>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 200,
            minWidth: 280, maxHeight: 380, overflowY: "auto",
            background: "#fff", border, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "4px 0",
          }}
        >
          {groups.map((g) => g.entries.length > 0 && (
            <div key={g.label}>
              <div style={{ padding: "6px 12px 3px", fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: "#9b59b6", fontFamily: "'Cinzel',serif" }}>
                {g.label}
              </div>
              {trier(g.entries).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => { setOpen(false); onPick(e.id); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "4px 12px",
                    border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
                    fontSize: 11, fontFamily: "'Cinzel',serif", color: "#333",
                  }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.background = "#f3ecff"; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
                >
                  {/* Pastille sombre : les PNG du jeu sont blancs, invisibles sur fond clair. */}
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 4, background: "#2a2a3a", flexShrink: 0, overflow: "hidden" }}>
                    <KeywordIcon symbol={e.symbol || "✦"} size={11} keyword={`spell_${e.id}`} fill />
                  </span>
                  <span>{e.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
