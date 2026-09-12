"use client";

// Compteurs de carte en ÉCUS HÉRALDIQUES : émail sombre cerné d'or, chiffre en
// Cinzel. Remplace la pastille ronde de mana (haut gauche) et les deux cases
// ATK / PV (bas droite) sur tous les rendus de carte.
//
// Contraintes (cf. BRIEF-COMPTEURS-BLASONS.md) :
//  • styles inline uniquement — donc pas de pseudo-élément : chaque écu est
//    DEUX <div> imbriqués (or dehors, émail dedans) qui portent le même clipPath ;
//  • pas de media query : TOUTES les dimensions sont en `cqw`. La racine de la
//    carte doit porter `containerType: "inline-size"` (1cqw = 1 % de sa
//    largeur), et un seul composant sert vignette, main, plateau et aperçus ;
//  • le CORPS du chiffre est constant : un 12 pèse autant qu'un 3. C'est la
//    LARGEUR de l'écu qui s'élargit à deux chiffres — sauf le coût, qui ne
//    peut pas s'élargir sans toucher le bandeau de titre et baisse un peu son
//    corps ; jamais trois chiffres (borné à 99).
import React from "react";

export const HERALDRY = {
  goldCost: "#C9A227",
  goldStat: "#B8952F",
  enamelCost: "linear-gradient(175deg,#26467F,#0C1B3E)",
  enamelAtk: "linear-gradient(175deg,#9E2B1C,#5A1109)",
  enamelHp: "linear-gradient(175deg,#1C4A3E,#0A2620)",
  inkNeutral: "#F4EBD2",
  inkBuff: "#8CE0A8",
  inkDebuff: "#FF8A7A",
  inkCheap: "#9FD2FF",
} as const;

const CLIP_COST = "polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)";
const CLIP_STAT = "polygon(0 0,100% 0,100% 74%,50% 100%,0 74%)";

/** Cinzel est chargée par next/font dans le layout racine (variable
 *  `--font-cinzel`, graisses 400/600/700/900) : disponible partout où une carte
 *  se rend, plateau comme boutique. Le nom littéral reste en repli. */
export const HERALDRY_FONT = "var(--font-cinzel), 'Cinzel', Georgia, serif";

/** Géométrie des écus, en cqw. Exportée pour que les barres d'icônes du bas
 *  puissent RÉSERVER la place des écus de stats (ils sont en absolu). */
export const SHIELD_GEOMETRY = {
  cost: { left: 2.6, top: 2.6, size: 17.4 },
  stat: { right: 2.4, bottom: 8.4, gap: 1.6, height: 14.6, width1: 12.8, width2: 17.4 },
} as const;

export type Tone = "neutral" | "buff" | "debuff";

const inkFor = (tone: Tone, cheap = false) =>
  tone === "buff" ? HERALDRY.inkBuff
    : tone === "debuff" ? HERALDRY.inkDebuff
      : cheap ? HERALDRY.inkCheap
        : HERALDRY.inkNeutral;

/** Valeur AFFICHÉE : entière, jamais négative, jamais plus de deux chiffres.
 *  Une valeur > 99 est un bug d'équilibrage, pas un cas d'affichage. */
export const shownValue = (value: number): number => Math.min(99, Math.max(0, Math.round(value)));

/** Largeur d'un écu de stat pour une valeur : la largeur varie, pas le corps. */
export const statShieldWidth = (value: number): number =>
  String(shownValue(value)).length > 1 ? SHIELD_GEOMETRY.stat.width2 : SHIELD_GEOMETRY.stat.width1;

/** Place (en cqw) que le bloc ATK / PV occupe depuis le bord droit — pour que
 *  la barre d'icônes du bas s'arrête avant, au lieu de passer dessous. */
export const statShieldsReserve = (atk: number, hp: number): number =>
  statShieldWidth(atk) + statShieldWidth(hp) + SHIELD_GEOMETRY.stat.gap + SHIELD_GEOMETRY.stat.right + 1.2;

