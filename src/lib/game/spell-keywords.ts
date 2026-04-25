import type { SpellKeywordId, SpellKeywordInstance, SpellTargetType, Card, ConvocationTokenDef } from "./types";

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
    label: "Invocation X/Y",
    symbol: "📣",
    desc: "Invoque un token X/Y",
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
  relancer: {
    label: "Relancer X",
    symbol: "♻️",
    desc: "Rejoue les X derniers sorts lancés avec des cibles aléatoires",
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

/** Get the display description for a spell keyword, with token details for invocation_multiple */
export function getSpellKeywordDesc(kw: SpellKeywordInstance, card?: Card | null): string {
  const def = SPELL_KEYWORDS[kw.id];
  let desc = def.desc;

  // Replace X/Y from params
  if (def.params.includes("attack")) desc = desc.replace(/X/g, String(kw.attack ?? 0));
  else if (def.params.includes("amount")) desc = desc.replace(/X/g, String(kw.amount ?? 1));
  if (def.params.includes("health")) desc = desc.replace(/Y/g, String(kw.health ?? 0));

  // Override for invocation_multiple with actual token details. The
  // race / template name isn't available here without a registry lookup, so
  // we surface the (possibly overridden) stats only — the token visual is
  // shown when actually summoned in-game.
  if (kw.id === "invocation_multiple" && card?.convocation_tokens?.length) {
    const parts = card.convocation_tokens.map((t: ConvocationTokenDef) =>
      `Token ${t.attack ?? "?"}/${t.health ?? "?"}`
    );
    desc = `Crée ${parts.join(", ")}`;
  }

  // Override for invocation with race
  if (kw.id === "invocation" && kw.race) {
    desc = `Invoque un ${kw.race} ${kw.attack ?? 1}/${kw.health ?? 1}`;
  }

  return desc;
}

/** Get the display label for a spell keyword */
export function getSpellKeywordLabel(kw: SpellKeywordInstance): string {
  const def = SPELL_KEYWORDS[kw.id];
  let label = def.label;
  if (def.params.includes("attack")) label = label.replace(/X/, String(kw.attack ?? 0));
  else if (def.params.includes("amount")) label = label.replace(/X/, String(kw.amount ?? 1));
  if (def.params.includes("health")) label = label.replace(/Y/, String(kw.health ?? 0));
  return label;
}

export function spellKeywordNeedsTarget(id: SpellKeywordId): boolean {
  return SPELL_KEYWORDS[id].needsTarget;
}

export function getSpellKeywordTargetType(id: SpellKeywordId): SpellTargetType | undefined {
  return SPELL_KEYWORDS[id].targetType;
}
