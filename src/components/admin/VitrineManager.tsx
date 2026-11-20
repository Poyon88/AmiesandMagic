"use client";

// Réglages de la page d'accueil : les cartes de chaque visuel et les textes.
// Une section laissée vide garde sa sélection automatique ; un texte non
// réécrit garde celui de messages/*.json.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FACTIONS, getFactionDisplayName, getRarityLabel } from "@/lib/card-engine/constants";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import {
  CLE_IMAGE_JOUER, FACTIONS_VITRINE, IMAGE_JOUER_DEFAUT, LONGUEUR_MAX_TEXTE, MIN_AFFICHES_PAR_RANGEE,
  POIDS_MAX_IMAGE_JOUER, TEXTES_EDITABLES,
  type SectionVitrine,
} from "@/lib/vitrine/config";

export interface CarteCatalogue {
  id: number;
  name: string;
  rarity: string;
  faction: string | null;
  card_type: string;
  image_url: string | null;
  set_id: number | null;
  card_year: number | null;
}

interface Choix { section: SectionVitrine; card_id: number; sort_order: number }
interface TexteEnregistre { key: string; fr: string; translations: Record<string, string> | null }
type Message = { text: string; type: "success" | "error" | "warning" };
/** Langues à produire pour un texte réécrit : toutes sauf le français. */
const NB_LANGUES_CIBLES = SUPPORTED_LOCALES.length - 1;
type Onglet = SectionVitrine | "textes" | "jouer";

const ALIGNEMENTS = [
  { id: "bon", nom: "Bon" },
  { id: "neutre", nom: "Neutre" },
  { id: "maléfique", nom: "Maléfique" },
] as const;

const ONGLETS: { id: Onglet; nom: string; aide: string }[] = [
  {
    id: "mur",
    nom: "1. Mur d'affiches",
    aide: `Le premier visuel : trois rangées, une par alignement. Chaque carte va dans la rangée de l'alignement de sa faction. Une rangée a besoin d'au moins ${MIN_AFFICHES_PAR_RANGEE} cartes ; en dessous, elle reste en sélection automatique.`,
  },
  {
    id: "faction",
    nom: "2. Affiches de faction",
    aide: "La carte qui illustre chaque faction. Une carte par faction : si tu en mets plusieurs de la même faction, la première de la liste l'emporte. Une faction sans carte garde son illustration automatique.",
  },
  {
    id: "tirages",
    nom: "3. Decks Expert",
    aide: "Les cartes montrées en vrai, telles qu'en jeu ; une édition limitée affiche son nombre d'exemplaires. Huit au plus sont affichées ; la carte du bloc « lisibilité » (Morcant, Cavalier du Dernier Nom) prend toujours la première place. Toutes les cartes jouables et illustrées sont proposées.",
  },
  {
    id: "frise",
    nom: "4. Frise de bas de page",
    aide: `La rangée qui défile avant le dernier bouton. Au moins ${MIN_AFFICHES_PAR_RANGEE} cartes, sinon elle reste automatique.`,
  },
  {
    id: "textes",
    nom: "Textes",
    aide: "Écris en français : à l'enregistrement, le texte est traduit automatiquement dans toutes les autres langues. « Rétablir » revient au texte d'origine.",
  },
  {
    id: "jouer",
    nom: "Hub — tuile « Jouer »",
    aide: "Le grand visuel de la tuile « Jouer », sur l'accueil du joueur connecté (pas sur la page publique). Choisis une image en paysage, d'au moins 1 600 px de large : elle est recadrée pour remplir la tuile, et le bas est assombri sous le titre.",
  },
];

const RARITY_COLORS: Record<string, string> = {
  "Commune": "#777", "Peu Commune": "#2e7d32", "Rare": "#0277bd", "Épique": "#8e24aa", "Légendaire": "#b8860b",
};

const alignementDe = (c: CarteCatalogue) => (c.faction ? FACTIONS[c.faction]?.alignment : undefined);
const estPresentable = (c: CarteCatalogue) => !!c.faction && FACTIONS_VITRINE.includes(c.faction);

