import type { SpellKeywordId, SpellKeywordInstance, SpellTargetType, Card, ConvocationTokenDef, TokenTemplate } from "./types";
import { SPELL_KEYWORDS as ABILITIES_SPELL_KEYWORDS, ABILITIES, type DerivedSpellKeywordDef } from "./abilities";
import type { SafeT } from "@/i18n/config";
import { resolveMarkers } from "./desc-markers";

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

// Gabarit localisé (clé messages) avec repli FR + substitution manuelle des
// {marqueurs} (SafeT renvoie la chaîne brute, cf. useVocab). Sans traducteur
// (moteur / forge / admin) → repli FR : le comportement historique est conservé.
function cfrag(t: SafeT | undefined, key: string, fallback: string, params?: Record<string, string | number>): string {
  let s = t?.(key) ?? fallback;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

// Nom localisé d'un token (vocab.tokens.{id}), repli sur le nom FR du template.
function tokenName(tmpl: TokenTemplate | null | undefined, t?: SafeT): string {
  if (!tmpl) return "Token";
  return (tmpl.id != null ? t?.(`vocab.tokens.${tmpl.id}`) : undefined) ?? tmpl.name;
}

// Resolves a creature keyword id (e.g. "raid") to its display label
// (e.g. "Raid" / "Raid" / …). Drops the trailing " X" that scalable keywords
// carry in their label — token keywords are stored without a value, so the bare
// name reads best in the convocation blurb. Localised via vocab.keywords.{id};
// falls back to the FR label then the raw id.
function tokenKeywordLabel(id: string, t?: SafeT): string {
  const a = ABILITIES[id];
  const fallback = (a?.creature?.label ?? a?.label ?? id).replace(/ X$/, "");
  const localized = t?.(`vocab.keywords.${id}.label`);
  return (localized ?? fallback).replace(/ X$/, "");
}

// Parenthesised keyword blurb for a single resolved token template, e.g.
// " (Raid, Poison)". Empty string when the token has no keywords.
function tokenKeywordSuffix(tmpl?: TokenTemplate | null, t?: SafeT): string {
  const kws = (tmpl?.keywords ?? []).map((k) => tokenKeywordLabel(k, t));
  return kws.length ? cfrag(t, "game.convocation_keywords", ` (${kws.join(", ")})`, { keywords: kws.join(", ") }) : "";
}

// Renders the convocation_tokens array as a human-readable string. Groups
// identical entries (same token + same effective stats + same keywords) so the
// reader sees "2 tokens Goblins des Marais 1/1 et un token Orc 2/2" rather than
// the raw list, and surfaces each token's keywords in parentheses. Localised
// via a SafeT (repli FR sans traducteur — préserve la forge/admin en FR).
export function formatConvocationTokens(
  tokens: ConvocationTokenDef[],
  registry?: TokenTemplate[],
  t?: SafeT,
): string {
  if (!tokens.length) return cfrag(t, "game.convocation_none", "aucun token");

  const groups = new Map<
    string,
    { count: number; name: string; atk: number; hp: number; keywords: string }
  >();

  for (const tk of tokens) {
    const tmpl = registry?.find((r) => r.id === tk.token_id) ?? null;
    const atk = tk.attack ?? tmpl?.attack ?? 1;
    const hp = tk.health ?? tmpl?.health ?? 1;
    const name = tokenName(tmpl, t);
    const keywords = (tmpl?.keywords ?? []).map((k) => tokenKeywordLabel(k, t)).join(", ");
    const key = `${tmpl?.id ?? "x"}|${atk}|${hp}|${name}|${keywords}`;
    const existing = groups.get(key);
    if (existing) existing.count++;
    else groups.set(key, { count: 1, name, atk, hp, keywords });
  }

  const parts = Array.from(groups.values()).map((g) => {
    const kwSuffix = g.keywords ? cfrag(t, "game.convocation_keywords", ` (${g.keywords})`, { keywords: g.keywords }) : "";
    const base = g.count > 1
      ? cfrag(t, "game.convocation_token_many", `${g.count} tokens ${g.name} ${g.atk}/${g.hp}`, { count: g.count, token: g.name, atk: g.atk, hp: g.hp })
      : cfrag(t, "game.convocation_token_one", `un token ${g.name} ${g.atk}/${g.hp}`, { token: g.name, atk: g.atk, hp: g.hp });
    return base + kwSuffix;
  });

  if (parts.length === 1) return parts[0];
  // "a et b" / "a, b et c" — le dernier segment est joint par « et » localisé.
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).join(", ");
  return cfrag(t, "game.convocation_and", `${head} et ${last}`, { a: head, b: last });
}

