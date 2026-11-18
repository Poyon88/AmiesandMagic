import React from "react";
import {
  AbsoluteFill, Easing, Img, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/BricolageGrotesque";

// Bande-annonce d'Armies of Legends — même monde que la vitrine : fond neutre,
// la couleur vient des illustrations, vermillon pour l'appel à l'action.
//
// Toute animation est pilotée par `useCurrentFrame()` : pas de transition CSS,
// elles ne se rendent pas image par image.

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "800"], subsets: ["latin", "latin-ext"] });

export const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);

const FOND = "#101114";
const ENCRE = "#f3f2ee";
const ENCRE_2 = "#cfcdc6";
const ACCENT = "#d4351a";
const SORTIE = Easing.bezier(0.16, 1, 0.3, 1);

const OUVERTURE = s(3.6);
const PORTRAIT = s(2.7);
const OFFRE = s(3.4);
const FIN = s(3.6);

interface Personnage { fichier: string; nom: string; ligne: string; faction: string; cadrage: string }

/** Cinq cartes Uniques, cinq factions. */
const PERSONNAGES: Personnage[] = [
  { fichier: "hippolyte", nom: "Hippolyte, Couronne de l’Aurore", ligne: "Humains · Les Guerrières du Vent", faction: "Les Royaumes Libres", cadrage: "50% 22%" },
  { fichier: "eleonara", nom: "Éléonara, Reine de la Cour Écarlate", ligne: "Vampires · La Cour Écarlate", faction: "La Nécropole", cadrage: "50% 20%" },
  { fichier: "bourin", nom: "Bourin I", ligne: "Nains · La Forge Ardente", faction: "Les Armées des Montagnes", cadrage: "50% 28%" },
  { fichier: "samourai", nom: "Maître Samouraï Légendaire", ligne: "Les Lames de l’Ombre", faction: "L’Empire du Milieu", cadrage: "50% 55%" },
  { fichier: "nusta", nom: "Nusta Wirina", ligne: "Humains · Les Enfants du Soleil", faction: "Les Royaumes du Soleil", cadrage: "50% 30%" },
];

export const DUREE = OUVERTURE + PERSONNAGES.length * PORTRAIT + OFFRE + FIN;

const RANGEES: string[][] = [
  ["v", "bourin", "archimage", "thane", "audrey", "hippolyte", "volva", "dragon"],
  ["samourai", "oyun", "nusta", "alpha", "maelstrom", "v", "audrey", "thane"],
  ["eleonara", "morcant", "vorthak", "grul", "nefersara", "eleonara", "morcant", "vorthak"],
];

const art = (nom: string) => staticFile(`art/${nom}.webp`);

