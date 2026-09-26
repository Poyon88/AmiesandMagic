"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { CardInstance } from "@/lib/game/types";
import { getEquipCost } from "@/lib/game/items";
import { OBJET_TEINTE, OBJET_RGB, OBJET_GLYPHE } from "@/lib/game/objet-theme";
import { SPRINGS } from "@/lib/fx/overlayMotion";
import { titleFontScale } from "@/lib/game/card-title";
import useCoarsePointer from "@/hooks/useCoarsePointer";

interface BoardItemProps {
  item: CardInstance;
  /** Objet du joueur LOCAL : lui seul peut l'équiper ou le sacrifier. */
  isOwn: boolean;
  /** Vrai quand cet objet attend qu'on lui désigne une créature. */
  isEquipping?: boolean;
  /** Nom de la créature qui le porte, s'il est équipé. */
  bearerName?: string | null;
  /** L'équipement est-il possible maintenant ? (tour du joueur, mana suffisant,
   *  au moins une créature libre) — sinon la vignette reste inerte. */
  canEquip?: boolean;
  /** Le sacrifice est-il possible maintenant ? (tour du joueur) — sinon la
   *  croix ne s'affiche pas plutôt que d'offrir un geste que le moteur
   *  refuserait en silence. */
  canSacrifice?: boolean;
  onEquip?: () => void;
  onSacrifice?: () => void;
  /** Cible valide de l'action en cours de ciblage (Exécution) : le clic
   *  DÉSIGNE l'objet, avant tout geste d'équipement. */
  isTargetable?: boolean;
  onTarget?: () => void;
}

/** UN OBJET SUR LA TABLE.
 *
 *  Volontairement PLUS PETIT qu'une créature, et sans bouclier de PV : un objet
 *  n'est ni attaquable, ni destructible, et lui donner la même silhouette
 *  qu'une unité laisserait croire le contraire. Ce que la vignette doit dire,
 *  c'est qu'il occupe une place, ce qu'il apporte, et s'il sert déjà.
 *
 *  Clic gauche pour l'équiper (ou le déplacer). Le SACRIFICE passe par une
 *  croix au survol, en DEUX temps.
 *
 *  Il était sur le clic droit, et c'était une faute : ce geste a déjà deux sens
 *  dans le jeu — annuler un ciblage (`GameBoard`) et afficher le détail d'une
 *  carte (`GameCard`). Un joueur qui armait l'équipement puis se ravisait
 *  faisait clic droit pour annuler, curseur encore sur l'objet qu'il venait de
 *  cliquer… et le détruisait. Une action irréversible, gratuite et sans
 *  confirmation, posée sous le geste que tout le reste du jeu emploie pour
 *  « laisser tomber ». Signalé en partie. */
