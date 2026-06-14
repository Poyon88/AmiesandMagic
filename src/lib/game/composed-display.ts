// Rendu des effets composés (modèle hybride) : icône réutilisée la plus proche
// de l'effet (teintée selon le déclencheur) + texte FR paramétrique. Partagé par
// tous les affichages de carte (forge, jeu, main, cimetière, mulligan, collection).

import { ABILITIES, creatureEngineId } from "./abilities";
import { toRoman } from "./keyword-labels";
import type { Capability, ComposedEffect, KeywordMode, TargetSpec, TokenTemplate } from "./types";

/** Valeur affichée à côté de l'icône composée (comme « II » pour Impact 2) :
 *  X/Y pour buff/debuff, chiffre romain de X sinon. null si pas de valeur. */
export function composedValueText(cap: Capability): string | null {
  const m = cap.composed?.magnitude;
  if (!m) return null;
  if (cap.composed!.content === "buff" || cap.composed!.content === "debuff") {
    return (m.x != null || m.y != null) ? `${m.x ?? 0}/${m.y ?? 0}` : null;
  }
  return (m.x != null && m.x > 0) ? toRoman(m.x) : null;
}

/** Icône (emoji de repli) + clé d'icône (pour une éventuelle icône uploadée).
 *  La clé pointe vers un keyword existant quand l'effet en réutilise l'icône, ou
 *  vers un id propre (damnation / conferer) pour les nouveaux. */
export function composedIcon(cap: Capability): { symbol: string; keyword: string } {
  const eff = cap.composed;
  if (!eff) return { symbol: "✦", keyword: "" };
  switch (eff.content) {
    case "deal_damage": {
      const t = eff.target;
      if (t?.designation === "random") return { symbol: "🌩️", keyword: "spell_tempete" };
      if (t && t.entity === "unit" && t.count === "all" && t.side === "enemy") return { symbol: "🌊", keyword: "spell_deferlement" };
      return { symbol: "💥", keyword: "spell_impact" }; // cible unique / héros / repli
    }
    case "heal": return { symbol: "💚", keyword: "spell_guerison" };
    case "buff": return { symbol: "⬆️", keyword: "spell_renforcement" };
    case "debuff": return { symbol: "🩸", keyword: "damnation" };
    case "destroy": return { symbol: "☠️", keyword: "spell_execution" };
    case "bounce": return { symbol: "🔼", keyword: "spell_remontee" };
    case "paralyze": return { symbol: "⛓️", keyword: "spell_entrave" };
    case "grant_keyword": return { symbol: "✋", keyword: "conferer" };
    case "draw_cards": return { symbol: "📖", keyword: "spell_inspiration" };
    case "discard": return { symbol: "💰", keyword: "pillage" };
    case "summon_token": return { symbol: "📣", keyword: "spell_invocation" };
    case "gain_mana": return { symbol: "💎", keyword: "spell_afflux" };
    default: return { symbol: "✦", keyword: "" };
  }
}

/** Mode (au sens couleur d'icône) déduit du déclencheur de la capacité :
 *  entrée/résolution → blanc (undefined), mort → rouge, retour → bleu,
 *  activation → jaune. Réutilise keywordModeColor/keywordModeFilter. */
export function composedTriggerMode(cap: Capability): KeywordMode | undefined {
  switch (cap.trigger) {
    case "on_death": return "death";
    case "on_return": return "return";
    case "on_activation": return "tap";
    case "on_attack": return "attack";
    default: return undefined; // on_play / spell_resolution → blanc
  }
}

const TRIGGER_PREFIX: Record<string, string> = {
  on_play: "À l'entrée",
  on_death: "À la mort",
  on_return: "Au retour en main",
  on_activation: "À l'activation",
  on_attack: "À l'attaque",
};

function plural(n: number, sing: string, plur = sing + "s"): string {
  return n > 1 ? plur : sing;
}

