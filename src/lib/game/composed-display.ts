// Rendu des effets composés (modèle hybride) : icône réutilisée la plus proche
// de l'effet (teintée selon le déclencheur) + texte paramétrique. Partagé par
// tous les affichages de carte (forge, jeu, main, cimetière, mulligan, collection).
//
// Localisation : chaque fragment de phrase passe par `vocab.composed.*` (via un
// SafeT optionnel) avec repli FR intégré (COMPOSED_FR = source unique, aussi
// graine du générateur vocab). Sans traducteur (store, tests) → FR.

import { ABILITIES, creatureEngineId } from "./abilities";
import { toRoman, keywordModeColor, KEYWORD_LABELS } from "./keyword-labels";
import type { Capability, ComposedEffect, KeywordMode, TargetSpec, TokenTemplate } from "./types";
import type { SafeT } from "@/i18n/config";

// ─── fragments FR (source unique : repli runtime + graine vocab.composed) ────
export const COMPOSED_FR: Record<string, string> = {
  "trigger.on_play": "À l'entrée",
  "trigger.on_death": "À la mort",
  "trigger.on_return": "Au retour en main",
  "trigger.on_activation": "À l'activation",
  "trigger.on_attack": "À l'attaque",
  "trigger.on_end_of_turn": "À la fin du tour",

  "content.deal_damage_one": "inflige {x} dégât",
  "content.deal_damage_many": "inflige {x} dégâts",
  "content.heal": "soigne {x} PV",
  "content.buff": "octroie +{x}/+{y}",
  "content.debuff": "inflige -{x}/-{y}",
  "content.destroy": "détruit",
  "content.bounce": "renvoie en main",
  "content.paralyze": "paralyse",
  "content.grant_keyword": "confère {ability}",
  "content.ability_generic": "une capacité",
  "content.draw_cards_one": "piochez {x} carte",
  "content.draw_cards_many": "piochez {x} cartes",
  "content.discard_one": "l'adversaire défausse {x} carte",
  "content.discard_many": "l'adversaire défausse {x} cartes",
  "content.summon_one": "invoque un {token}",
  "content.summon_many": "invoque {x} {token}",
  "content.token_one": "token",
  "content.token_many": "tokens",
  "content.gain_mana": "gagnez {x} mana ce tour",
  "content.exhumation": "ressuscite {who} de votre cimetière (coût ≤ {x})",
  "content.exhum_one": "une créature",
  "content.exhum_all": "toutes les créatures",
  "content.exhum_upto": "jusqu'à {n} créatures",

  "target.self": "à elle-même",
  "target.hero_ally": "à votre héros",
  "target.hero_enemy": "au héros adverse",
  "target.both_all": "à toutes les unités et au héros {side}",
  "target.both_one": "à une cible (unité ou héros){side}",
  "target.both_side_ally": "alliés",
  "target.both_side_enemy": "ennemis",
  "target.count_all": "à toutes les unités",
  "target.count_one": "à une unité",
  "target.count_n": "à {n} unités",
  "target.side_ally_one": "alliée",
  "target.side_ally_many": "alliées",
  "target.side_enemy_one": "ennemie",
  "target.side_enemy_many": "ennemies",
  "target.loc_hand": "en main",
  "target.loc_deck": "du deck",
  "target.loc_graveyard": "du cimetière",
  "target.des_random": "au hasard",
  "target.des_automatic": "automatiquement",
  "target.des_choice": "au choix",

  "scatter.action_damage": "inflige",
  "scatter.action_heal": "rend",
  "scatter.unit_damage": "dégât",
  "scatter.unit_heal": "PV",
  "scatter.times": "{x} fois 1 {unit}, à chaque fois",
  "scatter.target_both": "à une cible {side} aléatoire (unité ou héros)",
  "scatter.target_unit": "à une unité {side} aléatoire",

  "choice.deal_damage": "choisissez une cible à blesser",
  "choice.heal": "choisissez une cible à soigner",
  "choice.buff": "choisissez une créature à renforcer",
  "choice.debuff": "choisissez une créature à affaiblir",
  "choice.destroy": "choisissez une créature à détruire",
  "choice.bounce": "choisissez une créature à renvoyer en main",
  "choice.paralyze": "choisissez une créature à paralyser",
  "choice.grant_keyword": "choisissez une créature à qui conférer la capacité",
  "choice.exhumation": "choisissez une créature à ressusciter",
  "choice.default": "choisissez une cible",
};