/** Le mur : trois rangées d'affiches qui dérivent en sens alternés. */
const Mur: React.FC<{ vitesse?: number; lumiere?: number }> = ({ vitesse = 1, lumiere = 0.5 }) => {
  const frame = useCurrentFrame();
  const L = 250, H = 375, G = 18;
  return (
    <AbsoluteFill style={{ justifyContent: "center", gap: 26, backgroundColor: FOND }}>
      {RANGEES.map((rangee, r) => {
        const pas = (L + G) * rangee.length;
        const sens = r % 2 === 0 ? -1 : 1;
        const avance = ((frame * (1.5 + r * 0.45) * vitesse) % pas);
        const x = sens === -1 ? -avance : avance - pas;
        return (
          <div key={r} style={{ display: "flex", gap: G, width: "max-content", transform: `translateX(${x}px)` }}>
            {[...rangee, ...rangee, ...rangee].map((nom, i) => (
              <div key={i} style={{ width: L, height: H, borderRadius: 10, overflow: "hidden", flex: "none", filter: `brightness(${lumiere}) saturate(0.9)` }}>
                <Img src={art(nom)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%" }} />
              </div>
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Des mots qui montent l'un après l'autre. */
const Mots: React.FC<{ texte: string; depart?: number; pas?: number; style?: React.CSSProperties }> = ({
  texte, depart = 0, pas = 3, style,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: "0.24em", ...style }}>
      {texte.split(" ").map((mot, i) => {
        const t = interpolate(frame, [depart + i * pas, depart + i * pas + s(0.55)], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: SORTIE,
        });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: "0.12em" }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - t) * 105}%)` }}>{mot}</span>
          </span>
        );
      })}
    </div>
  );
};

const titre: React.CSSProperties = { fontFamily, fontWeight: 800, color: ENCRE, letterSpacing: "-0.035em", lineHeight: 0.98 };

const Ouverture: React.FC = () => {
  const frame = useCurrentFrame();
  const fondu = interpolate(frame, [0, s(0.8)], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: FOND }}>
      <AbsoluteFill style={{ opacity: fondu }}><Mur /></AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(90deg, rgba(16,17,20,0.97) 0%, rgba(16,17,20,0.8) 38%, rgba(16,17,20,0) 72%)" }} />
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 110px" }}>
        <Mots texte="Armies of Legends" depart={s(0.5)} pas={5} style={{ ...titre, fontSize: 176 }} />
        <Mots texte="Le jeu de cartes à collectionner" depart={s(1.4)} style={{ fontFamily, fontWeight: 400, fontSize: 46, color: ENCRE_2, marginTop: 26 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Portrait: React.FC<{ p: Personnage; aGauche: boolean }> = ({ p, aGauche }) => {
  const frame = useCurrentFrame();
  const entree = interpolate(frame, [0, s(0.75)], [0, 1], { extrapolateRight: "clamp", easing: SORTIE });
  const zoom = interpolate(frame, [0, PORTRAIT], [1.1, 1.0]);
  const fond = interpolate(frame, [0, PORTRAIT], [1.25, 1.38]);
  const ficheO = interpolate(frame, [s(0.7), s(1.1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cote = aGauche ? { left: 130 } : { right: 130 };
  const texteCote = aGauche ? { left: 870, right: 110 } : { left: 110, right: 870 };
  return (
    <AbsoluteFill style={{ backgroundColor: FOND, overflow: "hidden" }}>
      {/* L'illustration elle-même, agrandie et floutée, sert de décor. */}
      <Img src={art(p.fichier)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: p.cadrage, transform: `scale(${fond})`, filter: "blur(46px) brightness(0.34) saturate(1.1)" }} />
      <div style={{
        position: "absolute", top: 90, ...cote, width: 620, height: 900, borderRadius: 18, overflow: "hidden",
        boxShadow: `0 0 0 4px ${ENCRE}, 0 50px 120px rgba(0,0,0,0.75)`,
        clipPath: `inset(${(1 - entree) * 100}% 0 0 0 round 18px)`,
      }}>
        <Img src={art(p.fichier)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: p.cadrage, transform: `scale(${zoom})` }} />
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, ...texteCote, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Mots texte={p.nom} depart={s(0.3)} pas={4} style={{ ...titre, fontSize: p.nom.length > 22 ? 104 : 136 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 38, opacity: ficheO, fontFamily, fontSize: 34, fontWeight: 600, color: ENCRE_2 }}>
          <span style={{ background: ENCRE, color: FOND, fontWeight: 800, padding: "8px 22px", borderRadius: 100, fontSize: 30 }}>Unique</span>
          <span>{p.ligne}</span>
        </div>
        <div style={{ marginTop: 18, opacity: ficheO, fontFamily, fontSize: 34, fontWeight: 400, color: ENCRE_2 }}>{p.faction}</div>
      </div>
    </AbsoluteFill>
  );
};

const Offre: React.FC = () => {
  const frame = useCurrentFrame();
  const lumiere = interpolate(frame, [0, s(1)], [0.75, 0.42], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: FOND }}>
      <Mur vitesse={3.2} lumiere={lumiere} />
      <AbsoluteFill style={{ background: "rgba(16,17,20,0.55)" }} />
      <AbsoluteFill style={{ justifyContent: "center", padding: "0 110px" }}>
        <Mots texte="Une faction entière, offerte." depart={s(0.3)} pas={5} style={{ ...titre, fontSize: 164, maxWidth: 1500 }} />
        <Mots texte="Plus de 300 cartes dès l’inscription." depart={s(1.4)} style={{ fontFamily, fontWeight: 400, fontSize: 52, color: ENCRE, marginTop: 34 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Fin: React.FC = () => {
  const frame = useCurrentFrame();
  const bouton = interpolate(frame, [s(1.3), s(1.8)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: SORTIE });
  const noir = interpolate(frame, [FIN - s(0.5), FIN], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: FOND, justifyContent: "center", padding: "0 110px" }}>
      <Mots texte="Aucun deck Expert ne ressemble au tien." depart={s(0.2)} pas={4} style={{ ...titre, fontSize: 132, maxWidth: 1500 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 64, opacity: bouton, transform: `translateY(${(1 - bouton) * 24}px)` }}>
        <span style={{ fontFamily, fontWeight: 800, fontSize: 40, color: "#fff", background: ACCENT, padding: "26px 48px", borderRadius: 100 }}>
          Choisis ta faction offerte
        </span>
        <span style={{ fontFamily, fontWeight: 600, fontSize: 40, color: ENCRE }}>armiesoflegends.com</span>
      </div>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: noir }} />
    </AbsoluteFill>
  );
};

export const BandeAnnonce: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: FOND }}>
    <Series>
      <Series.Sequence durationInFrames={OUVERTURE}><Ouverture /></Series.Sequence>
      {PERSONNAGES.map((p, i) => (
        <Series.Sequence key={p.fichier} durationInFrames={PORTRAIT}>
          <Portrait p={p} aGauche={i % 2 === 0} />
        </Series.Sequence>
      ))}
      <Series.Sequence durationInFrames={OFFRE}><Offre /></Series.Sequence>
      <Series.Sequence durationInFrames={FIN}><Fin /></Series.Sequence>
    </Series>
  </AbsoluteFill>
);
