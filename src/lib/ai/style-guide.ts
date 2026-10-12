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

/** Bloc de direction artistique pour un prompt. Les champs vides sont omis ;
 *  `null` si la charte n'a rien à dire. La charte est rédigée en français : le
 *  modèle la transpose (Claude écrit l'illustrationPrompt en anglais, Gemini
 *  lit les deux langues). */
export function formatStyleGuideForPrompt(sg: Pick<StyleGuide, "clan" | StyleGuideField> | null | undefined): string | null {
  if (!sg) return null;
  const lignes = STYLE_GUIDE_FIELDS
    .map(({ key, prompt }) => {
      const v = sg[key]?.trim();
      return v ? `- ${prompt}: ${v}` : null;
    })
    .filter((l): l is string => l !== null);
  if (lignes.length === 0) return null;
  return `ART DIRECTION — clan "${sg.clan}" (house style guide, written in French; apply it, do not quote it):\n${lignes.join("\n")}`;
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