// Fragment localisé (vocab.composed.{key}) avec repli FR ; puis substitution
// manuelle des {jetons} (SafeT ne formate pas l'ICU, on reste sur du remplacement).
function frag(t: SafeT | undefined, key: string, params?: Record<string, string | number>): string {
  let s = t?.(`vocab.composed.${key}`) ?? COMPOSED_FR[key] ?? "";
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  return s;
}

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
 *  vers un id propre (ex. conferer) pour les nouveaux. */
export function composedIcon(cap: Capability): { symbol: string; keyword: string } {
  const eff = cap.composed;
  if (!eff) return { symbol: "✦", keyword: "" };
  switch (eff.content) {
    case "deal_damage": {
      const t = eff.target;
      if (t?.designation === "random" || t?.designation === "scatter") return { symbol: "🌩️", keyword: "spell_tempete" };
      // Toutes les unités des DEUX camps (Unité / Indifférent / Toutes) → Cataclysme.
      if (t && t.entity === "unit" && t.count === "all" && t.side === "any") return { symbol: "☄️", keyword: "cataclysme" };
      if (t && t.entity === "unit" && t.count === "all" && t.side === "enemy") return { symbol: "🌊", keyword: "spell_deferlement" };
      return { symbol: "💥", keyword: "spell_impact" }; // cible unique / héros / repli
    }
    case "heal": return { symbol: "💚", keyword: "spell_guerison" };
    case "buff": return { symbol: "⬆️", keyword: "spell_renforcement" };
    case "debuff": return { symbol: "🔻", keyword: "affaiblissement" };
    case "destroy": return { symbol: "☠️", keyword: "spell_execution" };
    case "bounce": return { symbol: "🔼", keyword: "spell_remontee" };
    case "paralyze": return { symbol: "⛓️", keyword: "spell_entrave" };
    case "grant_keyword": return { symbol: "✋", keyword: "conferer" };
    case "draw_cards": return { symbol: "📖", keyword: "spell_inspiration" };
    case "discard": return { symbol: "💰", keyword: "pillage" };
    case "summon_token": return { symbol: "📣", keyword: "spell_invocation" };
    case "gain_mana": return { symbol: "💎", keyword: "spell_afflux" };
    case "exhumation": return { symbol: "🪦", keyword: "exhumation" };
    default: return { symbol: "✦", keyword: "" };
  }
}

/** Nom du pouvoir dont l'icône est réutilisée pour cette capacité composée
 *  (ex. buff → « Renforcement », dégât de zone → « Cataclysme »). Dérivé de la
 *  MÊME source que l'icône (composedIcon().keyword) → le nom colle toujours à
 *  l'icône affichée. "" si aucun libellé résoluble (pas de préfixe affiché).
 *  Localisé : le préfixe `spell_` de la clé oriente vers vocab.spell_keywords,
 *  sinon vocab.keywords ; repli FR = label moteur. */
export function composedKeywordName(cap: Capability, t?: SafeT): string {
  const key = composedIcon(cap).keyword;
  if (!key) return "";
  const bareId = key.replace(/^spell_/, ""); // spell_renforcement → renforcement
  const loc = key.startsWith("spell_")
    ? (t?.(`vocab.spell_keywords.${bareId}.label`) ?? t?.(`vocab.keywords.${bareId}.label`))
    : (t?.(`vocab.keywords.${bareId}.label`) ?? t?.(`vocab.spell_keywords.${bareId}.label`));
  const label = loc ?? ABILITIES[bareId]?.label ?? KEYWORD_LABELS[bareId as keyof typeof KEYWORD_LABELS];
  if (!label) return "";
  return label.replace(/\s*[-+]?X.*$/, "").trim(); // "Renforcement +X/+Y" → "Renforcement"
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
    case "on_end_of_turn": return "end_of_turn";
    default: return undefined; // on_play / spell_resolution → blanc
  }
}

/** Couleur du marqueur ✦ d'un effet composé, selon le déclencheur (mort=rouge,
 *  tap=jaune, retour=bleu, attaque=violet…). BLANC par défaut (on_play / sort) :
 *  dans ce mode l'icône n'est pas teintée (elle reste blanche), le ✦ doit donc
 *  matcher — même règle que la teinte de l'icône (keywordModeColor null ⇒ blanc). */
