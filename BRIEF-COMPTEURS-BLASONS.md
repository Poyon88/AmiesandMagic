# Brief Claude Code — Compteurs de carte « blasons héraldiques »

> Document unique et à jour (12/09). Il remplace toutes les versions précédentes de ce brief : ne pas se référer aux anciens addenda, tout est consolidé ici.
> Maquette de référence : artifact **Compteurs Armies & Magic** — sections « Blasons héraldiques », « Les blasons à l'épreuve des deux chiffres », « La famille des coûts additionnels », « Le compteur d'Éveil », « Le jeton de défausse ».

## Mission

Remplacer tous les compteurs de carte par un système héraldique unique : écus émaillés cernés d'or, chiffres en Cinzel. Ne pas toucher à l'illustration, au bandeau de titre, ni aux icônes de bas de carte (oiseau, épées, etc.).

Ce qui disparaît :

- la pastille ronde bleue du coût de mana (haut gauche) ;
- la pastille ronde rouge du coût en vie (haut gauche) ;
- les deux cases arrondies ATK / PV (bas droite) ;
- l'icône jaune de défausse en bas à gauche **uniquement** si l'on retient la disposition empilée (voir §6).

## 1. Contraintes d'intégration

- **Styles inline uniquement** (objets de style React). Pas de feuille CSS, pas de CSS Modules, pas de Tailwind.
- Conséquence n°1 : **pas de pseudo-éléments**. Un écu plein est donc deux `<div>` imbriqués (or dehors, émail dedans en `inset`), et les silhouettes complexes sont des **SVG inline** — ce qui donne en prime de vraies bordures.
- Conséquence n°2 : pas de media query. Tout est en **unités de conteneur** : la racine de la carte porte `containerType: 'inline-size'`, et **toutes** les dimensions des compteurs sont en `cqw`. Un seul composant sert le plateau, la main, le deckbuilder et la vignette de liste de deck, sans point de rupture.
- Repère : `1cqw = 1 %` de la largeur de la carte. La carte fait `138.8cqw` de haut (ratio 552 × 766).
- `Cinzel` 700 doit être chargée partout où une carte est rendue — plateau, deckbuilder, boutique, ouverture de booster.
- **Vérifier qu'aucun compteur n'est incrusté dans les fichiers d'illustration.** S'il en reste, les lister : elles devront être régénérées, ce brief ne les couvre pas.

## 2. Carte des emplacements

| Emplacement | Contenu | Position | Taille |
|---|---|---|---|
| Haut gauche | Coût de mana (écu debout) | `left: 2.6cqw`, `top: 2.6cqw` | `17.4 × 17.4 cqw` |
| Haut droit, slot 1 | Éveil **ou** coût additionnel | `right: 2.6cqw`, `top: 2.6cqw` | `17 × 18.6 cqw` |
| Haut droit, slot 2 | Coût additionnel si la carte a aussi un Éveil | `right: 2.6cqw`, `top: 23.5cqw` | `17 × 18.6 cqw` |
| Bas droit | ATK et PV (écus bannière) | `right: 2.4cqw`, `bottom: 8.4cqw`, `gap: 1.6cqw` | `12.8 × 14.6 cqw` chacun |
| Bas gauche | Icônes de capacité | inchangé | inchangé |

**Deux slots maximum à droite, jamais trois.** Les cartes à deux jetons doivent rester l'exception — c'est une consigne de design, pas seulement d'affichage.

## 3. Les écus : mana, attaque, points de vie

Formes (`clipPath`) :

- Coût de mana — écu classique : `polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)`
- ATK / PV — écu bannière : `polygon(0 0, 100% 0, 100% 74%, 50% 100%, 0 74%)`

Couleurs :

| Rôle | Valeur |
|---|---|
| Or du coût | `#C9A227` |
| Or des stats | `#B8952F` |
| Émail coût | `linear-gradient(175deg, #26467F, #0C1B3E)` |
| Émail attaque | `linear-gradient(175deg, #9E2B1C, #5A1109)` |
| Émail points de vie | `linear-gradient(175deg, #1C4A3E, #0A2620)` |
| Chiffre neutre | `#F4EBD2` |
| Chiffre buffé | `#8CE0A8` |
| Chiffre endommagé | `#FF8A7A` |
| Coût réduit | `#9FD2FF` |

