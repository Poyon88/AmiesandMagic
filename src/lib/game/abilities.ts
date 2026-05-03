// Unified ability registry. Single source of truth for capabilities that can
// be carried by creatures, spells, or both. Two flat views — `KEYWORDS`
// (creature side, indexed by FR label) and `SPELL_KEYWORDS` (spell side,
// indexed by snake_case id) — are derived from this registry so the
// existing engine and UI imports keep working unchanged.
//
// Why a single registry: today a same concept (e.g. "Rappel", "Sélection X",
// "Exhumation X", "Relancer X", and the convocation/invocation pair) lived
// twice — once in `constants.ts:KEYWORDS` and once in
// `spell-keywords.ts:SPELL_KEYWORDS`. Diverging metadata, two icons, two
// descriptions to maintain. The registry below declares each concept once
// with explicit `applicable_to: ("creature" | "spell")[]`. The five
// duplicates collapse to a single entry that carries both substructures.
//
// Phase 1 scope: data layer + UI consolidation. Engine and DB schema are
// untouched — `card.keywords` still stores FR labels (TEXT[]) and
// `card.spell_keywords` still stores snake_case ids (JSONB).

import type { Card, CardInstance, SpellKeywordId, SpellTargetType } from "./types";

export type KeywordZone = "Terrain" | "Cimetière" | "Main" | "Mixte" | "Deck" | "Race" | "Clan";

export type AbilityHost = "creature" | "spell";

export interface AbilityCreatureMeta {
  /** Override of `AbilityDef.id` for the snake_case used inside
   *  `card.keywords[]` (and therefore the icon lookup key on the creature
   *  side). Needed for polymorphic concepts whose creature- and spell-side
   *  legacy ids differ — e.g. invocation/convocation,
   *  invocation_multiple/convocations_multiples. Defaults to AbilityDef.id. */
  id?: string;
  /** Override of `AbilityDef.label` for the creature side; defaults to it. */
  label?: string;
  /** Override of `AbilityDef.desc` for the creature side; defaults to it. */
  desc?: string;
  cost: number;
  costPerX: number;
  se: number;
  minTier: number;
  scalable: boolean;
  zone: KeywordZone;
}

export interface AbilitySpellMeta {
  /** Override of `AbilityDef.label` for the spell side; defaults to it. */
  label?: string;
  /** Override of `AbilityDef.desc` for the spell side; defaults to it. */
  desc?: string;
  params: ("amount" | "attack" | "health")[];
  needsTarget: boolean;
  targetType?: SpellTargetType;
}

export interface AbilityDef {
  /** snake_case stable identifier. */
  id: string;
  /** Default FR label. Per-host overrides allowed via creature.label / spell.label. */
  label: string;
  /** Default emoji or icon path. */
  symbol: string;
  /** Default FR description. Per-host overrides allowed via creature.desc / spell.desc. */
  desc: string;
  applicable_to: AbilityHost[];
  creature?: AbilityCreatureMeta;
  spell?: AbilitySpellMeta;
}