// Human-readable blurb for a SINGLE convocation token (creature keywords
// "convocation" / "convocation_simple", configured via `card.convocation_token_id`).
// `statOverride` carries the scalable X value (Convocation X creates an X/X) —
// when > 0 it overrides the template stats, otherwise the template defaults are
// used. Returns null when the token can't be resolved. Localised via SafeT.
export function formatConvocationToken(
  tokenId: number | null | undefined,
  registry?: TokenTemplate[],
  statOverride?: number | null,
  t?: SafeT,
): string | null {
  const tmpl = tokenId != null ? registry?.find((r) => r.id === tokenId) ?? null : null;
  if (!tmpl) return null;
  const atk = statOverride != null && statOverride > 0 ? statOverride : tmpl.attack;
  const hp = statOverride != null && statOverride > 0 ? statOverride : tmpl.health;
  const name = tokenName(tmpl, t);
  return cfrag(t, "game.convocation_token_one", `un token ${name} ${atk}/${hp}`, { token: name, atk, hp }) + tokenKeywordSuffix(tmpl, t);
}

// Phrase de convocation (« Crée un token X 1/1 »). Helper PUR — vit ici et non
// dans useVocab pour que keyword-display.ts n'ait pas de dépendance React.
// `useVocab.convocationPrefix` n'en est plus qu'un habillage.
export function convocationPrefix(content: string, t?: SafeT): string {
  return cfrag(t, "game.convocation_prefix", `Crée ${content}`, { content });
}

/** Get the display description for a spell keyword, with token details for invocation_multiple */
export function getSpellKeywordDesc(
  kw: SpellKeywordInstance,
  card?: Card | null,
  tokens?: TokenTemplate[],
  t?: SafeT,
): string {
  const def = SPELL_KEYWORDS[kw.id];
  // Defensive: a stale spell_keyword.id (admin renamed/removed an ability
  // without migrating cards) would crash here on `def.desc`. Fall back to
  // the raw id so the UI still renders.
  if (!def) return String(kw.id);
  // Gabarit localisé (vocab.spell_keywords.{id}.desc) ; repli FR = def.desc.
  // La substitution X/Y/amount et les surcharges d'invocation restent en aval.
  let desc = t?.(`vocab.spell_keywords.${kw.id}.desc`) ?? def.desc;

  // Marqueurs nommés ({race}, {clan_de}, {alignment}…). Une capacité comme
  // Sélection ou Appel Suprême existe côté créature ET côté sort avec la même
  // description : sans ce passage, la version sort affichait « {alignment} »
  // brut au joueur.
  desc = resolveMarkers(desc, String(kw.id), {
    card,
    instance: { race: kw.race, clan: kw.clan },
  }, t);

  // Replace X/Y from params
  // Invocation : X = coût de la créature invoquée. Repli legacy sur `attack`
  // pour les sorts sauvés avant la refonte (ex-« Invocation X/Y » token) —
  // l'ancienne ATK est devenue le coût X.
  if (kw.id === "invocation") desc = desc.replace(/X/g, String(kw.amount ?? kw.attack ?? 1));
  else if (def.params.includes("attack")) desc = desc.replace(/X/g, String(kw.attack ?? 0));
  else if (def.params.includes("amount")) desc = desc.replace(/X/g, String(kw.amount ?? 1));
  if (def.params.includes("health")) desc = desc.replace(/Y/g, String(kw.health ?? 0));

  // Override for invocation_multiple with actual token details. With the
  // token registry passed in we resolve names + apply effective stats
  // (override or template defaults). Without it, we fall back to the
  // stats-only description.
  if (kw.id === "invocation_multiple" && card?.convocation_tokens?.length) {
    desc = cfrag(t, "game.convocation_create_list", `Crée ${formatConvocationTokens(card.convocation_tokens, tokens, t)}`, {
      content: formatConvocationTokens(card.convocation_tokens, tokens, t),
    });
  }

  // Override for convocation_simple : compose le nom du token et ses stats
  // par défaut depuis le registre. Sans registre/token configuré, garde la
  // description générique du registre.
  if (kw.id === "convocation_simple" && card?.convocation_token_id) {
    const tmpl = tokens?.find((tk) => tk.id === card.convocation_token_id);
    if (tmpl) {
      const name = tokenName(tmpl, t);
      desc = cfrag(t, "game.convocation_create_one", `Crée un ${name} ${tmpl.attack}/${tmpl.health}`, { token: name, atk: tmpl.attack, hp: tmpl.health }) + tokenKeywordSuffix(tmpl, t);
    }
  }

  return desc;
}

/** Get the display label for a spell keyword */
export function getSpellKeywordLabel(kw: SpellKeywordInstance, t?: SafeT): string {
  const def = SPELL_KEYWORDS[kw.id];
  if (!def) return String(kw.id);
  let label = t?.(`vocab.spell_keywords.${kw.id}.label`) ?? def.label;
  // Invocation : repli legacy sur `attack` (ex-« Invocation X/Y »), cf. desc.
  if (kw.id === "invocation") label = label.replace(/X/, String(kw.amount ?? kw.attack ?? 1));
  else if (def.params.includes("attack")) label = label.replace(/X/, String(kw.attack ?? 0));
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