Chiffres : `Cinzel 700`, `tabular-nums`, `lineHeight: 1`. Corps : **coût 9.2cqw**, **stats 8.2cqw**.

### Règle des deux chiffres

Le corps du chiffre est **constant sur tout le jeu** — un 12 doit peser autant qu'un 3. C'est la **largeur** qui varie :

- ATK / PV : `12.8cqw` à un chiffre, **`17.4cqw` à deux**. Corps inchangé.
- Coût de mana : l'écu ne s'élargit pas (à `21cqw` il touche le bandeau de titre). Seule dérogation : corps `9.2cqw → 8.4cqw`.
- **Jamais trois chiffres** : borner l'affichage à 99. Au-delà, c'est un bug d'équilibrage, pas un cas d'affichage.

```tsx
// src/components/card/CardCounters.tsx
import React from 'react';

export const HERALDRY = {
  goldCost: '#C9A227',
  goldStat: '#B8952F',
  enamelCost: 'linear-gradient(175deg,#26467F,#0C1B3E)',
  enamelAtk:  'linear-gradient(175deg,#9E2B1C,#5A1109)',
  enamelHp:   'linear-gradient(175deg,#1C4A3E,#0A2620)',
  inkNeutral: '#F4EBD2',
  inkBuff:    '#8CE0A8',
  inkDebuff:  '#FF8A7A',
  inkCheap:   '#9FD2FF',
} as const;

const CLIP_COST = 'polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)';
const CLIP_STAT = 'polygon(0 0,100% 0,100% 74%,50% 100%,0 74%)';

export type Tone = 'neutral' | 'buff' | 'debuff';

const inkFor = (tone: Tone, cheap = false) =>
  tone === 'buff' ? HERALDRY.inkBuff
  : tone === 'debuff' ? HERALDRY.inkDebuff
  : cheap ? HERALDRY.inkCheap
  : HERALDRY.inkNeutral;

function Shield({ value, clip, gold, enamel, width, height, fontSize, ink, border }: {
  value: number; clip: string; gold: string; enamel: string;
  width: number; height: number; fontSize: number; ink: string; border: number;
}) {
  return (
    <div style={{
      position: 'relative', width: `${width}cqw`, height: `${height}cqw`,
      clipPath: clip, background: gold, display: 'grid', placeItems: 'center',
      filter: 'drop-shadow(0 0.6cqw 1cqw rgba(0,0,0,.45))',
    }}>
      <div style={{ position: 'absolute', inset: `${border}%`, clipPath: clip, background: enamel }} />
      <span style={{
        position: 'relative', zIndex: 1,
        fontFamily: "'Cinzel', Georgia, serif", fontWeight: 700,
        fontSize: `${fontSize}cqw`, lineHeight: 1, color: ink,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

export function CostShield({ value, discounted = false }: { value: number; discounted?: boolean }) {
  const shown = Math.min(99, Math.max(0, value));
  return (
    <div style={{ position: 'absolute', left: '2.6cqw', top: '2.6cqw', zIndex: 2 }}>
      <Shield value={shown} clip={CLIP_COST}
              gold={HERALDRY.goldCost} enamel={HERALDRY.enamelCost}
              width={17.4} height={17.4}
              fontSize={String(shown).length > 1 ? 8.4 : 9.2}
              ink={inkFor('neutral', discounted)} border={8} />
    </div>
  );
}

export function StatShields({ atk, hp, atkTone = 'neutral', hpTone = 'neutral' }:
  { atk: number; hp: number; atkTone?: Tone; hpTone?: Tone }) {
  const a = Math.min(99, Math.max(0, atk));
  const h = Math.min(99, Math.max(0, hp));
  const w = (v: number) => (String(v).length > 1 ? 17.4 : 12.8);
  return (
    <div style={{
      position: 'absolute', right: '2.4cqw', bottom: '8.4cqw',
      display: 'flex', alignItems: 'flex-end', gap: '1.6cqw', zIndex: 2,
    }}>
      <Shield value={a} clip={CLIP_STAT} gold={HERALDRY.goldStat} enamel={HERALDRY.enamelAtk}
              width={w(a)} height={14.6} fontSize={8.2} ink={inkFor(atkTone)} border={9} />
      <Shield value={h} clip={CLIP_STAT} gold={HERALDRY.goldStat} enamel={HERALDRY.enamelHp}
              width={w(h)} height={14.6} fontSize={8.2} ink={inkFor(hpTone)} border={9} />
    </div>
  );
}
```