export const ABILITIES: Record<string, AbilityDef> = {
  // ─── Creature-only — Tier 0 ───────────────────────────────────────────────
  loyaute: {
    id: "loyaute", label: "Loyauté", symbol: "🤝",
    desc: "Invocation : +1 ATK et +1 PV pour chaque allié de même race en jeu.",
    applicable_to: ["creature"],
    creature: { cost: 2, costPerX: 0, se: 0.5, minTier: 0, scalable: false, zone: "Terrain" },
  },
  ancre: {
    id: "ancre", label: "Ancré", symbol: "⚓",
    desc: "Ne peut pas être déplacé ou exilé.",
    applicable_to: ["creature"],
    creature: { cost: 2, costPerX: 0, se: 0.5, minTier: 0, scalable: false, zone: "Terrain" },
  },
  resistance: {
    id: "resistance", label: "Résistance X", symbol: "🛡️",
    desc: "Réduit les dégâts reçus de X (minimum 1 dégât).",
    applicable_to: ["creature"],
    creature: { cost: 5, costPerX: 3, se: 1.0, minTier: 0, scalable: true, zone: "Terrain" },
  },
  taunt: {
    id: "taunt", label: "Provocation", symbol: "🎯",
    desc: "Les ennemis doivent attaquer cette unité en priorité.",
    applicable_to: ["creature"],
    creature: { cost: 5, costPerX: 0, se: 1.0, minTier: 0, scalable: false, zone: "Terrain" },
  },
  raid: {
    id: "raid", label: "Raid", symbol: "⚔️",
    desc: "Peut attaquer une créature ennemie dès son invocation (mais pas le héros).",
    applicable_to: ["creature"],
    creature: { cost: 3, costPerX: 0, se: 0.7, minTier: 0, scalable: false, zone: "Terrain" },
  },
  charge: {
    id: "charge", label: "Traque", symbol: "⚡",
    desc: "Peut attaquer dès son invocation.",
    applicable_to: ["creature"],
    creature: { cost: 5, costPerX: 0, se: 1.0, minTier: 0, scalable: false, zone: "Terrain" },
  },
  premiere_frappe: {
    id: "premiere_frappe", label: "Première Frappe", symbol: "🗡️",
    desc: "Lorsque cette unité attaque, inflige ses dégâts en premier ; l'unité adverse ne riposte que si elle survit.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 0, se: 1.5, minTier: 0, scalable: false, zone: "Terrain" },
  },
  berserk: {
    id: "berserk", label: "Berserk", symbol: "😤",
    desc: "Double son ATK si ses PV actuels sont inférieurs à sa valeur de PV originale (sur la carte).",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 0, scalable: false, zone: "Terrain" },
  },
  divine_shield: {
    id: "divine_shield", label: "Bouclier", symbol: "🔰",
    desc: "Absorbe une première attaque sans dégâts.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 0, se: 1.5, minTier: 0, scalable: false, zone: "Terrain" },
  },

  // ─── Creature-only — Tier 1 ───────────────────────────────────────────────
  vol: {
    id: "vol", label: "Vol", symbol: "🦅",
    desc: "Ignore les provocations adverses.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Terrain" },
  },
  precision: {
    id: "precision", label: "Précision", symbol: "🏹",
    desc: "Ignore la Résistance, l'Armure et le Bouclier.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Terrain" },
  },
  drain_de_vie: {
    id: "drain_de_vie", label: "Drain de vie", symbol: "🩸",
    desc: "Soigne votre héros des dégâts infligés.",
    applicable_to: ["creature"],
    creature: { cost: 9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain" },
  },
  esquive: {
    id: "esquive", label: "Esquive", symbol: "💨",
    desc: "Évite automatiquement la première attaque reçue chaque tour.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 1, scalable: false, zone: "Terrain" },
  },
  poison: {
    id: "poison", label: "Poison", symbol: "☠️",
    desc: "Les unités blessées perdent 1 PV par tour.",
    applicable_to: ["creature"],
    creature: { cost: 9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain" },
  },
  celerite: {
    id: "celerite", label: "Célérité", symbol: "💫",
    desc: "Peut attaquer deux fois par tour.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 1, scalable: false, zone: "Terrain" },
  },
  augure: {
    id: "augure", label: "Augure", symbol: "/icons/augure.png",
    desc: "Quand cette unité inflige des dégâts au héros adverse, vous piochez une carte.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Terrain" },
  },
  benediction: {
    id: "benediction", label: "Bénédiction", symbol: "✝️",
    desc: "Soigne complètement l'unité ciblée.",
    applicable_to: ["creature"],
    creature: { cost: 9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain" },
  },
  bravoure: {
    id: "bravoure", label: "Bravoure", symbol: "🦁",
    desc: "Double ses dégâts (arrondi au supérieur) contre les unités ayant une ATK supérieure à la sienne.",
    applicable_to: ["creature"],
    creature: { cost: 9, costPerX: 0, se: 2.0, minTier: 1, scalable: false, zone: "Terrain" },
  },
  pillage: {
    id: "pillage", label: "Pillage", symbol: "💰",
    desc: "Invocation : l'adversaire défausse une carte de son choix.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 1, scalable: false, zone: "Terrain" },
  },
  riposte: {
    id: "riposte", label: "Riposte X", symbol: "↩️",
    desc: "Quand cette unité subit des dégâts, inflige X dégâts à la source de l'attaque (unité ou héros).",
    applicable_to: ["creature"],
    creature: { cost: 5, costPerX: 4, se: 2.0, minTier: 1, scalable: true, zone: "Terrain" },
  },
  combustion: {
    id: "combustion", label: "Combustion", symbol: "🔥",
    desc: "Invocation : défaussez une carte de votre main, puis piochez deux cartes.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Main" },
  },

  // ─── Creature-only — Tier 2 ───────────────────────────────────────────────
  terreur: {
    id: "terreur", label: "Terreur", symbol: "👁️",
    desc: "Les unités adverses perdent 1 ATK en présence de cette carte.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  armure: {
    id: "armure", label: "Armure", symbol: "/icons/armure.png",
    desc: "Réduit de moitié les dégâts de combat reçus (arrondi au supérieur) ; les dégâts de sorts ne sont pas réduits.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  commandement: {
    id: "commandement", label: "Commandement", symbol: "👑",
    desc: "Les alliés de même faction gagnent +1/+1.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain" },
  },
  fureur: {
    id: "fureur", label: "Fureur", symbol: "💢",
    desc: "Après avoir subi des dégâts, attaque immédiatement une unité adverse au choix.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain" },
  },
  double_attaque: {
    id: "double_attaque", label: "Double Attaque", symbol: "⚔️",
    desc: "En phase offensive uniquement : inflige deux fois son ATK, dont la première fois en Première Frappe.",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  invisible: {
    id: "invisible", label: "Invisible", symbol: "👻",
    desc: "Ne peut pas être ciblé par des sorts ni par des capacités d'unités adverses.",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  canalisation: {
    id: "canalisation", label: "Canalisation", symbol: "🔮",
    desc: "Tant que cette unité est en jeu, vos sorts coûtent 1 mana de moins.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain" },
  },
  catalyse: {
    id: "catalyse", label: "Catalyse", symbol: "⚗️",
    desc: "Invocation : réduit de 1 le coût en mana de toutes les unités de même race dans votre main.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Main" },
  },
  entraide: {
    id: "entraide", label: "Entraide (Race)", symbol: "🤝",
    desc: "En main : coûte 1 mana de moins par allié de la race choisie présent en jeu (cumulable, plancher 0).",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Main" },
  },
  contresort: {
    id: "contresort", label: "Contresort", symbol: "🚫",
    desc: "Invocation : annule le prochain sort adverse.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain" },
  },
  convocation: {
    id: "convocation", label: "Convocation X", symbol: "📣",
    desc: "Invocation : crée un token X/X de la race indiquée.",
    applicable_to: ["creature"],
    creature: { cost: 8, costPerX: 5, se: 3.0, minTier: 2, scalable: true, zone: "Terrain" },
  },
  convocation_simple: {
    id: "convocation_simple", label: "Convocation", symbol: "📯",
    desc: "Crée le token configuré.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 8, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Terrain",
      desc: "Invocation : crée le token configuré.",
    },
    spell: { params: [], needsTarget: false },
  },
  lycanthropie: {
    id: "lycanthropie", label: "Lycanthropie X", symbol: "🐺",
    desc: "Début de tour : se transforme en un token X/X avec Traque.",
    applicable_to: ["creature"],
    creature: { cost: 12, costPerX: 5, se: 3.5, minTier: 2, scalable: true, zone: "Terrain" },
  },
  // NOTE: the creature-side "Convocations multiples" is now a polymorphic
  // entry (`invocation_multiple` below) — same effect as the spell version,
  // only the trigger differs (creature on_play vs spell cast). Keeping the
  // registry id `invocation_multiple` because it's the SpellKeywordId and
  // referenced as such in `card.spell_keywords` JSONB; engine still
  // dispatches via that id on the spell path and via the FR label
  // "Convocations multiples" on the creature path.
  malediction: {
    id: "malediction", label: "Malédiction", symbol: "💀",
    desc: "Invocation : ciblez une unité ennemie, elle est exilée à la fin du prochain tour adverse.",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  necrophagie: {
    id: "necrophagie", label: "Nécrophagie", symbol: "🦴",
    desc: "Gagne +1 ATK et +1 PV chaque fois qu'une unité (alliée ou ennemie) meurt.",
    applicable_to: ["creature"],
    creature: { cost: 18, costPerX: 0, se: 4.0, minTier: 2, scalable: false, zone: "Terrain" },
  },
  paralysie: {
    id: "paralysie", label: "Paralysie", symbol: "⛓️",
    desc: "Les unités subissant des dégâts de cette créature ne peuvent attaquer ni utiliser de capacités actives avant la fin du prochain tour de leur propriétaire.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  permutation: {
    id: "permutation", label: "Permutation", symbol: "🔀",
    desc: "Invocation : échange les PV actuels de deux unités ciblées (une alliée et une ennemie).",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 0, se: 3.5, minTier: 2, scalable: false, zone: "Terrain" },
  },
  persecution: {
    id: "persecution", label: "Persécution X", symbol: "🩻",
    desc: "Chaque fois que cette unité attaque, inflige X dégâts au héros adverse.",
    applicable_to: ["creature"],
    creature: { cost: 8, costPerX: 5, se: 3.0, minTier: 2, scalable: true, zone: "Terrain" },
  },
  ombre_du_passe: {
    id: "ombre_du_passe", label: "Ombre du passé", symbol: "👤",
    desc: "Invocation : gagne +1 ATK et +1 PV par unité de même race dans votre cimetière.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Cimetière" },
  },
  profanation: {
    id: "profanation", label: "Profanation X", symbol: "⚰️",
    desc: "Invocation : exile les X dernières cartes de votre cimetière pour accorder jusqu'à +X/+X à l'unité.",
    applicable_to: ["creature"],
    creature: { cost: 7, costPerX: 3, se: 2.5, minTier: 2, scalable: true, zone: "Cimetière" },
  },
  prescience: {
    id: "prescience", label: "Prescience X", symbol: "🃏",
    desc: "Invocation : piochez des cartes jusqu'à avoir X cartes en main.",
    applicable_to: ["creature"],
    creature: { cost: 9, costPerX: 4, se: 3.0, minTier: 2, scalable: true, zone: "Main" },
  },
  suprematie: {
    id: "suprematie", label: "Suprématie", symbol: "👊",
    desc: "Invocation : gagne +1 ATK et +1 PV par carte dans votre main au moment de l'invocation.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Main" },
  },
  divination: {
    id: "divination", label: "Divination", symbol: "🔍",
    desc: "Invocation : révèle les 3 premières cartes de votre pioche ; placez-en une sur le dessus et les 2 autres en dessous dans l'ordre choisi.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Mixte" },
  },

  // ─── Creature-only — Tier 3 ───────────────────────────────────────────────
  liaison_de_vie: {
    id: "liaison_de_vie", label: "Liaison de vie", symbol: "🔗",
    desc: "Partage les dégâts subis avec le héros adverse.",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 0, se: 3.5, minTier: 3, scalable: false, zone: "Terrain" },
  },
  ombre: {
    id: "ombre", label: "Ombre", symbol: "🌑",
    desc: "Ne peut être ciblée ni attaquée tant qu'elle n'a pas effectué une action (attaque ou capacité).",
    applicable_to: ["creature"],
    creature: { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Terrain" },
  },
  sacrifice: {
    id: "sacrifice", label: "Sacrifice", symbol: "💔",
    desc: "Invocation : détruisez un allié pour gagner ses PV et son ATK de manière permanente.",
    applicable_to: ["creature"],
    creature: { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Terrain" },
  },
  malefice: {
    id: "malefice", label: "Maléfice", symbol: "🕯️",
    desc: "À la mort, inflige X dégâts à toutes les unités (alliés et ennemis), X = son ATK.",
    applicable_to: ["creature"],
    creature: { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Terrain" },
  },
  indestructible: {
    id: "indestructible", label: "Indestructible", symbol: "♾️",
    desc: "Ne subit aucun dégât de combat.",
    applicable_to: ["creature"],
    creature: { cost: 25, costPerX: 0, se: 5.5, minTier: 3, scalable: false, zone: "Terrain" },
  },
  regeneration: {
    id: "regeneration", label: "Régénération", symbol: "💚",
    desc: "Récupère 2 PV au début de votre tour.",
    applicable_to: ["creature"],
    creature: { cost: 20, costPerX: 0, se: 4.5, minTier: 3, scalable: false, zone: "Terrain" },
  },
  corruption: {
    id: "corruption", label: "Corruption", symbol: "🖤",
    desc: "Convertit l'unité ennemie sélectionnée à votre camp jusqu'à la fin du tour ; elle gagne Traque jusqu'à la fin du tour.",
    applicable_to: ["creature"],
    creature: { cost: 27, costPerX: 0, se: 6.0, minTier: 4, scalable: false, zone: "Terrain" },
  },
  carnage: {
    id: "carnage", label: "Carnage X", symbol: "💥",
    desc: "Mort : inflige X dégâts à toutes les unités en jeu (alliées et ennemies).",
    applicable_to: ["creature"],
    creature: { cost: 12, costPerX: 5, se: 4.0, minTier: 3, scalable: true, zone: "Terrain" },
  },
  heritage: {
    id: "heritage", label: "Héritage X", symbol: "📜",
    desc: "Mort : chaque unité alliée en jeu gagne +X ATK et +X PV de manière permanente.",
    applicable_to: ["creature"],
    creature: { cost: 14, costPerX: 6, se: 4.5, minTier: 3, scalable: true, zone: "Terrain" },
  },
  mimique: {
    id: "mimique", label: "Mimique", symbol: "🪞",
    desc: "Invocation : copie toutes les capacités d'une unité ciblée et les attribue à cette unité de manière permanente.",
    applicable_to: ["creature"],
    creature: { cost: 20, costPerX: 0, se: 4.5, minTier: 3, scalable: false, zone: "Terrain" },
  },
  metamorphose: {
    id: "metamorphose", label: "Métamorphose", symbol: "🦎",
    desc: "Invocation : cette unité devient une copie exacte (ATK / PV / capacités) d'une unité ciblée.",
    applicable_to: ["creature"],
    creature: { cost: 20, costPerX: 0, se: 4.5, minTier: 3, scalable: false, zone: "Terrain" },
  },
  tactique: {
    id: "tactique", label: "Tactique X", symbol: "📋",
    desc: "Invocation : attribue X capacité(s) choisie(s) à une unité alliée ciblée de manière permanente.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 7, se: 4.0, minTier: 3, scalable: true, zone: "Terrain" },
  },
  heritage_du_cimetiere: {
    id: "heritage_du_cimetiere", label: "Héritage du cimetière", symbol: "🏚️",
    desc: "Invocation : attribue à cette unité les capacités d'une unité ciblée dans votre cimetière.",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 0, se: 3.5, minTier: 3, scalable: false, zone: "Cimetière" },
  },

  // ─── Creature-only — Tier 4 ───────────────────────────────────────────────
  pacte_de_sang: {
    id: "pacte_de_sang", label: "Pacte de sang", symbol: "🩸",
    desc: "Quand cette unité meurt, invoque deux tokens 1/1 de sa race.",
    applicable_to: ["creature"],
    creature: { cost: 25, costPerX: 0, se: 5.5, minTier: 4, scalable: false, zone: "Terrain" },
  },
  souffle_de_feu: {
    id: "souffle_de_feu", label: "Souffle de feu X", symbol: "🐲",
    desc: "Inflige X dégâts à toutes les unités ennemies lors de l'attaque (ex : Souffle de feu 2 = 2 dégâts).",
    applicable_to: ["creature"],
    creature: { cost: 19, costPerX: 6, se: 5.5, minTier: 4, scalable: true, zone: "Terrain" },
  },
  domination: {
    id: "domination", label: "Domination", symbol: "👁️‍🗨️",
    desc: "Prend le contrôle d'une unité ennemie au hasard à son invocation.",
    applicable_to: ["creature"],
    creature: { cost: 27, costPerX: 0, se: 6.0, minTier: 4, scalable: false, zone: "Terrain" },
  },
  resurrection: {
    id: "resurrection", label: "Résurrection", symbol: "✨",
    desc: "Revient en jeu après sa mort avec 1 PV ; perd la capacité Résurrection à son retour.",
    applicable_to: ["creature"],
    creature: { cost: 29, costPerX: 0, se: 6.5, minTier: 4, scalable: false, zone: "Terrain" },
  },
  transcendance: {
    id: "transcendance", label: "Transcendance", symbol: "🌟",
    desc: "Immunité totale aux sorts adverses : ne peut subir aucun dégât ni effet de sort, y compris les sorts de zone.",
    applicable_to: ["creature"],
    creature: { cost: 32, costPerX: 0, se: 7.0, minTier: 4, scalable: false, zone: "Terrain" },
  },
  vampirisme: {
    id: "vampirisme", label: "Vampirisme X", symbol: "🧛",
    desc: "Invocation : vole X PV à une unité ennemie ciblée et les ajoute aux PV de cette unité.",
    applicable_to: ["creature"],
    creature: { cost: 20, costPerX: 5, se: 5.5, minTier: 4, scalable: true, zone: "Terrain" },
  },

  // ─── Creature-only — Deck / Race / Clan ───────────────────────────────────
  traque_du_destin: {
    id: "traque_du_destin", label: "Traque du destin X", symbol: "🔮",
    desc: "Invocation : révèle les X premières cartes de votre deck, prenez-en une en main et placez les autres en dessous dans un ordre aléatoire.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 4, se: 3.0, minTier: 2, scalable: true, zone: "Deck" },
  },
  cycle_eternel: {
    id: "cycle_eternel", label: "Cycle éternel", symbol: "♻️",
    desc: "Mort : ajoutez une copie de cette carte dans votre deck ; si elle est piochée, mettez-la directement en jeu.",
    applicable_to: ["creature"],
    creature: { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Deck" },
  },
  sang_mele: {
    id: "sang_mele", label: "Sang mêlé", symbol: "🧬",
    desc: "Gagne +1 ATK et +1 PV pour chaque type de race différent parmi vos alliés en jeu.",
    applicable_to: ["creature"],
    creature: { cost: 11, costPerX: 0, se: 2.5, minTier: 2, scalable: false, zone: "Race" },
  },
  martyr: {
    id: "martyr", label: "Martyr", symbol: "⚱️",
    desc: "Mort : toutes vos unités de même race en jeu gagnent +1/+1 permanent.",
    applicable_to: ["creature"],
    creature: { cost: 18, costPerX: 0, se: 4.0, minTier: 3, scalable: false, zone: "Race" },
  },
  instinct_de_meute: {
    id: "instinct_de_meute", label: "Instinct de meute X", symbol: "🐺",
    desc: "Invocation : gagne +X ATK et +X PV si une unité alliée de même faction a rejoint le cimetière depuis le jeu ce tour.",
    applicable_to: ["creature"],
    creature: { cost: 14, costPerX: 5, se: 4.0, minTier: 3, scalable: true, zone: "Race" },
  },
  totem: {
    id: "totem", label: "Totem", symbol: "🗿",
    desc: "Cette unité gagne les capacités de toutes les unités de même race alliées en jeu.",
    applicable_to: ["creature"],
    creature: { cost: 25, costPerX: 0, se: 5.5, minTier: 4, scalable: false, zone: "Race" },
  },
  fierte_du_clan: {
    id: "fierte_du_clan", label: "Fierté du clan", symbol: "🏰",
    desc: "Tant que cette unité est en jeu, les unités de même clan invoquées arrivent avec +1/+1.",
    applicable_to: ["creature"],
    creature: { cost: 13, costPerX: 0, se: 3.0, minTier: 2, scalable: false, zone: "Clan" },
  },
  appel_du_clan: {
    id: "appel_du_clan", label: "Appel du clan X", symbol: "📯",
    desc: "Invocation : mettez en jeu gratuitement la première unité de même clan avec un coût inférieur ou égal à X depuis le dessus de votre deck.",
    applicable_to: ["creature"],
    creature: { cost: 16, costPerX: 5, se: 4.5, minTier: 3, scalable: true, zone: "Clan" },
  },
  solidarite: {
    id: "solidarite", label: "Solidarité X", symbol: "🤜",
    desc: "Invocation : piochez X cartes si vous contrôlez 2 autres unités de même race.",
    applicable_to: ["creature"],
    creature: { cost: 9, costPerX: 4, se: 2.5, minTier: 2, scalable: true, zone: "Race" },
  },
  rassemblement: {
    id: "rassemblement", label: "Rassemblement X", symbol: "🏴",
    desc: "Révèle les X premières cartes du deck ; ajoutez à votre main les unités de même race et défaussez le reste.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 14, costPerX: 4, se: 4.0, minTier: 3, scalable: true, zone: "Mixte",
      desc: "Invocation : révèle les X premières cartes du deck ; ajoutez à votre main toutes les unités de même race et défaussez le reste.",
    },
    spell: {
      desc: "Révèle les X premières cartes de votre deck ; ajoutez à votre main les unités de la même race que ce sort et défaussez le reste.",
      params: ["amount"], needsTarget: false,
    },
  },

  // ─── Polymorphic — creature + spell ───────────────────────────────────────
  rappel: {
    id: "rappel", label: "Rappel", symbol: "🪦",
    desc: "Renvoie une carte alliée du cimetière dans la main.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 7, costPerX: 0, se: 1.5, minTier: 1, scalable: false, zone: "Cimetière",
      desc: "Invocation : remettez une carte ciblée de votre cimetière dans votre main.",
    },
    spell: {
      desc: "Renvoie une créature de votre cimetière dans votre main",
      params: [], needsTarget: true, targetType: "friendly_graveyard",
    },
  },
  exhumation: {
    id: "exhumation", label: "Exhumation X", symbol: "⚰️",
    desc: "Ressuscite une créature de votre cimetière sur le terrain.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 14, costPerX: 4, se: 4.0, minTier: 3, scalable: true, zone: "Cimetière",
      desc: "Invocation : ressuscite une unité de votre cimetière dont le coût en mana est égal ou inférieur à X.",
    },
    spell: {
      desc: "Ressuscite une créature (coût ≤ X) de votre cimetière sur le terrain",
      params: ["amount"], needsTarget: true, targetType: "friendly_graveyard_to_board",
    },
  },
  selection: {
    id: "selection", label: "Sélection X", symbol: "🎴",
    desc: "Choisissez une carte parmi 3 communes aléatoires de coût ≤ X (sans limite de coût si X non défini) à ajouter en main.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 9, costPerX: 4, se: 2.5, minTier: 2, scalable: true, zone: "Mixte",
      desc: "Invocation : révèle 3 cartes communes aléatoires de votre collection (factions du deck) de coût ≤ X ; ajoutez-en une à votre main. Sans limite de coût si X non défini.",
    },
    spell: {
      desc: "Choisissez une carte parmi 3 communes aléatoires de votre collection de coût ≤ X (sans limite si X non défini) à ajouter en main",
      params: ["amount"], needsTarget: false,
    },
  },
  selection_magique: {
    id: "selection_magique", label: "Sélection magique X", symbol: "🪄",
    desc: "Choisissez un sort parmi 3 sorts aléatoires (toutes factions) de coût ≤ X (sans limite si X non défini) à ajouter en main.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 11, costPerX: 4, se: 3.0, minTier: 2, scalable: true, zone: "Mixte",
      desc: "Invocation : révèle 3 sorts aléatoires (toutes factions) de coût ≤ X ; ajoutez-en un à votre main. Sans limite de coût si X non défini.",
    },
    spell: {
      desc: "Choisissez un sort parmi 3 sorts aléatoires (toutes factions) de coût ≤ X (sans limite si X non défini) à ajouter en main",
      params: ["amount"], needsTarget: false,
    },
  },
  renfort_royal: {
    id: "renfort_royal", label: "Renfort Royal X", symbol: "👑",
    desc: "Choisissez une carte parmi 3 éditions limitées que vous possédez (≥30 requises ; sinon parmi des communes), de coût ≤ X (sans limite si X non défini).",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 14, costPerX: 5, se: 3.5, minTier: 3, scalable: true, zone: "Mixte",
      desc: "Invocation : révèle 3 cartes aléatoires parmi vos éditions limitées (≥30 requises ; sinon parmi des communes) de coût ≤ X ; ajoutez-en une à votre main. Sans limite de coût si X non défini.",
    },
    spell: {
      desc: "Choisissez une carte parmi 3 cartes aléatoires de vos éditions limitées (≥30 requises ; sinon parmi des communes) de coût ≤ X (sans limite si X non défini) à ajouter en main",
      params: ["amount"], needsTarget: false,
    },
  },
  relancer: {
    id: "relancer", label: "Relancer X", symbol: "🔁",
    desc: "Rejoue les X derniers sorts lancés avec des cibles aléatoires.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 12, costPerX: 8, se: 5.0, minTier: 3, scalable: true, zone: "Terrain",
      desc: "Invocation : rejoue les X derniers sorts lancés avec des cibles aléatoires.",
    },
    spell: {
      desc: "Rejoue les X derniers sorts lancés avec des cibles aléatoires",
      params: ["amount"], needsTarget: false,
    },
  },
  invocation: {
    id: "invocation", label: "Invocation X/Y", symbol: "📣",
    desc: "Invoque un token X/Y",
    applicable_to: ["spell"],
    spell: { params: ["attack", "health"], needsTarget: false },
  },

  // ─── Spell-only ───────────────────────────────────────────────────────────
  impact: {
    id: "impact", label: "Impact X", symbol: "💥",
    desc: "Inflige X dégâts à une cible",
    applicable_to: ["spell"],
    spell: { params: ["amount"], needsTarget: true, targetType: "any" },
  },
  deferlement: {
    id: "deferlement", label: "Déferlement X", symbol: "🌊",
    desc: "Inflige X dégâts à tous les ennemis",
    applicable_to: ["spell"],
    spell: { params: ["amount"], needsTarget: false },
  },
  siphon: {
    id: "siphon", label: "Siphon X", symbol: "🩸",
    desc: "Inflige X dégâts à une cible et soigne votre héros du même montant",
    applicable_to: ["spell"],
    spell: { params: ["amount"], needsTarget: true, targetType: "enemy_creature" },
  },
  entrave: {
    id: "entrave", label: "Entrave", symbol: "⛓️",
    desc: "Paralyse une créature ennemie ciblée",
    applicable_to: ["spell"],
    spell: { params: [], needsTarget: true, targetType: "enemy_creature" },
  },
  execution: {
    id: "execution", label: "Exécution", symbol: "☠️",
    desc: "Détruit une créature ciblée",
    applicable_to: ["spell"],
    spell: { params: [], needsTarget: true, targetType: "any_creature" },
  },
  silence: {
    id: "silence", label: "Silence", symbol: "🤫",
    desc: "Retire tous les mots-clés d'une créature ciblée",
    applicable_to: ["spell"],
    spell: { params: [], needsTarget: true, targetType: "any_creature" },
  },
  renforcement: {
    id: "renforcement", label: "Renforcement +X/+Y", symbol: "⬆️",
    desc: "Donne +X ATK et +Y PV à une créature alliée",
    applicable_to: ["spell"],
    spell: { params: ["attack", "health"], needsTarget: true, targetType: "friendly_creature" },
  },
  guerison: {
    id: "guerison", label: "Guérison X", symbol: "💚",
    desc: "Restaure X PV à une cible",
    applicable_to: ["spell"],
    spell: { params: ["amount"], needsTarget: true, targetType: "any" },
  },
  inspiration: {
    id: "inspiration", label: "Inspiration X", symbol: "📖",
    desc: "Piochez X cartes.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 9, costPerX: 5, se: 2.5, minTier: 2, scalable: true, zone: "Main",
      desc: "Invocation : piochez X cartes.",
    },
    spell: {
      desc: "Piochez X cartes",
      params: ["amount"], needsTarget: false,
    },
  },
  concentration: {
    id: "concentration", label: "Concentration X", symbol: "🎯",
    desc: "Remplace chaque sort en main par un sort aléatoire (toutes factions) de coût en mana supérieur de X ; le coût du nouveau sort est réduit de X.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 12, costPerX: 6, se: 3.5, minTier: 3, scalable: true, zone: "Main",
      desc: "Invocation : remplace chaque sort en main par un sort aléatoire (toutes factions) de coût supérieur de X ; le coût du nouveau sort est réduit de X.",
    },
    spell: {
      desc: "Remplace chaque sort en main par un sort aléatoire (toutes factions) de coût supérieur de X ; le coût du nouveau sort est réduit de X.",
      params: ["amount"], needsTarget: false,
    },
  },
  invocation_multiple: {
    id: "invocation_multiple", label: "Convocations multiples", symbol: "📣📣",
    desc: "Crée plusieurs tokens selon la configuration de la carte.",
    applicable_to: ["creature", "spell"],
    creature: {
      id: "convocations_multiples",
      cost: 12, costPerX: 0, se: 4.0, minTier: 2, scalable: false, zone: "Terrain",
      desc: "Invocation : crée plusieurs tokens selon la configuration.",
    },
    spell: { params: [], needsTarget: false },
  },
  tempete: {
    id: "tempete", label: "Tempête X", symbol: "🌩️",
    desc: "Inflige X dégâts répartis aléatoirement entre les unités ennemies.",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: 10, costPerX: 4, se: 3.5, minTier: 2, scalable: true, zone: "Terrain",
      desc: "Invocation : inflige X dégâts répartis aléatoirement entre les unités ennemies.",
    },
    spell: { params: ["amount"], needsTarget: false },
  },
  // Premier mot-clé "drawback" du jeu : son cost et son costPerX sont
  // négatifs pour qu'il fonctionne comme un discount budget en forge —
  // l'auteur de carte récupère du budget en l'attachant, en échange du
  // coût en PV au moment de l'arrivée en jeu (unité) ou du lancement
  // (sort). Pas d'anti-letalité : checkWinCondition gère le cas du
  // suicide par Douleur.
  douleur: {
    id: "douleur", label: "Douleur X", symbol: "🤕",
    desc: "Inflige X dégâts à votre héros à l'arrivée en jeu (unité) ou au lancement (sort).",
    applicable_to: ["creature", "spell"],
    creature: {
      cost: -3, costPerX: -3, se: -1.0, minTier: 0, scalable: true, zone: "Terrain",
      desc: "Invocation : inflige X dégâts à votre héros.",
    },
    spell: {
      desc: "Au lancement, inflige X dégâts à votre héros.",
      params: ["amount"], needsTarget: false,
    },
  },
  afflux: {
    id: "afflux", label: "Afflux X", symbol: "💎",
    desc: "Gagnez X mana ce tour",
    applicable_to: ["spell"],
    spell: { params: ["amount"], needsTarget: false },
  },
};

