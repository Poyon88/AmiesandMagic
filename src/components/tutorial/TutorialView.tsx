"use client";

// Prose-heavy French content lives directly in JSX here (unlike the menu, which
// routes copy through the i18n dict). Disable the apostrophe-escaping rule so
// the text stays readable (l'invocation, d'un tour, …) without &apos; noise.
/* eslint-disable react/no-unescaped-entities */

import { useMemo, useState } from "react";
import HomeHeader from "@/components/home/HomeHeader";
import KeywordIcon from "@/components/shared/KeywordIcon";
import AmAtmosphere from "@/components/ui/AmAtmosphere";
import AmHeading from "@/components/ui/AmHeading";
import AmPanel from "@/components/ui/AmPanel";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { ABILITIES, CREATURE_ABILITIES, SPELL_ABILITIES } from "@/lib/game/abilities";
import { FACTIONS, getAllClanNames } from "@/lib/card-engine/constants";
import {
  HERO_MAX_HP,
  DECK_SIZE,
  STARTING_HAND_SIZE,
  FIRST_PLAYER_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_BOARD_SIZE,
  MAX_MANA,
  STARTING_MANA,
  MAX_SAME_CAPABILITY,
  CAPABILITY_LIMIT_OVERRIDES,
  MAX_EPARGNE,
  MAX_FOI,
  MAX_CONQUETE,
  MAX_INVENTIONS_MACHINE,
  EXPLORATION_PALIER,
  MAX_EVEIL,
} from "@/lib/game/constants";
import { HERO_HP_MIN, HERO_HP_MAX } from "@/lib/game/hero-hp";
import { regleDecouverteActivee } from "@/lib/game/decouverte";
import { keywordModeColor } from "@/lib/game/keyword-labels";
import type { Emblem, KeywordMode } from "@/lib/game/types";
import { CostShield, EquipToken, StatShields } from "@/components/card/CardCounters";
import { RightSlots, type CostType } from "@/components/card/CardTokens";
import ComposedMarker from "@/components/cards/ComposedMarker";
import AllAlliesMarker from "@/components/cards/AllAlliesMarker";
import CounterMedallion, { MachineGear } from "@/components/game/orbite/CounterMedallion";
import CounterIcon, { type CounterKind } from "@/components/game/orbite/counter-icons";
import EmblemDiamond from "@/components/game/orbite/EmblemDiamond";

// ── Design tokens (Arcane War-Codex design system) ────────────────────────────
const cinzel = "font-[family-name:var(--font-cinzel),serif]";
const crimson = "font-[family-name:var(--font-crimson),serif]";

/** Carte « vitrine » illustrant un clan ou une faction, choisie côté serveur. */
export interface ClanVisual {
  id: number;
  name: string;
  imageUrl: string;
  rarity?: string | null;
}

interface TutorialViewProps {
  username: string;
  goldBalance: number;
  clanVisuals?: Record<string, ClanVisual>;
  factionVisuals?: Record<string, ClanVisual[]>;
}

type Track = "beginner" | "tcg" | "factions";

/** « Chant : 24 » — liste lisible des capacités qui dérogent au plafond commun.
 *  DÉRIVÉE de CAPABILITY_LIMIT_OVERRIDES, jamais recopiée : une dérogation
 *  ajoutée au moteur sans être annoncée ici ferait mentir les règles du jeu. */
const DEROGATIONS_PLAFOND = [...CAPABILITY_LIMIT_OVERRIDES]
  .map(([id, max]) => `${ABILITIES[id]?.creature?.label ?? ABILITIES[id]?.label ?? id} : ${max}`)
  .join(", ");

export default function TutorialView({
  username, goldBalance, clanVisuals = {}, factionVisuals = {},
}: TutorialViewProps) {
  const t = useTranslations("home");
  const tt = useTranslations("tutorial");
  const [track, setTrack] = useState<Track>("beginner");

  return (
    <div className="min-h-screen bg-am-bg-0 text-am-ink">
      <AmAtmosphere />

      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/"
        backLabel={t('tutorial_back')}
      />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-20 min-h-screen"
      >
        {/* Title */}
        <div className="am-animate-rise mb-10 md:mb-12">
          <AmHeading
            as="h1"
            eyebrow={tt('page_eyebrow')}
            subtitle={tt('page_subtitle')}
          >
            {tt('page_title')}
          </AmHeading>
        </div>

        {/* Track switch */}
        <div className="flex justify-center gap-3 mb-10 am-animate-fade" style={{ animationDelay: "120ms" }}>
          <TrackButton active={track === "beginner"} onClick={() => setTrack("beginner")} label={tt('track_beginner')} />
          <TrackButton active={track === "tcg"} onClick={() => setTrack("tcg")} label={tt('track_tcg')} />
          <TrackButton active={track === "factions"} onClick={() => setTrack("factions")} label={tt('track_factions')} />
        </div>

        <div className="max-w-4xl mx-auto">
          {track === "beginner" && <BeginnerGuide />}
          {track === "tcg" && <TcgGuide />}
          {track === "factions" && (
            <FactionsGuide clanVisuals={clanVisuals} factionVisuals={factionVisuals} />
          )}

          {/* Keyword reference — auto-generated from the ability registry. Hors
              de l'onglet Factions, qui décrit des camps et non des mots-clés. */}
          {track !== "factions" && <KeywordReference />}
        </div>
      </main>
    </div>
  );
}

// ── Track toggle button ───────────────────────────────────────────────────────
function TrackButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`${cinzel} am-btn ${active ? "am-btn-gold am-btn-sheen" : "am-btn-ghost"} px-4 py-2 text-sm md:text-base`}
    >
      {label}
    </button>
  );
}

// ── Shared layout primitives ──────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9 am-animate-rise">
      <AmHeading as="h2" align="left" className="mb-5">
        {title}
      </AmHeading>
      <AmPanel corners className="p-5 md:p-7">
        {children}
      </AmPanel>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className={`${crimson} text-am-ink/90 leading-[1.85] mb-4 last:mb-0`} style={{ fontSize: 17 }}>
      {children}
    </p>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="am-gild-border rounded-[var(--am-r-md)] bg-am-bg-1 px-4 py-3 text-center">
      <div className={`${cinzel} am-foil-text font-bold`} style={{ fontSize: 22 }}>{value}</div>
      <div className={`${crimson} italic text-am-ink-soft mt-1`} style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={i} className={`${crimson} text-am-ink/90 leading-[1.8] flex gap-3`} style={{ fontSize: 16 }}>
          <span className="text-am-gold-bright shrink-0 mt-0.5" aria-hidden="true">◆</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const Hi = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-am-gold-bright font-semibold">{children}</strong>
);

// ── Visuels de démonstration ──────────────────────────────────────────────────
// Les écus, jetons, médaillons et losanges ci-dessous sont les COMPOSANTS DU JEU,
// pas des images : la page suit d'elle-même toute retouche de leur dessin.

/** Gabarit de carte vide (proportions d'une GameCard) : conteneur de taille pour
 *  les écus, dimensionnés en cqw comme sur une vraie carte. */
