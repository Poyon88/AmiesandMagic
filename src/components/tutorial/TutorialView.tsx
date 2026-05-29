"use client";

// Prose-heavy French content lives directly in JSX here (unlike the menu, which
// routes copy through the i18n dict). Disable the apostrophe-escaping rule so
// the text stays readable (l'invocation, d'un tour, …) without &apos; noise.
/* eslint-disable react/no-unescaped-entities */

import { useMemo, useState } from "react";
import HomeHeader from "@/components/home/HomeHeader";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { useStoredLocale } from "@/lib/i18n/useLocale";
import { homeDict } from "@/lib/i18n/homeDict";
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

// ── Design tokens (match the menu / collection hub) ───────────────────────────
const GOLD = "#c8a84e";
const cinzel = "font-[family-name:var(--font-cinzel),serif]";
const crimson = "font-[family-name:var(--font-crimson),serif]";

interface TutorialViewProps {
  username: string;
  goldBalance: number;
}

type Track = "beginner" | "tcg";

export default function TutorialView({ username, goldBalance }: TutorialViewProps) {
  const [locale] = useStoredLocale();
  const t = homeDict[locale];
  const [track, setTrack] = useState<Track>("beginner");

  return (
    <div className="min-h-screen bg-[#0a0a18] text-[#e0e0e0]">
      <HomeHeader
        username={username}
        goldBalance={goldBalance}
        backHref="/"
        backLabel={t.tutorial_back}
      />

      <main
        id="main-content"
        className="relative px-4 md:px-10 pt-28 md:pt-32 pb-20 min-h-screen"
        style={{
          background:
            "radial-gradient(ellipse at 50% 35%, rgba(21,21,51,0.95) 0%, #0a0a18 75%)",
        }}
      >
        {/* Title */}
        <div className="text-center mb-8 md:mb-10">
          <h1
            className={`${cinzel} font-bold text-[#c8a84e]`}
            style={{
              fontSize: "clamp(32px, 5vw, 52px)",
              letterSpacing: "0.06em",
              textShadow: "0 0 28px rgba(200, 168, 78, 0.3)",
            }}
          >
            Comment jouer
          </h1>
          <p className={`${crimson} italic text-[#e0e0e0]/65 mt-3`} style={{ fontSize: "clamp(14px,1.6vw,18px)" }}>
            Armies &amp; Magic — duel de cartes médiéval-fantastique
          </p>
          <div
            className="mx-auto mt-4 h-px w-28"
            style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
            aria-hidden="true"
          />
        </div>

        {/* Track switch */}
        <div className="flex justify-center gap-3 mb-10">
          <TrackButton active={track === "beginner"} onClick={() => setTrack("beginner")} label="Débutant — guide complet" />
          <TrackButton active={track === "tcg"} onClick={() => setTrack("tcg")} label="Joueur de TCG — l'essentiel" />
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
      className={`${cinzel} px-4 py-2 rounded-lg text-sm md:text-base transition-all`}
      style={{
        background: active ? `${GOLD}22` : "transparent",
        border: `1px solid ${active ? GOLD : "#3d3d5c"}`,
        color: active ? GOLD : "#e0e0e0aa",
        fontWeight: active ? 700 : 400,
        boxShadow: active ? `0 0 16px ${GOLD}33` : "none",
      }}
    >
      {label}
    </button>
  );
}

// ── Shared layout primitives ──────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className={`${cinzel} text-[#c8a84e] font-bold mb-3`} style={{ fontSize: "clamp(20px,2.6vw,28px)", letterSpacing: "0.04em" }}>
        {title}
      </h2>
      <div
        className="rounded-xl p-5 md:p-6"
        style={{ background: "linear-gradient(160deg, rgba(45,45,74,0.55), rgba(20,20,38,0.85))", border: "1px solid #3d3d5c" }}
      >
        {children}
      </div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className={`${crimson} text-[#e0e0e0]/85 leading-relaxed mb-3`} style={{ fontSize: 16 }}>{children}</p>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg px-4 py-3 text-center" style={{ background: "#15152e", border: "1px solid #3d3d5c" }}>
      <div className={`${cinzel} font-bold text-[#c8a84e]`} style={{ fontSize: 22 }}>{value}</div>
      <div className={`${crimson} text-[#e0e0e0]/65`} style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className={`${crimson} text-[#e0e0e0]/85 leading-relaxed flex gap-2`} style={{ fontSize: 15.5 }}>
          <span className="text-[#c8a84e] shrink-0" aria-hidden="true">◆</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

const Hi = ({ children }: { children: React.ReactNode }) => <strong className="text-[#c8a84e]">{children}</strong>;

