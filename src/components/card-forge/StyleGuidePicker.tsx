"use client";

// Choix de la CHARTE GRAPHIQUE d'un clan avant de générer un prompt
// d'illustration. `null` = la charte par défaut du clan (résolue côté serveur).
// Les listes sont mises en cache par clan au niveau du module : l'onglet
// Chartes invalide le cache après chaque modification.
import { useEffect, useState } from "react";
import type { StyleGuide } from "@/lib/ai/style-guide";

const cache = new Map<string, Promise<StyleGuide[]>>();

export function invalidateStyleGuides(): void {
  cache.clear();
}

export function fetchStyleGuides(clan: string): Promise<StyleGuide[]> {
  let p = cache.get(clan);
  if (!p) {
    p = fetch(`/api/style-guides?clan=${encodeURIComponent(clan)}`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    cache.set(clan, p);
  }
  return p;
}

export function useStyleGuides(clan: string | null | undefined): StyleGuide[] {
  // La liste est rangée AVEC le clan qu'elle concerne : un changement de clan
  // rend aussitôt une liste vide, sans setState synchrone dans l'effet.
  const [etat, setEtat] = useState<{ clan: string; list: StyleGuide[] } | null>(null);
  useEffect(() => {
    if (!clan) return;
    let vivant = true;
    fetchStyleGuides(clan).then((list) => { if (vivant) setEtat({ clan, list }); });
    return () => { vivant = false; };
  }, [clan]);
  return clan && etat?.clan === clan ? etat.list : [];
}

export default function StyleGuidePicker({ clan, value, onChange }: {
  clan: string | null | undefined;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const list = useStyleGuides(clan);
  if (!clan) return null;
  if (list.length === 0) {
    return <div style={{ fontSize: 8, color: "#aaa", margin: "2px 0" }}>Aucune charte graphique pour ce clan (onglet Chartes).</div>;
  }
  // Une charte d'un autre clan (carte dont on a changé le clan) vaut « défaut ».
  const courant = list.some((g) => g.id === value) ? value : null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#666", margin: "2px 0 4px" }}>
      🎨 Charte
      <select
        value={courant ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        style={{ fontSize: 9, padding: "2px 4px", borderRadius: 4, border: "1px solid #ddd", flex: 1 }}
      >
        <option value="">Par défaut{list.find((g) => g.is_default) ? ` — ${list.find((g) => g.is_default)!.name}` : ""}</option>
        {list.map((g) => (
          <option key={g.id} value={g.id}>{g.name}{g.is_default ? " ★" : ""}</option>
        ))}
      </select>
    </label>
  );
}
