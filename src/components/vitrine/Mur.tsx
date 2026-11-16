"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { factionSlug } from "@/lib/game/faction-slug";
import type { Affiche, RangeeDuMur } from "./types";

/** Durée d'exposition de l'affiche visée quand le mur tourne tout seul. */
const TENUE_MS = 4600;

interface Vocab {
  rarities?: Record<string, string>;
  races?: Record<string, string>;
  clans?: Record<string, string>;
  alignments?: Record<string, string>;
  factions?: Record<string, { displayName?: string }>;
}

interface MurProps {
  rangees: RangeeDuMur[];
  /** Les cartes que le mur met en avant quand personne ne vise. */
  vedettes: Affiche[];
  vocab: Vocab;
  labels: { pause: string; play: string; voirFaction: string };
}

/**
 * Le mur des cartes : trois rangées d'illustrations qui dérivent, et une
 * affiche « visée » qui se détache en grand avec sa fiche.
 *
 * Sans intervention, la visée parcourt les vedettes. Dès qu'un visiteur survole
 * une affiche, la touche ou y arrive au clavier, c'est elle qui est visée, et
 * la ronde automatique s'arrête jusqu'à ce qu'il quitte le mur.
 */
/** Préférence « mouvement réduit », lue APRÈS le montage : le serveur ne la
 *  connaît pas, et un rendu qui en dépendrait dès le premier passage ne
 *  correspondrait pas au HTML reçu. */