// ── Beginner guide (complete) ─────────────────────────────────────────────────
function BeginnerGuide() {
  return (
    <>
      <Section title="Le but du jeu">
        <P>
          Chaque joueur incarne un <Hi>héros</Hi> qui démarre avec <Hi>{HERO_MAX_HP} points de vie</Hi>. Vous gagnez
          la partie en réduisant les points de vie du héros adverse à <Hi>0</Hi>. Pour cela, vous invoquez des
          créatures et lancez des sorts.
        </P>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat value={`${HERO_MAX_HP} PV`} label="Héros au départ" />
          <Stat value={`${STARTING_HAND_SIZE} cartes`} label="Main de départ" />
          <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label="Mana (croît chaque tour)" />
          <Stat value={`${MAX_BOARD_SIZE}`} label="Créatures max sur le terrain" />
        </div>
      </Section>

      <Section title="Le déroulement d'un tour">
        <P>Au début de chacun de vos tours, dans l'ordre :</P>
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

      <Section title="La main et la pioche">
        <P>
          Vous démarrez avec <Hi>{STARTING_HAND_SIZE} cartes</Hi> et pouvez en remplacer autant que vous voulez lors
          du <Hi>mulligan</Hi> (avant le début de la partie). Votre main peut contenir au maximum
          <Hi> {MAX_HAND_SIZE} cartes</Hi> — au-delà, les cartes piochées sont perdues. Si votre deck est vide et que
          vous devez piocher, vous subissez des dégâts de <Hi>fatigue</Hi> croissants.
        </P>
      </Section>

      <Section title="Les créatures">
        <P>
          Une créature a une <Hi>attaque (ATK)</Hi> et des <Hi>points de vie (PV)</Hi>. Quand vous l'invoquez, elle
          arrive avec le <Hi>mal d'invocation</Hi> : elle ne peut pas attaquer le tour où elle est posée (sauf si elle
          possède la capacité <Hi>Charge</Hi>). Dès le tour suivant, elle peut attaquer une créature ennemie ou le
          héros adverse. Le terrain accueille jusqu'à <Hi>{MAX_BOARD_SIZE} créatures</Hi>.
        </P>
      </Section>

      <Section title="Les sorts">
        <P>
          Un sort produit un effet immédiat puis part au <Hi>cimetière</Hi>. Certains sorts nécessitent une
          <Hi> cible</Hi> (une créature, un héros…). Nouveauté : un sort peut aussi <Hi>conférer une capacité de
          créature</Hi> — à une créature ciblée (icône <span style={{ color: "#dfe6e9" }}>blanche</span>) ou à
          toutes vos unités alliées (icône <span style={{ color: "#27ae60" }}>verte</span>).
        </P>
      </Section>

      <Section title="Le combat">
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
        <P>La liste complète des capacités est en bas de page.</P>
      </Section>

      <Section title="Le héros et son pouvoir">
        <P>
          Au-delà de ses {HERO_MAX_HP} PV, votre héros possède un <Hi>pouvoir</Hi> utilisable <Hi>une fois par
          tour</Hi> en payant son coût en mana. Selon le héros, il peut conférer une capacité à une créature,
          déclencher un effet de sort, ou activer une <Hi>aura</Hi> persistante (par ex. renforcer toutes vos unités).
        </P>
      </Section>

      <Section title="Les coûts alternatifs">
        <P>
          Certaines cartes puissantes coûtent, <Hi>en plus du mana</Hi> : des <Hi>points de vie</Hi> de votre héros,
          la <Hi>défausse</Hi> de cartes de votre main, ou le <Hi>sacrifice</Hi> de créatures alliées. Ces coûts
          s'additionnent au coût en mana et ne sont pas réductibles.
        </P>
      </Section>

      <Section title="Construire un deck">
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
  return (
    <>
      <Section title="Les chiffres clés">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat value={`${HERO_MAX_HP}`} label="PV du héros" />
          <Stat value={`${DECK_SIZE}`} label="Cartes / deck (exact)" />
          <Stat value={`${STARTING_HAND_SIZE} → ${MAX_HAND_SIZE}`} label="Main (départ → max)" />
          <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label="Mana (+1 / tour)" />
        </div>
      </Section>

      <Section title="Boucle de jeu (spécificités A&M)">
        <Bullets items={[
          <>Début de tour : <Hi>+1 mana max</Hi> (cap {MAX_MANA}), recharge complète, <Hi>pioche 1</Hi>.</>,
          <>Victoire : héros adverse à <Hi>0 PV</Hi>. Deck vide → <Hi>fatigue</Hi> croissante.</>,
          <>Terrain et main plafonnés à <Hi>{MAX_BOARD_SIZE}</Hi>.</>,
          <>Le joueur en second reçoit une <Hi>Étincelle de mana</Hi> (+1 mana au tour 1).</>,
          <><Hi>Mal d'invocation</Hi> par défaut ; <Hi>Charge</Hi> l'annule, <Hi>Raid</Hi> autorise l'attaque (créatures uniquement) en étant « malade ».</>,
        ]} />
      </Section>

      <Section title="Deckbuilding">
        <Bullets items={[
          <><Hi>Mono-faction</Hi>, <Hi>≤ 2 clans</Hi>, <Hi>≤ 4 Mercenaires</Hi>.</>,
          <>Slots de rareté : <Hi>2 / 4 / 6 / 8 / 30</Hi> (Lég / Épique / Rare / Peu Commune / Commune).</>,
          <>Copies : non-communes <Hi>×1</Hi>, communes <Hi>×3</Hi>.</>,
          <>Interdit de mélanger <Hi>Bon</Hi> et <Hi>Maléfique</Hi>.</>,
          <>Faction = race(s) + clan(s). Ex. Élémentaires : race « Élémentaire », clans Feu / Terre / Eau / Air.</>,
        ]} />
      </Section>

      <Section title="Combat — résolution">
        <Bullets items={[
          <>Échange <Hi>simultané</Hi> par défaut ; <Hi>Première Frappe</Hi> frappe avant.</>,
          <>Défense : <Hi>Bouclier divin</Hi> (absorbe 1 coup), <Hi>Résistance X</Hi> (−X, min 1), <Hi>Armure</Hi> (½ dégâts de combat), <Hi>Indestructible</Hi> (immunise le combat), <Hi>Transcendance</Hi> (immunise les sorts), <Hi>Esquive</Hi>.</>,
          <>Contournement : <Hi>Vol</Hi> ignore Provocation ; <Hi>Ombre</Hi> = furtif tant qu'il n'a pas agi.</>,
          <>Offensif : <Hi>Double Attaque / Célérité</Hi>, <Hi>Piétinement</Hi>, <Hi>Souffle de feu X</Hi>, <Hi>Persécution X</Hi>, <Hi>Drain de vie</Hi>, <Hi>Poison</Hi>, <Hi>Paralysie</Hi>, <Hi>Riposte X</Hi>, <Hi>Fureur</Hi>.</>,
          <><Hi>Précision</Hi> ignore le Bouclier divin.</>,
        ]} />
      </Section>

      <Section title="Héros & sorts">
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
    <section className="mt-12">
      <h2 className={`${cinzel} text-[#c8a84e] font-bold mb-2 text-center`} style={{ fontSize: "clamp(22px,3vw,32px)", letterSpacing: "0.04em" }}>
        Toutes les capacités
      </h2>
      <p className={`${crimson} italic text-[#e0e0e0]/60 text-center mb-5`} style={{ fontSize: 14 }}>
        Référence complète, toujours à jour avec le jeu. « X » et « Y » sont des valeurs réglées sur chaque carte.
      </p>

      <div className="flex justify-center mb-7">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une capacité…"
          className={`${crimson} w-full max-w-md px-4 py-2 rounded-lg outline-none`}
          style={{ background: "#15152e", border: `1px solid #3d3d5c`, color: "#e0e0e0", fontSize: 15 }}
        />
      </div>

      <KeywordGroup title={`Capacités de créature (${creatureF.length})`} items={creatureF} />
      <KeywordGroup title={`Capacités de sort (${spellF.length})`} items={spellF} />

      {creatureF.length === 0 && spellF.length === 0 && (
        <p className={`${crimson} text-[#e0e0e0]/50 text-center py-6`}>Aucune capacité ne correspond à « {query} ».</p>
      )}
    </section>
  );
}

function KeywordGroup({ title, items }: { title: string; items: { key: string; label: string; symbol: string; desc: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-8">
      <h3 className={`${cinzel} text-[#e0e0e0]/80 font-semibold mb-3`} style={{ fontSize: 17, letterSpacing: "0.05em" }}>
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((k) => (
          <div
            key={k.key}
            className="flex items-start gap-3 rounded-lg p-3"
            style={{ background: "#15152e", border: "1px solid #2d2d4a" }}
          >
            <div
              className="shrink-0 flex items-center justify-center rounded-md"
              style={{ width: 40, height: 40, background: "#0a0a18", border: `1px solid ${GOLD}44` }}
            >
              <KeywordIcon symbol={k.symbol} keyword={k.key} size={22} />
            </div>
            <div className="min-w-0">
              <div className={`${cinzel} text-[#c8a84e] font-semibold`} style={{ fontSize: 14.5 }}>{k.label}</div>
              <div className={`${crimson} text-[#e0e0e0]/75 leading-snug`} style={{ fontSize: 14 }}>{k.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