## 4. Les jetons de coût additionnel

Cinq coûts, cinq silhouettes, un seul emplacement. Ce qui identifie un coût, c'est **sa forme et son émail** — pas un glyphe : à 19 px (taille réelle du jeton en vignette de deck), un glyphe ne dit plus rien, une silhouette et une couleur se lisent encore.

**Règle : une carte ne porte qu'un seul coût additionnel.** Ce n'est pas une limite technique mais une règle de design : le modèle de données doit la rendre impossible à violer (voir §7).

Tous les jetons partagent : la taille (`17 × 18.6 cqw`), le cerne `#C9A227`, le chiffre (Cinzel 700, `8.2cqw`, `#FFE7D6`, `tabular-nums`).

| Coût | Silhouette | `viewBox` | Émail (haut → bas) | `strokeWidth` | Décalage du chiffre |
|---|---|---|---|---|---|
| Vie | Goutte de sang | `0 0 100 126` | `#B93020` → `#470B05` | 5.5 | `translateY(4%)` |
| Défausse | Carte cornée | `0 0 100 110` | `#4E6B8C` → `#121D2B` | 5 | — |
| Sacrifice | Crâne | `0 0 100 110` | `#7C8188` → `#1A1E24` | 5 | `translateY(6%)` |
| Exil | Arche | `0 0 100 110` | `#8046C4` → `#220F3E` | 5 | `translateY(4%)` |
| Repli | Chevron | `0 0 100 110` | `#2F8A83` → `#0A2320` | 5 | `translateX(9%)` |

```
vie       M50 5 C57 32 88 62 88 86 a38 38 0 0 1 -76 0 C12 62 43 32 50 5 Z
défausse  M20 6 H62 L86 30 V96 A8 8 0 0 1 78 104 H20 A8 8 0 0 1 12 96 V14 A8 8 0 0 1 20 6 Z
          + le pli : M62 6 L86 30 H70 A8 8 0 0 1 62 22 Z
            (fill rgba(255,255,255,.22), stroke #C9A227, width 3)
sacrifice M50 4 C76 4 90 21 90 45 C90 60 84 69 75 75 L75 90 C75 99 69 104 60 104 L40 104
          C31 104 25 99 25 90 L25 75 C16 69 10 60 10 45 C10 21 24 4 50 4 Z
          + orbites : <ellipse cx="31" cy="45" rx="11" ry="12"/> et <ellipse cx="69" cy="45" rx="11" ry="12"/>
            (fill rgba(0,0,0,.6))
          + dents : M38 90 V104 M50 90 V104 M62 90 V104   (stroke rgba(0,0,0,.45), width 4)
exil      M14 104 V52 A36 36 0 0 1 86 52 V104 Z
repli     M92 10 H46 L8 57 L46 104 H92 Z
```

## 5. Le compteur d'Éveil

L'Éveil est un **coût alternatif**, pas un coût de plus : la carte peut être payée normalement en mana, ou éveillée par versements successifs. Les deux façons de payer s'affichent donc ensemble — **l'écu de mana reste à gauche, l'Éveil occupe le slot de droite**.

Forme : **écu renversé** (pointe en haut), émail nuit, dont l'intérieur se remplit d'ambre par le bas. Le chiffre décompte **ce qu'il reste à verser** — jamais ce qui a été versé. Il va du total à 0, et 0 signifie « la carte peut entrer en jeu ».

| Propriété | Valeur |
|---|---|
| Tracé | `M50 4 L96 42 V104 H4 V42 Z` (`viewBox="0 0 100 110"`) |
| Émail | `#1E3663` → `#091326` |
| Jauge | `#FFD277` → `#A8620B`, opacité .9, découpée au `clipPath` du tracé |
| Ligne de niveau | bandeau `#FFF0C4` de 2.4 unités au sommet de la jauge, **seulement** entre 1 et total−1 |
| Cerne | `#C9A227`, `strokeWidth: 5`, tracé **par-dessus** la jauge |
| Chiffre | Cinzel 700, `8.2cqw`, `#FFF1D8`, `translateY(5%)` |

## 6. Le composant des jetons

Un seul fichier gère les six silhouettes (cinq coûts + Éveil) et leur empilement.

