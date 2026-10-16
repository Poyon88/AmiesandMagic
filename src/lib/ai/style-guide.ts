// CHARTES GRAPHIQUES par clan (table `style_guides`, cf.
// supabase-migration-style-guides.sql) : l'univers visuel commun d'un clan,
// injecté dans les prompts d'illustration des cartes, jetons, plateaux et
// héros. La RACE reste le sujet de l'image ; la charte en fixe le monde.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StyleGuide {
  id: number;
  clan: string;
  name: string;
  is_default: boolean;
  palette: string | null;
  lighting: string | null;
  art_style: string | null;
  environments: string | null;
  materials: string | null;
  motifs: string | null;
  avoid: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export type StyleGuideField = "palette" | "lighting" | "art_style" | "environments" | "materials" | "motifs" | "avoid" | "notes";

/** Champs dans l'ordre d'affichage ET d'injection. `prompt` = étiquette anglaise
 *  du bloc envoyé aux modèles (les prompts d'illustration sont en anglais). */
export const STYLE_GUIDE_FIELDS: { key: StyleGuideField; label: string; prompt: string; aide: string }[] = [
  { key: "palette", label: "Palette", prompt: "Palette", aide: "Couleurs dominantes et d'accent" },
  { key: "lighting", label: "Lumière et ambiance", prompt: "Lighting & mood", aide: "Heure, sources de lumière, atmosphère" },
  { key: "art_style", label: "Style artistique", prompt: "Art style", aide: "Rendu, technique, cadrage" },
  { key: "environments", label: "Décors", prompt: "Environments", aide: "Lieux et arrière-plans typiques" },
  { key: "materials", label: "Matériaux et costumes", prompt: "Materials, costume & gear", aide: "Armures, tissus, armes, architecture" },
  { key: "motifs", label: "Motifs et emblèmes", prompt: "Motifs & emblems", aide: "Symboles et ornements récurrents" },
  { key: "avoid", label: "À éviter", prompt: "Avoid", aide: "Ce qui trahirait le clan" },
  { key: "notes", label: "Notes", prompt: "Notes", aide: "Ce qui n'entre nulle part ailleurs" },
];

/** Champs qui font l'UNITÉ d'un clan (toujours appliqués) : le rendu et les
 *  interdits. La palette n'y est plus (2026-10-15) : imposée à chaque carte avec
 *  la lumière, elle peignait tout le clan de la même couleur (Fils du Volcan :
 *  nuit, lave et volcan sur chaque carte). Elle donne désormais des ACCENTS ; la
 *  lumière rejoint le RÉPERTOIRE, où chaque carte pioche. */
export const STYLE_GUIDE_MANDATORY: readonly StyleGuideField[] = ["art_style", "avoid"];
/** Couleurs du clan, en touches : la couleur dominante de l'image suit le moment
 *  et la météo de la carte. */
export const STYLE_GUIDE_ACCENTS: readonly StyleGuideField[] = ["palette"];

/** Éléments d'un champ libre, hors parenthèses : aux points-virgules s'il y en a
 *  (« pagne de kapa, épaules nues ; cape de fibres » = deux options), sinon aux
 *  virgules. */
export function elementsCharte(texte: string): string[] {
  const seps = texte.includes(";") ? [";"] : [","];
  const out: string[] = [];
  let prof = 0, cur = "";
  for (const ch of texte) {
    if (ch === "(") prof++;
    if (ch === ")") prof = Math.max(0, prof - 1);
    if (prof === 0 && seps.includes(ch)) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((e) => e.trim().replace(/\.$/, "").trim()).filter(Boolean);
}

/** Bloc de direction artistique pour un prompt. Les champs vides sont omis ;
 *  `null` si la charte n'a rien à dire. La charte est rédigée en français : le
 *  modèle la transpose (Claude écrit l'illustrationPrompt en anglais, Gemini
 *  lit les deux langues).
 *
 *  `mode: "repertoire"` (cartes) sépare l'obligatoire, les accents et le
 *  répertoire ; le mode par défaut (jetons, plateaux, héros) garde le bloc
 *  unique. Avec `tirage` (un générateur dans [0, 1[), chaque champ du répertoire
 *  est réduit à `parChamp` éléments tirés au hasard : une carte isolée ne voit
 *  plus toujours les mêmes premiers éléments de la liste. */
export function formatStyleGuideForPrompt(
  sg: Pick<StyleGuide, "clan" | StyleGuideField> | null | undefined,
  opts: { mode?: "strict" | "repertoire"; tirage?: () => number; parChamp?: number } = {},
): string | null {
  if (!sg) return null;
  const valeur = (key: StyleGuideField) => {
    const v = sg[key]?.trim();
    if (!v || !opts.tirage || opts.mode !== "repertoire" || !estRepertoire(key) || key === "notes") return v;
    const items = elementsCharte(v);
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(opts.tirage() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items.slice(0, opts.parChamp ?? 3).join(" ; ");
  };
  const ligne = (key: StyleGuideField, prompt: string) => {
    const v = valeur(key);
    return v ? `- ${prompt}: ${v}` : null;
  };
  const lignes = (filtre: (k: StyleGuideField) => boolean) => STYLE_GUIDE_FIELDS
    .filter(({ key }) => filtre(key))
    .map(({ key, prompt }) => ligne(key, prompt))
    .filter((l): l is string => l !== null);
  if (opts.mode === "repertoire") {
    const obligatoire = lignes((k) => STYLE_GUIDE_MANDATORY.includes(k));
    const accents = lignes((k) => STYLE_GUIDE_ACCENTS.includes(k));
    const repertoire = lignes(estRepertoire);
    if (!obligatoire.length && !accents.length && !repertoire.length) return null;
    return [
      `ART DIRECTION — clan "${sg.clan}" (house style guide, written in French; apply it, do not quote it).`,
      ...(obligatoire.length ? ["MANDATORY for every card:", ...obligatoire] : []),
      ...(accents.length ? ["CLAN COLOURS — accents only (one or two touches: cloth, banner, glow, jewel, paint); the dominant colours of the image come from the card's own time of day, weather and setting:", ...accents] : []),
      ...(repertoire.length ? ["REPERTOIRE — ideas to draw from, not a checklist: use at most one or two per card, vary them from card to card, and feel free to invent others in the same spirit. The clan's signature light or landmark is an OPTION, not a rule:", ...repertoire] : []),
    ].join("\n");
  }
  const tout = lignes(() => true);
  if (tout.length === 0) return null;
  return `ART DIRECTION — clan "${sg.clan}" (house style guide, written in French; apply it, do not quote it):\n${tout.join("\n")}`;
}

function estRepertoire(k: StyleGuideField): boolean {
  return !STYLE_GUIDE_MANDATORY.includes(k) && !STYLE_GUIDE_ACCENTS.includes(k);
}

/** Charte à utiliser (serveur, client service_role) : celle demandée si elle
 *  appartient bien au clan, sinon la charte par défaut du clan, sinon `null`. */
export async function loadStyleGuide(
  admin: SupabaseClient,
  { id, clan }: { id?: number | null; clan?: string | null },
): Promise<StyleGuide | null> {
  if (!clan) return null;
  if (id) {
    const { data } = await admin.from("style_guides").select("*").eq("id", id).eq("clan", clan).maybeSingle();
    if (data) return data as StyleGuide;
  }
  const { data } = await admin.from("style_guides").select("*").eq("clan", clan).eq("is_default", true).maybeSingle();
  return (data as StyleGuide | null) ?? null;
}