/** Écu générique : div or + div émail, même découpe. */
function Shield({
  value, clip, gold, enamel, width, height, fontSize, ink, border, title,
}: {
  value: number; clip: string; gold: string; enamel: string;
  width: number; height: number; fontSize: number; ink: string; border: number;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        position: "relative",
        width: `${width}cqw`,
        height: `${height}cqw`,
        clipPath: clip,
        background: gold,
        display: "grid",
        placeItems: "center",
        // Cible d'animation : ce div extérieur (transform), jamais `width` —
        // la découpe sauterait.
        filter: "drop-shadow(0 0.6cqw 1cqw rgba(0,0,0,.45))",
        // Jamais de transition sur width : la découpe sauterait (brief §8.9).
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: `${border}%`,
          clipPath: clip,
          background: enamel,
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          fontFamily: HERALDRY_FONT,
          fontWeight: 700,
          fontSize: `${fontSize}cqw`,
          lineHeight: 1,
          color: ink,
          fontVariantNumeric: "tabular-nums",
          // Le chiffre est centré dans la partie RECTANGULAIRE de l'écu, pas
          // dans sa boîte complète (la pointe basse fausserait le centrage).
          marginBottom: `${(100 - (clip === CLIP_COST ? 60 : 74)) / 100 * height * 0.45}cqw`,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Écu de COÛT (haut gauche). `discounted` : coût réduit (Canalisation,
 *  Entraide…) → chiffre bleu clair. Masqué à 0 (jetons, cartes gratuites) :
 *  un « 0 » en écu n'apprend rien. */
export function CostShield({ value, discounted = false, title }: { value: number; discounted?: boolean; title?: string }) {
  const shown = shownValue(value);
  if (shown <= 0) return null;
  const two = String(shown).length > 1;
  const g = SHIELD_GEOMETRY.cost;
  return (
    <div style={{ position: "absolute", left: `${g.left}cqw`, top: `${g.top}cqw`, zIndex: 3 }}>
      <Shield
        value={shown}
        clip={CLIP_COST}
        gold={HERALDRY.goldCost}
        enamel={HERALDRY.enamelCost}
        width={g.size}
        height={g.size}
        fontSize={two ? 8.4 : 9.2}   // seule dérogation : le coût ne s'élargit pas
        ink={inkFor("neutral", discounted)}
        border={8}
        title={title}
      />
    </div>
  );
}

/** Écus ATK / PV (bas droite). Les tons ne changent que le CHIFFRE, jamais l'or. */
export function StatShields({
  atk, hp, atkTone = "neutral", hpTone = "neutral",
}: { atk: number; hp: number; atkTone?: Tone; hpTone?: Tone }) {
  const a = shownValue(atk);
  const h = shownValue(hp);
  const g = SHIELD_GEOMETRY.stat;
  return (
    <div
      style={{
        position: "absolute",
        right: `${g.right}cqw`,
        bottom: `${g.bottom}cqw`,
        display: "flex",
        alignItems: "flex-end",
        gap: `${g.gap}cqw`,
        zIndex: 3,
        pointerEvents: "none",
      }}
    >
      <Shield value={a} clip={CLIP_STAT} gold={HERALDRY.goldStat} enamel={HERALDRY.enamelAtk}
        width={statShieldWidth(a)} height={g.height} fontSize={8.2} ink={inkFor(atkTone)} border={9} />
      <Shield value={h} clip={CLIP_STAT} gold={HERALDRY.goldStat} enamel={HERALDRY.enamelHp}
        width={statShieldWidth(h)} height={g.height} fontSize={8.2} ink={inkFor(hpTone)} border={9} />
    </div>
  );
}

/** Ton d'un chiffre par rapport à sa valeur de référence. */
export const toneFor = (value: number, base: number): Tone =>
  value > base ? "buff" : value < base ? "debuff" : "neutral";

/** Libellé d'accessibilité de la racine de carte. */
export function cardAriaLabel(
  name: string, cost: number, stats?: { atk: number; hp: number } | null,
  // Tout ce que la carte AFFICHE en plus (jetons, Éveil) — cf. rightSlotsAriaParts.
  extras: string[] = [],
): string {
  const parts = [name, `coût ${cost}`, ...extras];
  if (stats) parts.push(`attaque ${stats.atk}`, `points de vie ${stats.hp}`);
  return parts.join(", ");
}