```tsx
// src/components/card/CardTokens.tsx
import React from 'react';

export type CostType = 'vie' | 'defausse' | 'sacrifice' | 'exil' | 'repli';

type Shape = {
  vb: string; from: string; to: string; sw: number; shift: string;
  d: string; extra?: React.ReactNode;
};

const SHAPES: Record<CostType, Shape> = {
  vie: {
    vb: '0 0 100 126', from: '#B93020', to: '#470B05', sw: 5.5, shift: 'translateY(4%)',
    d: 'M50 5 C57 32 88 62 88 86 a38 38 0 0 1 -76 0 C12 62 43 32 50 5 Z',
  },
  defausse: {
    vb: '0 0 100 110', from: '#4E6B8C', to: '#121D2B', sw: 5, shift: 'none',
    d: 'M20 6 H62 L86 30 V96 A8 8 0 0 1 78 104 H20 A8 8 0 0 1 12 96 V14 A8 8 0 0 1 20 6 Z',
    extra: <path d="M62 6 L86 30 H70 A8 8 0 0 1 62 22 Z" fill="rgba(255,255,255,.22)"
                 stroke="#C9A227" strokeWidth="3" strokeLinejoin="round" />,
  },
  sacrifice: {
    vb: '0 0 100 110', from: '#7C8188', to: '#1A1E24', sw: 5, shift: 'translateY(6%)',
    d: 'M50 4 C76 4 90 21 90 45 C90 60 84 69 75 75 L75 90 C75 99 69 104 60 104 L40 104 '
     + 'C31 104 25 99 25 90 L25 75 C16 69 10 60 10 45 C10 21 24 4 50 4 Z',
    extra: (
      <>
        <ellipse cx="31" cy="45" rx="11" ry="12" fill="rgba(0,0,0,.6)" />
        <ellipse cx="69" cy="45" rx="11" ry="12" fill="rgba(0,0,0,.6)" />
        <path d="M38 90 V104 M50 90 V104 M62 90 V104" stroke="rgba(0,0,0,.45)" strokeWidth="4" />
      </>
    ),
  },
  exil: {
    vb: '0 0 100 110', from: '#8046C4', to: '#220F3E', sw: 5, shift: 'translateY(4%)',
    d: 'M14 104 V52 A36 36 0 0 1 86 52 V104 Z',
  },
  repli: {
    vb: '0 0 100 110', from: '#2F8A83', to: '#0A2320', sw: 5, shift: 'translateX(9%)',
    d: 'M92 10 H46 L8 57 L46 104 H92 Z',
  },
};

const TOKEN_DIGIT: React.CSSProperties = {
  position: 'relative', zIndex: 1,
  fontFamily: "'Cinzel', Georgia, serif", fontWeight: 700, fontSize: '8.2cqw',
  lineHeight: 1, color: '#FFE7D6', fontVariantNumeric: 'tabular-nums',
  textShadow: '0 .3cqw .7cqw rgba(0,0,0,.8)',
};

const SVG_FILL: React.CSSProperties = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible',
};

/** Jeton de coût additionnel — rendu SANS position : c'est <RightSlots> qui place. */
function CostToken({ type, value }: { type: CostType; value: number }) {
  const s = SHAPES[type];
  const gid = `am-cost-${type}`;
  return (
    <>
      <svg viewBox={s.vb} aria-hidden="true" style={SVG_FILL}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.from} /><stop offset="1" stopColor={s.to} />
          </linearGradient>
        </defs>
        <path d={s.d} fill={`url(#${gid})`} stroke="#C9A227" strokeWidth={s.sw} strokeLinejoin="round" />
        {s.extra}
      </svg>
      <span style={{ ...TOKEN_DIGIT, transform: s.shift }}>{Math.min(99, value)}</span>
    </>
  );
}

const AWAKEN_D = 'M50 4 L96 42 V104 H4 V42 Z';

