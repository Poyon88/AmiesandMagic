"use client";

// La barre de décision, en tête de la page d'une faction.
//
// POURQUOI ICI plutôt que dans la seule boutique : c'est sur cette page que le
// joueur voit les cartes. Choisir sa faction depuis une liste de neuf noms,
// c'est choisir à l'aveugle un engagement définitif ; la décision appartient à
// l'écran qui montre ce qu'on achète.
//
// Composant CLIENT greffé sur une page publique et statiquement générée : la
// page reste indexable et servie telle quelle, et seule cette bande interroge
// le serveur. Un visiteur anonyme reçoit un 401 de `/api/faction-shop`, ce qui
// est ici une réponse et non une erreur — c'est ainsi qu'on sait qu'il n'a pas
// encore de compte.
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GoldCoin from "@/components/shared/GoldCoin";

const OR = "#d4af37";

interface Etat {
  factionPrice: number | null;
  balance: number;
  goldDebt: number;
  ownsBundle: boolean;
  starterFaction: string | null;
  factions: { id: string; owned: boolean; isStarter: boolean }[];
}

type Situation =
  | { quoi: "chargement" }
  /** Pas de compte : rien à décider ici, mais tout à gagner à s'inscrire. */
  | { quoi: "visiteur" }
  /** Aucune faction de départ encore choisie : celle-ci peut être OFFERTE. */
  | { quoi: "offrable" }
  | { quoi: "possedee"; parLeForfait: boolean; deDepart: boolean }
  | { quoi: "achetable"; prix: number; solde: number; dette: number };

/** Décision pure, extraite du rendu : c'est la seule vraie logique du
 *  composant, et elle doit pouvoir être lue et testée sans React. */
export function situationPour(etat: Etat | null, factionId: string, anonyme: boolean): Situation {
  if (anonyme) return { quoi: "visiteur" };
  if (!etat) return { quoi: "chargement" };

  const ligne = etat.factions.find((f) => f.id === factionId);

  if (etat.ownsBundle) return { quoi: "possedee", parLeForfait: true, deDepart: false };
  if (ligne?.owned) return { quoi: "possedee", parLeForfait: false, deDepart: ligne.isStarter };

  // Aucune faction de départ ⇒ celle-ci peut encore l'être, gratuitement. Ce
  // test PASSE AVANT le prix : proposer 1200 or à quelqu'un qui a droit à une
  // faction gratuite serait lui vendre ce qu'on lui doit.
  if (etat.starterFaction == null) return { quoi: "offrable" };

  // Sans tarif (migration non appliquée), il n'y a rien à proposer.
  if (etat.factionPrice == null) return { quoi: "chargement" };

  return {
    quoi: "achetable",
    prix: etat.factionPrice,
    solde: etat.balance,
    dette: etat.goldDebt,
  };
}

