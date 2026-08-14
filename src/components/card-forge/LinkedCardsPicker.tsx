"use client";

// Paramètres du mot-clé « Compagnons » : une liste ordonnée de CARTES LIÉES
// (ids de la table `cards`), choisies à la création de la carte porteuse. Au
// déclenchement, le moteur mélange une copie de chacune dans le deck du
// contrôleur puis remélange tout le deck. Les doublons sont PERMIS : lier deux
// fois la même carte en mélange deux copies.
//
// Partagé par la forge côté créature (keyword_instances[i].linkedCardIds) et
// côté sort (spell_keywords[i].linkedCardIds) — même contrat que CostListEditor
// pour « Invocations multiples ».

import { useEffect, useMemo, useState } from "react";
import { getFactionDisplayName } from "@/lib/card-engine/constants";

interface PickableCard {
  id: number;
  name: string;
  mana_cost: number;
  card_type: "creature" | "spell";
  faction: string | null;
  attack: number | null;
  health: number | null;
}

// Catalogue partagé entre toutes les instances du picker (créature + sort du
// même formulaire) : une seule requête par session de forge.
let catalogCache: PickableCard[] | null = null;
let catalogPromise: Promise<PickableCard[]> | null = null;

/** Vide le catalogue partagé. À appeler après CHAQUE création ou modification de
 *  carte : sans cela, une carte forgée pendant la session reste introuvable dans
 *  le sélecteur de Compagnons jusqu'au rechargement complet de la page — le cache
 *  vit au niveau du module, il survit donc au démontage du composant.
 *
 *  Symptôme constaté : « Mila, Bouclier Dévoué », créée puis cherchée dans la
 *  foulée, n'apparaissait pas. */
export function invalidateLinkedCardsCatalog(): void {
  catalogCache = null;
  catalogPromise = null;
}

async function loadCatalog(): Promise<PickableCard[]> {
  if (catalogCache) return catalogCache;
  if (!catalogPromise) {
    catalogPromise = fetch("/api/cards/save")
      .then((r) => r.json())
      .then((data) => {
        catalogCache = Array.isArray(data)
          ? (data as PickableCard[]).map((c) => ({
              id: c.id, name: c.name, mana_cost: c.mana_cost,
              card_type: c.card_type, faction: c.faction,
              attack: c.attack, health: c.health,
            }))
          : [];
        return catalogCache;
      })
      .catch(() => {
        catalogPromise = null; // permet un nouvel essai au prochain montage
        return [];
      });
  }
  return catalogPromise;
}

// Recherche insensible à la casse ET aux accents (NFD + retrait des
// diacritiques combinants U+0300–U+036F).
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function LinkedCardsPicker({
  value, onChange, accent = "#8a6d3b",
}: {
  value: number[];
  onChange: (v: number[]) => void;
  accent?: string;
}) {
  const [catalog, setCatalog] = useState<PickableCard[]>(catalogCache ?? []);
  const [search, setSearch] = useState("");
  const ids = value ?? [];

  useEffect(() => {
    let alive = true;
    loadCatalog().then((cards) => { if (alive) setCatalog(cards); });
    return () => { alive = false; };
  }, []);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const matches = useMemo(() => {
    const needle = normalize(search.trim());
    if (!needle) return [];
    return catalog
      .filter((c) => normalize(c.name).includes(needle))
      .slice(0, 20);
  }, [catalog, search]);

  const cardLabel = (c: PickableCard) => {
    const stats = c.card_type === "creature" ? ` ${c.attack ?? 0}/${c.health ?? 0}` : " (sort)";
    const fac = c.faction ? ` · ${getFactionDisplayName(c.faction)}` : "";
    return `${c.name} — ${c.mana_cost}💧${stats}${fac}`;
  };

  return (
    <div style={{ border: `1px solid ${accent}33`, borderRadius: 6, padding: 8, background: "#fff" }}>
      <div style={{ fontSize: 8, color: accent, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>
        🐾 COMPAGNONS — CARTES LIÉES
        {ids.length === 0 && <span style={{ color: "#e74c3c", marginLeft: 4 }}>· requis</span>}
      </div>

      {/* Cartes liées déjà choisies (doublons permis, une puce par copie). */}
      {ids.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {ids.map((id, idx) => {
            const c = byId.get(id);
            return (
              <span key={`${id}_${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 4, border: `1px solid ${accent}44`, background: `${accent}11`, fontSize: 9, fontFamily: "'Cinzel',serif", color: "#555" }}>
                {c ? cardLabel(c) : `Carte #${id}`}
                <button
                  onClick={() => onChange(ids.filter((_, i) => i !== idx))}
                  title="Retirer"
                  style={{ padding: "0px 5px", borderRadius: 3, border: "1px solid #f5a3a3", background: "#fde8e8", color: "#e74c3c", fontSize: 9, cursor: "pointer" }}
                >×</button>
              </span>
            );
          })}
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={catalog.length === 0 ? "Chargement des cartes…" : "Rechercher une carte à lier…"}
        style={{ width: "100%", padding: "4px 8px", borderRadius: 5, border: `1px solid ${accent}44`, fontSize: 10, fontFamily: "'Cinzel',serif", background: "#fff" }}
      />
      {matches.length > 0 && (
        <div style={{ marginTop: 4, maxHeight: 160, overflowY: "auto", border: `1px solid ${accent}22`, borderRadius: 5 }}>
          {matches.map((c) => (
            <button
              key={c.id}
              onClick={() => onChange([...ids, c.id])}
              title="Ajouter aux Compagnons"
              style={{ display: "block", width: "100%", textAlign: "left", padding: "3px 8px", border: "none", borderBottom: `1px solid ${accent}11`, background: "#fff", fontSize: 9, fontFamily: "'Cinzel',serif", color: "#444", cursor: "pointer" }}
            >{cardLabel(c)}</button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 8, color: "#999", marginTop: 6, fontStyle: "italic" }}>
        Au déclenchement, une copie de chaque carte liée est mélangée dans le deck
        du contrôleur, puis le deck est remélangé. Doublons permis.
      </div>
    </div>
  );
}