/** Écu d'Éveil à jauge — rendu SANS position, comme CostToken. */
function AwakenToken({ total, paid }: { total: number; paid: number }) {
  const left = Math.max(0, total - paid);
  const y = 110 - 110 * Math.min(1, paid / total);
  const partial = paid > 0 && paid < total;
  return (
    <>
      <svg viewBox="0 0 100 110" aria-hidden="true" style={SVG_FILL}>
        <defs>
          <clipPath id="am-awaken-clip"><path d={AWAKEN_D} /></clipPath>
          <linearGradient id="am-awaken-enamel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1E3663" /><stop offset="1" stopColor="#091326" />
          </linearGradient>
          <linearGradient id="am-awaken-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD277" /><stop offset="1" stopColor="#A8620B" />
          </linearGradient>
        </defs>
        <path d={AWAKEN_D} fill="url(#am-awaken-enamel)" />
        <rect x="0" y={y} width="100" height={110 - y} fill="url(#am-awaken-fill)"
              clipPath="url(#am-awaken-clip)" opacity={0.9}
              style={{ transition: 'y 240ms ease-out, height 240ms ease-out' }} />
        {partial && <rect x="0" y={y} width="100" height="2.4" fill="#FFF0C4"
                          clipPath="url(#am-awaken-clip)" opacity={0.95} />}
        <path d={AWAKEN_D} fill="none" stroke="#C9A227" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span style={{
        ...TOKEN_DIGIT, color: '#FFF1D8', transform: 'translateY(5%)',
        fontSize: String(left).length > 1 ? '7cqw' : '8.2cqw',
      }}>{Math.min(99, left)}</span>
    </>
  );
}

/**
 * Colonne de droite : l'Éveil d'abord, le coût additionnel ensuite.
 * Deux slots maximum — le troisième est ignoré, et signalé en dev.
 */
export function RightSlots({ awaken, cost }: {
  awaken?: { total: number; paid: number };
  cost?: { type: CostType; value: number };
}) {
  const items: React.ReactNode[] = [];
  if (awaken?.total) items.push(<AwakenToken key="aw" total={awaken.total} paid={awaken.paid} />);
  if (cost?.value)   items.push(<CostToken  key="ct" type={cost.type} value={cost.value} />);
  if (items.length > 2 && process.env.NODE_ENV !== 'production') {
    console.warn('[card] plus de deux jetons dans le coin droit — les suivants sont ignorés');
  }
  return (
    <>
      {items.slice(0, 2).map((node, i) => (
        <div key={i} style={{
          position: 'absolute', right: '2.6cqw', top: `${2.6 + i * 20.9}cqw`,
          width: '17cqw', height: '18.6cqw', display: 'grid', placeItems: 'center', zIndex: 3,
        }}>{node}</div>
      ))}
    </>
  );
}
```

### Montage dans la carte

```tsx
<div
  style={{
    position: 'relative',
    width: size,                    // seule valeur en px du composant
    aspectRatio: '552 / 766',
    containerType: 'inline-size',   // <- indispensable : tout le reste est en cqw
    borderRadius: '3.4%',
    overflow: 'hidden',
  }}
  aria-label={ariaLabel(card)}
>
  <img src={card.art} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  {/* titre, icônes de bas de carte… inchangés */}

  <CostShield value={card.cost} discounted={card.cost < card.baseCost} />

  <RightSlots awaken={card.awaken} cost={card.additionalCost} />

  {!isSpell && (
    <StatShields
      atk={card.atk} hp={card.hp}
      atkTone={card.atk > card.baseAtk ? 'buff' : card.atk < card.baseAtk ? 'debuff' : 'neutral'}
      hpTone={card.hp > card.baseHp ? 'buff' : card.hp < card.baseHp ? 'debuff' : 'neutral'}
    />
  )}