function describeContent(eff: ComposedEffect, tokens?: TokenTemplate[]): string {
  const x = eff.magnitude?.x ?? 0;
  const y = eff.magnitude?.y ?? 0;
  switch (eff.content) {
    case "deal_damage": return `inflige ${x} ${plural(x, "dégât")}`;
    case "heal": return `soigne ${x} PV`;
    case "buff": return `octroie +${x}/+${y}`;
    case "debuff": return `inflige -${x}/-${y}`;
    case "destroy": return "détruit";
    case "bounce": return "renvoie en main";
    case "paralyze": return "paralyse";
    case "grant_keyword": {
      const id = eff.grantAbilityId;
      const a = id ? (ABILITIES[id] ?? Object.values(ABILITIES).find((d) => creatureEngineId(d) === id)) : undefined;
      return `confère ${a?.label ?? id ?? "une capacité"}`;
    }
    case "draw_cards": return `piochez ${x} ${plural(x, "carte")}`;
    case "discard": return `l'adversaire défausse ${x} ${plural(x, "carte")}`;
    case "summon_token": {
      // Resolve the token template (when available) so the description names the
      // token and shows its stats — e.g. "invoque 2 Token Hommes-Loups (2/2)".
      // Falls back to the generic "token(s)" wording if no template is passed.
      const tok = eff.tokenId != null ? tokens?.find((t) => t.id === eff.tokenId) : undefined;
      const label = tok ? `${tok.name} (${tok.attack}/${tok.health})` : (x > 1 ? "tokens" : "token");
      return x > 1 ? `invoque ${x} ${label}` : `invoque un ${label}`;
    }
    case "gain_mana": return `gagnez ${x} mana ce tour`;
    default: return String(eff.content);
  }
}

function describeTarget(t: TargetSpec | undefined): string {
  if (!t) return "";
  if (t.entity === "self") return "à elle-même";
  if (t.entity === "hero") return t.side === "ally" ? "à votre héros" : "au héros adverse";
  if (t.entity === "both") {
    const sideTxt = t.side === "ally" ? "alliés" : t.side === "enemy" ? "ennemis" : "";
    return t.count === "all"
      ? `à toutes les unités et au héros ${sideTxt}`.trim()
      : `à une cible (unité ou héros)${sideTxt ? ` ${sideTxt}` : ""}`;
  }
  const count = t.count === "all" ? "toutes les unités" : t.count === 1 ? "une unité" : `${t.count} unités`;
  const sideTxt = t.side === "ally" ? (t.count === "all" || (typeof t.count === "number" && t.count > 1) ? "alliées" : "alliée")
    : t.side === "enemy" ? (t.count === "all" || (typeof t.count === "number" && t.count > 1) ? "ennemies" : "ennemie") : "";
  const memb = t.membership;
  const mtxt = memb ? [...(memb.race ?? []), ...(memb.clan ?? []), ...(memb.faction ?? [])].join("/") : "";
  const locTxt = t.location === "hand" ? "en main" : t.location === "deck" ? "du deck" : t.location === "graveyard" ? "du cimetière" : "";
  const desTxt = t.designation === "random" ? "au hasard"
    : t.designation === "automatic" ? (t.count !== "all" ? "automatiquement" : "")
    : (t.count !== "all" ? "au choix" : "");
  return ["à", count, sideTxt, mtxt && `(${mtxt})`, locTxt, desTxt].filter(Boolean).join(" ");
}

/** Phrase FR décrivant un effet composé (générateur paramétrique). Passer
 *  `tokens` (templates) pour nommer/chiffrer les tokens d'un effet summon_token. */
export function describeComposedCap(cap: Capability, tokens?: TokenTemplate[]): string {
  const eff = cap.composed;
  if (!eff) return "";
  const prefix = TRIGGER_PREFIX[cap.trigger];
  const body = [describeContent(eff, tokens), describeTarget(eff.target)].filter(Boolean).join(" ");
  const sentence = prefix ? `${prefix} : ${body}` : body;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

/** Capacités composées portées par une carte (pour les renderers). */
export function composedCapsOf(capabilities: Capability[] | null | undefined): Capability[] {
  return (capabilities ?? []).filter((c) => !!c.composed);
}