export function composedMarkerColor(mode: KeywordMode | undefined): string {
  return keywordModeColor(mode) ?? "#ffffff";
}

function describeContent(eff: ComposedEffect, tokens: TokenTemplate[] | undefined, t?: SafeT): string {
  const x = eff.magnitude?.x ?? 0;
  const y = eff.magnitude?.y ?? 0;
  switch (eff.content) {
    case "deal_damage": return frag(t, x > 1 ? "content.deal_damage_many" : "content.deal_damage_one", { x });
    case "heal": return frag(t, "content.heal", { x });
    case "buff": return frag(t, "content.buff", { x, y });
    case "debuff": return frag(t, "content.debuff", { x, y });
    case "destroy": return frag(t, "content.destroy");
    case "bounce": return frag(t, "content.bounce");
    case "paralyze": return frag(t, "content.paralyze");
    case "grant_keyword": {
      const id = eff.grantAbilityId;
      const a = id ? (ABILITIES[id] ?? Object.values(ABILITIES).find((d) => creatureEngineId(d) === id)) : undefined;
      // Nom de capacité localisé quand disponible (vocab.keywords), sinon label moteur.
      const ability = (id ? t?.(`vocab.keywords.${id}.label`) : undefined)
        ?? a?.label ?? id ?? frag(t, "content.ability_generic");
      return frag(t, "content.grant_keyword", { ability });
    }
    case "draw_cards": return frag(t, x > 1 ? "content.draw_cards_many" : "content.draw_cards_one", { x });
    case "discard": return frag(t, x > 1 ? "content.discard_many" : "content.discard_one", { x });
    case "summon_token": {
      // Resolve the token template (when available) so the description names the
      // token and shows its stats — e.g. "invoque 2 Token Hommes-Loups (2/2)".
      // Falls back to the generic "token(s)" wording if no template is passed.
      const tok = eff.tokenId != null ? tokens?.find((tk) => tk.id === eff.tokenId) : undefined;
      const label = tok ? `${tok.name} (${tok.attack}/${tok.health})` : frag(t, x > 1 ? "content.token_many" : "content.token_one");
      return frag(t, x > 1 ? "content.summon_many" : "content.summon_one", { x, token: label });
    }
    case "gain_mana": return frag(t, "content.gain_mana", { x });
    case "exhumation": {
      const n = eff.target?.count;
      const who = typeof n === "number" && n > 1 ? frag(t, "content.exhum_upto", { n })
        : n === "all" ? frag(t, "content.exhum_all")
        : frag(t, "content.exhum_one");
      return frag(t, "content.exhumation", { who, x });
    }
    default: return String(eff.content);
  }
}

// Adjectif de camp accordé en genre/nombre (alliée/alliées/ennemie/ennemies).
function sideAdj(t: SafeT | undefined, side: string | undefined, many: boolean): string {
  if (side === "ally") return frag(t, many ? "target.side_ally_many" : "target.side_ally_one");
  if (side === "enemy") return frag(t, many ? "target.side_enemy_many" : "target.side_enemy_one");
  return "";
}

function describeTarget(t: TargetSpec | undefined, tr?: SafeT): string {
  if (!t) return "";
  if (t.entity === "self") return frag(tr, "target.self");
  if (t.entity === "hero") return t.side === "ally" ? frag(tr, "target.hero_ally") : frag(tr, "target.hero_enemy");
  if (t.entity === "both") {
    const sideTxt = t.side === "ally" ? frag(tr, "target.both_side_ally") : t.side === "enemy" ? frag(tr, "target.both_side_enemy") : "";
    return t.count === "all"
      ? frag(tr, "target.both_all", { side: sideTxt }).replace(/\s+$/, "")
      : frag(tr, "target.both_one", { side: sideTxt ? ` ${sideTxt}` : "" });
  }
  const many = t.count === "all" || (typeof t.count === "number" && t.count > 1);
  const count = t.count === "all" ? frag(tr, "target.count_all") : t.count === 1 ? frag(tr, "target.count_one") : frag(tr, "target.count_n", { n: t.count });
  const sideTxt = sideAdj(tr, t.side, many);
  const memb = t.membership;
  const mtxt = memb ? [...(memb.race ?? []), ...(memb.clan ?? []), ...(memb.faction ?? [])].join("/") : "";
  const locTxt = t.location === "hand" ? frag(tr, "target.loc_hand") : t.location === "deck" ? frag(tr, "target.loc_deck") : t.location === "graveyard" ? frag(tr, "target.loc_graveyard") : "";
  const desTxt = t.designation === "random" ? frag(tr, "target.des_random")
    : t.designation === "automatic" ? (t.count !== "all" ? frag(tr, "target.des_automatic") : "")
    : (t.count !== "all" ? frag(tr, "target.des_choice") : "");
  return [count, sideTxt, mtxt && `(${mtxt})`, locTxt, desTxt].filter(Boolean).join(" ");
}