// ─── Derived views ──────────────────────────────────────────────────────────
// Existing call sites import KEYWORDS from card-engine/constants and
// SPELL_KEYWORDS from spell-keywords. Both files re-export from the views
// below so engine code (`hasKw`, `resolveSpellKeywords`), the forge UI, and
// any downstream tooling continue to work without changes.

export const KEYWORDS: Record<string, {
  cost: number;
  costPerX: number;
  se: number;
  minTier: number;
  scalable: boolean;
  zone: KeywordZone;
  desc: string;
}> = (() => {
  const out: Record<string, {
    cost: number; costPerX: number; se: number; minTier: number;
    scalable: boolean; zone: KeywordZone; desc: string;
  }> = {};
  for (const a of Object.values(ABILITIES)) {
    if (!a.creature) continue;
    const label = a.creature.label ?? a.label;
    out[label] = {
      cost: a.creature.cost,
      costPerX: a.creature.costPerX,
      se: a.creature.se,
      minTier: a.creature.minTier,
      scalable: a.creature.scalable,
      zone: a.creature.zone,
      desc: a.creature.desc ?? a.desc,
    };
  }
  return out;
})();

export interface DerivedSpellKeywordDef {
  label: string;
  symbol: string;
  desc: string;
  params: ("amount" | "attack" | "health")[];
  needsTarget: boolean;
  targetType?: SpellTargetType;
}

