// Cartes d'APERÇU des tokens qu'une capacité crée.
//
// Le descriptif écrivait le token en toutes lettres — « 3 tokens Archer Sylvain
// 1/1 (Vol) ». Deux limites, dont la seconde est rédhibitoire :
//   - la ligne s'allonge sans fin dès que le token porte des mots-clés ;
//   - depuis que les jetons acceptent des EFFETS COMPOSÉS, une phrase ne peut
//     tout simplement plus les décrire.
//
// Le nom reste dans le texte ; le reste part dans une pastille qui montre le
// VERSO du token au survol — exactement ce que font déjà les Compagnons.
import type { Card, ConvocationTokenDef, TokenTemplate } from "./types";
import type { ComposedEffect } from "./types";

/** Un template + ses stats effectives, sous la forme d'une Card affichable.
 *
 *  `id` reprend celui du TEMPLATE : les tokens vivent dans leur propre table,
 *  donc cet id n'a rien à voir avec celui d'une carte. Il ne sert qu'à donner
 *  une clé de liste stable — d'où le `nameOf` que le composant reçoit, pour
 *  qu'aucune traduction ne soit cherchée avec un id de carte qui n'existe pas. */
export function tokenTemplateToCard(
  tmpl: TokenTemplate,
  attack?: number | null,
  health?: number | null,
): Card {
  return {
    id: tmpl.id,
    name: tmpl.name,
    mana_cost: 0,
    card_type: "creature",
    attack: attack ?? tmpl.attack,
    health: health ?? tmpl.health,
    effect_text: "",
    flavor_text: null,
    keywords: tmpl.keywords ?? [],
    keyword_instances: tmpl.keyword_instances ?? null,
    // Les effets composés du token : c'est eux qu'aucune phrase ne savait dire.
    capabilities: tmpl.capabilities ?? null,
    spell_keywords: null,
    spell_effects: null,
    image_url: tmpl.image_url,
    race: tmpl.race,
    faction: tmpl.faction ?? null,
    clan: tmpl.clan,
    token_id: tmpl.id,
  } as unknown as Card;
}

const trouver = (registre: TokenTemplate[] | undefined, id: number | null | undefined) =>
  id != null ? registre?.find((r) => r.id === id) ?? null : null;

/** Tokens d'une liste `convocation_tokens` (Convocations multiples, Invocation
 *  multiple), stats par entrée quand elles sont surchargées. */
function depuisListe(defs: ConvocationTokenDef[] | null | undefined, registre?: TokenTemplate[]): Card[] {
  const out: Card[] = [];
  const vus = new Set<string>();
  for (const def of defs ?? []) {
    const tmpl = trouver(registre, def.token_id);
    if (!tmpl) continue;
    const atk = def.attack ?? tmpl.attack;
    const hp = def.health ?? tmpl.health;
    // Dédoublonné : « 3 tokens Archer Sylvain » ne doit montrer QU'UNE pastille.
    // Le nombre est déjà dans la phrase ; trois pastilles identiques seraient du
    // bruit, et le survol montrerait trois fois le même verso.
    const cle = `${tmpl.id}|${atk}|${hp}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(tokenTemplateToCard(tmpl, atk, hp));
  }
  return out;
}

/** Tokens créés par une capacité de CRÉATURE (ou son jumeau-sort).
 *
 *  `x` porte la surcharge de stats de Convocation X, qui crée un X/X — même
 *  règle que `formatConvocationToken`, à laquelle cette fonction doit rester
 *  d'accord pour que la pastille montre ce que la phrase annonce. */
export function tokenCardsForKeyword(
  kw: string,
  card: Card | null | undefined,
  registre: TokenTemplate[] | undefined,
  x?: number | null,
): Card[] {
  if (!card) return [];
  switch (kw) {
    case "convocations_multiples":
    case "invocation_multiple":
      return depuisListe(card.convocation_tokens, registre);
    case "convocation":
    case "convocation_simple": {
      const tmpl = trouver(registre, card.convocation_token_id);
      if (!tmpl) return [];
      const stat = x != null && x > 0 ? x : null;
      return [tokenTemplateToCard(tmpl, stat, stat)];
    }
    case "lycanthropie": {
      const tmpl = trouver(registre, card.lycanthropie_token_id);
      return tmpl ? [tokenTemplateToCard(tmpl)] : [];
    }
    default:
      return [];
  }
}

/** Token créé par un effet COMPOSÉ `summon_token`. */
export function tokenCardsForComposed(
  eff: ComposedEffect | undefined,
  registre: TokenTemplate[] | undefined,
): Card[] {
  if (eff?.content !== "summon_token") return [];
  const tmpl = trouver(registre, eff.tokenId);
  return tmpl ? [tokenTemplateToCard(tmpl)] : [];
}

/** Nom AFFICHÉ d'un token d'aperçu. Passé au composant de pastilles pour qu'il
 *  n'aille pas chercher une traduction de CARTE avec un id de TOKEN — les deux
 *  tables ont leurs propres séquences, la collision est certaine. */
export function tokenPreviewName(c: Card, t?: (k: string) => string | undefined): string {
  return t?.(`vocab.tokens.${c.id}`) ?? c.name;
}