function BoardItem({
  item, isOwn, isEquipping, bearerName, canEquip, canSacrifice, onEquip, onSacrifice,
  isTargetable, onTarget,
}: BoardItemProps) {
  // Sacrifice EN DEUX TEMPS : la croix demande d'abord « Sûr ? ». L'armement
  // se désarme seul au bout de trois secondes — sans quoi une question oubliée
  // resterait en embuscade, et le clic suivant détruirait l'objet.
  const [arme, setArme] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grossierPointeur = useCoarsePointer();
  useEffect(() => () => { if (minuteur.current) clearTimeout(minuteur.current); }, []);

  const cliquerCroix = useCallback((e: React.MouseEvent) => {
    // Sans quoi le clic remonterait à la vignette et armerait l'équipement.
    e.stopPropagation();
    if (minuteur.current) clearTimeout(minuteur.current);
    if (arme) { setArme(false); onSacrifice?.(); return; }
    setArme(true);
    minuteur.current = setTimeout(() => setArme(false), 3000);
  }, [arme, onSacrifice]);

  const card = item.card;
  const cout = getEquipCost(card);
  const atk = card.attack ?? 0;
  const pv = card.health ?? 0;
  const equipe = !!item.equippedToInstanceId;
  const ciblable = !!isTargetable && !!onTarget;
  const cliquable = ciblable || (isOwn && canEquip && !!onEquip);

  return (
    <motion.div
      layout
      data-instance-id={item.instanceId}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: isEquipping ? 1.06 : 1,
      }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={SPRINGS.boardSettle}
      onClick={ciblable ? onTarget : cliquable ? onEquip : undefined}
      onMouseLeave={() => { if (arme) { setArme(false); if (minuteur.current) clearTimeout(minuteur.current); } }}
      title={
        ciblable ? `${card.name}\nClic : cibler cet objet`
        : isOwn
          ? `${card.name}${bearerName ? ` — porté par ${bearerName}` : ""}\n`
            + `Clic : ${equipe ? "déplacer" : "équiper"} (${cout} mana)\n`
            + `Croix : sacrifier (gratuit, libère la place)`
          : card.name
      }
      className="relative shrink-0 rounded-md overflow-hidden select-none group"
      style={{
        width: 52,
        height: 72,
        cursor: cliquable ? "pointer" : "default",
        // Bordure bronze, plus marquée quand l'objet sert déjà : d'un coup d'œil
        // on distingue l'objet AU TRAVAIL de celui qui attend un porteur.
        border: `1px solid ${equipe ? OBJET_TEINTE : `rgba(${OBJET_RGB},0.45)`}`,
        boxShadow: ciblable
          // Même rouge que le halo de cible d'une créature.
          ? "0 0 0 2px #e74c3c, 0 0 14px rgba(231,76,60,0.8)"
          : isEquipping
          ? `0 0 0 2px ${OBJET_TEINTE}, 0 0 14px rgba(${OBJET_RGB},0.8)`
          : equipe ? `0 0 8px rgba(${OBJET_RGB},0.35)` : "none",
        background: "#12100c",
        opacity: equipe ? 1 : 0.92,
      }}
    >
      {card.image_url && (
        <Image
          src={card.image_url}
          alt={card.name}
          fill
          sizes="52px"
          className="object-cover"
          style={{ opacity: 0.55 }}
        />
      )}

      {/* Coût d'ÉQUIPEMENT, en haut à gauche. Ce n'est PAS le coût de mana de la
          carte (déjà payé pour la poser) : c'est ce que coûtera de l'attacher,
          et il se repaie à chaque déplacement — la seule valeur encore utile
          une fois l'objet sur la table. */}
      <div
        className="absolute top-0 left-0 flex items-center justify-center font-bold"
        style={{
          minWidth: 16, height: 16, padding: "0 3px",
          background: OBJET_TEINTE, color: "#1a1208",
          fontSize: 10, borderBottomRightRadius: 5,
          fontFamily: "'Cinzel',serif",
        }}
      >
        {OBJET_GLYPHE}{cout}
      </div>

      {/* Bonus conféré. Masqué s'il est nul : un objet de pures capacités ne
          doit pas afficher un « 0/0 » qui ne veut rien dire. */}
      {/* Coût d'ÉQUIPEMENT — sur la vignette, pas seulement dans l'infobulle :
          un écran tactile n'a pas de survol, et c'est le prix du clic. */}
      <div
        className="absolute top-0 left-0 font-bold"
        style={{
          padding: "0 3px", background: "rgba(0,0,0,0.78)",
          color: OBJET_TEINTE, fontSize: 9, borderBottomRightRadius: 5,
          fontFamily: "'Cinzel',serif",
        }}
      >
        ⚒{cout}
      </div>

      {/* Bonus TOUJOURS affiché, zéros compris : « +0/+1 » dit ce que l'objet
          donne, là où une vignette nue laisserait croire qu'il ne donne rien. */}
      {(
        <div
          className="absolute bottom-0 right-0 font-bold"
          style={{
            padding: "0 3px", background: "rgba(0,0,0,0.78)",
            color: OBJET_TEINTE, fontSize: 9, borderTopLeftRadius: 5,
            fontFamily: "'Cinzel',serif",
          }}
        >
          +{atk}/+{pv}
        </div>
      )}

      <div
        className="absolute left-0 right-0 text-center px-0.5"
        style={{
          bottom: 11,
          fontSize: 7 * titleFontScale(card.name, { charsPerLine: 9, maxLines: 2 }),
          lineHeight: 1.05,
          color: "#e8dcc8",
          textShadow: "0 1px 3px rgba(0,0,0,0.95)",
          fontFamily: "'Cinzel',serif",
        }}
      >
        {card.name}
      </div>

      {/* SACRIFICE — croix au survol, en deux temps.
          Visible d'office sur un pointeur GROSSIER : un écran tactile n'a pas
          de survol, et une commande qui ne se révèle qu'au survol y serait
          purement et simplement absente. */}
      {isOwn && canSacrifice && onSacrifice && (
        <button
          onClick={cliquerCroix}
          title={arme ? "Confirmer le sacrifice" : "Sacrifier cet objet (gratuit, libère la place)"}
          className={grossierPointeur || arme ? "" : "opacity-0 group-hover:opacity-100"}
          style={{
            position: "absolute", top: 0, right: 0, zIndex: 4,
            padding: arme ? "0 4px" : "0 3px",
            height: 14, lineHeight: "14px",
            border: "none", borderBottomLeftRadius: 5, cursor: "pointer",
            background: arme ? "#b03030" : "rgba(0,0,0,0.72)",
            color: arme ? "#fff" : "#e8dcc8",
            fontSize: arme ? 8 : 10,
            fontFamily: "'Cinzel',serif", fontWeight: 700,
            transition: "opacity 0.12s",
          }}
        >
          {arme ? "Sûr ?" : "×"}
        </button>
      )}

      {/* Objet LIBRE : un liseré discret rappelle qu'il ne sert à rien tant
          qu'aucune créature ne le porte — et qu'il mange pourtant une place. */}
      {!equipe && (
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: `rgba(${OBJET_RGB},0.55)` }}
        />
      )}
    </motion.div>
  );
}

export default memo(BoardItem);