export const SPELL_KEYWORDS: Record<SpellKeywordId, DerivedSpellKeywordDef> = (() => {
  const out: Partial<Record<SpellKeywordId, DerivedSpellKeywordDef>> = {};
  for (const a of Object.values(ABILITIES)) {
    if (!a.spell) continue;
    out[a.id as SpellKeywordId] = {
      label: a.spell.label ?? a.label,
      symbol: a.symbol,
      desc: a.spell.desc ?? a.desc,
      params: a.spell.params,
      needsTarget: a.spell.needsTarget,
      targetType: a.spell.targetType,
    };
  }
  return out as Record<SpellKeywordId, DerivedSpellKeywordDef>;
})();

// ─── Selectors for UI consumers ────────────────────────────────────────────

/** All abilities that can appear on a creature (sorted by FR creature label). */
export const CREATURE_ABILITIES: AbilityDef[] = Object.values(ABILITIES)
  .filter((a) => a.applicable_to.includes("creature"))
  .sort((a, b) => (a.creature?.label ?? a.label).localeCompare(b.creature?.label ?? b.label, "fr"));

/** All abilities that can appear on a spell (sorted by FR spell label). */
export const SPELL_ABILITIES: AbilityDef[] = Object.values(ABILITIES)
  .filter((a) => a.applicable_to.includes("spell"))
  .sort((a, b) => (a.spell?.label ?? a.label).localeCompare(b.spell?.label ?? b.label, "fr"));