function Demo({ legende, children, pointe = false, petite = false }: {
  legende: string; children: React.ReactNode; pointe?: boolean; petite?: boolean;
}) {
  const w = petite ? 96 : 124;
  return (
    <figure className="m-0 flex flex-col items-center" style={{ width: w + 24 }}>
      <div style={{
        position: "relative", width: w, height: Math.round(w * 1.4), containerType: "inline-size",
        background: "linear-gradient(160deg, #24243c, #0d0d1a)",
        border: pointe ? "none" : "2px solid #3d3d5c", borderRadius: pointe ? 0 : 8,
        clipPath: pointe ? "polygon(0 0, 100% 0, 100% 92%, 50% 100%, 0 92%)" : undefined,
      }}>
        {children}
      </div>
      <figcaption className={`${crimson} italic text-am-ink-soft mt-2 text-center leading-tight`} style={{ fontSize: 13 }}>
        {legende}
      </figcaption>
    </figure>
  );
}

/** Élément d'orbite isolé, avec sa légende. */
function Pastille({ legende, children }: { legende: string; children: React.ReactNode }) {
  return (
    <figure className="m-0 flex flex-col items-center" style={{ width: 96 }}>
      <div className="flex items-center justify-center" style={{ height: 56 }}>{children}</div>
      <figcaption className={`${crimson} italic text-am-ink-soft mt-1 text-center leading-tight`} style={{ fontSize: 13 }}>
        {legende}
      </figcaption>
    </figure>
  );
}

/** Une même icône de capacité, déclinée par déclencheur et par marqueur. */
function IconeDemo({ mode, compose = false, toutes = false, soi = false, singulier = false, barree = false }: {
  mode?: KeywordMode; compose?: boolean; toutes?: boolean; soi?: boolean; singulier?: boolean; barree?: boolean;
}) {
  return (
    <span className="shrink-0 inline-flex items-center justify-center rounded-[var(--am-r-sm)] bg-am-bg-0 border border-am-gold/30"
      style={{ width: 40, height: 40 }}>
      <span style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
        <KeywordIcon symbol="💥" keyword="impact" size={26} mode={mode} singulier={singulier} barred={barree} />
        {compose && <ComposedMarker mode={mode} size={9} />}
        {toutes && <AllAlliesMarker size={11} color={keywordModeColor(mode)} />}
        {soi && <AllAlliesMarker letter="S" size={11} color={keywordModeColor(mode)} label="Sur elle-même" />}
      </span>
    </span>
  );
}

function Marqueur({ icone, nom, children }: { icone: React.ReactNode; nom: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 am-gild-border rounded-[var(--am-r-md)] bg-am-bg-1 px-3 py-2.5">
      {icone}
      <div className="min-w-0">
        <div className={`${cinzel} text-am-gold-bright font-semibold`} style={{ fontSize: 14 }}>{nom}</div>
        <div className={`${crimson} text-am-ink-soft leading-snug`} style={{ fontSize: 14 }}>{children}</div>
      </div>
    </div>
  );
}

/** Poignées de bulle neutres : sur cette page, les éléments d'orbite sont des
 *  illustrations, leur texte est écrit juste à côté. */
const BULLE_INERTE = { attacher: () => {}, consume: () => false, handlers: {} };

const COUTS_DEMO: { type: CostType; legende: string }[] = [
  { type: "vie", legende: "Vie : 2 PV" },
  { type: "defausse", legende: "Défausse : 2 cartes" },
  { type: "sacrifice", legende: "Sacrifice : 2 alliés" },
  { type: "exil", legende: "Exil : 2 cartes du deck" },
  { type: "repli", legende: "Repli : 2 cartes remises" },
];

const COMPTEURS_DEMO: { kind: CounterKind; teinte: string; total: number; valeur: number; legende: string }[] = [
  { kind: "epargne", teinte: "var(--orbit-epargne)", total: MAX_EPARGNE, valeur: 4, legende: "Épargne" },
  { kind: "foi", teinte: "var(--orbit-foi)", total: MAX_FOI, valeur: 3, legende: "Foi" },
  { kind: "conquete", teinte: "var(--orbit-conquete)", total: MAX_CONQUETE, valeur: 2, legende: "Conquête" },
  { kind: "exploration", teinte: "var(--orbit-exploration)", total: EXPLORATION_PALIER, valeur: 1, legende: "Exploration" },
];

const EMBLEMES_DEMO: { e: Emblem; legende: string }[] = [
  { e: { abilityId: "commandement", params: { amount: 1 }, stacks: 1 }, legende: "Permanent" },
  { e: { abilityId: "terreur", stacks: 1, duration: 2 }, legende: "À durée (2 tours)" },
  { e: { composed: { content: "deal_damage", magnitude: { x: 1 }, target: { entity: "hero", count: 1, side: "enemy", location: "board", designation: "automatic" } }, trigger: "on_end_of_turn", stacks: 2 }, legende: "Déclenché, posé 2 fois" },
  { e: { abilityId: "terreur", stacks: 1, malediction: true }, legende: "Malédiction adverse" },
];

const DECLENCHEURS_DEMO: { mode?: KeywordMode; nom: string; quand: string }[] = [
  { nom: "Blanc — permanent", quand: "Passif, aura ou râle d'agonie : actif tant que la carte est là." },
  { mode: "entry", nom: "Jaune — entrée en jeu / action", quand: "Quand la créature arrive en jeu, ou quand l'action se résout." },
  { mode: "tap", nom: "Orange — activation", quand: "Pouvoir que vous déclenchez en cliquant la créature, une fois par tour (pas le tour de son arrivée, sauf Traque)." },
  { mode: "attack", nom: "Magenta — à l'attaque", quand: "Chaque fois que la créature attaque, avant les dégâts du combat." },
  { mode: "death", nom: "Rouge sombre — à la mort", quand: "Quand la créature meurt." },
  { mode: "wound", nom: "Vert citron — blessure", quand: "Quand la créature est blessée sans mourir (une fois par tour)." },
  { mode: "low_hp", nom: "Violet — sous 15 PV", quand: "Quand votre héros passe sous 15 points de vie." },
  { mode: "start_of_turn", nom: "Argent — début du tour", quand: "Au début de chacun de vos tours." },
  { mode: "end_of_turn", nom: "Vert — fin du tour", quand: "À la fin de chacun de vos tours." },
  { mode: "return", nom: "Bleu — retour en main", quand: "Quand la carte revient dans votre main." },
  { mode: "draw", nom: "Cyan — à la pioche", quand: "Quand vous piochez cette carte." },
  { mode: "delay", nom: "Ambre — retard X", quand: "Une seule fois, au début de votre X-ième tour suivant (1 à 3)." },
];

