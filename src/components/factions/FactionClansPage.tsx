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

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useTranslations, useMessages } from "next-intl";
import GameCard from "@/components/cards/GameCard";
import KeywordIcon from "@/components/shared/KeywordIcon";
import { FACTIONS } from "@/lib/card-engine/constants";
import { KEYWORD_SYMBOLS } from "@/lib/game/keyword-labels";
import { SPELL_KEYWORD_SYMBOLS } from "@/lib/game/spell-keywords";
import type { SpellKeywordId } from "@/lib/game/types";
import type { Keyword } from "@/lib/game/types";
import type { ClanProfile } from "@/lib/game/clan-profile";
import type { SignatureEntry } from "@/lib/game/clan-signature";
import type { Card } from "@/lib/game/types";
import { overlayRect } from "@/lib/fx/overlayMotion";

const OR = "#c8a84e";

/** Au-delà, la liste de races déborde : Le Pacte des Griffes en accueille onze. */
const RACES_AFFICHEES = 4;

interface Section {
  profil: ClanProfile;
  cartes: Card[];
  /** Capacités les plus portées par les cartes du clan, toutes raretés. */
  signature: SignatureEntry[];
}

/** Clé stable d'une capacité, les deux registres confondus. */
const cle = (e: SignatureEntry) => `${e.spell ? "s" : "c"}:${e.id}`;

/** L'icône d'une capacité, prise dans le bon registre. */
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
      mode={entree.spell ? "spell" : undefined}
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
            {t("free_commons", { count: total, clans: sections.length })}
          </p>
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
          {/* Titre du clan + décompte */}
          <div className="flex items-baseline gap-4 flex-wrap">
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

            <Bloc titre={t("signature")}>
              <Signature entrees={section.signature} nomCap={nomCap} descCap={descCap} couleur={couleur} />
            </Bloc>

            <Bloc titre={t("profile")}>
              <Jauge libelle={t("offense")} valeur={profil.offensif} couleur="#e07a5f" />
              <Jauge libelle={t("defense")} valeur={profil.defensif} couleur="#5f9ee0" />
            </Bloc>
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

function Jauge({ libelle, valeur, couleur }: { libelle: string; valeur: number; couleur: string }) {
  return (
    <div className="flex items-center gap-3" style={{ marginBottom: 7 }}>
      <span style={{ fontSize: 11.5, color: "#e0e0e099", width: 62, flexShrink: 0 }}>{libelle}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#ffffff12", overflow: "hidden", maxWidth: 190 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.round(valeur * 100)}%`,
            background: couleur,
            borderRadius: 3,
            boxShadow: `0 0 8px ${couleur}88`,
          }}
        />
      </div>
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
function Signature({
  entrees, nomCap, descCap, couleur,
}: {
  entrees: SignatureEntry[];
  nomCap: (e: SignatureEntry) => string;
  descCap: (e: SignatureEntry) => string;
  couleur: string;
}) {
  const [ouverte, setOuverte] = useState<SignatureEntry | null>(null);
  const [ancre, setAncre] = useState<{ x: number; y: number; dessous: boolean } | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());

  const montrer = (e: SignatureEntry) => {
    const el = refs.current.get(cle(e));
    if (!el) return;
    const r = overlayRect(el);
    // Au-dessus par défaut ; en dessous quand le haut de fenêtre est trop
    // proche — la première section de clan est haute dans la page.
    const dessous = r.top < 210;
    setAncre({ x: r.left + r.width / 2, y: dessous ? r.top + r.height : r.top, dessous });
    setOuverte(e);
  };

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {entrees.map((e) => (
        <button
          key={cle(e)}
          type="button"
          ref={(el) => { if (el) refs.current.set(cle(e), el); }}
          onMouseEnter={() => montrer(e)}
          onMouseLeave={() => setOuverte(null)}
          // Clavier et tactile : sans ça, l'encart n'existerait qu'à la souris.
          onFocus={() => montrer(e)}
          onBlur={() => setOuverte(null)}
          onClick={() => (ouverte && cle(ouverte) === cle(e) ? setOuverte(null) : montrer(e))}
          className="inline-flex items-center gap-1.5 transition-colors"
          style={{
            fontSize: 12.5,
            color: ouverte && cle(ouverte) === cle(e) ? "#fff" : "#e0e0e0cc",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "help",
            borderBottom: `1px dotted ${couleur}88`,
          }}
        >
          <Icone entree={e} size={15} />
          {nomCap(e)}
          {/* Le décompte rend le classement vérifiable : le visiteur voit
              combien de cartes portent la capacité, plutôt qu'un palmarès
              qu'il devrait croire sur parole. */}
          <span style={{ fontSize: 10.5, color: `${couleur}dd`, letterSpacing: "0.03em" }}>×{e.count}</span>
        </button>
      ))}

      {ouverte && ancre && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            left: Math.min(Math.max(ancre.x, 150), (typeof window !== "undefined" ? window.innerWidth : 1200) - 150),
            top: ancre.y + (ancre.dessous ? 9 : -9),
            transform: `translate(-50%, ${ancre.dessous ? "0" : "-100%"})`,
            zIndex: 60,
            width: 280,
            padding: "11px 13px",
            borderRadius: 9,
            background: "#12122a",
            border: `1px solid ${couleur}77`,
            boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
            pointerEvents: "none",
          }}
        >
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <Icone entree={ouverte} size={16} />
            <span style={{ fontSize: 13, color: OR, fontWeight: 700, fontFamily: "var(--font-cinzel), serif" }}>
              {nomCap(ouverte)}
            </span>
          </div>
          <div
            className="font-[family-name:var(--font-crimson),serif]"
            style={{ fontSize: 12.5, lineHeight: 1.5, color: "#e0e0e0cc" }}
          >
            {descCap(ouverte)}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
