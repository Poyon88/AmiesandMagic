import type { SpellKeywordId, SpellTargetType } from "./types";

export interface SpellKeywordDef {
  label: string;
  symbol: string;
  desc: string;
  params: ("amount" | "attack" | "health")[];
  needsTarget: boolean;
  targetType?: SpellTargetType;
}

export const SPELL_KEYWORDS: Record<SpellKeywordId, SpellKeywordDef> = {
  impact: {
    label: "Impact X",
    symbol: "💥",
    desc: "Inflige X dégâts à une cible",
    params: ["amount"],
    needsTarget: true,
    targetType: "any",
  },
  deferlement: {
    label: "Déferlement X",
    symbol: "🌊",
    desc: "Inflige X dégâts à tous les ennemis",
    params: ["amount"],
    needsTarget: false,
  },
  siphon: {
    label: "Siphon X",
    symbol: "🩸",
    desc: "Inflige X dégâts à une cible et soigne votre héros du même montant",
    params: ["amount"],
    needsTarget: true,
    targetType: "enemy_creature",
  },
  entrave: {
    label: "Entrave",
    symbol: "⛓️",
    desc: "Paralyse une créature ennemie ciblée",
    params: [],
    needsTarget: true,
    targetType: "enemy_creature",
  },
  execution: {
    label: "Exécution",
    symbol: "☠️",
    desc: "Détruit une créature ciblée",
    params: [],
    needsTarget: true,
    targetType: "any_creature",
  },
  silence: {
    label: "Silence",
    symbol: "🤫",
    desc: "Retire tous les mots-clés d'une créature ciblée",
    params: [],
    needsTarget: true,
    targetType: "any_creature",
  },
  renforcement: {
    label: "Renforcement +X/+Y",
    symbol: "⬆️",
    desc: "Donne +X ATK et +Y PV à une créature alliée",
    params: ["attack", "health"],
    needsTarget: true,
    targetType: "friendly_creature",
  },
  guerison: {
    label: "Guérison X",
    symbol: "💚",
    desc: "Restaure X PV à une cible",
    params: ["amount"],
    needsTarget: true,
    targetType: "any",
  },
  invocation: {
    label: "Invocation X/X",
    symbol: "📣",
    desc: "Invoque un token X/X",
    params: ["attack", "health"],
    needsTarget: false,
  },
  inspiration: {
    label: "Inspiration X",
    symbol: "📖",
    desc: "Piochez X cartes",
    params: ["amount"],
    needsTarget: false,
  },
  invocation_multiple: {
    label: "Invocation multiple",
    symbol: "📣📣",
    desc: "Crée plusieurs tokens selon la configuration de la carte",
    params: [],
    needsTarget: false,
  },
  afflux: {
    label: "Afflux X",
    symbol: "💎",
    desc: "Gagnez X mana ce tour",
    params: ["amount"],
    needsTarget: false,
  },
  rappel: {
    label: "Rappel",
    symbol: "🪦",
    desc: "Renvoie une créature de votre cimetière dans votre main",
    params: [],
    needsTarget: true,
    targetType: "friendly_graveyard",
  },
  exhumation: {
    label: "Exhumation X",
    symbol: "⚰️",
    desc: "Ressuscite une créature (coût ≤ X) de votre cimetière sur le terrain",
    params: ["amount"],
    needsTarget: true,
    targetType: "friendly_graveyard_to_board",
  },
  selection: {
    label: "Sélection X",
    symbol: "🎴",
    desc: "Choisissez une carte parmi X aléatoires de votre collection à ajouter en main",
    params: ["amount"],
    needsTarget: false,
  },
};

export const ALL_SPELL_KEYWORDS: SpellKeywordId[] = Object.keys(SPELL_KEYWORDS) as SpellKeywordId[];

export const SPELL_KEYWORD_LABELS: Record<SpellKeywordId, string> = Object.fromEntries(
  Object.entries(SPELL_KEYWORDS).map(([id, def]) => [id, def.label])
) as Record<SpellKeywordId, string>;

export const SPELL_KEYWORD_SYMBOLS: Record<SpellKeywordId, string> = Object.fromEntries(
  Object.entries(SPELL_KEYWORDS).map(([id, def]) => [id, def.symbol])
) as Record<SpellKeywordId, string>;

export function spellKeywordNeedsTarget(id: SpellKeywordId): boolean {
  return SPELL_KEYWORDS[id].needsTarget;
}

export function getSpellKeywordTargetType(id: SpellKeywordId): SpellTargetType | undefined {
  return SPELL_KEYWORDS[id].targetType;
}
