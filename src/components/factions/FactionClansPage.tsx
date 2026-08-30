"use client";

// Présentation d'une faction par ses CLANS.
//
// Mise en page retenue : une seule page, un bloc par clan à la suite, chacun
// ancrable. Les clans sont très inégalement fournis — de 1 à 31 communes — et
// une section courte se lit bien, là où une page entière consacrée à un clan
// d'une seule carte sonnerait creux.
//
// Le portrait d'un clan est DÉRIVÉ du moteur (cf. clan-profile.ts) : races,
// capacités emblématiques, penchant offensif/défensif. Aucune prose à écrire,
// donc rien qui se désaccorde au premier rééquilibrage.

import { useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useMessages } from "next-intl";
import { useVocab } from "@/i18n/useVocab";
import { useHeroText } from "@/i18n/useHeroText";
import { useTranslations } from "next-intl";
import FactionActionBar from "./FactionActionBar";
import GameCard from "@/components/cards/GameCard";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { FACTIONS } from "@/lib/card-engine/constants";
import { KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import type { SpellKeywordId, KeywordMode } from "@/lib/game/types";
import type { Keyword } from "@/lib/game/types";
import type { ClanProfile } from "@/lib/game/clan-profile";
import type { SignatureEntry } from "@/lib/game/clan-signature";
import type { AdditionalCost, CoutKind } from "@/lib/game/clan-costs";
import { jaugeDilatee, type StatProfile } from "@/lib/game/clan-stat-profile";
import { REPLI_TEINTE, REPLI_GLYPHE } from "@/lib/game/repli-theme";
import ExileGlyph from "@/components/cards/ExileGlyph";
import type { Card } from "@/lib/game/types";
import { useEncartSurvol } from "./useEncartSurvol";

const OR = "#c8a84e";

/** Au-delà, la liste de races déborde : Le Pacte des Griffes en accueille onze. */
const RACES_AFFICHEES = 4;

/** Le héros qui représente un clan, tel que la page l'affiche. */
export interface HeroDeClan {
  id: number;
  name: string;
  thumbnail_url: string | null;
  power_name: string | null;
  power_cost: number | null;
  power_description: string | null;
  /** Illustration du pouvoir — celle que le jeu peint à l'activation. */
  power_image_url: string | null;
  /** Activations autorisées par partie. `null` = illimité. */
  power_usage_limit: number | null;
}

interface Section {
  profil: ClanProfile;
  cartes: Card[];
  /** Capacités les plus portées par les cartes du clan, toutes raretés. */
  signature: SignatureEntry[];
  /** Coûts additionnels assez répandus pour caractériser le clan. Vide le plus
   *  souvent : la section n'apparaît alors pas. */
  couts: AdditionalCost[];
  /** Penchant offensif / défensif MESURÉ sur les créatures du clan. `null`
   *  quand il y en a trop peu pour que le partage veuille dire quelque chose. */
  stats: StatProfile | null;
  /** Visage du clan. `null` tant qu'aucun héros ne lui est rattaché. */
  hero: HeroDeClan | null;
}

/** Glyphe d'un coût additionnel — les mêmes qu'en haut à gauche des cartes,
 *  pour qu'on les reconnaisse sans légende. */
function GlypheCout({ kind }: { kind: CoutKind }) {
  const teintes: Record<CoutKind, string> = {
    life: "#e74c3c", discard: "#bbbbbb", sacrifice: "#a060a0", exile: "#7f8fa6",
    topdeck: REPLI_TEINTE,
  };
  const couleur = teintes[kind];
  // Même gabarit que `KeywordIcon` dans la liste des capacités (15 px) : les
  // deux listes se lisent l'une sous l'autre, un décalage de taille se voit.
  const TAILLE = 15;
  if (kind === "exile") {
    return <span style={{ display: "inline-flex", lineHeight: 0 }}><ExileGlyph size={TAILLE} color={couleur} /></span>;
  }
  const glyphe = kind === "life" ? "♥" : kind === "discard" ? "🃏" : kind === "topdeck" ? REPLI_GLYPHE : "☠";
  return (
    <span
      aria-hidden="true"
      style={{
        color: couleur, fontSize: TAILLE, lineHeight: 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: TAILLE, height: TAILLE,
      }}
    >
      {glyphe}
    </span>
  );
}

/** Teinte d'une entrée : seul un vrai déclencheur en porte une. */
const modeDe = (e: SignatureEntry): KeywordMode | undefined =>
  e.dominant && e.dominant !== "permanent" ? e.dominant : undefined;

/** Clé stable d'une capacité, les deux registres confondus. */
const cle = (e: SignatureEntry) => `${e.spell ? "s" : "c"}:${e.id}`;

/** L'icône d'une capacité, prise dans le bon registre et teintée par le
 *  déclencheur DOMINANT du clan.
 *
 *  Une capacité n'a pas de couleur en soi : un Renforcement à l'attaque n'est
 *  pas un Renforcement à l'entrée, et c'est l'usage du clan qui tranche. En cas
 *  d'égalité, `mode` est absent et l'icône reste blanche. */
function Icone({ entree, size }: { entree: SignatureEntry; size: number }) {
  const symbole = entree.spell
    ? SPELL_KEYWORD_SYMBOLS[entree.id as SpellKeywordId]
    : KEYWORD_SYMBOLS[entree.id as Keyword];
  return (
    <KeywordIcon
      symbol={symbole || "✦"}
      size={size}
      // Les surcharges d'icône en base préfixent les sorts — même convention
      // que le verso des cartes.
      keyword={entree.spell ? `spell_${entree.id}` : entree.id}
      mode={modeDe(entree)}
    />
  );
}

/** Ancre d'une section, dérivée du nom canonique du clan. */
const ancre = (nom: string) =>
  nom.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Ancre de la section « sans clan » — hors du jeu de noms de clans. */
const ANCRE_SANS_CLAN = "toutes-clans";

export default function FactionClansPage({
  factionId,
  sections,
  sansClan,
}: {
  factionId: string;
  sections: Section[];
  /** Communes de la faction n'appartenant à aucun clan. Le constructeur ne les
   *  compte pas dans la limite d'un clan par deck : elles vont partout. */
  sansClan: Card[];
}) {
  const t = useTranslations("factions_page");
  // Le catalogue partagé nomme factions, clans, races et capacités dans la
  // langue active — la page n'a aucun nom propre à traduire.
  const vocab = useMessages() as unknown as {
    vocab?: {
      factions?: Record<string, { displayName?: string; description?: string }>;
      clans?: Record<string, string>;
      races?: Record<string, string>;
      keywords?: Record<string, { label?: string; desc?: string }>;
      spell_keywords?: Record<string, { label?: string; desc?: string }>;
    };
  };

  const faction = FACTIONS[factionId];
  const nomFaction = vocab.vocab?.factions?.[factionId]?.displayName ?? faction.displayName;
  const descFaction = vocab.vocab?.factions?.[factionId]?.description ?? faction.description;
  const nomClan = (n: string) => vocab.vocab?.clans?.[n] ?? n;
  const nomRace = (r: string) => vocab.vocab?.races?.[r] ?? r;
  // Deux registres, deux espaces de traduction : `incineration` existe des
  // deux côtés et n'y désigne pas la même chose.
  const nomCap = (e: SignatureEntry) =>
    (e.spell ? vocab.vocab?.spell_keywords?.[e.id]?.label : vocab.vocab?.keywords?.[e.id]?.label) ?? e.id;
  const descCap = (e: SignatureEntry) =>
    (e.spell ? vocab.vocab?.spell_keywords?.[e.id]?.desc : vocab.vocab?.keywords?.[e.id]?.desc) ?? "";

  const total = sections.reduce((n, s) => n + s.cartes.length, 0) + sansClan.length;

  return (
    <main style={{ background: "#0a0a18", minHeight: "100vh", color: "#e0e0e0" }}>
      {/* ── Bandeau de faction ─────────────────────────────────────── */}
      <header
        className="relative px-6 md:px-10 pt-10 pb-16 md:pb-20"
        style={{
          background: `radial-gradient(ellipse at 50% 0%, ${faction.color}44 0%, #0a0a18 70%)`,
        }}
      >
        <Link
          href="/landing"
          className="inline-flex items-center gap-2 transition-opacity hover:opacity-100"
          style={{ color: `${OR}bb`, opacity: 0.75, fontSize: 13, letterSpacing: "0.06em" }}
        >
          ← {t("back")}
        </Link>

        <div className="max-w-4xl mx-auto text-center mt-8 md:mt-12">
          <div style={{ fontSize: 48, lineHeight: 1 }} aria-hidden="true">{faction.emoji}</div>
          <h1
            className="am-foil-text font-[family-name:var(--font-cinzel),serif] font-bold mt-4"
            style={{
              fontSize: "clamp(30px, 5vw, 54px)",
              letterSpacing: "0.07em",
              textShadow: `0 0 34px ${faction.accent}44`,
            }}
          >
            {nomFaction}
          </h1>
          <div
            className="mx-auto my-5 h-px w-24"
            style={{ background: `linear-gradient(90deg, transparent, ${OR}, transparent)` }}
          />
          <p
            className="font-[family-name:var(--font-crimson),serif] italic mx-auto"
            style={{ fontSize: "clamp(15px, 1.9vw, 20px)", color: "#e0e0e0aa", maxWidth: "42rem" }}
          >
            {descFaction}
          </p>
          <p style={{ marginTop: 22, fontSize: 13, color: `${OR}cc`, letterSpacing: "0.05em" }}>
            {t("commons_count", { count: total, clans: sections.length })}
          </p>

          {/* La décision se prend ICI, sous les cartes qu'elle engage. La bande
              sait seule ce qu'elle doit proposer — choix gratuit, achat, ou
              rien — et reste muette tant qu'elle l'ignore. */}
          <FactionActionBar
            factionId={factionId}
            nomFaction={nomFaction}
            accent={faction.accent}
          />
        </div>

        {/* Sommaire des clans — la page est longue, on doit pouvoir sauter. */}
        {sections.length > 1 && (
          <nav className="max-w-4xl mx-auto mt-10 flex flex-wrap justify-center gap-2">
            {sections.map((s) => (
              <a
                key={s.profil.nom}
                href={`#${ancre(s.profil.nom)}`}
                className="transition-colors"
                style={{
                  padding: "5px 13px",
                  borderRadius: 999,
                  border: `1px solid ${OR}33`,
                  background: "#ffffff08",
                  fontSize: 12.5,
                  color: "#e0e0e0cc",
                  fontFamily: "var(--font-cinzel), serif",
                  letterSpacing: "0.04em",
                }}
              >
                {nomClan(s.profil.nom)}
              </a>
            ))}
            {sansClan.length > 0 && (
              <a
                href={`#${ANCRE_SANS_CLAN}`}
                style={{
                  padding: "5px 13px",
                  borderRadius: 999,
                  border: `1px solid ${OR}55`,
                  background: `${OR}14`,
                  fontSize: 12.5,
                  color: `${OR}ee`,
                  fontFamily: "var(--font-cinzel), serif",
                  letterSpacing: "0.04em",
                }}
              >
                {t("no_clan_title")}
              </a>
            )}
          </nav>
        )}
      </header>

      {/* ── Un bloc par clan ───────────────────────────────────────── */}
      {sections.map((s, i) => (
        <ClanSection
          key={s.profil.nom}
          section={s}
          index={i}
          couleur={faction.color}
          accent={faction.accent}
          nomClan={nomClan}
          nomRace={nomRace}
          nomCap={nomCap}
          descCap={descCap}
          t={t}
        />
      ))}

      {/* Après le dernier clan : ce qui n'appartient à aucun d'eux. */}
      {sansClan.length > 0 && (
        <SansClanSection
          cartes={sansClan}
          index={sections.length}
          couleur={faction.color}
          accent={faction.accent}
          t={t}
        />
      )}

      <footer className="px-6 py-20 flex flex-wrap justify-center items-center gap-4 md:gap-6">
        <BoutonPied href="/landing">← {t("back")}</BoutonPied>
        {/* On sort d'une faction : la suite naturelle est d'en voir une autre,
            pas de remonter à l'accueil. */}
        <BoutonPied href="/landing#factions">{t("other_factions")} →</BoutonPied>
      </footer>
    </main>
  );
}

function ClanSection({
  section, index, couleur, accent, nomClan, nomRace, nomCap, descCap, t,
}: {
  section: Section;
  index: number;
  couleur: string;
  accent: string;
  nomClan: (n: string) => string;
  nomRace: (r: string) => string;
  nomCap: (e: SignatureEntry) => string;
  descCap: (e: SignatureEntry) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  const ref = useRef<HTMLElement>(null);
  const vu = useInView(ref, { once: true, margin: "-80px" });
  const { profil, cartes } = section;

  const racesVisibles = profil.races.slice(0, RACES_AFFICHEES);
  const racesEnPlus = profil.races.length - racesVisibles.length;

  return (
    <section
      ref={ref}
      id={ancre(profil.nom)}
      className="px-6 md:px-10 py-14 md:py-20"
      style={{
        // Alternance discrète : les blocs se distinguent sans bordure lourde.
        background: index % 2 === 0 ? "transparent" : "#ffffff05",
        scrollMarginTop: 24,
      }}
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={vu ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          {/* Titre du clan + décompte, précédés du visage du clan */}
          <div className="flex items-center gap-4 flex-wrap">
            {section.hero && <PortraitHero hero={section.hero} couleur={accent} />}
            <h2
              className="font-[family-name:var(--font-cinzel),serif] font-bold"
              style={{ fontSize: "clamp(21px, 3vw, 32px)", color: accent, letterSpacing: "0.05em" }}
            >
              {nomClan(profil.nom)}
            </h2>
            <span style={{ fontSize: 13, color: "#e0e0e055", letterSpacing: "0.05em" }}>
              {t("commons", { count: cartes.length })}
            </span>
          </div>
          <div
            className="mt-3 mb-7 h-px"
            style={{ background: `linear-gradient(90deg, ${couleur}, ${couleur}22, transparent)` }}
          />

          {/* Le portrait du clan : races, signature, penchant */}
          <div className="grid gap-6 md:gap-10 md:grid-cols-3 mb-9">
            <Bloc titre={t("races")}>
              <div className="flex flex-wrap gap-1.5">
                {racesVisibles.map((r) => (
                  <Pastille key={r} couleur={couleur}>{nomRace(r)}</Pastille>
                ))}
                {racesEnPlus > 0 && (
                  <Pastille couleur={couleur}>{t("more_races", { count: racesEnPlus })}</Pastille>
                )}
              </div>
            </Bloc>

            <div>
              <Bloc titre={t("signature")}>
                <Signature entrees={section.signature} nomCap={nomCap} descCap={descCap} couleur={couleur} />
              </Bloc>
              {/* Sous les capacités, et seulement quand le clan en a vraiment
                  l'habitude : un coût isolé n'est pas une identité. */}
              {section.couts.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <Bloc titre={t("costs")}>
                    <ListeSurvolable
                      couleur={couleur}
                      elements={section.couts.map((c) => ({
                        cle: c.kind,
                        icone: <GlypheCout kind={c.kind} />,
                        // Pas de montant dans la liste : il varie d'une carte à
                        // l'autre, et « 2–3 » alourdit sans rien apprendre. Ce
                        // qui compte est QUE le clan paie ainsi.
                        libelle: t(`cost_${c.kind}`),
                        compte: c.count,
                        titre: t(`cost_${c.kind}`),
                        desc: t(`cost_${c.kind}_desc`),
                      }))}
                    />
                  </Bloc>
                </div>
              )}
            </div>

            {/* Rien à montrer quand le clan n'a pas assez de créatures : un
                partage tiré d'une ou deux cartes ne dit rien. */}
            {section.stats && (
              <Bloc titre={t("profile")}>
                <Jauge libelle={t("offense")} part={section.stats.offensif} couleur="#e07a5f" />
                <Jauge libelle={t("defense")} part={section.stats.defensif} couleur="#5f9ee0" />
              </Bloc>
            )}
          </div>

          {/* Toutes les communes du clan */}
          <div className="flex flex-wrap gap-3 md:gap-4 justify-center sm:justify-start">
            {cartes.map((c) => (
              <GameCard key={c.id} card={c} size="sm" />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Les communes de la faction qui n'ont pas de clan.
 *
 *  Elles ne sont pas un reliquat : elles représentent souvent un tiers à la
 *  moitié du commun d'une faction, et ce sont les seules que TOUS ses decks
 *  peuvent jouer. D'où une section à part entière, en clôture — pas une note
 *  de bas de page.
 *
 *  Pas de races, pas de signature, pas de jauges : ces repères décrivent un
 *  clan, et il n'y en a pas ici. Une phrase suffit, et elle dit la règle. */
function SansClanSection({
  cartes, index, couleur, accent, t,
}: {
  cartes: Card[];
  index: number;
  couleur: string;
  accent: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const ref = useRef<HTMLElement>(null);
  const vu = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      id={ANCRE_SANS_CLAN}
      className="px-6 md:px-10 py-14 md:py-20"
      style={{
        background: index % 2 === 0 ? "transparent" : "#ffffff05",
        scrollMarginTop: 24,
      }}
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={vu ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="flex items-baseline gap-4 flex-wrap">
            <h2
              className="font-[family-name:var(--font-cinzel),serif] font-bold"
              style={{ fontSize: "clamp(21px, 3vw, 32px)", color: accent, letterSpacing: "0.05em" }}
            >
              {t("no_clan_title")}
            </h2>
            <span style={{ fontSize: 13, color: "#e0e0e055", letterSpacing: "0.05em" }}>
              {t("commons", { count: cartes.length })}
            </span>
          </div>
          <div
            className="mt-3 mb-6 h-px"
            style={{ background: `linear-gradient(90deg, ${couleur}, ${couleur}22, transparent)` }}
          />

          <p
            className="font-[family-name:var(--font-crimson),serif] italic mb-9"
            style={{ fontSize: 15, color: "#e0e0e0aa", maxWidth: "44rem", lineHeight: 1.55 }}
          >
            {t("no_clan_desc")}
          </p>

          <div className="flex flex-wrap gap-3 md:gap-4 justify-center sm:justify-start">
            {cartes.map((c) => (
              <GameCard key={c.id} card={c} size="sm" />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Bouton de pied de page. Les deux sont STRICTEMENT identiques : aucun des
 *  deux chemins n'est plus recommandé que l'autre, et une mise en avant se
 *  lisait comme une hiérarchie qui n'existe pas. */
function BoutonPied({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="transition-colors"
      style={{
        display: "inline-block",
        padding: "10px 22px",
        borderRadius: 999,
        border: `1px solid ${OR}44`,
        background: "transparent",
        color: `${OR}dd`,
        fontSize: 14,
        letterSpacing: "0.08em",
        fontFamily: "var(--font-cinzel), serif",
      }}
    >
      {children}
    </Link>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          color: `${OR}99`,
          textTransform: "uppercase",
          marginBottom: 9,
          fontFamily: "var(--font-cinzel), serif",
        }}
      >
        {titre}
      </div>
      {children}
    </div>
  );
}

function Pastille({ children, couleur }: { children: React.ReactNode; couleur: string }) {
  return (
    <span
      style={{
        padding: "2.5px 9px",
        borderRadius: 999,
        border: `1px solid ${couleur}66`,
        background: `${couleur}1f`,
        fontSize: 11.5,
        color: "#e0e0e0dd",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Le VISAGE d'un clan : son héros, et son pouvoir au survol.
 *
 *  L'encart montre l'illustration du pouvoir — celle que le jeu peint à
 *  l'activation — parce qu'un nom de pouvoir seul ne dit rien à qui découvre la
 *  faction, et que c'est cette image qu'il reverra en partie.
 *
 *  Portail, comme le reste de la page : la section est peinte dans un flux qui
 *  rognerait un encart débordant vers le haut. */
function PortraitHero({ hero, couleur }: { hero: HeroDeClan; couleur: string }) {
  const { heroName, powerName, powerDesc } = useHeroText();
  const tJeu = useTranslations("game");
  // Marge haute plus large que pour les pastilles : cet encart porte une
  // illustration, il est donc bien plus haut et sortirait de l'écran plus tôt.
  const encart = useEncartSurvol<true>(340);
  const ref = useRef<HTMLButtonElement>(null);
  const montrer = () => encart.montrer(true, ref.current);
  const ouvert = encart.ouverte !== null;

  const nom = heroName(hero);
  const pouvoir = powerName(hero);
  const desc = powerDesc(hero);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={montrer}
        onMouseLeave={encart.fermer}
        onFocus={montrer}
        onBlur={encart.fermer}
        onClick={() => (ouvert ? encart.fermer() : montrer())}
        aria-label={nom}
        className="transition-transform"
        style={{
          width: 54, height: 54, borderRadius: "50%", flexShrink: 0,
          border: `1px solid ${couleur}77`,
          background: "#ffffff08",
          padding: 0, cursor: "help", overflow: "hidden",
          transform: ouvert ? "scale(1.06)" : undefined,
        }}
      >
        {hero.thumbnail_url ? (
          // Portraits servis depuis Supabase Storage : `next/image` refuserait
          // l'hôte sans configuration, et l'optimisation n'apporte rien sur une
          // vignette déjà taillée.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero.thumbnail_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 20 }} aria-hidden="true">👤</span>
        )}
      </button>

      {ouvert && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            ...encart.stylePosition(320),
            borderRadius: 10,
            background: "#12122a",
            border: `1px solid ${couleur}77`,
            boxShadow: "0 12px 34px rgba(0,0,0,0.75)",
            overflow: "hidden",
          }}
        >
          {hero.power_image_url && (
            // Hauteur LIBRE : `cover` sur 128 px rognait l'illustration haut et
            // bas. Elle est ici pour être vue en entier — c'est la même image
            // que le jeu peint à l'activation du pouvoir.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.power_image_url} alt="" style={{ width: "100%", height: "auto", display: "block" }} />
          )}
          <div style={{ padding: "11px 13px" }}>
            <div style={{ fontSize: 13, color: couleur, fontWeight: 700, fontFamily: "var(--font-cinzel), serif" }}>
              {nom}
            </div>
            {pouvoir && (
              <div style={{ fontSize: 12, color: OR, marginTop: 5, fontFamily: "var(--font-cinzel), serif" }}>
                ⚡ {pouvoir}
                {typeof hero.power_cost === "number" && (
                  <span style={{ color: "#e0e0e077" }}> · {hero.power_cost} mana</span>
                )}
                {/* Une limite d'activations change tout à la lecture d'un
                    pouvoir : « une fois par partie » n'est pas « à volonté ».
                    Libellé repris du jeu, pour que le joueur lise la même
                    phrase ici et en partie. */}
                {typeof hero.power_usage_limit === "number" && (
                  <span style={{ color: "#e0e0e077" }}>
                    {" · "}{tJeu("power_usage_limit", { limit: hero.power_usage_limit })}
                  </span>
                )}
              </div>
            )}
            {desc && (
              <div
                className="font-[family-name:var(--font-crimson),serif]"
                style={{ fontSize: 12.5, lineHeight: 1.5, color: "#e0e0e0cc", marginTop: 5 }}
              >
                {desc}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Une part du profil de jeu.
 *
 *  La BARRE est dilatée : les partages réels de tous les clans tiennent entre
 *  39,6 % et 55,8 %, et des barres proportionnelles se ressembleraient toutes.
 *  Le POURCENTAGE EXACT est écrit à côté — c'est lui qui empêche la barre
 *  d'exagérer l'écart qu'elle rend lisible. */
function Jauge({ libelle, part, couleur }: { libelle: string; part: number; couleur: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 7 }}>
      <span style={{ fontSize: 11.5, color: "#e0e0e099", width: 62, flexShrink: 0 }}>{libelle}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#ffffff12", overflow: "hidden", maxWidth: 150 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.round(jaugeDilatee(part) * 100)}%`,
            background: couleur,
            borderRadius: 3,
            boxShadow: `0 0 8px ${couleur}88`,
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: "#e0e0e077", width: 38, flexShrink: 0, textAlign: "right" }}>
        {Math.round(part * 100)}&nbsp;%
      </span>
    </div>
  );
}

/** Les capacités emblématiques d'un clan, chacune dépliant son descriptif.
 *
 *  Nommer une capacité ne suffit pas à qui découvre le jeu : « Persécution X »
 *  ou « Sang mêlé » ne disent rien hors contexte. Le texte vient de
 *  `vocab.keywords`, celui-là même que le jeu affiche au dos des cartes — donc
 *  traduit, et jamais un second texte à tenir à jour.
 *
 *  L'encart est monté en PORTAIL : les blocs de portrait vivent dans une grille,
 *  et un survol en bord de colonne se ferait rogner par le débordement. */
/** Un élément d'une liste survolable : ce qu'on voit, et ce que dit l'encart. */
interface ElementSurvolable {
  cle: string;
  icone: React.ReactNode;
  libelle: string;
  /** Couleur du libellé dans la liste. Blanc cassé par défaut. */
  couleur?: string;
  compte: number;
  /** Titre de l'encart — peut porter une précision que la liste n'affiche pas. */
  titre: string;
  desc: string;
}

/** Liste de pastilles dont chacune déplie son descriptif au survol.
 *
 *  PARTAGÉE par les capacités emblématiques et les coûts additionnels. Les deux
 *  se lisent pareil et méritent le même encart ; en écrire deux, c'était
 *  garantir qu'ils divergeraient — la logique de placement du portail à elle
 *  seule (bascule au-dessus/en dessous, recadrage horizontal) n'a aucune raison
 *  d'exister en double.
 *
 *  L'encart est monté en PORTAIL : les blocs vivent dans une grille, et un
 *  survol en bord de colonne se ferait rogner par le débordement. */
function ListeSurvolable({
  elements, couleur,
}: {
  elements: ElementSurvolable[];
  couleur: string;
}) {
  const encart = useEncartSurvol<ElementSurvolable>();
  const refs = useRef(new Map<string, HTMLElement>());

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {elements.map((e) => (
        <button
          key={e.cle}
          type="button"
          ref={(el) => { if (el) refs.current.set(e.cle, el); }}
          onMouseEnter={() => encart.montrer(e, refs.current.get(e.cle) ?? null)}
          onMouseLeave={encart.fermer}
          // Clavier et tactile : sans ça, l'encart n'existerait qu'à la souris.
          onFocus={() => encart.montrer(e, refs.current.get(e.cle) ?? null)}
          onBlur={encart.fermer}
          onClick={() => (encart.estOuvert((o) => o.cle === e.cle)
            ? encart.fermer()
            : encart.montrer(e, refs.current.get(e.cle) ?? null))}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            fontSize: 12.5,
            color: e.couleur ?? "#e0e0e0cc",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "help",
            borderBottom: `1px dotted ${couleur}88`,
          }}
        >
          {e.icone}
          {/* Pas de mot du déclencheur dans la LISTE : elle doit rester
              parcourable d'un coup d'œil. La couleur suffit à le signaler ;
              le mot, lui, attend l'encart. */}
          {e.libelle}
          {/* Le décompte rend le classement vérifiable : le visiteur voit
              combien de cartes sont concernées, plutôt qu'un palmarès qu'il
              devrait croire sur parole. */}
          <span style={{ fontSize: 10.5, color: `${couleur}dd`, letterSpacing: "0.03em" }}>×{e.compte}</span>
        </button>
      ))}

      {encart.ouverte && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            ...encart.stylePosition(280),
            padding: "11px 13px",
            borderRadius: 9,
            background: "#12122a",
            border: `1px solid ${couleur}77`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
          }}
        >
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            {encart.ouverte.icone}
            <span style={{ fontSize: 13, color: encart.ouverte.couleur ?? "#fff", fontWeight: 700, fontFamily: "var(--font-cinzel), serif" }}>
              {encart.ouverte.titre}
            </span>
          </div>
          <div
            className="font-[family-name:var(--font-crimson),serif]"
            style={{ fontSize: 12.5, lineHeight: 1.5, color: "#e0e0e0cc" }}
          >
            {encart.ouverte.desc}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Les capacités emblématiques d'un clan, chacune dépliant son descriptif.
 *
 *  Nommer une capacité ne suffit pas à qui découvre le jeu : « Persécution X »
 *  ou « Sang mêlé » ne disent rien hors contexte. Le texte vient de
 *  `vocab.keywords`, celui-là même que le jeu affiche au dos des cartes — donc
 *  traduit, et jamais un second texte à tenir à jour. */
function Signature({
  entrees, nomCap, descCap, couleur,
}: {
  entrees: SignatureEntry[];
  nomCap: (e: SignatureEntry) => string;
  descCap: (e: SignatureEntry) => string;
  couleur: string;
}) {
  const vocab = useVocab();
  // Le mot du déclencheur — sauf en cas d'ÉGALITÉ, où il n'y a rien à affirmer.
  //
  // Ici, et ICI SEULEMENT, « Permanent » s'affiche encore : le dos des cartes ne
  // le dit plus (il s'y confondait avec la permanence d'un emblème), mais cette
  // vitrine en a besoin pour séparer un profil dominant permanent d'une égalité
  // entre déclencheurs. Les deux sont blancs — le mot est le seul écart.
  const badge = (e: SignatureEntry) =>
    e.dominant === null ? null : vocab.triggerBadge(modeDe(e));

  return (
    <ListeSurvolable
      couleur={couleur}
      elements={entrees.map((e) => {
        const d = badge(e);
        return {
          cle: cle(e),
          icone: <Icone entree={e} size={15} />,
          // Pas de mot du déclencheur dans la LISTE : elle doit rester
          // parcourable d'un coup d'œil. La couleur suffit à le signaler ;
          // le mot, lui, attend l'encart.
          libelle: nomCap(e),
          couleur: d?.color ?? "#fff",
          compte: e.count,
          titre: d ? `${nomCap(e)} (${d.label})` : nomCap(e),
          desc: descCap(e),
        };
      })}
    />
  );
}