function useMouvementReduit(): boolean {
  const [reduit, setReduit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const maj = () => setReduit(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);
  return reduit;
}

export default function Mur({ rangees, vedettes, vocab, labels }: MurProps) {
  const reduit = useMouvementReduit();
  const [index, setIndex] = useState(0);
  const [choisie, setChoisie] = useState<Affiche | null>(null);
  const [enPause, setEnPause] = useState(false);
  const murRef = useRef<HTMLDivElement>(null);

  // Sous 900 px la troisième rangée est masquée : la ronde ne doit viser que
  // des affiches qu'on voit, sinon la carte agrandie ne vient de nulle part.
  const [etroit, setEtroit] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const maj = () => setEtroit(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, []);
  const ronde = useMemo(() => {
    if (!etroit) return vedettes;
    const visibles = new Set(rangees.slice(0, 2).flatMap((r) => r.affiches.map((a) => a.id)));
    const v = vedettes.filter((a) => visibles.has(a.id));
    return v.length > 0 ? v : vedettes;
  }, [etroit, rangees, vedettes]);

  const visee = choisie ?? ronde[index % Math.max(1, ronde.length)] ?? null;

  // La ronde des vedettes. Suspendue pendant qu'un visiteur vise lui-même,
  // quand il a mis le mur en pause, et quand l'onglet est en arrière-plan.
  useEffect(() => {
    if (choisie || enPause || reduit || ronde.length < 2) return;
    const t = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % ronde.length);
    }, TENUE_MS);
    return () => window.clearInterval(t);
  }, [choisie, enPause, reduit, ronde.length]);

  // Les calques de l'affiche visée : la ronde, plus la carte que le visiteur a
  // choisie si elle n'en fait pas partie.
  const calques = useMemo(
    () => (choisie && !ronde.some((a) => a.id === choisie.id) ? [...ronde, choisie] : ronde),
    [ronde, choisie],
  );
  // La carte qu'on quitte reste dessous le temps que la nouvelle se dévoile.
  const [precedente, setPrecedente] = useState<number | null>(null);
  const derniere = useRef<number | null>(null);
  useEffect(() => {
    const id = visee?.id ?? null;
    if (derniere.current !== id) {
      setPrecedente(derniere.current);
      derniere.current = id;
    }
  }, [visee?.id]);

  const viser = useCallback((a: Affiche) => setChoisie(a), []);
  const lacher = useCallback(() => setChoisie(null), []);

  const rangeeActive = useMemo(
    () => rangees.find((r) => r.affiches.some((a) => a.id === visee?.id))?.id,
    [rangees, visee],
  );

  const ligne = visee
    ? [
        visee.race ? (vocab.races?.[visee.race] ?? visee.race) : null,
        visee.clan ? (vocab.clans?.[visee.clan] ?? visee.clan) : null,
      ].filter(Boolean).join(" · ")
    : "";

  return (
    <>
      <div
        ref={murRef}
        className="vt-mur"
        data-paused={enPause || !!choisie || undefined}
        onPointerLeave={lacher}
        onBlur={(e) => {
          if (!murRef.current?.contains(e.relatedTarget as Node | null)) lacher();
        }}
      >
        {rangees.map((r, ri) => (
          <div key={r.id} className="vt-rangee" data-active={r.id === rangeeActive || undefined}>
            <span className="vt-rangee-nom">{vocab.alignments?.[r.id] ?? r.id}</span>
            <div
              className="vt-rail"
              // Chaque rangée a sa vitesse : à pas égal, le mur aurait l'air
              // d'un tapis roulant.
              style={{ ["--vt-dur" as string]: `${r.affiches.length * 7 + ri * 9}s` }}
            >
              {[0, 1].map((lot) => (
                <div key={lot} className="vt-rail-lot" aria-hidden={lot === 1 || undefined}>
                  {r.affiches.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="vt-affiche"
                      data-visee={a.id === visee?.id || undefined}
                      tabIndex={lot === 1 ? -1 : 0}
                      aria-label={a.name}
                      onPointerEnter={(e) => {
                        if (e.pointerType === "mouse") viser(a);
                      }}
                      onFocus={() => viser(a)}
                      onClick={() => viser(a)}
                    >
                      <Image src={a.image} alt="" fill sizes="(max-width: 899px) 27vw, 11vw" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="vt-voile" />

      {visee && (
        <aside className="vt-visee" aria-live="off">
          <div className="vt-visee-art">
            {/* Toutes les illustrations de la ronde sont posées d'avance, l'une
                sur l'autre : changer de carte ne fait que dévoiler un calque
                déjà chargé. Sinon le nom changeait tout de suite et l'image
                attendait le réseau. */}
            {calques.map((a) => (
              <div
                key={a.id}
                className="vt-visee-plan"
                data-etat={a.id === visee.id ? "visee" : a.id === precedente ? "dessous" : undefined}
              >
                <div className="vt-visee-plan vt-visee-zoom">
                  <Image
                    src={a.image}
                    alt=""
                    fill
                    sizes="(max-width: 899px) 34vw, 22vw"
                    priority={a.id === calques[0].id}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="vt-visee-fiche">
            {/* Animation CSS, pas JS : le texte est là dès le premier rendu,
                même si le script tarde. */}
            <div key={visee.id} className="vt-visee-texte">
              <div className="vt-visee-nom">{visee.name}</div>
              <div className="vt-visee-ligne">
                <span className="vt-puce">{vocab.rarities?.[visee.rarity] ?? visee.rarity}</span>
                {ligne && <span>{ligne}</span>}
              </div>
              {visee.flavor && <p className="vt-visee-ambiance">{visee.flavor}</p>}
            </div>
          </div>
          <Link
            className="vt-visee-lien"
            href={`/factions/${factionSlug(visee.faction)}`}
            aria-label={`${labels.voirFaction} — ${vocab.factions?.[visee.faction]?.displayName ?? visee.faction}`}
          />
        </aside>
      )}

      {/* Toujours dans le HTML ; masqué en CSS si le mouvement est réduit. */}
      <button type="button" className="vt-pause" aria-pressed={enPause} onClick={() => setEnPause((p) => !p)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">
            {enPause ? <path d="M2 1l9 5-9 5z" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" />}
          </svg>
          {enPause ? labels.play : labels.pause}
        </button>
    </>
  );
}

/** Une rangée du mur, décorative : elle dérive sans rien viser. Sert de rappel
 *  du mur en clôture de page. */
export function Frise({ affiches }: { affiches: Affiche[] }) {
  if (affiches.length < 6) return null;
  return (
    <div className="vt-frise" aria-hidden="true">
      <div className="vt-rail" style={{ ["--vt-dur" as string]: `${affiches.length * 8}s` }}>
        {[0, 1].map((lot) => (
          <div key={lot} className="vt-rail-lot">
            {affiches.map((a) => (
              <div key={a.id} className="vt-affiche vt-affiche--frise">
                <Image src={a.image} alt="" fill sizes="(max-width: 899px) 27vw, 11vw" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