/** Répartition point par point (designation "scatter") : décrit les X points
 *  distribués un à un, chacun sur une cible aléatoire du pool. Renvoie null si
 *  l'effet n'est pas un scatter de dégâts/soin. Ex. « inflige 2 fois 1 dégât,
 *  à chaque fois à une cible ennemie aléatoire (unité ou héros) ». */
function describeScatter(eff: ComposedEffect, t?: SafeT): string | null {
  const tg = eff.target;
  if (!tg || tg.designation !== "scatter") return null;
  if (eff.content !== "deal_damage" && eff.content !== "heal") return null;
  const x = eff.magnitude?.x ?? 0;
  const action = eff.content === "deal_damage" ? frag(t, "scatter.action_damage") : frag(t, "scatter.action_heal");
  const unit = eff.content === "deal_damage" ? frag(t, "scatter.unit_damage") : frag(t, "scatter.unit_heal");
  const side = sideAdj(t, tg.side, false);
  const memb = tg.membership;
  const mtxt = memb ? [...(memb.race ?? []), ...(memb.clan ?? []), ...(memb.faction ?? [])].join("/") : "";
  const targetTxt = tg.entity === "both"
    ? frag(t, "scatter.target_both", { side })
    : frag(t, "scatter.target_unit", { side });
  return [`${action} ${frag(t, "scatter.times", { x, unit })}`, targetTxt, mtxt && `(${mtxt})`].filter(Boolean).join(" ");
}

/** Phrase décrivant un effet composé (générateur paramétrique). Passer `tokens`
 *  (templates) pour nommer/chiffrer les tokens d'un effet summon_token, et `t`
 *  (SafeT) pour la localisation (repli FR sinon). */
export function describeComposedCap(cap: Capability, tokens?: TokenTemplate[], t?: SafeT): string {
  const eff = cap.composed;
  if (!eff) return "";
  const prefix = cap.trigger ? frag(t, `trigger.${cap.trigger}`) : "";
  // Exhumation : la phrase de contenu décrit déjà le nombre + la zone (cimetière)
  // → on n'y accole pas le descripteur de cible générique (qui dirait « à N unités
  // alliées du cimetière au choix », redondant).
  const skipTarget = eff.content === "exhumation";
  const body = describeScatter(eff, t)
    ?? [describeContent(eff, tokens, t), skipTarget ? "" : describeTarget(eff.target, t)].filter(Boolean).join(" ");
  const sentence = prefix ? `${prefix} : ${body}` : body;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

/** Capacités composées portées par une carte (pour les renderers). */
export function composedCapsOf(capabilities: Capability[] | null | undefined): Capability[] {
  return (capabilities ?? []).filter((c) => !!c.composed);
}

/** Libellé du sélecteur de cible d'un effet composé « au choix » (ex. le
 *  déclencheur interactif de fin de tour). Décrit l'ACTION à réaliser sur la
 *  cible à désigner — auparavant l'overlay affichait un texte de Remontée figé
 *  quel que soit l'effet réel (bug : un buff de fin de tour proposait « une
 *  créature à remonter en main »). Préfixé de l'icône de l'effet. */
export function composedChoicePrompt(cap: Capability, t?: SafeT): string {
  const eff = cap.composed;
  if (!eff) return `🎯 ${frag(t, "choice.default")}`;
  const ic = composedIcon(cap).symbol;
  const icon = ic.startsWith("/") || ic.startsWith("http") ? "🎯" : ic;
  const key = ["deal_damage", "heal", "buff", "debuff", "destroy", "bounce", "paralyze", "grant_keyword", "exhumation"].includes(eff.content)
    ? `choice.${eff.content}`
    : "choice.default";
  const body = frag(t, key);
  return `${icon} ${body.charAt(0).toUpperCase() + body.slice(1)}`;
}