// ── Beginner guide (complete) ─────────────────────────────────────────────────
function BeginnerGuide() {
  const tt = useTranslations("tutorial");
  return (
    <>
      <Section title={tt('goal_title')}>
        <P>
          Chaque joueur incarne un <Hi>héros</Hi> qui démarre avec <Hi>{HERO_HP_MIN} à {HERO_HP_MAX} points de
          vie</Hi> selon le héros ({HERO_MAX_HP} le plus souvent) : un pouvoir puissant se paie de quelques PV en
          moins, un pouvoir modeste se compense par quelques PV en plus. Vous gagnez
          la partie en réduisant les points de vie du héros adverse à <Hi>0</Hi>. Pour cela, vous invoquez des
          créatures et jouez des actions.
        </P>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <Stat value={`${HERO_HP_MIN}–${HERO_HP_MAX} PV`} label={tt('stat_hero_start')} />
          <Stat value={`${FIRST_PLAYER_HAND_SIZE} ou ${STARTING_HAND_SIZE} cartes`} label={tt('stat_starting_hand')} />
          <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label={tt('stat_mana_growth')} />
          <Stat value={`${MAX_BOARD_SIZE}`} label={tt('stat_max_board')} />
        </div>
      </Section>

      <Section title="Lire une carte">
        <P>
          Tous les chiffres d'une carte ont une place fixe, la même en main, sur le terrain et dans la bulle de
          détail qui s'ouvre au survol (ou à l'appui long sur tablette) — celle-ci ajoute le texte des capacités
          sans jamais recouvrir les écus.
        </P>
        <div className="flex flex-wrap justify-center gap-6 my-5">
          <Demo legende="Créature : coût 4, attaque 3, PV 5">
            <CostShield value={4} />
            <StatShields atk={3} hp={5} />
          </Demo>
          <Demo legende="Action : coût seul, pointe basse" pointe>
            <CostShield value={2} />
          </Demo>
          <Demo legende="Objet : coût de pose, coût d'équipement, bonus">
            <CostShield value={2} />
            <EquipToken value={1} />
            <StatShields atk={2} hp={1} bonus />
          </Demo>
        </div>
        <Bullets items={[
          <><Hi>Écu bleu, en haut à gauche</Hi> : le coût en mana. Un chiffre bleu clair signale un coût réduit.</>,
          <><Hi>Écus du bas, à droite</Hi> : l'attaque (rouge) et les points de vie (vert) d'une créature. Un chiffre
            vert signale un bonus, un chiffre rouge une valeur diminuée.</>,
          <><Hi>Jetons en haut à droite</Hi> : les coûts additionnels et l'éveil (détaillés plus bas). Survolez-en un
            pour lire ce qu'il demande.</>,
          <><Hi>Barre du bas</Hi> : une icône par capacité, teintée selon son déclencheur (voir « Les déclencheurs »).</>,
        ]} />
        <P>
          Les <Hi>objets</Hi> sont le troisième type de carte. Ils occupent une place du terrain mais restent
          inertes : ni attaquables, ni comptés comme des unités. On paie leur coût pour les poser, puis leur
          <Hi> coût d'équipement</Hi> (le cartouche sous le mana) pour les fixer sur une créature alliée — une seule
          par créature — qui reçoit alors leurs bonus « +X/+Y » et leurs capacités. On peut les rééquiper à
          volonté, en repayant ce coût ; si le porteur meurt, l'objet reste en jeu, déséquipé.
        </P>
      </Section>

      <Section title={tt('turn_title')}>
        <P>{tt('turn_intro')}</P>
        <Bullets items={[
          <>Votre <Hi>mana maximum augmente de 1</Hi> (jusqu'à {MAX_MANA}), puis votre mana est entièrement rechargé.</>,
          regleDecouverteActivee()
            ? <>Vous <Hi>piochez 1 carte</Hi> — sauf <Hi>un tour sur deux</Hi> (vos 2ᵉ, 4ᵉ, 6ᵉ tours…) : la pioche
              est alors remplacée par une <Hi>découverte</Hi>. Vous choisissez 1 carte parmi 3 Communes de coûts
              variés, 2 de votre clan et 1 d'un autre clan de votre faction. La carte est créée pour vous : votre
              deck n'est pas entamé.</>
            : <>Vous <Hi>piochez 1 carte</Hi>.</>,
          <>Vos créatures se « réveillent » : elles peuvent de nouveau attaquer ce tour-ci.</>,
          <>Vous jouez autant de cartes que votre mana le permet, vous attaquez, puis vous passez la main.</>,
        ]} />
        <P>
          La <Hi>première</Hi> partie commence à {STARTING_MANA} mana : le mana est la ressource clé, et elle grandit
          à chaque tour. Commencer est un avantage — on pose sa créature avant l'autre et on attaque un tour plus
          tôt — alors le jeu le compense de deux façons : le joueur qui commence <Hi>en second</Hi> reçoit une
          <Hi> Étincelle de mana</Hi> (+1 mana pour son premier tour), et le joueur qui commence en premier démarre
          avec <Hi>une carte de moins</Hi>.
        </P>
      </Section>

      <Section title={tt('hand_title')}>
        <P>
          Vous démarrez avec <Hi>{STARTING_HAND_SIZE} cartes</Hi> — ou <Hi>{FIRST_PLAYER_HAND_SIZE}</Hi> si c'est
          vous qui commencez — et pouvez en remplacer autant que vous voulez lors
          du <Hi>mulligan</Hi> (avant le début de la partie). Votre main peut contenir au maximum
          <Hi> {MAX_HAND_SIZE} cartes</Hi> — au-delà, les cartes piochées sont perdues. Si votre deck est vide et que
          vous devez piocher, vous subissez des dégâts de <Hi>fatigue</Hi> croissants.
        </P>
      </Section>

      <Section title={tt('creatures_title')}>
        <P>
          Une créature a une <Hi>attaque (ATK)</Hi> et des <Hi>points de vie (PV)</Hi>. Quand vous l'invoquez, elle
          arrive avec le <Hi>mal d'invocation</Hi> : elle ne peut pas attaquer le tour où elle est posée (sauf si elle
          possède la capacité <Hi>Traque</Hi>). Dès le tour suivant, elle peut attaquer une créature ennemie ou le
          héros adverse. Le terrain accueille jusqu'à <Hi>{MAX_BOARD_SIZE} créatures</Hi>.
        </P>
      </Section>

      <Section title={tt('spells_title')}>
        <P>
          Une action produit un effet immédiat puis part au <Hi>cimetière</Hi>. Certaines actions nécessitent une
          <Hi> cible</Hi> (une créature, un héros…). Une action peut aussi <Hi>conférer une capacité de
          créature</Hi> — à une créature ciblée, ou à toutes vos unités alliées (icône marquée d'un
          « A »).
        </P>
        <P>
          Certaines cartes, actions comme créatures, posent un <Hi>emblème</Hi> : un effet permanent attaché à un
          <Hi> joueur</Hi> et non à une carte. Il survit à la disparition de sa source (créature morte, action
          résolue) et se réveille à chaque cadence choisie — entrée en jeu, attaque, mort, fin de tour… — chez le
          joueur qu'il affecte, jusqu'à la fin de la partie ou de sa durée.
        </P>
      </Section>

      <Section title={tt('combat_title')}>
        <P>
          Quand une créature en attaque une autre, les deux s'infligent <Hi>simultanément</Hi> leur attaque. Si elle
          attaque le héros adverse, elle lui inflige son ATK. Quelques règles importantes :
        </P>
        <Bullets items={[
          <><Hi>Provocation</Hi> : vous devez d'abord attaquer les créatures ennemies qui ont Provocation… sauf avec une créature qui a <Hi>Vol</Hi>.</>,
          <><Hi>Bouclier</Hi> : absorbe la première blessure subie.</>,
          <><Hi>Première Frappe</Hi> : frappe avant l'adversaire (qui ne riposte que s'il survit).</>,
          <><Hi>Résistance X</Hi> réduit les dégâts reçus, <Hi>Armure</Hi> divise par deux les dégâts de combat.</>,
          <><Hi>Esquive</Hi> évite la première attaque du tour.</>,
        ]} />
        <P>{tt('combat_see_full_list')}</P>
      </Section>

      <Section title="Les déclencheurs : couleurs et marqueurs">
        <P>
          La <Hi>couleur</Hi> d'une icône de capacité dit <Hi>quand</Hi> elle agit. Une icône <Hi>blanche</Hi> est un
          effet permanent : un passif (Vol, Provocation…), une aura ou un râle d'agonie. Toutes les autres se
          déclenchent à un moment précis :
        </P>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
          {DECLENCHEURS_DEMO.map(({ mode, nom, quand }) => (
            <div key={nom} className="flex items-start gap-3 am-gild-border rounded-[var(--am-r-md)] bg-am-bg-1 px-3 py-2.5">
              <IconeDemo mode={mode} />
              <div className="min-w-0">
                <div className={`${cinzel} font-semibold`} style={{ fontSize: 14, color: (mode && keywordModeColor(mode)) || "#fff" }}>{nom}</div>
                <div className={`${crimson} text-am-ink-soft leading-snug`} style={{ fontSize: 14 }}>{quand}</div>
              </div>
            </div>
          ))}
        </div>
        <P>Quelques marqueurs complètent l'icône :</P>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-5">
          <Marqueur icone={<IconeDemo mode="death" compose />} nom="✦ Effet composé">
            Une étincelle en haut à droite, de la couleur du déclencheur. L'effet est assemblé à partir d'un
            déclencheur, d'un contenu et d'une cible — par exemple « À la mort : inflige 2 dégâts à toutes les
            créatures ennemies ». Son texte exact est dans la bulle de détail.
          </Marqueur>
          <Marqueur icone={<IconeDemo mode="entry" toutes />} nom="« A » : toutes les unités">
            Un « A » en bas à gauche : au lieu d'une cible choisie, la capacité frappe toutes les unités d'un camp
            (ou des deux). Sur une action, il signale une capacité conférée à toutes vos unités.
          </Marqueur>
          <Marqueur icone={<IconeDemo mode="entry" soi />} nom="« S » : sur elle-même">
            Un « S » au même endroit : la capacité s'applique à l'unité qui la porte, et non à une autre unité
            comme sur une action — par exemple un Renforcement que la créature se donne à elle-même.
          </Marqueur>
          <Marqueur icone={<span className="inline-flex items-center gap-1"><IconeDemo mode="spell" compose /><span className={`${cinzel} text-am-ink-soft font-bold`}>/</span><IconeDemo mode="spell" compose /></span>} nom="« / » : l'un OU l'autre">
            Deux effets composés séparés par une barre forment un choix : à la résolution, vous n'en jouez
            qu'un, celui que vous désignez.
          </Marqueur>
          <Marqueur icone={<IconeDemo mode="entry" singulier />} nom="Icône bicolore : Singulier">
            Turquoise d'un côté, couleur du déclencheur de l'autre : la capacité n'agit que si votre deck de départ
            n'avait aucun doublon (voir plus bas).
          </Marqueur>
          <Marqueur icone={<IconeDemo barree />} nom="Icône barrée : neutralisée">
            Un trait rouge : la capacité a été rendue muette par une Neutralisation adverse.
          </Marqueur>
          <Marqueur icone={<span className="inline-flex items-center gap-1"><IconeDemo mode="entry" /><span className={`${cinzel} font-black`} style={{ color: "#FFE05C", fontSize: 17 }}>2</span></span>} nom="Chiffre : la valeur X">
            Le nombre accolé à l'icône est la valeur X (ou X/Y) de la capacité sur cette carte. Un « ? » annonce une
            valeur tirée au hasard.
          </Marqueur>
        </div>
        <P>
          Quand un effet vous demande un <Hi>choix</Hi> — une cible, une carte parmi plusieurs —, c'est toujours
          son <Hi>propriétaire</Hi> qui choisit, même pendant le tour adverse. Vous disposez de <Hi>15 secondes</Hi>,
          pendant lesquelles le chrono du tour est suspendu ; faute de réponse, le jeu tranche au hasard. Un choix
          déclenché « à l'attaque » se règle <Hi>avant</Hi> le combat.
        </P>
      </Section>

      <Section title={tt('hero_title')}>
        <P>
          Chaque héros a ses propres <Hi>points de vie de départ</Hi> ({HERO_HP_MIN} à {HERO_HP_MAX}), qui sont aussi
          son <Hi>maximum</Hi> : aucun soin ne le fait remonter au-delà. Le seuil « Sous 15 PV » reste le même pour
          tous les héros.
        </P>
        <P>
          Votre héros possède un <Hi>pouvoir</Hi> utilisable <Hi>une fois par tour</Hi> en payant son coût en mana.
          Selon le héros, il peut conférer une capacité à une créature, déclencher un effet d'action, ou poser
          un <Hi>emblème</Hi> persistant (par ex. renforcer toutes vos unités).
        </P>
        <P>
          Autour de son portrait gravite l'<Hi>orbite</Hi> du héros : ses emblèmes (losanges) et ses compteurs
          (médaillons), présentés plus bas. Chaque élément s'explique au survol ; ceux du héros adverse sont
          visibles aussi, en miroir.
        </P>
      </Section>

      <Section title={tt('alt_costs_title')}>
        <P>
          Certaines cartes puissantes coûtent, <Hi>en plus du mana</Hi>, une ressource que vous engagez au moment de
          les jouer. Ces coûts s'additionnent au coût en mana, se cumulent entre eux sur une même carte, et ne sont
          <Hi> jamais réductibles</Hi> : ni Canalisation, ni Entraide, ni Concentration ne les voient.
        </P>
        <Bullets items={[
          <><Hi>Points de vie</Hi> : votre héros paie de sa vie. Impossible si cela le tuerait.</>,
          <><Hi>Défausse</Hi> : vous jetez au cimetière N autres cartes de votre main, que vous désignez.</>,
          <><Hi>Sacrifice</Hi> : vous détruisez N créatures alliées de votre choix — leurs râles d'agonie se déclenchent.</>,
          <><Hi>Exil</Hi> : N cartes sont retirées du <Hi>dessus de votre deck</Hi>, définitivement. Un prix payé sur votre avenir.</>,
          <><Hi>Repli</Hi> : vous replacez N cartes de votre main <Hi>sur le dessus de votre deck</Hi>, dans l'ordre que vous choisissez — la dernière posée sera la première repiochée. Un coût de tempo, pas de cartes : vous les reverrez.</>,
        ]} />
        <div className="flex flex-wrap justify-center gap-4 mt-5 mb-6">
          {COUTS_DEMO.map(({ type, legende }) => (
            <Demo key={type} legende={legende} petite>
              <CostShield value={3} />
              <RightSlots cost={{ type, value: 2 }} />
            </Demo>
          ))}
          <Demo legende="Éveil : 2 points versés sur 5" petite>
            <RightSlots awaken={{ total: 5, paid: 2 }} />
          </Demo>
        </div>
        <P>
          L'<Hi>éveil</Hi> est à part : c'est le seul coût <Hi>alternatif</Hi>, qui <Hi>remplace</Hi> le mana au lieu
          de s'y ajouter. Une carte à coût d'éveil peut être mise en éveil depuis votre main, gratuitement, dans une
          zone dédiée ; à chacun de vos tours, vous y versez autant de points que vous le souhaitez, <Hi>un point par
          mana</Hi>. Le dernier point la fait entrer en jeu. Vous ne pouvez tenir que <Hi>{MAX_EVEIL} cartes</Hi> en
          éveil à la fois — la zone n'est pas un coffre-fort.
        </P>
      </Section>

      <Section title="Les compteurs et les emblèmes">
        <div className="flex flex-wrap justify-center gap-5 mb-6">
          {COMPTEURS_DEMO.map(({ kind, teinte, total, valeur, legende }) => (
            <Pastille key={kind} legende={legende}>
              <CounterMedallion size={48} teinte={teinte} total={total} valeur={valeur} ecu={valeur}
                ariaLabel={legende} bulle={BULLE_INERTE}>
                <CounterIcon kind={kind} />
              </CounterMedallion>
            </Pastille>
          ))}
          <Pastille legende="Machine (Invention)">
            <MachineGear size={48} total={MAX_INVENTIONS_MACHINE} inventions={2} ariaLabel="Machine" bulle={BULLE_INERTE} />
          </Pastille>
        </div>
        <P>
          Plusieurs capacités alimentent des <Hi>compteurs</Hi> personnels : des médaillons ronds dans l'orbite de
          votre héros, avec une jauge dorée et leur valeur exacte dans l'écu en coin. Un compteur n'apparaît que
          lorsqu'il dépasse 0, et son halo pulse quand vous pouvez le dépenser. Ils ne se
          dépensent pas en mana : l'Épargne, la Foi et la Conquête ouvrent, d'un clic sur le compteur, une
          <Hi>découverte</Hi> — vous voyez trois cartes et en prenez une en main. L'Exploration se règle toute seule, et
          l'Invention construit une machine.
        </P>
        <Bullets items={[
          <><Hi>Épargne</Hi> (maximum {MAX_EPARGNE}) : dépensez tout le compteur pour choisir 1 carte parmi 3 tirées au hasard dans le jeu, de coût inférieur ou égal à votre Épargne. Le compteur repart à 0.</>,
          <><Hi>Foi</Hi> (maximum {MAX_FOI}) : choisissez 1 carte parmi 3 tirées de <Hi>votre propre deck</Hi>, de coût inférieur ou égal à votre Foi. Seul le coût de la carte prise est retiré, le reste est conservé pour une prochaine découverte.</>,
          <><Hi>Conquête</Hi> (palier {MAX_CONQUETE}) : quand le compteur atteint {MAX_CONQUETE}, choisissez 1 carte parmi 3 tirées du <Hi>deck adverse</Hi>. Elle est à vous pour le reste de la partie, jouable sans contrainte de faction, et l'adversaire ne la piochera jamais. Le compteur repart à 0 et disparaît tant qu'il est vide.</>,
          <><Hi>Invention +X/+Y</Hi> : chaque Invention ajoute +X/+Y à <Hi>votre machine</Hi> (0/1 au départ), et parfois une capacité avec son déclencheur — deux fois la même capacité au même déclencheur additionnent leurs valeurs. La machine coûte 1 mana par Invention, {MAX_INVENTIONS_MACHINE} au plus. Survolez le compteur ⚙️ pour la voir, cliquez-le pour la prendre en main : la suivante repart de zéro.</>,
          <><Hi>Exploration</Hi> (palier {EXPLORATION_PALIER}) : le seul compteur qui ne se clique pas. Chaque fois qu'il atteint {EXPLORATION_PALIER}, vous <Hi>piochez une carte</Hi> aussitôt et {EXPLORATION_PALIER} points sont retirés — le reste est conservé, si bien qu'un gros gain peut faire piocher deux cartes. Il disparaît tant qu'il est vide.</>,
        ]} />
        <div className="flex flex-wrap justify-center gap-5 mt-7 mb-5">
          {EMBLEMES_DEMO.map(({ e, legende }) => (
            <Pastille key={legende} legende={legende}>
              <EmblemDiamond e={e} size={46} bulle={BULLE_INERTE} />
            </Pastille>
          ))}
        </div>
        <P>
          Les <Hi>emblèmes</Hi> sont des losanges, colorés selon leur nature : <Hi>ardoise</Hi> pour un effet
          permanent, <Hi>brun</Hi> pour un effet à durée — des points dorés comptent les tours restants, le dernier
          vire à l'orange —, <Hi>bleu</Hi> pour un emblème qui réagit à un événement (fin de tour, attaque, mort…).
          Un <Hi>liseré rouge</Hi> signale une malédiction posée par l'adversaire, et « ×N » un emblème posé
          plusieurs fois.
        </P>
      </Section>

      <Section title={tt('singulier_title')}>
        <P>
          Certaines capacités portent la condition <Hi>Singulier</Hi>, reconnaissable à son icône bicolore
          (<span style={{ color: "#0D9488" }}>turquoise</span> d'un côté, couleur du déclencheur de l'autre). Elles
          ne se déclenchent que si votre <Hi>deck de départ</Hi> ne contenait <Hi>aucune carte en double</Hi>. Cet
          état est fixé au lancement du duel et ne bouge plus : les cartes conquises, générées ou copiées en cours
          de partie n'y changent rien, et une carte gagnée en partie profite de votre état, pas de celui de son
          ancien propriétaire. Aucune règle de construction ne l'impose — c'est une prime pour qui renonce aux
          exemplaires multiples. Le deckbuilder vous indique si votre deck est singulier, et votre adversaire ne
          découvre le vôtre qu'à la première capacité Singulier qu'il vous voit jouer.
        </P>
      </Section>

      <Section title={tt('deck_title')}>
        <P>Un deck contient exactement <Hi>{DECK_SIZE} cartes</Hi> et suit ces règles :</P>
        <Bullets items={[
          <>Une <Hi>seule faction</Hi> principale par deck.</>,
          <>Un <Hi>seul clan</Hi> : c'est lui qui définit votre style de jeu.</>,
          <>Jusqu'à <Hi>4 cartes Mercenaires</Hi> (sans clan ni allégeance, elles s'ajoutent à n'importe quel deck).</>,
          <>Répartition par rareté : <Hi>2 Légendaires, 4 Épiques, 6 Rares, 8 Peu Communes, 30 Communes</Hi>.</>,
          <>Copies : <Hi>1 exemplaire</Hi> par carte non-commune, <Hi>3 exemplaires</Hi> par commune.</>,
          <>Une même capacité nommée ne peut pas figurer plus de <Hi>{MAX_SAME_CAPABILITY} fois</Hi> dans le deck
            (Vol excepté{DEROGATIONS_PLAFOND && <> ; <Hi>{DEROGATIONS_PLAFOND}</Hi></>}) : impossible d'empiler
            cinquante fois le même effet.</>,
          <>On ne mélange pas une faction <Hi>Bonne</Hi> et une faction <Hi>Maléfique</Hi> dans le même deck.</>,
          <>Un deck <Hi>sans aucun doublon</Hi> est dit <Hi>singulier</Hi> : il active les capacités Singulier. Facultatif, mais récompensé.</>,
          <>Les <Hi>objets</Hi> ne se mettent pas dans un deck : on les trouve <Hi>en jeu</Hi> (Trésor, Compagnons, Tuteur,
            Sélection, Faveur…).</>,
        ]} />
        <P>
          Deux <Hi>formats</Hi> encadrent enfin ce que vous pouvez jouer. Le mode <Hi>Classique</Hi> n'autorise que les
          Communes — {DECK_SIZE} cartes à égalité de puissance ; le mode <Hi>Expert</Hi> ouvre les slots de rareté
          ci-dessus. L'étendue <Hi>Standard</Hi> ne retient que les cartes des deux dernières années, l'étendue
          <Hi> Étendu</Hi> accepte toute la collection.
        </P>
      </Section>
    </>
  );
}