/** Abilities that exist in BOTH contexts. Used by the forge picker to flag them. */
export const POLYMORPHIC_ABILITIES: AbilityDef[] = Object.values(ABILITIES)
  .filter((a) => a.applicable_to.length > 1)
  .sort((a, b) => a.label.localeCompare(b.label, "fr"));

// ─── Icon lookup keys ──────────────────────────────────────────────────────
//
// In-game, GameCard / HandCard / etc. pass these keys to <KeywordIcon>:
//  - creature side: the snake_case id stored in `card.keywords[]`
//    (which is the engine's `Keyword` enum, not necessarily the registry id)
//  - spell side:    `spell_${spell_keyword.id}`
//
// `POLYMORPHIC_ICON_KEY_FALLBACK` lets the icon store transparently resolve
// either side to whichever sibling has an uploaded icon. Useful when an
// admin uploaded the icon under one key only (e.g. before the registry
// merge) — both contexts now show the same image.
export const POLYMORPHIC_ICON_KEY_FALLBACK: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const a of Object.values(ABILITIES)) {
    if (a.applicable_to.length < 2) continue;
    const creatureKey = a.creature?.id ?? a.id;
    const spellKey = `spell_${a.id}`;
    out[creatureKey] = spellKey;
    out[spellKey] = creatureKey;
  }
  return out;
})();

