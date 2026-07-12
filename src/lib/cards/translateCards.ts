// Cœur de traduction du contenu des cartes (nom + ambiance) via Claude.
// Réutilisé par la route /api/cards/translate ET par le branchement forge.
//
// Rappel modèle : SEULS `name` et `flavor_text` sont traduits par carte.
// `effect_text` n'est jamais traduit ici (reconstruit à l'affichage à partir
// des descriptions de mots-clés déjà traduites). Corpus source en langue mixte
// (FR ou EN) → on laisse Claude auto-détecter la langue source (option A).

export const CARD_TARGET_LOCALES = ["en", "es", "de", "it", "pt"] as const;
export type CardTargetLocale = (typeof CARD_TARGET_LOCALES)[number];

const LANG_NAMES: Record<CardTargetLocale, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
};

export interface CardText {
  id: number;
  name: string | null;
  flavor_text: string | null;
}

const ANTHROPIC_MODEL = "claude-sonnet-4-6";

function buildPrompt(cards: CardText[], locale: CardTargetLocale): string {
  const lang = LANG_NAMES[locale];
  const payload = cards.map((c) => ({
    id: c.id,
    name: c.name ?? "",
    flavor_text: c.flavor_text ?? "",
  }));
  return `You are a professional game localizer for "Armies & Magic", a dark-fantasy collectible card game. Translate the following card fields into ${lang}.

Rules:
- The source text may be in French OR English — detect it and translate into idiomatic ${lang}.
- "name" is a card title (a creature, hero, or spell). Translate it naturally; keep it evocative and concise. Do not translate a proper name that clearly should stay as-is.
- "flavor_text" is an epic lore quote/description — preserve tone and imagery.
- If a field is empty, leave it empty.

OUTPUT FORMAT — follow exactly:
- Output ONE line per card and nothing else: no header, no commentary, no code fences.
- Each line = three fields separated by a single TAB character (U+0009), in this order: the numeric id, the translated name, the translated flavor_text.
- Do NOT wrap fields in quotes and do NOT output JSON. Never put a TAB or a line break inside a field.
- Keep the same order as the input.

Cards (JSON input):
${JSON.stringify(payload)}`;
}

// Parse la réponse TSV (id⇥nom⇥ambiance, une carte par ligne). On a abandonné le
// JSON / tool_use : sur du contenu allemand le modèle ferme ses guillemets par
// un " ASCII non échappé et « stringifie » parfois le tableau — JSON invalide à
// toute taille de lot. La tabulation n'apparaît jamais dans un texte de carte.
function parseTsv(text: string): CardText[] {
  const rows: CardText[] = [];
  for (const line of text.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const id = Number(parts[0].trim());
    if (!Number.isInteger(id)) continue;
    const name = (parts[1] ?? "").trim();
    const flavor = parts.slice(2).join(" ").trim();
    rows.push({ id, name: name || null, flavor_text: flavor || null });
  }
  return rows;
}

/**
 * Traduit un lot de cartes (nom + ambiance) vers une locale cible.
 * Renvoie une map id → {name, flavor_text} traduits. Retries sur surcharge.
 */
export async function translateCardBatch(
  cards: CardText[],
  locale: CardTargetLocale,
): Promise<Map<number, { name: string | null; flavor_text: string | null }>> {
  const out = new Map<number, { name: string | null; flavor_text: string | null }>();
  if (cards.length === 0) return out;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing on server");
  }

  const prompt = buildPrompt(cards, locale);
  const maxRetries = 3;
  let lastErr = "unknown error";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          // 8000 : marge confortable pour 20 cartes name+flavor dans toute langue.
          max_tokens: 8000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();

      if (response.status === 529 || data.error?.type === "overloaded_error") {
        lastErr = `overloaded (${response.status})`;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!response.ok) {
        throw new Error(data.error?.message || `Anthropic ${response.status}`);
      }

      const text =
        data.content?.find((b: { type: string; text?: string }) => b.type === "text")
          ?.text || "";
      const rows = parseTsv(text);
      if (rows.length === 0) throw new Error("aucune ligne TSV parsée");
      for (const row of rows) {
        if (typeof row.id !== "number") continue;
        out.set(row.id, {
          name: row.name?.trim() ? row.name : null,
          flavor_text: row.flavor_text?.trim() ? row.flavor_text : null,
        });
      }
      return out;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw new Error(`translateCardBatch failed after ${maxRetries} attempts: ${lastErr}`);
}
