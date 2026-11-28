import { MIN_STARTING_BID } from "@/lib/auction/pricing";
import { USERNAME_MAX, USERNAME_MIN } from "@/lib/auth/username";
import { LIMITED_PRINT_COUNTS, RARITY_MAP } from "@/lib/card-engine/constants";
import { CREDIT_EXPIRY_ALERT_DAYS, ESSENCE_CRAFT_COST, ESSENCE_CRAFT_ODDS, ESSENCE_DAILY_WIN } from "@/lib/economy/constants";
import { DELAI_INACTIVITE_MS } from "@/lib/game/match-result";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { CHECKOUT_EXPIRY_MINUTES, GOLD_PACKS, TICKET_PACKS, TICKET_VALIDITY_DAYS } from "@/lib/payments/config";
import { CREDIT_LIFETIME_DAYS } from "@/lib/tournaments/config";
import { ECONOMIE } from "../economie";
import type { Chapitre, ContexteLivret } from "../livret";

const euros = (centimes: number) => `${(centimes / 100).toFixed(2).replace(".", ",")} €`;
/** Nom affiché d'une rareté (l'identifiant « Légendaire » s'affiche « Unique »). */
const rarete = (id: string) => RARITY_MAP[id]?.label ?? id;
const parRarete = (table: Readonly<Record<string, number>>) =>
  Object.entries(table).map(([id, n]) => `${rarete(id)} ${n}`).join(", ");

/** Montants réglés depuis l'admin : connus seulement si le contexte les porte
 *  (l'agent de tri les lit en base). Le document de référence, lui, renvoie à
 *  l'écran où ils s'affichent — il ne doit pas figer une valeur réglable. */
function montantsRegles(ctx: ContexteLivret): string {
  const e = ctx.economie;
  const ou = (valeur: number | null | undefined, suffixe: string, repli: string) =>
    typeof valeur === "number" ? `${valeur} ${suffixe}` : repli;
  return [
    `- Prix d'une faction : ${ou(e?.prixFaction, "pièces d'or", "affiché dans la boutique (réglé par l'équipe du jeu)")}.`,
    `- Prix du forfait « Toutes les factions » : ${ou(e?.prixForfait, "pièces d'or", "affiché dans la boutique (réglé par l'équipe du jeu)")}.`,
    `- Surenchère minimale : ${ou(e?.surenchereMin, "pièce(s) d'or au-dessus de la mise en cours", "indiquée sur la page de la vente (réglée par l'équipe du jeu)")}.`,
    `- Prolongation d'une vente quand une mise arrive dans les dernières secondes : ${
      typeof e?.prolongationSecondes === "number"
        ? e.prolongationSecondes > 0 ? `${e.prolongationSecondes} secondes` : "désactivée actuellement"
        : "durée réglée par l'équipe du jeu"
    }.`,
    ...(e?.marcheOuvert === false ? ["- L'hôtel des ventes est actuellement fermé : aucune nouvelle vente n'est ouverte."] : []),
  ].join("\n");
}

export const siteEtEconomie: Chapitre = {
  id: "site-economie",
  titre: "Le site et l'économie",
  texte: (ctx) => `Ce chapitre décrit ce qui fonctionne **aujourd'hui** hors des parties. Ce que le site annonce comme prévu ou à venir (déroulement des tournois, récompenses de tournoi, or gagné en jouant) n'y figure pas : il ne faut rien en promettre à un joueur. Les cas individuels — un solde, un achat non reçu, un remboursement — ne se règlent pas avec ce livret : ils relèvent de l'équipe du jeu.

### Montants en vigueur

Fixés dans le jeu :
- Bourses de pièces d'or : ${GOLD_PACKS.map((p) => `${p.label} — ${p.gold} pièces d'or pour ${euros(p.displayPriceCents)}`).join(" ; ")}. Le prix facturé est celui affiché sur la page de paiement.
- Carnets de tickets de tournoi : ${TICKET_PACKS.map((p) => `${p.tickets} ticket${p.tickets > 1 ? "s" : ""} pour ${euros(p.displayPriceCents)}`).join(" ; ")}.
- Validité d'un ticket : ${TICKET_VALIDITY_DAYS} jours à partir de l'achat.
- Une session de paiement non terminée expire après ${CHECKOUT_EXPIRY_MINUTES} minutes.
- Première victoire du jour : ${ESSENCE_DAILY_WIN} essence, une seule fois par jour. Le jour change à minuit en temps universel (UTC).
- Forge d'essence : ${ESSENCE_CRAFT_COST} essence par forge. Chances : ${ESSENCE_CRAFT_ODDS.map((o) => `${o.label} ${o.odds}`).join(" ; ")}.
- Exemplaires d'une édition limitée, par rareté : ${parRarete(LIMITED_PRINT_COUNTS)}.
- Mise de départ minimale aux enchères, par rareté (en pièces d'or) : ${parRarete(MIN_STARTING_BID)}.
- Crédits marché : un lot expire ${CREDIT_LIFETIME_DAYS} jours après son attribution ; l'alerte part quand il lui reste moins de ${CREDIT_EXPIRY_ALERT_DAYS} jours.
- Pseudo : de ${USERNAME_MIN} à ${USERNAME_MAX} caractères.
- Langues disponibles : ${SUPPORTED_LOCALES.length}.
- Une partie sans aucune activité pendant ${Math.round(DELAI_INACTIVITE_MS / 60000)} minutes est fermée par un passage automatique quotidien.

Réglés par l'équipe du jeu (ils peuvent changer) :
${montantsRegles(ctx)}
- Âge minimum pour acheter, et fonctions ouvertes (achat de pièces d'or, tickets, enchères, gains en euros) : ils dépendent du pays de connexion du joueur, que ce livret ne connaît pas.

${ECONOMIE.map((p) => `### ${p.theme}\n${p.regles.map((r) => `- ${r}`).join("\n")}`).join("\n\n")}
`,
};