export default function VitrineManager({ cartes, defauts }: { cartes: CarteCatalogue[]; defauts: Record<string, string> }) {
  const [onglet, setOnglet] = useState<Onglet>("mur");
  const [choix, setChoix] = useState<Choix[]>([]);
  const [textes, setTextes] = useState<Record<string, TexteEnregistre>>({});
  const [imageJouer, setImageJouer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);

  const parId = useMemo(() => new Map(cartes.map((c) => [c.id, c])), [cartes]);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/vitrine");
      const data = await res.json();
      if (data.error) {
        setMessage({ text: data.error, type: "error" });
      } else {
        setChoix(data.cartes ?? []);
        const lignes = (data.textes ?? []) as TexteEnregistre[];
        setTextes(Object.fromEntries(lignes.map((t) => [t.key, t])));
        setImageJouer(lignes.find((t) => t.key === CLE_IMAGE_JOUER)?.fr || null);
      }
    } catch {
      setMessage({ text: "Lecture impossible : vérifie ta connexion.", type: "error" });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Chargement initial : l'état vient du serveur, pas du rendu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    charger();
  }, [charger]);

  const info = ONGLETS.find((o) => o.id === onglet)!;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#333", marginBottom: 6 }}>Vitrine — page d&apos;accueil</h1>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
        Les cartes de chaque visuel et les textes de la page d&apos;accueil publique. Tout ce qui reste vide garde son réglage automatique.
      </p>

      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            role="tab"
            aria-selected={onglet === o.id}
            onClick={() => { setOnglet(o.id); setMessage(null); }}
            style={{
              padding: "8px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer",
              border: onglet === o.id ? "1px solid #333" : "1px solid #ccc",
              background: onglet === o.id ? "#333" : "#fff",
              color: onglet === o.id ? "#fff" : "#333",
              fontWeight: onglet === o.id ? 600 : 400,
            }}
          >
            {o.nom}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 14, color: "#444", lineHeight: 1.5, marginBottom: 16, maxWidth: 820 }}>{info.aide}</p>

      {message && (
        <div
          role="status"
          style={{
            padding: 12, marginBottom: 16, borderRadius: 8, fontSize: 14,
            background: message.type === "success" ? "#d4edda" : message.type === "warning" ? "#fff3cd" : "#f8d7da",
            color: message.type === "success" ? "#155724" : message.type === "warning" ? "#7a5a00" : "#721c24",
          }}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 20, color: "#666" }}>Chargement…</div>
      ) : onglet === "textes" ? (
        <Textes defauts={defauts} textes={textes} setTextes={setTextes} setMessage={setMessage} />
      ) : onglet === "jouer" ? (
        <ImageJouer image={imageJouer} setImage={setImageJouer} setMessage={setMessage} />
      ) : (
        <SectionCartes
          key={onglet}
          section={onglet}
          cartes={cartes}
          parId={parId}
          choix={choix.filter((c) => c.section === onglet).sort((a, b) => a.sort_order - b.sort_order)}
          recharger={charger}
          setMessage={setMessage}
        />
      )}
    </div>
  );
}

// ── Une section de cartes ────────────────────────────────────────────────

