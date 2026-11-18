// Traduction automatique d'un texte de la page d'accueil, FR → 7 langues, en
// UN appel : les textes sont courts, et un seul aller-retour garde
// l'enregistrement rapide pour l'admin.
//
// Même pattern d'appel que api/news/translate (fetch direct sur
// api.anthropic.com, pas de SDK dans ce dépôt).

import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/i18n/config";

const MODEL = "claude-sonnet-5-5";
const MAX_TOKENS = 4000;

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", de: "German", it: "Italian",
  pt: "Portuguese", ja: "Japanese", zh: "Simplified Chinese",
};

export const LOCALES_CIBLES: Locale[] = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);

export function construirePrompt(texte: string, role: string): string {
  const langues = LOCALES_CIBLES.map((l) => `"${l}" (${LANG_NAMES[l] ?? l})`).join(", ");
  return `You are a professional game localizer for "Armies of Legends", a fantasy collectible card game. Translate the French marketing text below, shown on the public home page, into each of these languages: ${langues}.

Where the text appears: ${role}

Rules:
- Idiomatic and concise, same tone and same length as the source. Address the reader informally where the language allows it.
- Keep "Armies of Legends", faction names and card names unchanged unless an official translation is obvious.
- Do not add or remove content. No quotes around the text, no code fences.
- Output ONLY a JSON object, nothing else, with exactly these keys: ${LOCALES_CIBLES.map((l) => `"${l}"`).join(", ")}.

FRENCH TEXT:
${texte}`;
}

/** Extrait les traductions de la réponse (tolère du texte autour du JSON). */
export function lireTraductions(reponse: string): Partial<Record<Locale, string>> {
  const debut = reponse.indexOf("{");
  const fin = reponse.lastIndexOf("}");
  if (debut === -1 || fin <= debut) return {};
  let obj: unknown;
  try {
    obj = JSON.parse(reponse.slice(debut, fin + 1));
  } catch {
    return {};
  }
  if (obj === null || typeof obj !== "object") return {};
  const out: Partial<Record<Locale, string>> = {};
  for (const l of LOCALES_CIBLES) {
    const v = (obj as Record<string, unknown>)[l];
    if (typeof v === "string" && v.trim()) out[l] = v.trim();
  }
  return out;
}

async function appelerModele(apiKey: string, prompt: string): Promise<string> {
  let derniere = "";
  for (let essai = 0; essai < 3; essai++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: "low" },
        fallbacks: "default",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (response.ok && data.stop_reason === "refusal") {
      throw new Error(`refus du modèle (${data.stop_details?.category ?? "catégorie inconnue"})`);
    }
    if (response.ok) {
      const text = data.content?.find((b: { type: string; text?: string }) => b.type === "text")?.text;
      if (typeof text === "string" && text.trim()) return text;
      derniere = "réponse vide";
    } else if (response.status === 529 || data?.error?.type === "overloaded_error") {
      derniere = "API surchargée";
      await new Promise((r) => setTimeout(r, 2000 * (essai + 1)));
    } else {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }
  }
  throw new Error(derniere || "échec après plusieurs essais");
}

/**
 * Traduit `texte` dans les sept langues. Un second appel ne redemande rien de
 * plus : si des langues manquent après deux essais, elles sont listées dans
 * `manquantes` et le visiteur garde le texte par défaut dans ces langues.
 */
export async function traduireTexte(
  apiKey: string,
  texte: string,
  role: string,
): Promise<{ traductions: Partial<Record<Locale, string>>; manquantes: Locale[] }> {
  const prompt = construirePrompt(texte, role);
  let traductions = lireTraductions(await appelerModele(apiKey, prompt));
  if (LOCALES_CIBLES.some((l) => !traductions[l])) {
    traductions = { ...lireTraductions(await appelerModele(apiKey, prompt)), ...traductions };
  }
  return { traductions, manquantes: LOCALES_CIBLES.filter((l) => !traductions[l]) };
}
