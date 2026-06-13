import type { SpellKeywordId, SpellKeywordInstance, SpellTargetType, Card, ConvocationTokenDef, TokenTemplate } from "./types";
import { SPELL_KEYWORDS as ABILITIES_SPELL_KEYWORDS, ABILITIES, type DerivedSpellKeywordDef } from "./abilities";

// Single source of truth lives in `src/lib/game/abilities.ts` (unified
// registry shared with creature keywords). The map below is re-exported
// under the legacy SPELL_KEYWORDS name so the engine
// (`resolveSpellKeywords`), the forge UI, and downstream tooling keep
// working unchanged.

export type SpellKeywordDef = DerivedSpellKeywordDef;
export const SPELL_KEYWORDS: Record<SpellKeywordId, SpellKeywordDef> = ABILITIES_SPELL_KEYWORDS;
export type { SpellTargetType };

export const ALL_SPELL_KEYWORDS: SpellKeywordId[] = Object.keys(SPELL_KEYWORDS) as SpellKeywordId[];

export const SPELL_KEYWORD_LABELS: Record<SpellKeywordId, string> = Object.fromEntries(
  Object.entries(SPELL_KEYWORDS).map(([id, def]) => [id, def.label])
) as Record<SpellKeywordId, string>;

export const SPELL_KEYWORD_SYMBOLS: Record<SpellKeywordId, string> = Object.fromEntries(
  Object.entries(SPELL_KEYWORDS).map(([id, def]) => [id, def.symbol])
) as Record<SpellKeywordId, string>;

// Resolves a creature keyword id (e.g. "raid") to its French display label
// (e.g. "Raid"). Drops the trailing " X" that scalable keywords carry in
// their label — token keywords are stored without a value, so the bare
// name reads best in the convocation blurb. Falls back to the raw id.
function tokenKeywordLabel(id: string): string {
  const a = ABILITIES[id];
  const label = a?.creature?.label ?? a?.label ?? id;
  return label.replace(/ X$/, "");
}

// Parenthesised keyword blurb for a single resolved token template, e.g.
// " (Raid, Poison)". Empty string when the token has no keywords.
function tokenKeywordSuffix(tmpl?: TokenTemplate | null): string {
  const kws = (tmpl?.keywords ?? []).map(tokenKeywordLabel);
  return kws.length ? ` (${kws.join(", ")})` : "";
}

// Renders the convocation_tokens array as a human-readable French string.
// Groups identical entries (same token + same effective stats + same
// keywords) so the admin sees "2 tokens Goblins des Marais 1/1 et un token
// Orc 2/2" rather than the raw list, and surfaces each token's keywords in
// parentheses (e.g. "un token Tigre 3/3 (Raid)"). Falls back to stats-only
// when the token registry is not available at the call site.
export function formatConvocationTokens(
  tokens: ConvocationTokenDef[],
  registry?: TokenTemplate[],
): string {
  if (!tokens.length) return "aucun token";

  const groups = new Map<
    string,
    { count: number; name: string; atk: number; hp: number; keywords: string }
  >();

  for (const t of tokens) {
    const tmpl = registry?.find((r) => r.id === t.token_id) ?? null;
    const atk = t.attack ?? tmpl?.attack ?? 1;
    const hp = t.health ?? tmpl?.health ?? 1;
    const name = tmpl?.name ?? "Token";
    const keywords = (tmpl?.keywords ?? []).map(tokenKeywordLabel).join(", ");
    const key = `${tmpl?.id ?? "x"}|${atk}|${hp}|${name}|${keywords}`;
    const existing = groups.get(key);
    if (existing) existing.count++;
    else groups.set(key, { count: 1, name, atk, hp, keywords });
  }

  const parts = Array.from(groups.values()).map((g) => {
    const noun = g.count > 1 ? "tokens" : "token";
    const countStr = g.count === 1 ? "un" : String(g.count);
    const kwSuffix = g.keywords ? ` (${g.keywords})` : "";
    return `${countStr} ${noun} ${g.name} ${g.atk}/${g.hp}${kwSuffix}`;
  });

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} et ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/** Get the display description for a spell keyword, with token details for invocation_multiple */
export function getSpellKeywordDesc(
  kw: SpellKeywordInstance,
  card?: Card | null,
  tokens?: TokenTemplate[],
): string {
  const def = SPELL_KEYWORDS[kw.id];
  // Defensive: a stale spell_keyword.id (admin renamed/removed an ability
  // without migrating cards) would crash here on `def.desc`. Fall back to
  // the raw id so the UI still renders.
  if (!def) return String(kw.id);
  let desc = def.desc;

  // Replace X/Y from params
  if (def.params.includes("attack")) desc = desc.replace(/X/g, String(kw.attack ?? 0));
  else if (def.params.includes("amount")) desc = desc.replace(/X/g, String(kw.amount ?? 1));
  if (def.params.includes("health")) desc = desc.replace(/Y/g, String(kw.health ?? 0));

  // Override for invocation_multiple with actual token details. With the
  // token registry passed in we resolve names + apply effective stats
  // (override or template defaults). Without it, we fall back to the
  // stats-only description.
  if (kw.id === "invocation_multiple" && card?.convocation_tokens?.length) {
    desc = `Crée ${formatConvocationTokens(card.convocation_tokens, tokens)}`;
  }

  // Override for invocation — prefer the resolved token template name
  // (multi-token-per-race safe); fall back to the raw race for legacy
  // entries that only stored kw.race.
  if (kw.id === "invocation") {
    const tmpl = kw.token_id ? tokens?.find(t => t.id === kw.token_id) : null;
    if (tmpl) {
      desc = `Invoque un ${tmpl.name} ${kw.attack ?? tmpl.attack ?? 1}/${kw.health ?? tmpl.health ?? 1}${tokenKeywordSuffix(tmpl)}`;
    } else if (kw.race) {
      desc = `Invoque un ${kw.race} ${kw.attack ?? 1}/${kw.health ?? 1}`;
    }
  }

  // Override for convocation_simple : compose le nom du token et ses stats
  // par défaut depuis le registre. Sans registre/token configuré, garde la
  // description générique du registre.
  if (kw.id === "convocation_simple" && card?.convocation_token_id) {
    const tmpl = tokens?.find(t => t.id === card.convocation_token_id);
    if (tmpl) desc = `Crée un ${tmpl.name} ${tmpl.attack}/${tmpl.health}${tokenKeywordSuffix(tmpl)}`;
  }

  return desc;
}

/** Get the display label for a spell keyword */
export function getSpellKeywordLabel(kw: SpellKeywordInstance): string {
  const def = SPELL_KEYWORDS[kw.id];
  if (!def) return String(kw.id);
  let label = def.label;
  if (def.params.includes("attack")) label = label.replace(/X/, String(kw.attack ?? 0));
  else if (def.params.includes("amount")) label = label.replace(/X/, String(kw.amount ?? 1));
  if (def.params.includes("health")) label = label.replace(/Y/, String(kw.health ?? 0));
  return label;
}

export function spellKeywordNeedsTarget(id: SpellKeywordId): boolean {
  return SPELL_KEYWORDS[id]?.needsTarget ?? false;
}

export function getSpellKeywordTargetType(id: SpellKeywordId): SpellTargetType | undefined {
  return SPELL_KEYWORDS[id]?.targetType;
}