/** Returns the icon-store keys to write a polymorphic ability's icon under. */
export function abilityIconKeys(a: AbilityDef): { host: AbilityHost; key: string }[] {
  return a.applicable_to.map((host) => ({
    host,
    key: host === "spell" ? `spell_${a.id}` : a.creature?.id ?? a.id,
  }));
}

// ─── Polymorphic engine-id pairs ────────────────────────────────────────────
//
// For each ability that lives on both sides, the snake_case id stored in
// `card.keywords[]` (creature side) paired with the id used in
// `card.spell_keywords[].id` (spell side). Used by render layers to dedup
// rows when a card legacy-carries both sides of the same concept (e.g.
// authored before the registry merge).
export const POLYMORPHIC_PAIRS: {
  creatureId: string;
  creatureLabel: string;
  spellId: string;
}[] = Object.values(ABILITIES)
  .filter((a) => a.applicable_to.length > 1)
  .map((a) => ({
    creatureId: a.creature?.id ?? a.id,
    creatureLabel: a.creature?.label ?? a.label,
    spellId: a.id,
  }));

/** True when `creatureKw` is the creature side of a polymorphic ability whose
 *  spell side is also present on the same card — caller should skip the
 *  creature row to avoid a visible duplicate.
 *
 *  `creatureKw` accepts either the snake_case engine id (in-game cards,
 *  card.keywords stores ids) or the FR label (forge author state). */
export function isCreatureKwShadowedBySpell(
  creatureKw: string,
  spellKws: { id: string }[] | null | undefined,
): boolean {
  if (!spellKws?.length) return false;
  const pair = POLYMORPHIC_PAIRS.find(
    (p) => p.creatureId === creatureKw || p.creatureLabel === creatureKw,
  );
  if (!pair) return false;
  return spellKws.some((sk) => sk.id === pair.spellId);
}

/** Mana-cost reduction granted by the "Entraide" creature keyword while the
 *  card is in hand. Counts allied creatures on the player's board whose
 *  `race` matches the targeted race stored on the card. The card itself is
 *  in hand (not on the board) so it can never count towards its own
 *  reduction. */
export function getEntraideReduction(card: Card, board: CardInstance[]): number {
  if (!card.keywords.includes("entraide")) return 0;
  const targetRace = card.entraide_race;
  if (!targetRace) return 0;
  return board.filter((c) => c.card.race === targetRace).length;
}