// ── TCG-player guide (concise) ────────────────────────────────────────────────
function TcgGuide() {
  const tt = useTranslations("tutorial");
  return (
    <>
      <Section title={tt('tcg_numbers_title')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={`${HERO_HP_MIN}–${HERO_HP_MAX}`} label={tt('stat_hero_hp')} />
          <Stat value={`${DECK_SIZE}`} label={tt('stat_deck_exact')} />
          <Stat value={`${FIRST_PLAYER_HAND_SIZE}–${STARTING_HAND_SIZE} → ${MAX_HAND_SIZE}`} label={tt('stat_hand_range')} />
          <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label={tt('stat_mana_per_turn')} />
        </div>
      </Section>

      <Section title={tt('tcg_gameloop_title')}>
        <Bullets items={[
          <>Début de tour : <Hi>+1 mana max</Hi> (cap {MAX_MANA}), recharge complète, <Hi>pioche 1</Hi>{regleDecouverteActivee() && <> — un tour sur deux (vos tours pairs), <Hi>découverte</Hi> à la place : 1 Commune parmi 3 (2 de votre clan, 1 d'un autre clan de la faction), créée hors deck</>}.</>,
          <>PV de départ <Hi>propres à chaque héros</Hi> ({HERO_HP_MIN}–{HERO_HP_MAX}, {HERO_MAX_HP} par défaut), qui sont aussi son plafond de soin. « Sous 15 PV » reste absolu.</>,
          <>Tout choix revient au <Hi>propriétaire</Hi> de l'effet, même hors de son tour : fenêtre de <Hi>15 s</Hi>, chrono suspendu, hasard à défaut. Les choix « à l'attaque » se règlent avant le combat.</>,
          <>Victoire : héros adverse à <Hi>0 PV</Hi>. Deck vide → <Hi>fatigue</Hi> croissante.</>,
          <>Terrain et main plafonnés à <Hi>{MAX_BOARD_SIZE}</Hi>.</>,
          <>Le joueur en second reçoit une <Hi>Étincelle de mana</Hi> (+1 mana au tour 1).</>,
          <><Hi>Mal d'invocation</Hi> par défaut ; <Hi>Traque</Hi> l'annule, <Hi>Raid</Hi> autorise l'attaque (créatures uniquement, jamais le héros) en étant « malade ».</>,
        ]} />
      </Section>

      <Section title={tt('tcg_deckbuilding_title')}>
        <Bullets items={[
          <><Hi>Mono-faction</Hi>, <Hi>mono-clan</Hi>, <Hi>≤ 4 Mercenaires</Hi>.</>,
          <>Slots de rareté : <Hi>2 / 4 / 6 / 8 / 30</Hi> (Lég / Épique / Rare / Peu Commune / Commune).</>,
          <>Copies : non-communes <Hi>×1</Hi>, communes <Hi>×3</Hi>.</>,
          <>Une même capacité nommée : <Hi>{MAX_SAME_CAPABILITY} occurrences</Hi> maximum (Vol exempté{DEROGATIONS_PLAFOND && <> ; <Hi>{DEROGATIONS_PLAFOND}</Hi></>}).</>,
          <>Interdit de mélanger <Hi>Bon</Hi> et <Hi>Maléfique</Hi>.</>,
          <>Formats : mode <Hi>Classique</Hi> (communes seules) ou <Hi>Expert</Hi> (slots de rareté) × étendue
            <Hi> Standard</Hi> (rotation ~2 ans) ou <Hi>Étendu</Hi>.</>,
          <>Faction = race(s) + clan(s). Ex. Les Primordiaux : race « Élémentaire », un clan par élément.</>,
        ]} />
      </Section>

      <Section title={tt('tcg_combat_title')}>
        <Bullets items={[
          <>Échange <Hi>simultané</Hi> par défaut ; <Hi>Première Frappe</Hi> frappe avant.</>,
          <>Défense : <Hi>Bouclier</Hi> (absorbe 1 coup), <Hi>Résistance X</Hi> (−X, min 1), <Hi>Armure</Hi> (½ dégâts de combat), <Hi>Indestructible</Hi> (immunise le combat), <Hi>Transcendance</Hi> (immunise les actions), <Hi>Esquive</Hi>.</>,
          <>Contournement : <Hi>Vol</Hi> ignore Provocation ; <Hi>Ombre</Hi> = furtif tant qu'il n'a pas agi.</>,
          <>Offensif : <Hi>Double Attaque</Hi> / <Hi>Célérité</Hi>, <Hi>Piétinement</Hi>, <Hi>Souffle de feu X</Hi>, <Hi>Persécution X</Hi>, <Hi>Drain de vie</Hi>, <Hi>Poison</Hi>, <Hi>Paralysie</Hi>, <Hi>Riposte X</Hi>, <Hi>Fureur</Hi>.</>,
          <><Hi>Précision</Hi> ignore <Hi>Résistance</Hi>, <Hi>Armure</Hi> et <Hi>Bouclier</Hi>.</>,
        ]} />
      </Section>

      <Section title={tt('tcg_hero_spells_title')}>
        <Bullets items={[
          <>Pouvoir de héros : <Hi>1× / tour</Hi>, coût en mana. 3 modes : conférer un mot-clé, déclencher un effet d'action, ou activer une <Hi>aura</Hi> empilable.</>,
          <>Coûts additionnels (cumulatifs, non réductibles) : <Hi>PV</Hi>, <Hi>défausse</Hi>, <Hi>sacrifice</Hi>, <Hi>exil</Hi> (dessus du deck), <Hi>repli</Hi> (main → dessus du deck, ordre choisi). <Hi>Éveil</Hi> = coût alternatif au mana, 1 point / mana / tour, {MAX_EVEIL} cartes en éveil max.</>,
          <>Compteurs (clic = découverte 1 parmi 3) : <Hi>Épargne</Hi> (≤ {MAX_EPARGNE}, vidée, cartes du jeu de coût ≤ compteur), <Hi>Foi</Hi> (≤ {MAX_FOI}, cartes de SON deck, seul le coût pris est défalqué), <Hi>Conquête</Hi> (palier {MAX_CONQUETE}, carte du deck ADVERSE volée pour la partie), <Hi>Invention</Hi> (machine 0/1 améliorée pièce par pièce, 1 mana par Invention, {MAX_INVENTIONS_MACHINE} au plus, clic = en main).</>,
          <><Hi>Singulier</Hi> : condition sur une capacité — active seulement si le deck de départ n'a aucun doublon (figé au lancement). <Hi>Emblème</Hi> : effet permanent posé sur un joueur, survit à sa source.</>,
          <>Réductions de coût : <Hi>Canalisation</Hi> (actions, selon le terrain), <Hi>Entraide</Hi> (selon alliés de même race).</>,
          <>Une action peut <Hi>conférer une capacité de créature</Hi> : à la cible, ou à toutes vos unités (marqueur « A »).</>,
          <><Hi>Objets</Hi> : 3ᵉ type de carte, hors deck. Occupent une place du terrain, inertes ; coût de pose + <Hi>coût d'équipement</Hi> rejouable, un seul par créature alliée, restent en jeu à la mort du porteur.</>,
          <>Couleur d'icône = déclencheur : blanc permanent, <span style={{ color: keywordModeColor("entry")! }}>jaune</span> entrée/action, <span style={{ color: keywordModeColor("tap")! }}>orange</span> activation, <span style={{ color: keywordModeColor("attack")! }}>magenta</span> attaque, <span style={{ color: keywordModeColor("death")! }}>rouge</span> mort, <span style={{ color: keywordModeColor("wound")! }}>citron</span> blessure, <span style={{ color: keywordModeColor("low_hp")! }}>violet</span> sous 15 PV, <span style={{ color: keywordModeColor("start_of_turn")! }}>argent</span> début de tour, <span style={{ color: keywordModeColor("end_of_turn")! }}>vert</span> fin de tour, <span style={{ color: keywordModeColor("return")! }}>bleu</span> retour en main, <span style={{ color: keywordModeColor("draw")! }}>cyan</span> pioche, <span style={{ color: keywordModeColor("delay")! }}>ambre</span> Retard X. Marqueurs : <Hi>✦</Hi> effet composé, <Hi>A</Hi> toutes les unités, <Hi>S</Hi> sur elle-même, <Hi>/</Hi> choix OU, bicolore Singulier, barré neutralisé.</>,
        ]} />
      </Section>
    </>
  );
}

// ── Factions & clans ──────────────────────────────────────────────────────────
// Les factions, leurs races et leurs clans viennent du REGISTRE (FACTIONS) :
// renommer un clan dans le moteur le renomme ici. Seules les phrases de
// caractérisation sont écrites à la main — elles décrivent le profil réel de
// chaque clan (poids de stats + mots-clés les plus probables du générateur),
// pas une intention littéraire.

/** Clan volontairement ABSENT de cette page : il se découvre en jouant. */
const CLANS_CACHES = new Set(["La Forêt Enchantée"]);

/** Une ligne par clan, fidèle à son `clanProfile` (statWeights + likelyKeywords). */
const CLAN_BLURBS: Record<string, string> = {
  // L'Alliance Céleste
  "Les Sylvains": "Embuscade et précision : ils frappent les premiers, esquivent et restent introuvables.",
  "Les Hauts-Elfes": "Les mages du savoir : canalisation, divination et contresorts pour dicter le rythme.",
  "La Forêt d'Émeraude": "Le petit peuple — fées, farfadets, korrigans, faunes et dryades : fragiles mais insaisissables, ils volent et manipulent la magie.",
  "La Combe Verte": "Hobbits et Hommes-Arbres : loyauté, bénédictions et une ténacité qui use l'adversaire.",
  // Les Armées des Montagnes
  "La Forge Ardente": "Le feu du métal : combustion, fureur et ripostes qui punissent chaque coup reçu.",
  "La Guilde des Ingénieurs": "Machines et gnomes : convocations, catalyse et pioche pour bâtir sa position.",
  "Clan des Mille Tunnels": "Les kobolds en nombre : rassemblement, solidarité, la force du groupe.",
  "Clan des Premiers Géants": "Le mur des cimes : provocation, armure et résistance — presque rien ne passe.",
  // L'Empire du Milieu
  "Les Hordes des Steppes": "Cavalerie rapide : célérité, traque et raids qui frappent avant l'installation.",
  "L'Empire de Jade": "Discipline et contrôle : tactique, divination, contresorts et commandement — sous le présage du qilin.",
  "Les Lames de l'Ombre": "Assassins — ninjas, tengu et oni : ombre et invisibilité jusqu'au premier coup, mortel.",
  "Les Défenseurs d'Ivoire": "Éléphants de guerre : piétinement, armure et provocation, l'avance inarrêtable.",
  // Les Royaumes du Soleil
  "Les Enfants du Soleil": "Le brasier rituel : sacrifice, martyr et héritage — mourir sert le camp.",
  "Les Seigneurs des Dunes": "Nomades pilleurs : pillage, traque et esquive, ils prennent et disparaissent.",
  "Le Royaume des Masques": "Invocateurs et esprits : convocation, divination et prescience.",
  "Les Fils du Volcan": "La rage de la lave : combustion, fureur et souffle de feu, tout en attaque.",
  // Les Royaumes Libres
  "Le Royaume du Nord": "Champions héroïques : gloire cumulative, bravoure et raids.",
  "L'Ordre de l'Aube": "La lumière protectrice : boucliers, bénédictions et provocation.",
  "Les Guerrières du Vent": "Archères montées, pégases et sphinx : précision, esquive et frappe initiale.",
  "La Sublime Porte": "L'armée d'apparat : commandement, première frappe et discipline de rang.",
  // La Meute
  "Les Seigneurs Fauves": "Les félins : persécution et célérité, la pression permanente.",
  "Les Enfants de la Lune": "Loups-garous : lycanthropie, fureur et régénération, ils grandissent en combattant.",
  "Le Pacte des Griffes": "L'alliance des races : sang mêlé, solidarité et loyauté.",
  "La Harde Sauvage": "La charge des sabots : célérité, raid et piétinement.",
  // Les Primordiaux
  "La Colère des Flammes": "Le feu pur — élémentaires et salamandres : la plus forte attaque du jeu, la plus faible défense.",
  "Le Socle du Monde": "La terre — élémentaires, cristallins, troglodytes et bêtes chtoniennes : provocation, armure et immobilité, le mur qui ne cède pas.",
  "La Vague Sans Fin": "L'eau — élémentaires, ondins, sirènes et léviathans : régénération, drain de vie et paralysie, la victoire par l'usure.",
  "Le Souffle des Cimes": "L'air — élémentaires, sylphes et néphélides : vol, célérité et esquive, insaisissable.",
  // La Nécropole
  "Les Rangs Silencieux": "La piétaille sans fin — squelettes, zombies et ghoules : nécrophagie, exhumation et rappel du cimetière.",
  "Le Voile Hurlant": "Le présage de mort — spectres, banshees, poltergeists, dullahans et sluaghs : terreur, ombre et maléfices.",
  "La Cour Écarlate": "La cour du sang : vampires, dhampirs, gargouilles, chiroptères et homuncules — drain de vie et vampirisme.",
  "Le Cénacle Nécromant": "Les maîtres de la mort — liches, momies, chimères nécrotiques et vermines : résurrection, héritage du cimetière et savoir interdit.",
  // Les Légions du Chaos
  "Les Cohortes Sanglantes": "La horde organisée : traque, entrainement et gloire au fil des combats.",
  "Les Princes des Abîmes": "La cour démoniaque : fureur, sacrifice et terreur, à tout prix.",
  "La Forêt Maudite": "Les corrompus : poison, malédiction et embuscade.",
  "La Garde Noire": "L'élite déchue : armure, résistance et maléfices — solide et rancunière.",
};

const ALIGN_LABEL: Record<string, string> = {
  bon: "Bon", neutre: "Neutre", "maléfique": "Maléfique", "spéciale": "Spéciale",
};

/** Ordre de présentation : les camps tranchés encadrent les neutres. */
const ORDRE_ALIGNEMENT = ["bon", "neutre", "maléfique", "spéciale"];

function FactionsGuide({
  clanVisuals, factionVisuals,
}: { clanVisuals: Record<string, ClanVisual>; factionVisuals: Record<string, ClanVisual[]> }) {
  const factions = Object.entries(FACTIONS).sort(
    (a, b) => ORDRE_ALIGNEMENT.indexOf(a[1].alignment) - ORDRE_ALIGNEMENT.indexOf(b[1].alignment),
  );

  return (
    <>
      <Section title="Choisir son camp">
        <P>
          Chaque carte appartient à une <Hi>faction</Hi>, elle-même divisée en <Hi>clans</Hi>. La faction donne
          l'univers et l'<Hi>alignement</Hi> — Bon, Neutre ou Maléfique ; le clan donne le style de jeu.
        </P>
        <P>
          Un deck se construit sur <Hi>une seule faction</Hi> et <Hi>un seul clan</Hi>, plus jusqu'à
          <Hi> 4 cartes Mercenaires</Hi>, qui n'ont ni clan ni allégeance et s'invitent partout. Le choix du clan est
          donc la vraie décision : c'est lui qui décide de votre plan de jeu.
        </P>
      </Section>

      {factions.map(([id, f]) => {
        const clans = getAllClanNames(id).filter((c) => !CLANS_CACHES.has(c));
        const vitrines = factionVisuals[id] ?? [];
        return (
          <Section key={id} title={`${f.emoji} ${f.displayName}`}>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span
                className={`${cinzel} am-gild-border rounded-full px-3 py-1 text-am-ink-soft`}
                style={{ fontSize: 12 }}
              >
                {ALIGN_LABEL[f.alignment] ?? f.alignment}
              </span>
              <span className={`${crimson} italic text-am-ink-faint`} style={{ fontSize: 14 }}>
                {f.races.join(" · ")}
              </span>
            </div>

            <P>{f.description}</P>

            {clans.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                {clans.map((clan) => (
                  <ClanCard key={clan} clan={clan} blurb={CLAN_BLURBS[clan]} visual={clanVisuals[clan]} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 mt-5">
                {vitrines.map((v) => (
                  <Vignette key={v.id} visual={v} />
                ))}
              </div>
            )}
          </Section>
        );
      })}
    </>
  );
}

function ClanCard({ clan, blurb, visual }: { clan: string; blurb?: string; visual?: ClanVisual }) {
  return (
    <div className="am-gild-border rounded-[var(--am-r-md)] bg-am-bg-1 p-3 flex gap-3">
      <div className="shrink-0 w-[76px]">
        {visual ? <Vignette visual={visual} /> : <VignetteVide />}
      </div>
      <div className="min-w-0">
        <div className={`${cinzel} am-foil-text font-bold mb-1`} style={{ fontSize: 15 }}>{clan}</div>
        <p className={`${crimson} text-am-ink/85 leading-[1.6]`} style={{ fontSize: 14 }}>
          {blurb ?? "Style de jeu à préciser."}
        </p>
      </div>
    </div>
  );
}

function Vignette({ visual }: { visual: ClanVisual }) {
  return (
    <figure className="m-0">
      <div className="relative w-full aspect-[3/4] rounded-[var(--am-r-sm)] overflow-hidden am-gild-border">
        <Image
          src={visual.imageUrl}
          alt={visual.name}
          fill
          className="object-cover"
          sizes="120px"
          unoptimized
        />
      </div>
      <figcaption className={`${crimson} italic text-am-ink-faint mt-1 text-center leading-tight`} style={{ fontSize: 11 }}>
        {visual.name}
      </figcaption>
    </figure>
  );
}

/** Cadre en attente : ce clan n'a pas encore de carte illustrée. La place est
 *  réservée pour que la grille ne bouge pas le jour où l'illustration arrive. */
function VignetteVide() {
  return (
    <figure className="m-0">
      <div
        className="relative w-full aspect-[3/4] rounded-[var(--am-r-sm)] border border-dashed border-am-gold/30 bg-am-bg-0/60 flex items-center justify-center"
        aria-label="Illustration à venir"
      >
        <span className="text-am-gold/40" style={{ fontSize: 20 }} aria-hidden="true">◆</span>
      </div>
      <figcaption className={`${crimson} italic text-am-ink-faint mt-1 text-center leading-tight`} style={{ fontSize: 11 }}>
        à venir
      </figcaption>
    </figure>
  );
}

// ── Auto-generated keyword reference (from the ability registry) ──────────────
function KeywordReference() {
  const tt = useTranslations("tutorial");
  const [query, setQuery] = useState("");

  const creature = useMemo(
    () =>
      CREATURE_ABILITIES.map((ab) => ({
        key: ab.creature?.id ?? ab.id,
        label: ab.creature?.label ?? ab.label,
        symbol: ab.symbol,
        desc: ab.creature?.desc ?? ab.desc,
      })),
    [],
  );
  const spell = useMemo(
    () =>
      SPELL_ABILITIES.map((ab) => ({
        key: `spell_${ab.id}`,
        label: ab.spell?.label ?? ab.label,
        symbol: ab.symbol,
        desc: ab.spell?.desc ?? ab.desc,
      })),
    [],
  );

  const q = query.trim().toLowerCase();
  const match = (k: { label: string; desc: string }) =>
    !q || k.label.toLowerCase().includes(q) || k.desc.toLowerCase().includes(q);
  const creatureF = creature.filter(match);
  const spellF = spell.filter(match);

  return (
    <section className="mt-16 am-animate-rise">
      <AmHeading
        as="h2"
        eyebrow={tt('lexicon_eyebrow')}
        subtitle={tt('lexicon_subtitle')}
      >
        {tt('lexicon_title')}
      </AmHeading>

      <div className="flex justify-center mt-7 mb-9">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tt('search_placeholder')}
          className={`${crimson} w-full max-w-md px-4 py-3 rounded-[var(--am-r-md)] bg-am-bg-1 text-am-ink border border-am-gold/30 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-am-gold focus-visible:ring-offset-2 focus-visible:ring-offset-am-bg-0 placeholder:text-am-ink-soft/60`}
          style={{ fontSize: 16 }}
        />
      </div>

      <KeywordGroup title={tt('creature_abilities_group', { count: creatureF.length })} items={creatureF} />
      <KeywordGroup title={tt('spell_abilities_group', { count: spellF.length })} items={spellF} />

      {creatureF.length === 0 && spellF.length === 0 && (
        <p className={`${crimson} italic text-am-ink-soft text-center py-8`} style={{ fontSize: 16 }}>
          {tt('no_ability_match', { query })}
        </p>
      )}
    </section>
  );
}

function KeywordGroup({ title, items }: { title: string; items: { key: string; label: string; symbol: string; desc: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-10">
      <div className="flex items-center gap-4 mb-4">
        <h3 className={`${cinzel} text-am-gold font-semibold shrink-0`} style={{ fontSize: 17, letterSpacing: "0.05em" }}>
          {title}
        </h3>
        <span className="am-rule flex-1" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((k) => (
          <AmPanel key={k.key} className="flex items-start gap-3 !rounded-[var(--am-r-md)] p-3">
            <div
              className="shrink-0 flex items-center justify-center rounded-[var(--am-r-sm)] bg-am-bg-0 border border-am-gold/30"
              style={{ width: 40, height: 40 }}
            >
              <KeywordIcon symbol={k.symbol} keyword={k.key} size={22} />
            </div>
            <div className="min-w-0">
              <div className={`${cinzel} text-am-gold-bright font-semibold`} style={{ fontSize: 14.5 }}>{k.label}</div>
              <div className={`${crimson} text-am-ink-soft leading-snug mt-0.5`} style={{ fontSize: 14 }}>{k.desc}</div>
            </div>
          </AmPanel>
        ))}
      </div>
    </div>
  );
}
