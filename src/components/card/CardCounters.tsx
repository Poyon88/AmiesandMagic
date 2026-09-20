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
  // `width3` : « +12 », le seul texte à trois signes — un BONUS d'objet à deux
  // chiffres. Une stat d'unité n'en a jamais plus de deux (cf. shownValue).
  stat: { right: 2.4, bottom: 8.4, gap: 1.6, height: 14.6, width1: 12.8, width2: 17.4, width3: 21.6 },
  // Jeton d'ÉQUIPEMENT : rangé sous l'écu de coût, même colonne, même largeur.
  equip: { gap: 1.2, height: 11.6 },
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

/** Texte d'un écu de stat. `bonus` : la valeur d'un OBJET, qui n'est pas la
 *  stat d'une unité mais ce qu'il AJOUTE à son porteur — d'où le « + », zéro
 *  compris (« +0 » dit que l'objet ne donne rien de ce côté, là où un écu
 *  absent laisserait croire à un oubli). */
export const statShieldText = (value: number, bonus = false): string =>
  `${bonus ? "+" : ""}${shownValue(value)}`;

/** Largeur d'un écu de stat pour une valeur : la largeur varie, pas le corps. */
export const statShieldWidth = (value: number, bonus = false): number => {
  const signes = statShieldText(value, bonus).length;
  const g = SHIELD_GEOMETRY.stat;
  return signes > 2 ? g.width3 : signes > 1 ? g.width2 : g.width1;
};

/** Place (en cqw) que le bloc ATK / PV occupe depuis le bord droit — pour que
 *  la barre d'icônes du bas s'arrête avant, au lieu de passer dessous. */
export const statShieldsReserve = (atk: number, hp: number, bonus = false): number =>
  statShieldWidth(atk, bonus) + statShieldWidth(hp, bonus) + SHIELD_GEOMETRY.stat.gap + SHIELD_GEOMETRY.stat.right + 1.2;

/** Écu générique : div or + div émail, même découpe. */
function Shield({
  value, clip, gold, enamel, width, height, fontSize, ink, border, title,
}: {
  value: number | string; clip: string; gold: string; enamel: string;
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
  atk, hp, atkTone = "neutral", hpTone = "neutral", bonus = false,
}: {
  atk: number; hp: number; atkTone?: Tone; hpTone?: Tone;
  /** OBJET : les valeurs sont des bonus, écrits « +N » (cf. statShieldText). */
  bonus?: boolean;
}) {
  const a = statShieldText(atk, bonus);
  const h = statShieldText(hp, bonus);
  const g = SHIELD_GEOMETRY.stat;
  // Le « + » prend la place d'un chiffre : le corps cède un peu pour que
  // « +12 » tienne sans élargir l'écu au-delà de width3.
  const corps = bonus ? 7.4 : 8.2;
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
        width={statShieldWidth(atk, bonus)} height={g.height} fontSize={corps} ink={inkFor(atkTone)} border={9} />
      <Shield value={h} clip={CLIP_STAT} gold={HERALDRY.goldStat} enamel={HERALDRY.enamelHp}
        width={statShieldWidth(hp, bonus)} height={g.height} fontSize={corps} ink={inkFor(hpTone)} border={9} />
    </div>
  );
}

/** Jeton d'ÉQUIPEMENT d'un objet — sous l'écu de coût, en haut à gauche.
 *
 *  Les deux sont du MANA : la colonne se lit « 1 pour la poser, 2 pour
 *  l'équiper ». La colonne de DROITE reste celle des coûts qui n'en sont pas
 *  (vie, défausse, exil…) et de l'Éveil, avec sa limite de deux jetons.
 *
 *  Affiché à ZÉRO aussi, contrairement à l'écu de coût : « équiper est gratuit »
 *  est une information, et un jeton absent ne la distinguerait pas d'un oubli.
 *  `sousLeCout` : faux quand l'écu de coût est masqué (objet gratuit à poser) —
 *  le jeton remonte alors à sa place plutôt que de flotter sous un vide. */
export function EquipToken({ value, sousLeCout = true }: { value: number; sousLeCout?: boolean }) {
  const shown = shownValue(value);
  const c = SHIELD_GEOMETRY.cost;
  const e = SHIELD_GEOMETRY.equip;
  return (
    <div
      title={shown > 0 ? `Équiper : ${shown} mana, à chaque équipement` : "Équiper : gratuit"}
      style={{
        position: "absolute", left: `${c.left}cqw`,
        top: `${sousLeCout ? c.top + c.size + e.gap : c.top}cqw`,
        width: `${c.size}cqw`, height: `${e.height}cqw`,
        zIndex: 3, display: "grid", placeItems: "center",
        filter: "drop-shadow(0 0.6cqw 1cqw rgba(0,0,0,.45))",
      }}
    >
      {/* Cartouche à pans coupés : ni l'écu du mana, ni les jetons de droite —
          une troisième silhouette pour une troisième nature de coût. */}
      <svg viewBox="0 0 100 66" aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
        <defs>
          <linearGradient id="am-equip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c8873c" /><stop offset="1" stopColor="#4a2a0c" />
          </linearGradient>
        </defs>
        <path d="M14 3 H86 L97 14 V52 L86 63 H14 L3 52 V14 Z"
          fill="url(#am-equip)" stroke="#C9A227" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span style={{
        position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "0.8cqw",
        fontFamily: HERALDRY_FONT, fontWeight: 700, lineHeight: 1, color: "#FFE9CF",
        fontVariantNumeric: "tabular-nums", textShadow: "0 .3cqw .7cqw rgba(0,0,0,.8)",
      }}>
        <span aria-hidden="true" style={{ fontSize: "5.4cqw" }}>⚒</span>
        <span style={{ fontSize: "7.4cqw" }}>{shown}</span>
      </span>
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
  // OBJET : ses chiffres sont des bonus, et il porte un coût d'équipement.
  objet?: { equip: number } | null,
): string {
  const parts = [name, `coût ${cost}`, ...extras];
  if (objet) parts.push(`équipement ${objet.equip}`);
  if (stats) {
    parts.push(objet
      ? `bonus d'attaque ${stats.atk}, bonus de points de vie ${stats.hp}`
      : `attaque ${stats.atk}, points de vie ${stats.hp}`);
  }
  return parts.join(", ");
}