</div>
```

## 7. Modèle de données

```ts
type Card = {
  // …
  cost: number;
  additionalCost?: { type: CostType; value: number };   // UN objet, jamais un tableau
  awaken?: { total: number; paid: number };
};
```

`additionalCost` est un **objet unique** : la règle « un seul coût additionnel » est ainsi inscrite dans les types plutôt que vérifiée à l'exécution. Si le modèle actuel expose un tableau, le migrer et **faire échouer la migration** sur toute carte qui en déclare deux, avec un message explicite.

Si la défausse est aujourd'hui rendue par l'icône jaune en bas à gauche, elle devient un `additionalCost` : **retirer l'icône**, sinon le coût est affiché deux fois. Même vérification pour les autres coûts qui auraient déjà une icône.

## 8. Cas limites

1. **Sorts et emblèmes** : pas de `StatShields`. Le coût et les jetons restent.
2. **Carte sans coût** (jeton généré, carte conquise jouée gratuitement) : masquer aussi `CostShield` plutôt qu'afficher un 0.
3. **Coût réduit** : `discounted` passe le chiffre en `#9FD2FF`. L'or ne change jamais.
4. **Dégâts en cours de tour** : les PV passent en `debuff` dès que `hp < baseHp`, sans attendre la fin de la pile.
5. **Versement d'Éveil** : `paid` peut augmenter de n'importe quelle valeur, plusieurs fois par tour. La jauge s'anime depuis sa hauteur courante — jamais depuis 0.
6. **Éveil terminé** (`left === 0`) : jauge pleine, pas de ligne de niveau, chiffre 0 affiché, halo ambré optionnel sur le slot.
7. **Deux écus voisins** : l'écu de mana (debout, bleu) et l'écu d'Éveil (renversé, nuit + ambre) sont proches. Si le coup d'œil hésite en test de jeu, assombrir l'émail du mana ou garder l'Éveil ambré même à 0 versé — ne pas changer les silhouettes.
8. **Deux jetons empilés** : le second descend à `top: 23.5cqw`. Vérifier sur les illustrations dont le sujet est en haut à droite qu'il ne mord pas sur l'essentiel — c'est le cas à limiter au maximum côté création de cartes.
9. **Animation** : cibler le conteneur du slot (`transform`), jamais la largeur ni le tracé. Lire `window.matchMedia('(prefers-reduced-motion: reduce)')` avant d'animer, puisqu'il n'y a pas de feuille CSS pour le faire.
10. **`id` SVG** : les dégradés sont nommés globalement (`am-cost-vie`, `am-awaken-fill`…) et partagés entre toutes les cartes — c'est voulu, puisqu'ils sont identiques. Ne pas introduire de teinte par carte ou par faction sans suffixer ces `id`.
11. **Accessibilité** : construire l'`aria-label` de la carte à partir de tout ce qui est affiché — `« Démon des Ombres, coût 1, défausse 1, attaque 2, points de vie 1 »`, et pour l'Éveil `« …, Éveil : 3 mana restants sur 7 »`.

## 9. Vérifications attendues

- [ ] Rendu correct à 118 px (vignette deck), 210 px (main) et 360 px (plateau) — mêmes proportions, aucun point de rupture.
- [ ] `3 / 3 / 2` et `10 / 12 / 11` côte à côte : corps de chiffre identique, seule la largeur de l'écu diffère.
- [ ] Les cinq jetons rendus côte à côte : cinq silhouettes distinctes, cinq émaux distincts, même encombrement — et à 19 px chacun reste identifiable à la forme et à la couleur.
- [ ] Le bleu de la défausse ne se confond pas avec l'écu de mana — vérifier sur une carte de faction bleue.
- [ ] Le crâne du sacrifice garde ses orbites lisibles à 19 px.
- [ ] Jauge d'Éveil : trois cartes à 1/7, 4/7 et 6/7 s'ordonnent d'un coup d'œil, sans lire les chiffres.
- [ ] Le chiffre d'Éveil décompte le restant, jamais le versé (piège classique à la relecture).
- [ ] Un versement anime la hauteur depuis sa valeur courante.
- [ ] Une carte avec Éveil + coût additionnel affiche deux jetons alignés à droite, le second à `23.5cqw`, sans recouvrement.
- [ ] Aucune carte n'affiche à la fois un jeton et une icône de coût en bas de carte.
- [ ] `additionalCost` est un objet unique dans le modèle, et la migration a échoué proprement sur les cartes à deux coûts.
- [ ] Les icônes de bas de carte et le bandeau de titre sont strictement inchangés (diff visuel à l'appui).
- [ ] Aucune règle CSS ajoutée : le diff ne contient que du TSX et des objets de style.

## 10. Ordre de travail suggéré

1. **Repérage, sans écrire** : lire ce brief, localiser le composant de carte et tous ses points d'appel, lister ce qui va changer et les endroits où l'ancien rendu des compteurs est dupliqué.
2. **Implémentation** : `CardCounters.tsx`, puis `CardTokens.tsx`, puis le montage dans la carte, puis la migration du modèle de données.
3. **Page de contrôle** : une route `/card-lab` (dev uniquement) rendant la même carte dans neuf cas — `3/3/2`, `10/12/11`, sort sans stats, PV buffés, PV endommagés, un jeton de chaque type, Éveil 4/7, Éveil + défausse empilés, et la série en vignette 118 px. Screenshots Playwright des neuf.
