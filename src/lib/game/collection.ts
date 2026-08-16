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
   *  joueur ne possède alors que sa collection personnelle et le neutre.
   *
   *  ⚠️ CONSERVÉ mais plus autoritaire : depuis la boutique de factions, c'est
   *  `unlockedFactions` qui fait foi, et la faction offerte n'y est qu'une
   *  entrée parmi d'autres. Ce champ reste pour l'onboarding, qui écrit encore
   *  `profiles.starter_faction`, et pour les profils dont la migration de la
   *  table n'a pas encore été jouée. */
  starterFaction: string | null;
  /** TOUTES les factions dont le joueur détient les communes : celle offerte à
   *  l'inscription ET celles achetées en boutique, lues dans
   *  `user_faction_unlocks`.
   *
   *  OPTIONNELLE à dessein : un appelant qui ne l'a pas encore branchée retombe
   *  sur `starterFaction`, et ne retire donc aucune carte. Un champ obligatoire
   *  aurait forcé chaque site de construction à écrire `new Set()`, c'est-à-dire
   *  exactement le contraire — plus aucune faction. */
  unlockedFactions?: ReadonlySet<string>;
  /** Option payante : les communes de TOUTES les factions, définitivement. */
  allCommonsUnlocked: boolean;
}

/** Part sérialisable du contexte : ce qu'un Server Component lit dans
 *  `profiles` et transmet tel quel au composant client. Le rôle et la
 *  collection sont déjà passés séparément par les deux surfaces. */
export type Entitlements = Pick<
  OwnershipContext,
  "legacyFullAccess" | "starterFaction" | "allCommonsUnlocked" | "unlockedFactions"
>;

/** Profil PRÉSENT mais sans les colonnes du nouveau modèle : la migration n'est
 *  pas encore appliquée. On retombe sur la règle d'AVANT, pour que déployer le
 *  code sans la migration ne retire aucune carte à personne. */
export const LEGACY_ENTITLEMENTS: Entitlements = {
  legacyFullAccess: true,
  starterFaction: null,
  allCommonsUnlocked: false,
  unlockedFactions: new Set(),
};

/** Profil ABSENT — état anormal : le compte existe dans `auth.users` mais sa
 *  ligne `profiles` n'a jamais été créée (trigger en échec). Droits minimaux :
 *  seule la collection personnelle subsiste.
 *
 *  Le repli permissif était un vrai défaut : un compte cassé obtenait le
 *  CATALOGUE COMPLET, puisqu'aucune donnée ne venait le restreindre. Le plus
 *  permissif est le mauvais défaut face à l'inconnu — d'autant qu'ici l'anomalie
 *  se voyait d'autant moins qu'elle était généreuse. */
export const NO_PROFILE_ENTITLEMENTS: Entitlements = {
  legacyFullAccess: false,
  starterFaction: null,
  allCommonsUnlocked: false,
  unlockedFactions: new Set(),
};

/** Lit les droits depuis une ligne `profiles`.
 *
 *  Distingue deux absences que l'on confondait :
 *    • la LIGNE manque      ⇒ état cassé, droits minimaux ;
 *    • la COLONNE manque    ⇒ migration en attente, régime grand-père. */
export function entitlementsFromProfile(
  profile: {
    legacy_full_access?: boolean | null;
    starter_faction?: string | null;
    all_commons_unlocked?: boolean | null;
  } | null | undefined,
  /** Factions débloquées, lues dans `user_faction_unlocks`. Omise ⇒ on retombe
   *  sur la seule faction de départ : c'est le cas d'un appelant qui n'a pas
   *  encore été branché sur la table, et il ne doit RIEN perdre pour autant. */
  unlockedFactions?: Iterable<string>,
): Entitlements {
  if (!profile) return NO_PROFILE_ENTITLEMENTS;
  if (profile.legacy_full_access == null) return LEGACY_ENTITLEMENTS;
  const starter = profile.starter_faction ?? null;
  // La faction de départ est TOUJOURS incluse, même si la table ne la contient
  // pas encore : déployer le code avant la migration ne doit retirer aucune
  // carte à personne.
  const unlocked = new Set(unlockedFactions ?? []);
  if (starter) unlocked.add(starter);
  return {
    legacyFullAccess: profile.legacy_full_access,
    starterFaction: starter,
    allCommonsUnlocked: profile.all_commons_unlocked ?? false,
    unlockedFactions: unlocked,
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
  if (faction == null) return false;
  // `unlockedFactions` contient la faction offerte ET les factions achetées.
  // Le repli sur `starterFaction` couvre les appelants pas encore branchés sur
  // la table : sans lui, un déploiement partiel retirerait sa faction au
  // joueur.
  if (ctx.unlockedFactions?.has(faction)) return true;
  return ctx.starterFaction != null && faction === ctx.starterFaction;
}

export function filterOwnedCards(cards: Card[], ctx: OwnershipContext): Card[] {
  return cards.filter((card) => isCardOwned(card, ctx));
}