function SectionCartes({
  section, cartes, parId, choix, recharger, setMessage,
}: {
  section: SectionVitrine;
  cartes: CarteCatalogue[];
  parId: Map<number, CarteCatalogue>;
  choix: Choix[];
  recharger: () => Promise<void>;
  setMessage: (m: Message | null) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [faction, setFaction] = useState("");
  const [occupe, setOccupe] = useState(false);

  const choisies = choix.map((c) => parId.get(c.card_id)).filter((c): c is CarteCatalogue => !!c);
  // Carte choisie puis retirée du jeu (ou dont l'image a disparu) : la page
  // l'ignore, on le dit ici plutôt que de la cacher.
  const perdues = choix.filter((c) => !parId.has(c.card_id));
  const idsChoisis = new Set(choix.map((c) => c.card_id));

  async function appeler(method: "POST" | "DELETE" | "PATCH", body: Record<string, unknown>, succes?: string) {
    setOccupe(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/vitrine", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, ...body }),
      });
      const data = await res.json();
      if (data.error) setMessage({ text: data.error, type: "error" });
      else if (succes) setMessage({ text: succes, type: "success" });
      await recharger();
    } catch {
      setMessage({ text: "Enregistrement impossible : vérifie ta connexion.", type: "error" });
    }
    setOccupe(false);
  }

  function deplacer(idx: number, pas: -1 | 1) {
    const cible = idx + pas;
    if (cible < 0 || cible >= choix.length) return;
    const ids = choix.map((c) => c.card_id);
    [ids[idx], ids[cible]] = [ids[cible], ids[idx]];
    appeler("PATCH", { card_ids: ids });
  }

  const candidates = cartes.filter((c) =>
    !idsChoisis.has(c.id)
    && // « Decks Expert » : tout le catalogue reçu (jouable, illustré). Un filtre
    // sur le tirage limité cachait les communes et jusqu'à la carte du bloc
    // « lisibilité », qui n'a ni set ni millésime.
    (section === "tirages" || estPresentable(c))
    && (!faction || c.faction === faction)
    && (!recherche || c.name.toLowerCase().includes(recherche.toLowerCase())),
  );

  // Faction déjà illustrée par une carte placée plus haut dans la liste.
  const factionsVues = new Set<string>();

  return (
    <>
      {section === "mur" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {ALIGNEMENTS.map((al) => {
            const n = choisies.filter((c) => alignementDe(c) === al.id).length;
            const actif = n >= MIN_AFFICHES_PAR_RANGEE;
            return (
              <span key={al.id} style={{ ...pastille, background: actif ? "#d4edda" : "#eee", color: actif ? "#155724" : "#555" }}>
                {al.nom} : {n} carte{n > 1 ? "s" : ""} — {actif ? "ta sélection" : n === 0 ? "automatique" : `automatique (il en manque ${MIN_AFFICHES_PAR_RANGEE - n})`}
              </span>
            );
          })}
        </div>
      )}
      {section === "faction" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {FACTIONS_VITRINE.map((f) => {
            const choisie = choisies.some((c) => c.faction === f);
            return (
              <span key={f} style={{ ...pastille, background: choisie ? "#d4edda" : "#eee", color: choisie ? "#155724" : "#555" }}>
                {getFactionDisplayName(f)} — {choisie ? "ta carte" : "automatique"}
              </span>
            );
          })}
        </div>
      )}
      {section === "frise" && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ ...pastille, background: choisies.length >= MIN_AFFICHES_PAR_RANGEE ? "#d4edda" : "#eee", color: choisies.length >= MIN_AFFICHES_PAR_RANGEE ? "#155724" : "#555" }}>
            {choisies.length >= MIN_AFFICHES_PAR_RANGEE ? "Ta sélection est affichée" : choisies.length === 0 ? "Automatique" : `Automatique (il en manque ${MIN_AFFICHES_PAR_RANGEE - choisies.length})`}
          </span>
        </div>
      )}

      <div style={panneau}>
        <h2 style={titrePanneau}>Cartes choisies ({choisies.length})</h2>
        {choix.length === 0 ? (
          <div style={{ padding: 20, color: "#666", fontSize: 14 }}>
            Aucune carte choisie : ce visuel utilise sa sélection automatique. Ajoute des cartes ci-dessous pour la remplacer.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {choix.map((ch, idx) => {
              const c = parId.get(ch.card_id);
              if (!c) return null;
              const doublon = section === "faction" && !!c.faction && factionsVues.has(c.faction);
              if (c.faction) factionsVues.add(c.faction);
              return (
                <div key={c.id} style={{ ...ligne, opacity: doublon ? 0.55 : 1 }}>
                  <span style={{ fontSize: 12, color: "#777", width: 24 }}>#{idx + 1}</span>
                  <Vignette carte={c} taille={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Identite carte={c} />
                    {section === "mur" && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: "#555" }}>
                        rangée {ALIGNEMENTS.find((a) => a.id === alignementDe(c))?.nom ?? "?"}
                      </span>
                    )}
                    {doublon && <span style={{ marginLeft: 8, fontSize: 11, color: "#a15c00" }}>non affichée : faction déjà illustrée plus haut</span>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => deplacer(idx, -1)} disabled={occupe || idx === 0} style={boutonOrdre(occupe || idx === 0)} aria-label={`Monter ${c.name}`}>↑</button>
                    <button onClick={() => deplacer(idx, 1)} disabled={occupe || idx === choix.length - 1} style={boutonOrdre(occupe || idx === choix.length - 1)} aria-label={`Descendre ${c.name}`}>↓</button>
                    <button onClick={() => appeler("DELETE", { card_id: c.id })} disabled={occupe} style={boutonRetirer}>Retirer</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {perdues.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#721c24" }}>
            {perdues.length} carte{perdues.length > 1 ? "s" : ""} choisie{perdues.length > 1 ? "s" : ""} n&apos;est plus jouable ou plus illustrée, et n&apos;est donc pas affichée :{" "}
            {perdues.map((p) => (
              <button key={p.card_id} onClick={() => appeler("DELETE", { card_id: p.card_id })} disabled={occupe} style={{ ...boutonRetirer, marginLeft: 6 }}>
                Retirer #{p.card_id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={panneau}>
        <h2 style={titrePanneau}>Ajouter des cartes</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <input
            type="search"
            placeholder="Nom de la carte"
            aria-label="Rechercher une carte par son nom"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ ...champ, flex: "1 1 260px" }}
          />
          <select value={faction} onChange={(e) => setFaction(e.target.value)} aria-label="Filtrer par faction" style={{ ...champ, flex: "0 1 260px" }}>
            <option value="">Toutes les factions</option>
            {(section === "tirages" ? Object.keys(FACTIONS) : FACTIONS_VITRINE).map((f) => (
              <option key={f} value={f}>{getFactionDisplayName(f)}</option>
            ))}
          </select>
        </div>
        <div style={{ maxHeight: 420, overflow: "auto" }}>
          {candidates.length === 0 && (
            <div style={{ padding: 16, color: "#666", fontSize: 14 }}>Aucune carte ne correspond à cette recherche.</div>
          )}
          {candidates.slice(0, 60).map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>
              <Vignette carte={c} taille={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: "#777", marginRight: 6 }}>#{c.id}</span>
                <Identite carte={c} />
              </div>
              <button onClick={() => appeler("POST", { card_id: c.id })} disabled={occupe} style={boutonAjouter}>Ajouter</button>
            </div>
          ))}
          {candidates.length > 60 && (
            <div style={{ padding: 8, textAlign: "center", color: "#666", fontSize: 12 }}>
              {candidates.length - 60} autres cartes : précise le nom ou choisis une faction.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Vignette({ carte, taille }: { carte: CarteCatalogue; taille: number }) {
  if (!carte.image_url) return <span style={{ width: taille, height: taille }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={carte.image_url} alt="" loading="lazy" style={{ width: taille, height: taille, objectFit: "cover", objectPosition: "50% 20%", borderRadius: 6, flexShrink: 0 }} />
  );
}

function Identite({ carte }: { carte: CarteCatalogue }) {
  return (
    <>
      <span style={{ fontWeight: 600, color: "#333", fontSize: 14 }}>{carte.name}</span>
      <span style={{ marginLeft: 8, fontSize: 11, color: RARITY_COLORS[carte.rarity] ?? "#777" }}>{getRarityLabel(carte.rarity)}</span>
      {carte.faction && <span style={{ marginLeft: 6, fontSize: 11, color: "#666" }}>{getFactionDisplayName(carte.faction)}</span>}
    </>
  );
}

// ── Les textes ───────────────────────────────────────────────────────────

function Textes({
  defauts, textes, setTextes, setMessage,
}: {
  defauts: Record<string, string>;
  textes: Record<string, TexteEnregistre>;
  setTextes: React.Dispatch<React.SetStateAction<Record<string, TexteEnregistre>>>;
  setMessage: (m: Message | null) => void;
}) {
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);

  const groupes = useMemo(() => {
    const out: { nom: string; champs: typeof TEXTES_EDITABLES }[] = [];
    for (const t of TEXTES_EDITABLES) {
      const g = out.find((x) => x.nom === t.groupe);
      if (g) g.champs.push(t);
      else out.push({ nom: t.groupe, champs: [t] });
    }
    return out;
  }, []);

  async function enregistrer(key: string, valeur: string) {
    setEnCours(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/vitrine/textes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, fr: valeur }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage({ text: data.error, type: "error" });
      } else {
        setTextes((t) => ({ ...t, [key]: { key, fr: valeur.trim(), translations: data.translations ?? {} } }));
        setBrouillons((b) => { const { [key]: _retire, ...reste } = b; void _retire; return reste; });
        setMessage(data.avertissement
          ? { text: data.avertissement, type: "warning" }
          : { text: "Texte enregistré et traduit dans toutes les autres langues.", type: "success" });
      }
    } catch {
      setMessage({ text: "Enregistrement impossible : vérifie ta connexion.", type: "error" });
    }
    setEnCours(null);
  }

  async function retablir(key: string) {
    setEnCours(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/vitrine/textes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage({ text: data.error, type: "error" });
      } else {
        setTextes((t) => { const { [key]: _retire, ...reste } = t; void _retire; return reste; });
        setBrouillons((b) => { const { [key]: _retire, ...reste } = b; void _retire; return reste; });
        setMessage({ text: "Texte d'origine rétabli, dans toutes les langues.", type: "success" });
      }
    } catch {
      setMessage({ text: "Rétablissement impossible : vérifie ta connexion.", type: "error" });
    }
    setEnCours(null);
  }

  return (
    <>
      {groupes.map((g) => (
        <div key={g.nom} style={panneau}>
          <h2 style={titrePanneau}>{g.nom}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {g.champs.map((champTexte) => {
              const enregistre = textes[champTexte.key];
              const courant = enregistre?.fr ?? defauts[champTexte.key] ?? "";
              const valeur = brouillons[champTexte.key] ?? courant;
              const modifie = valeur.trim() !== courant.trim();
              const occupe = enCours === champTexte.key;
              const nbTraductions = enregistre ? Object.keys(enregistre.translations ?? {}).length : 0;
              const id = `texte-${champTexte.key}`;
              const proprietes = {
                id,
                value: valeur,
                maxLength: LONGUEUR_MAX_TEXTE,
                disabled: occupe,
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setBrouillons((b) => ({ ...b, [champTexte.key]: e.target.value })),
                style: { ...champ, width: "100%" } as React.CSSProperties,
              };
              return (
                <div key={champTexte.key}>
                  <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 4 }}>
                    {champTexte.label}
                    <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: enregistre ? (nbTraductions >= NB_LANGUES_CIBLES ? "#155724" : "#a15c00") : "#666" }}>
                      {!enregistre ? "texte d'origine" : nbTraductions >= NB_LANGUES_CIBLES ? "réécrit, traduit" : `réécrit, ${nbTraductions}/${NB_LANGUES_CIBLES} langues traduites`}
                    </span>
                  </label>
                  {champTexte.long ? <textarea rows={3} {...proprietes} /> : <input type="text" {...proprietes} />}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, alignItems: "center" }}>
                    <button
                      onClick={() => enregistrer(champTexte.key, valeur)}
                      disabled={occupe || !valeur.trim() || (!modifie && nbTraductions >= NB_LANGUES_CIBLES) || (!modifie && !enregistre)}
                      style={boutonAjouter}
                    >
                      {occupe ? "Traduction en cours…" : !modifie && enregistre && nbTraductions < NB_LANGUES_CIBLES ? "Relancer la traduction" : "Enregistrer et traduire"}
                    </button>
                    {modifie && !occupe && (
                      <button onClick={() => setBrouillons((b) => { const { [champTexte.key]: _retire, ...reste } = b; void _retire; return reste; })} style={boutonNeutre}>
                        Annuler la saisie
                      </button>
                    )}
                    {enregistre && !occupe && (
                      <button onClick={() => retablir(champTexte.key)} style={boutonNeutre}>Rétablir le texte d&apos;origine</button>
                    )}
                  </div>
                  {enregistre && (
                    <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Texte d&apos;origine : {defauts[champTexte.key]}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ── Le visuel de la tuile « Jouer » ──────────────────────────────────────

const TYPES_IMAGE: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function ImageJouer({
  image, setImage, setMessage,
}: {
  image: string | null;
  setImage: (url: string | null) => void;
  setMessage: (m: Message | null) => void;
}) {
  const [occupe, setOccupe] = useState<string | null>(null);
  const saisie = useRef<HTMLInputElement>(null);

  async function envoyer(fichier: File) {
    const ext = TYPES_IMAGE[fichier.type];
    if (!ext) { setMessage({ text: "Format refusé : choisis un PNG, un JPEG ou un WebP.", type: "error" }); return; }
    if (fichier.size > POIDS_MAX_IMAGE_JOUER) {
      setMessage({ text: `Image trop lourde (${Math.round(fichier.size / 1048576)} Mo) : ${POIDS_MAX_IMAGE_JOUER / 1048576} Mo au plus.`, type: "error" });
      return;
    }
    setOccupe("Envoi de l'image…");
    setMessage(null);
    try {
      // 1. URL signée, 2. envoi direct au stockage, 3. enregistrement.
      const resUrl = await fetch("/api/admin/vitrine/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ext }),
      });
      const cible = await resUrl.json();
      if (!resUrl.ok || !cible.signedUrl) throw new Error(cible.error ?? "URL d'envoi indisponible");

      const envoi = await fetch(cible.signedUrl, { method: "PUT", headers: { "Content-Type": fichier.type }, body: fichier });
      if (!envoi.ok) throw new Error(`envoi au stockage refusé (${envoi.status})`);

      const res = await fetch("/api/admin/vitrine/image", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: cible.path }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "enregistrement refusé");

      setImage(data.url);
      setMessage({ text: "Visuel remplacé : il est en place sur l'accueil du joueur.", type: "success" });
    } catch (err) {
      setMessage({ text: `Remplacement impossible : ${err instanceof Error ? err.message : "vérifie ta connexion"}.`, type: "error" });
    }
    setOccupe(null);
  }

  async function retablir() {
    setOccupe("Rétablissement…");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/vitrine/image", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "refusé");
      setImage(null);
      setMessage({ text: "Image d'origine rétablie.", type: "success" });
    } catch (err) {
      setMessage({ text: `Rétablissement impossible : ${err instanceof Error ? err.message : "vérifie ta connexion"}.`, type: "error" });
    }
    setOccupe(null);
  }

  return (
    <div style={panneau}>
      <h2 style={titrePanneau}>
        Visuel actuel
        <span style={{ ...pastille, marginLeft: 10, background: image ? "#d4edda" : "#eee", color: image ? "#155724" : "#555" }}>
          {image ? "ton image" : "image d'origine"}
        </span>
      </h2>
      {/* Aperçu au cadrage de la tuile (grand écran) : même recadrage, même voile. */}
      <div style={{ position: "relative", maxWidth: 720, aspectRatio: "10 / 7", borderRadius: 14, overflow: "hidden", background: "#17171c" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image ?? IMAGE_JOUER_DEFAUT} alt="Visuel de la tuile Jouer" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 45%", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(14,14,17,0.92) 0%, rgba(14,14,17,0.35) 38%, transparent 62%)" }} />
        <div style={{ position: "absolute", left: 24, bottom: 20, color: "#f4f3ee" }}>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>Jouer</div>
          <div style={{ fontSize: 15, marginTop: 8, opacity: 0.85 }}>Trouvez un adversaire et affrontez-le</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
        Aperçu indicatif : le cadrage exact dépend de la taille de l&apos;écran du joueur.
      </p>

      <input
        ref={saisie}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) envoyer(f);
        }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14, alignItems: "center" }}>
        <button onClick={() => saisie.current?.click()} disabled={!!occupe} style={boutonAjouter}>
          {occupe ?? "Choisir une nouvelle image…"}
        </button>
        {image && !occupe && (
          <button onClick={retablir} style={boutonNeutre}>Rétablir l&apos;image d&apos;origine</button>
        )}
        <span style={{ fontSize: 12, color: "#666" }}>PNG, JPEG ou WebP, {POIDS_MAX_IMAGE_JOUER / 1048576} Mo au plus.</span>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const panneau: React.CSSProperties = { background: "#fff", border: "1px solid #ddd", borderRadius: 12, padding: 20, marginBottom: 24 };
