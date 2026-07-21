import type { Card } from "./types";

/** Faction neutre : ses cartes échappent déjà à la règle mono-faction du deck
 *  builder (`DeckBuilder.tsx`), elles servent de liant à tous les decks. Les
 *  exclure du socle gratuit rendrait la construction d'un premier deck
 *  nettement plus dure sans rien rapporter. */
export const NEUTRAL_FACTION = "Mercenaires";

/** Rareté du socle gratuit. Une carte sans rareté est traitée comme Commune,
 *  cohérent avec le reste du code (`DeckBuilder` autorise 3 exemplaires quand
 *  `rarity` est absente, et son filtre « expert » applique le même repli). */
export const FREE_RARITY = "Commune";

/** Droits du joueur vis-à-vis du catalogue. Objet plutôt que paramètres
 *  positionnels : trois booléens voisins s'intervertissent en silence, et le
 *  compilateur ne dirait rien. */
export interface OwnershipContext {
  /** Rôle privilégié : possède tout le catalogue.
   *  ⚠️ Les deux appelants ne s'accordent pas sur sa définition —
   *  `collection/page.tsx` compte `testeur` ET `admin`, `decks/builder/page.tsx`
   *  seulement `testeur`. Divergence PRÉEXISTANTE, laissée telle quelle : la
   *  corriger changerait ce qu'un admin voit dans le deck builder, ce qui n'est
   *  pas l'objet de ce changement. */
  ownsEverything: boolean;
  /** Cartes acquises personnellement : `user_collections` (dons admin) et
   *  `card_prints` (enchères, exemplaires numérotés). */
  collectedCardIds: ReadonlySet<number>;
  /** Compte créé AVANT le passage au modèle « une faction offerte ». Conserve
   *  la règle d'origine — toute carte de set est à lui — pour qu'aucun deck
   *  existant ne devienne injouable. */
  legacyFullAccess: boolean;
  /** Faction choisie à l'inscription. `null` tant qu'elle ne l'est pas : le
   *  joueur ne possède alors que sa collection personnelle et le neutre. */
  starterFaction: string | null;
  /** Option payante : les communes de TOUTES les factions, définitivement. */
  allCommonsUnlocked: boolean;
}

/** Part sérialisable du contexte : ce qu'un Server Component lit dans
 *  `profiles` et transmet tel quel au composant client. Le rôle et la
 *  collection sont déjà passés séparément par les deux surfaces. */
export type Entitlements = Pick<
  OwnershipContext,
  "legacyFullAccess" | "starterFaction" | "allCommonsUnlocked"
>;

/** Droits d'un joueur dont le profil n'a pas encore les colonnes du nouveau
 *  modèle — c'est-à-dire tant que la migration n'est pas appliquée. On retombe
 *  sur `legacyFullAccess`, donc sur la règle d'AVANT : déployer le code sans la
 *  migration ne retire aucune carte à personne. */
export const LEGACY_ENTITLEMENTS: Entitlements = {
  legacyFullAccess: true,
  starterFaction: null,
  allCommonsUnlocked: false,
};

/** Lit les droits depuis une ligne `profiles` éventuellement incomplète.
 *  Une colonne absente (migration non appliquée) ⇒ régime grand-père. */
export function entitlementsFromProfile(
  profile: {
    legacy_full_access?: boolean | null;
    starter_faction?: string | null;
    all_commons_unlocked?: boolean | null;
  } | null | undefined,
): Entitlements {
  if (!profile || profile.legacy_full_access == null) return LEGACY_ENTITLEMENTS;
  return {
    legacyFullAccess: profile.legacy_full_access,
    starterFaction: profile.starter_faction ?? null,
    allCommonsUnlocked: profile.all_commons_unlocked ?? false,
  };
}

/**
 * Une carte est-elle utilisable par ce joueur ?
 *
 * Modèle : à l'inscription le joueur choisit une faction et en reçoit les
 * communes ; une option payante ouvre les communes de toutes les factions. Les
 * raretés supérieures ne s'obtiennent que par la collection personnelle.
 *
 * Évaluation du plus permissif au plus restrictif. L'ordre est load-bearing :
 * la collection personnelle est testée AVANT toute restriction de rareté ou de
 * faction, sinon une Légendaire remportée aux enchères deviendrait inutilisable.
 */
export function isCardOwned(card: Card, ctx: OwnershipContext): boolean {
  if (ctx.ownsEverything) return true;

  // Acquisition personnelle : enchères, dons admin, futurs boosters. Ce chemin
  // ignore délibérément rareté et faction — il ne doit jamais se rétrécir.
  if (ctx.collectedCardIds.has(card.id)) return true;

  // Hors set : jamais distribuée, uniquement acquise (test ci-dessus).
  if (card.set_id == null) return false;

  // Grand-père : la règle d'avant le changement de modèle.
  if (ctx.legacyFullAccess) return true;

  if ((card.rarity ?? FREE_RARITY) !== FREE_RARITY) return false;

  if (ctx.allCommonsUnlocked) return true;

  const faction = card.faction ?? null;
  if (faction === NEUTRAL_FACTION) return true;
  return ctx.starterFaction != null && faction === ctx.starterFaction;
}

export function filterOwnedCards(cards: Card[], ctx: OwnershipContext): Card[] {
  return cards.filter((card) => isCardOwned(card, ctx));
}
