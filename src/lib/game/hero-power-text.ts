// TEXTE DU POUVOIR DE HÉROS — toujours GÉNÉRÉ depuis ses effets (arbitrage
// auteur), pour tous les héros : le champ libre `power_description` n'est plus
// affiché. Une phrase par effet, dans l'ordre de résolution.
//
// Chaque phrase réutilise le générateur de son mode (mots-clés de créature, de
// sort, effets composés), tous traduits via un `SafeT` : le texte suit la langue
// du joueur sans pipeline de traduction propre aux héros.
import type { SafeT } from "@/i18n/config";
import type { Capability, HeroPowerEffect, Keyword, KeywordInstance, SpellKeywordInstance, TokenTemplate } from "./types";
import { describeKeyword, describeKeywordLabel } from "./keyword-display";
import { applyKeywordValueToLabel } from "./keyword-labels";
import { getSpellKeywordDesc, SPELL_KEYWORDS } from "./spell-keywords";
import { describeComposedCap } from "./composed-display";
import { effetsDuPouvoir, uidEffetPouvoir } from "./hero-power";

/** Gabarits propres au pouvoir (repli FR ; traduits sous `game.hero_power_*`). */
const FR: Record<string, string> = {
  "game.hero_power_grant": "Confère {kw} à une créature",
  "game.hero_power_emblem": "Emblème : {kw}",
};
const gabarit = (cle: string, t?: SafeT) => t?.(cle) ?? FR[cle];

/** « Gloire +2/+1 », « Résistance 3 » : le libellé du registre, valeurs posées. */
function libelleAvecValeurs(kw: Keyword, effect: HeroPowerEffect, t?: SafeT): string {
  const x = effect.params?.amount;
  const inst = { id: kw, x, y: effect.params?.amountY } as unknown as KeywordInstance;
  return applyKeywordValueToLabel(kw, describeKeywordLabel(kw, { x, y: effect.params?.amountY }, t), x, inst);
}

const phrase = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim();
  if (!v) return null;
  return /[.!?…]$/.test(v) ? v : `${v}.`;
};

/** La phrase d'UN effet. */
export function decrireEffetPouvoir(effect: HeroPowerEffect, i: number, tokens?: TokenTemplate[], t?: SafeT): string | null {
  const kw = effect.keywordId as Keyword;
  switch (effect.mode) {
    case "grant_keyword":
      return phrase(gabarit("game.hero_power_grant", t).replace("{kw}", libelleAvecValeurs(kw, effect, t)));
    case "aura": {
      const desc = describeKeyword(kw, { x: effect.params?.amount, y: effect.params?.amountY }, t);
      const tete = gabarit("game.hero_power_emblem", t).replace("{kw}", libelleAvecValeurs(kw, effect, t));
      return phrase(desc ? `${tete} — ${desc.replace(/\.$/, "")}` : tete);
    }
    case "spell_trigger": {
      if (SPELL_KEYWORDS[effect.keywordId as keyof typeof SPELL_KEYWORDS]) {
        const inst = {
          id: effect.keywordId, amount: effect.params?.amount,
          attack: effect.params?.attack, health: effect.params?.health,
          race: effect.race, clan: effect.clan,
        } as SpellKeywordInstance;
        return phrase(getSpellKeywordDesc(inst, null, tokens, t));
      }
      // Mot-clé de créature rejoué comme pouvoir (Corruption, Malédiction…).
      return phrase(describeKeyword(kw, { x: effect.params?.amount, y: effect.params?.amountY }, t));
    }
    case "composed": {
      if (!effect.composed) return null;
      const cap = {
        uid: uidEffetPouvoir(i), trigger: "spell_resolution", effectKind: "immediate",
        abilityId: "_composed", composed: effect.composed,
      } as Capability;
      return phrase(describeComposedCap(cap, tokens, t));
    }
    default:
      return null;
  }
}

/** Le texte complet du pouvoir : ses effets, une phrase chacun. Null si le
 *  héros n'a aucun effet lisible (l'appelant retombe alors sur le texte libre). */
export function decrirePouvoir(
  powerEffect: HeroPowerEffect | HeroPowerEffect[] | null | undefined,
  tokens?: TokenTemplate[],
  t?: SafeT,
): string | null {
  const phrases = effetsDuPouvoir({ powerEffect: powerEffect as HeroPowerEffect })
    .map((e, i) => decrireEffetPouvoir(e, i, tokens, t))
    .filter((s): s is string => !!s);
  return phrases.length ? phrases.join(" ") : null;
}