const titrePanneau: React.CSSProperties = { fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 14 };
const ligne: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#f9f9f9", border: "1px solid #eee", borderRadius: 8 };
const pastille: React.CSSProperties = { padding: "5px 10px", borderRadius: 100, fontSize: 12, fontWeight: 600 };
const champ: React.CSSProperties = { padding: "8px 12px", border: "1px solid #bbb", borderRadius: 6, fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" };
const boutonAjouter: React.CSSProperties = { padding: "6px 14px", background: "#2e7d32", border: "none", borderRadius: 4, color: "#fff", fontSize: 13, cursor: "pointer" };
const boutonRetirer: React.CSSProperties = { padding: "4px 10px", background: "#c62828", border: "none", borderRadius: 4, color: "#fff", fontSize: 12, cursor: "pointer" };
const boutonNeutre: React.CSSProperties = { padding: "6px 14px", background: "#fff", border: "1px solid #bbb", borderRadius: 4, color: "#333", fontSize: 13, cursor: "pointer" };
function boutonOrdre(inactif: boolean): React.CSSProperties {
  return { padding: "4px 8px", background: inactif ? "#eee" : "#e0e0e0", border: "none", borderRadius: 4, color: inactif ? "#aaa" : "#333", fontSize: 12, cursor: inactif ? "default" : "pointer" };
}