export default function FactionActionBar({
  factionId,
  nomFaction,
  accent,
}: {
  factionId: string;
  nomFaction: string;
  accent: string;
}) {
  const t = useTranslations("faction_action");
  const router = useRouter();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [anonyme, setAnonyme] = useState(false);
  const [pret, setPret] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirme, setConfirme] = useState(false);
  // Le joueur vient de prendre sa faction DEPUIS cette page : l'onboarding
  // l'attendait ailleurs, il faut donc lui rouvrir la porte du jeu ici même,
  // sinon il reste sur une vitrine sans savoir qu'il a fini de s'inscrire.
  const [vientDeChoisir, setVientDeChoisir] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await fetch("/api/faction-shop");
      if (res.status === 401) {
        setAnonyme(true);
        return;
      }
      if (res.ok) setEtat(await res.json());
    } catch {
      /* la bande reste muette plutôt que d'afficher une panne sur une vitrine */
    } finally {
      setPret(true);
    }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  async function prendreGratuitement() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/profile/faction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faction: factionId }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: null }));
        setErreur(
          error === "already_chosen"
            ? t("err_already_chosen")
            : t("err_choice"),
        );
        return;
      }
      setVientDeChoisir(true);
      await charger();
      // `refresh` et non un simple état local : la collection, les decks et
      // l'aiguillage d'accueil dépendent tous de cette faction côté serveur.
      router.refresh();
    } catch {
      setErreur(t("err_choice"));
    } finally {
      setEnCours(false);
      setConfirme(false);
    }
  }

  async function acheter() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/faction-shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ faction: factionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.message ?? t("err_purchase"));
        return;
      }
      await charger();
      router.refresh();
    } catch {
      setErreur(t("err_purchase"));
    } finally {
      setEnCours(false);
    }
  }

  // Tant que la première réponse n'est pas là, on n'affiche RIEN : une bande qui
  // dirait « à débloquer » puis se corrigerait en « déjà à vous » ferait
  // clignoter un contresens sur la vitrine du jeu.
  if (!pret) return null;

  const situation = situationPour(etat, factionId, anonyme);
  if (situation.quoi === "chargement") return null;

  const cadre: React.CSSProperties = {
    maxWidth: "42rem",
    margin: "26px auto 0",
    padding: "18px 22px",
    borderRadius: 12,
    border: `1px solid ${accent}55`,
    background: "#ffffff08",
    textAlign: "center",
  };

  const bouton = (couleur: string): React.CSSProperties => ({
    marginTop: 12,
    padding: "9px 22px",
    borderRadius: 8,
    border: `1px solid ${couleur}`,
    background: `${couleur}22`,
    color: couleur,
    fontFamily: "var(--font-cinzel), serif",
    fontSize: 13,
    letterSpacing: "0.06em",
    cursor: "pointer",
  });

  if (situation.quoi === "visiteur") {
    return (
      <div style={cadre}>
        <p style={{ fontSize: 14, color: "#e0e0e0cc" }}>
          {t("visitor_pitch", { faction: nomFaction })}
        </p>
        <Link href="/login" style={{ ...bouton(OR), display: "inline-block", textDecoration: "none" }}>
          {t("visitor_cta")}
        </Link>
      </div>
    );
  }

  if (situation.quoi === "possedee") {
    return (
      <div style={{ ...cadre, border: `1px solid ${OR}55` }}>
        <p style={{ fontSize: 14, color: OR, fontFamily: "var(--font-cinzel), serif", letterSpacing: "0.05em" }}>
          {vientDeChoisir
            ? `★ ${t("owned_just_chosen", { faction: nomFaction })}`
            : situation.parLeForfait
              ? `★ ${t("owned_bundle")}`
              : situation.deDepart
                ? `★ ${t("owned_starter")}`
                : `★ ${t("owned_bought")}`}
        </p>
        <p style={{ fontSize: 13, color: "#e0e0e0aa", marginTop: 6 }}>
          {t("owned_note")}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {vientDeChoisir && (
            <Link href="/" style={{ ...bouton(OR), display: "inline-block", textDecoration: "none" }}>
              {t("enter_game")}
            </Link>
          )}
          <Link
            href="/collection"
            style={{ ...bouton("#9a9aa8"), display: "inline-block", textDecoration: "none", opacity: 0.85 }}
          >
            {t("see_collection")}
          </Link>
        </div>
      </div>
    );
  }

  if (situation.quoi === "offrable") {
    return (
      <div style={cadre}>
        <p style={{ fontSize: 14, color: "#e0e0e0cc" }}>
          {t.rich("free_pitch", {
            faction: nomFaction,
            strong: (c) => <strong style={{ color: OR }}>{c}</strong>,
          })}
        </p>
        {/* Confirmation en deux temps : le choix est DÉFINITIF, et il se trouve
            au bout d'un simple clic sur une page qu'on parcourt. */}
        {!confirme ? (
          <button style={bouton(OR)} onClick={() => setConfirme(true)} disabled={enCours}>
            {t("free_cta")}
          </button>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "#e0a05a", marginTop: 12 }}>
              {t("free_warning")}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={bouton(OR)} onClick={prendreGratuitement} disabled={enCours}>
                {enCours ? "…" : t("free_confirm", { faction: nomFaction.toUpperCase() })}
              </button>
              <button
                style={{ ...bouton("#9a9aa8"), opacity: 0.8 }}
                onClick={() => setConfirme(false)}
                disabled={enCours}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}
        {erreur && <p style={{ fontSize: 13, color: "#e0533c", marginTop: 10 }}>{erreur}</p>}
      </div>
    );
  }

  const { prix, solde, dette } = situation;
  const bloque = dette > 0 || solde < prix;

  return (
    <div style={cadre}>
      <p style={{ fontSize: 14, color: "#e0e0e0cc" }}>
        {t("buy_pitch", { faction: nomFaction })}
      </p>
      <p style={{ marginTop: 8, fontSize: 20, color: OR, fontFamily: "var(--font-cinzel), serif" }}>
        {prix} <GoldCoin size={16} />
        <span style={{ fontSize: 12, color: "#e0e0e088", marginLeft: 10 }}>
          {t("your_balance", { balance: solde })}
        </span>
      </p>
      {dette > 0 && (
        <p style={{ fontSize: 13, color: "#e0533c", marginTop: 8 }}>
          {t("debt_blocks", { debt: dette })}
        </p>
      )}
      <button style={{ ...bouton(OR), opacity: bloque ? 0.45 : 1 }} onClick={acheter} disabled={enCours || bloque}>
        {enCours ? "…" : solde < prix && dette === 0 ? t("not_enough_gold") : t("buy_cta")}
      </button>
      {erreur && <p style={{ fontSize: 13, color: "#e0533c", marginTop: 10 }}>{erreur}</p>}
    </div>
  );
}
