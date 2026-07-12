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
import { CREATURE_ABILITIES, SPELL_ABILITIES } from "@/lib/game/abilities";
import {
  HERO_MAX_HP,
  DECK_SIZE,
  STARTING_HAND_SIZE,
  MAX_HAND_SIZE,
  MAX_BOARD_SIZE,
  MAX_MANA,
  STARTING_MANA,
} from "@/lib/game/constants";

// ── Design tokens (Arcane War-Codex design system) ────────────────────────────
const cinzel = "font-[family-name:var(--font-cinzel),serif]";
const crimson = "font-[family-name:var(--font-crimson),serif]";

interface TutorialViewProps {
  username: string;
  goldBalance: number;
}

type Track = "beginner" | "tcg";

export default function TutorialView({ username, goldBalance }: TutorialViewProps) {
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
        </div>

        <div className="max-w-4xl mx-auto">
          {track === "beginner" ? <BeginnerGuide /> : <TcgGuide />}

          {/* Keyword reference — auto-generated from the ability registry, shown
              in both tracks. Always in sync with the game. */}
          <KeywordReference />
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

// ── Beginner guide (complete) ─────────────────────────────────────────────────
function BeginnerGuide() {
  const tt = useTranslations("tutorial");
  return (
    <>
      <Section title={tt('goal_title')}>
        <P>
          Chaque joueur incarne un <Hi>héros</Hi> qui démarre avec <Hi>{HERO_MAX_HP} points de vie</Hi>. Vous gagnez
          la partie en réduisant les points de vie du héros adverse à <Hi>0</Hi>. Pour cela, vous invoquez des
          créatures et lancez des sorts.
        </P>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <Stat value={`${HERO_MAX_HP} PV`} label={tt('stat_hero_start')} />
          <Stat value={`${STARTING_HAND_SIZE} cartes`} label={tt('stat_starting_hand')} />
          <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label={tt('stat_mana_growth')} />
          <Stat value={`${MAX_BOARD_SIZE}`} label={tt('stat_max_board')} />
        </div>
      </Section>

      <Section title={tt('turn_title')}>
        <P>{tt('turn_intro')}</P>
        <Bullets items={[
          <>Votre <Hi>mana maximum augmente de 1</Hi> (jusqu'à {MAX_MANA}), puis votre mana est entièrement rechargé.</>,
          <>Vous <Hi>piochez 1 carte</Hi>.</>,
          <>Vos créatures se « réveillent » : elles peuvent de nouveau attaquer ce tour-ci.</>,
          <>Vous jouez autant de cartes que votre mana le permet, vous attaquez, puis vous passez la main.</>,
        ]} />
        <P>
          La <Hi>première</Hi> partie commence à {STARTING_MANA} mana : le mana est la ressource clé, et elle grandit
          à chaque tour. Le joueur qui commence en second reçoit une <Hi>Étincelle de mana</Hi> (+1 mana pour son
          premier tour) afin de compenser le désavantage d'initiative.
        </P>
      </Section>

      <Section title={tt('hand_title')}>
        <P>
          Vous démarrez avec <Hi>{STARTING_HAND_SIZE} cartes</Hi> et pouvez en remplacer autant que vous voulez lors
          du <Hi>mulligan</Hi> (avant le début de la partie). Votre main peut contenir au maximum
          <Hi> {MAX_HAND_SIZE} cartes</Hi> — au-delà, les cartes piochées sont perdues. Si votre deck est vide et que
          vous devez piocher, vous subissez des dégâts de <Hi>fatigue</Hi> croissants.
        </P>
      </Section>

      <Section title={tt('creatures_title')}>
        <P>
          Une créature a une <Hi>attaque (ATK)</Hi> et des <Hi>points de vie (PV)</Hi>. Quand vous l'invoquez, elle
          arrive avec le <Hi>mal d'invocation</Hi> : elle ne peut pas attaquer le tour où elle est posée (sauf si elle
          possède la capacité <Hi>Charge</Hi>). Dès le tour suivant, elle peut attaquer une créature ennemie ou le
          héros adverse. Le terrain accueille jusqu'à <Hi>{MAX_BOARD_SIZE} créatures</Hi>.
        </P>
      </Section>

      <Section title={tt('spells_title')}>
        <P>
          Un sort produit un effet immédiat puis part au <Hi>cimetière</Hi>. Certains sorts nécessitent une
          <Hi> cible</Hi> (une créature, un héros…). Nouveauté : un sort peut aussi <Hi>conférer une capacité de
          créature</Hi> — à une créature ciblée (icône <span className="text-am-ink">blanche</span>) ou à
          toutes vos unités alliées (icône <span className="text-am-jade">verte</span>).
        </P>
      </Section>

      <Section title={tt('combat_title')}>
        <P>
          Quand une créature en attaque une autre, les deux s'infligent <Hi>simultanément</Hi> leur attaque. Si elle
          attaque le héros adverse, elle lui inflige son ATK. Quelques règles importantes :
        </P>
        <Bullets items={[
          <><Hi>Provocation</Hi> : vous devez d'abord attaquer les créatures ennemies qui ont Provocation… sauf avec une créature qui a <Hi>Vol</Hi>.</>,
          <><Hi>Bouclier divin</Hi> : absorbe la première blessure subie.</>,
          <><Hi>Première Frappe</Hi> : frappe avant l'adversaire (qui ne riposte que s'il survit).</>,
          <><Hi>Résistance X</Hi> réduit les dégâts reçus, <Hi>Armure</Hi> divise par deux les dégâts de combat.</>,
          <><Hi>Esquive</Hi> évite la première attaque du tour.</>,
        ]} />
        <P>{tt('combat_see_full_list')}</P>
      </Section>

      <Section title={tt('hero_title')}>
        <P>
          Au-delà de ses {HERO_MAX_HP} PV, votre héros possède un <Hi>pouvoir</Hi> utilisable <Hi>une fois par
          tour</Hi> en payant son coût en mana. Selon le héros, il peut conférer une capacité à une créature,
          déclencher un effet de sort, ou activer une <Hi>aura</Hi> persistante (par ex. renforcer toutes vos unités).
        </P>
      </Section>

      <Section title={tt('alt_costs_title')}>
        <P>
          Certaines cartes puissantes coûtent, <Hi>en plus du mana</Hi> : des <Hi>points de vie</Hi> de votre héros,
          la <Hi>défausse</Hi> de cartes de votre main, ou le <Hi>sacrifice</Hi> de créatures alliées. Ces coûts
          s'additionnent au coût en mana et ne sont pas réductibles.
        </P>
      </Section>

      <Section title={tt('deck_title')}>
        <P>Un deck contient exactement <Hi>{DECK_SIZE} cartes</Hi> et suit ces règles :</P>
        <Bullets items={[
          <>Une <Hi>seule faction</Hi> principale par deck.</>,
          <>Au maximum <Hi>2 clans</Hi> différents.</>,
          <>Jusqu'à <Hi>4 cartes Mercenaires</Hi> (elles s'ajoutent à n'importe quel deck).</>,
          <>Répartition par rareté : <Hi>2 Légendaires, 4 Épiques, 6 Rares, 8 Peu Communes, 30 Communes</Hi>.</>,
          <>Copies : <Hi>1 exemplaire</Hi> par carte non-commune, <Hi>3 exemplaires</Hi> par commune.</>,
          <>On ne mélange pas une faction <Hi>Bonne</Hi> et une faction <Hi>Maléfique</Hi> dans le même deck.</>,
        ]} />
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
          <Stat value={`${HERO_MAX_HP}`} label={tt('stat_hero_hp')} />
          <Stat value={`${DECK_SIZE}`} label={tt('stat_deck_exact')} />
          <Stat value={`${STARTING_HAND_SIZE} → ${MAX_HAND_SIZE}`} label={tt('stat_hand_range')} />
          <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label={tt('stat_mana_per_turn')} />
        </div>
      </Section>

      <Section title={tt('tcg_gameloop_title')}>
        <Bullets items={[
          <>Début de tour : <Hi>+1 mana max</Hi> (cap {MAX_MANA}), recharge complète, <Hi>pioche 1</Hi>.</>,
          <>Victoire : héros adverse à <Hi>0 PV</Hi>. Deck vide → <Hi>fatigue</Hi> croissante.</>,
          <>Terrain et main plafonnés à <Hi>{MAX_BOARD_SIZE}</Hi>.</>,
          <>Le joueur en second reçoit une <Hi>Étincelle de mana</Hi> (+1 mana au tour 1).</>,
          <><Hi>Mal d'invocation</Hi> par défaut ; <Hi>Charge</Hi> l'annule, <Hi>Raid</Hi> autorise l'attaque (créatures uniquement) en étant « malade ».</>,
        ]} />
      </Section>

      <Section title={tt('tcg_deckbuilding_title')}>
        <Bullets items={[
          <><Hi>Mono-faction</Hi>, <Hi>≤ 2 clans</Hi>, <Hi>≤ 4 Mercenaires</Hi>.</>,
          <>Slots de rareté : <Hi>2 / 4 / 6 / 8 / 30</Hi> (Lég / Épique / Rare / Peu Commune / Commune).</>,
          <>Copies : non-communes <Hi>×1</Hi>, communes <Hi>×3</Hi>.</>,
          <>Interdit de mélanger <Hi>Bon</Hi> et <Hi>Maléfique</Hi>.</>,
          <>Faction = race(s) + clan(s). Ex. Élémentaires : race « Élémentaire », clans Feu / Terre / Eau / Air.</>,
        ]} />
      </Section>

      <Section title={tt('tcg_combat_title')}>
        <Bullets items={[
          <>Échange <Hi>simultané</Hi> par défaut ; <Hi>Première Frappe</Hi> frappe avant.</>,
          <>Défense : <Hi>Bouclier divin</Hi> (absorbe 1 coup), <Hi>Résistance X</Hi> (−X, min 1), <Hi>Armure</Hi> (½ dégâts de combat), <Hi>Indestructible</Hi> (immunise le combat), <Hi>Transcendance</Hi> (immunise les sorts), <Hi>Esquive</Hi>.</>,
          <>Contournement : <Hi>Vol</Hi> ignore Provocation ; <Hi>Ombre</Hi> = furtif tant qu'il n'a pas agi.</>,
          <>Offensif : <Hi>Double Attaque / Célérité</Hi>, <Hi>Piétinement</Hi>, <Hi>Souffle de feu X</Hi>, <Hi>Persécution X</Hi>, <Hi>Drain de vie</Hi>, <Hi>Poison</Hi>, <Hi>Paralysie</Hi>, <Hi>Riposte X</Hi>, <Hi>Fureur</Hi>.</>,
          <><Hi>Précision</Hi> ignore le Bouclier divin.</>,
        ]} />
      </Section>

      <Section title={tt('tcg_hero_spells_title')}>
        <Bullets items={[
          <>Pouvoir de héros : <Hi>1× / tour</Hi>, coût en mana. 3 modes : conférer un mot-clé, déclencher un effet de sort, ou activer une <Hi>aura</Hi> empilable.</>,
          <>Coûts alternatifs (cumulatifs, non réductibles) : <Hi>PV</Hi>, <Hi>défausse</Hi>, <Hi>sacrifice</Hi>.</>,
          <>Réductions de coût : <Hi>Canalisation</Hi> (sorts, selon le terrain), <Hi>Entraide</Hi> (selon alliés de même race).</>,
          <>Un sort peut <Hi>conférer une capacité de créature</Hi> : à la cible (blanc) ou à tous les alliés (vert).</>,
        ]} />
      </Section>
    </>
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
