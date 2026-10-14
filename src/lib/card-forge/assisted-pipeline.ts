// CRÉATION ASSISTÉE — pipeline d'UNE carte, côté navigateur :
//   texte (Claude, nom unique) → illustration (Gemini) → enregistrement en
//   Brouillon. La carte arrive déjà conçue et équilibrée (brief-generator) ;
//   on ne fait ici qu'appeler les routes existantes de la forge.
import { ABILITIES, KEYWORDS } from "@/lib/game/abilities";
import type { KeywordMode } from "@/lib/game/types";
import { alignementAEnregistrer } from "@/lib/card-engine/constants";
import { BRIEF_COST_LABELS, BRIEF_TRIGGER_LABELS, type CardBrief } from "@/lib/card-engine/brief";
import { champsCarte, regleNom, type BalancedCard } from "@/lib/card-engine/brief-generator";
import type { CardConcept } from "@/lib/ai/card-concepts";

const MODE_LABEL: Record<KeywordMode, string> = {
  entry: BRIEF_TRIGGER_LABELS.entry, spell: "à la résolution", death: BRIEF_TRIGGER_LABELS.death, tap: BRIEF_TRIGGER_LABELS.tap,
  return: BRIEF_TRIGGER_LABELS.return, attack: BRIEF_TRIGGER_LABELS.attack, end_of_turn: BRIEF_TRIGGER_LABELS.end_of_turn,
  start_of_turn: BRIEF_TRIGGER_LABELS.start_of_turn, draw: BRIEF_TRIGGER_LABELS.draw, low_hp: BRIEF_TRIGGER_LABELS.low_hp,
  wound: BRIEF_TRIGGER_LABELS.wound,
};

/** « Résistance X » + 2 → « Résistance 2 » ; « Gloire +X/+Y » + 1/1 → « Gloire +1/+1 ». */
export function libelleAvecValeurs(label: string, x?: number, y?: number): string {
  if (x == null) return label;
  return label.replace(/\+X\/\+Y/, `+${x}/+${y ?? x}`).replace(/-X\/-Y/, `-${x}/-${y ?? x}`).replace(/X\/Y/, `${x}/${y ?? x}`).replace(/\bX\b/, String(x));
}

/** Description de la mécanique exacte, envoyée à Claude pour le texte de capacité. */
export function mecaniques(b: BalancedCard): string[] {
  const out: string[] = [];
  if (b.cardType === "spell") {
    for (const k of b.spellKeywords) {
      const a = ABILITIES[k.id];
      const v = k.amount ?? k.attack;
      out.push(`${libelleAvecValeurs(a?.spell?.label ?? a?.label ?? k.id, v, k.health)} : ${(a?.spell?.desc ?? a?.desc ?? "").replace(/\bX\b/g, String(v ?? "X"))}`);
    }
  } else {
    for (const l of b.labels) {
      const x = b.xValues[l], y = b.yValues[l];
      const mode = b.plan.modes[l];
      const desc = (KEYWORDS[l]?.desc ?? "").replace(/\bX\b/g, String(x ?? "X")).replace(/\bY\b/g, String(y ?? x ?? "Y"));
      out.push(`${libelleAvecValeurs(l, x, y)}${mode ? ` (déclencheur : ${MODE_LABEL[mode]})` : ""} : ${desc}`);
    }
  }
  if (b.plan.cost) out.push(`Coût additionnel pour jouer la carte : ${BRIEF_COST_LABELS[b.plan.cost.kind]} (${b.plan.cost.n})`);
  return out;
}

async function json(res: Response) {
  const d = await res.json().catch(() => null);
  if (!res.ok) throw new Error(d?.error ?? `Erreur ${res.status}`);
  return d;
}

/** Réduit l'illustration (800 px max, WebP) avant l'envoi : le corps de la
 *  requête de sauvegarde doit rester léger. Même traitement que la forge. */
async function compresser(base64: string, mime: string): Promise<string> {
  const img = new Image();
  img.src = `data:${mime};base64,${base64}`;
  await img.decode();
  const ratio = Math.min(1, 800 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.85).split(",")[1];
}

export interface CarteCreee { id: number | null; name: string; nameAdjusted?: boolean; imageOk: boolean; imageErreur?: string; voix?: string | null }

/** Ce que le planificateur de concepts doit savoir d'une carte du lot. */
export function cartepourConcept(b: BalancedCard) {
  const p = b.plan;
  return { type: p.type, rarity: p.rarity, mana: p.mana, race: p.race, clan: p.clan, gender: p.gender, mechanics: mecaniques(b) };
}

/** Crée UNE carte : texte, image, sauvegarde. `pris` = noms déjà donnés dans le
 *  lot ; `concept` = celui décidé à l'étape Concepts (sinon Claude en invente un). */
export async function creerCarte(
  b: BalancedCard, brief: CardBrief, pris: string[], signal?: AbortSignal,
  concept?: { concept: CardConcept; lexique: string[] } | null,
  imageModel?: string,
): Promise<CarteCreee> {
  const p = b.plan;
  const isSpell = b.cardType === "spell";
  const labels = isSpell
    ? b.spellKeywords.map((k) => ABILITIES[k.id]?.spell?.label ?? ABILITIES[k.id]?.label ?? k.id)
    : b.labels;

  const texte = await json(await fetch("/api/cards/generate-text", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({
      factionId: p.faction, type: p.type, rarityId: p.rarity,
      stats: { mana: p.mana, attack: b.attack, defense: b.health, power: null, keywords: labels },
      raceId: p.race ?? undefined, clanId: p.clan ?? undefined,
      gender: p.gender, nameRule: regleNom(p.rarity), notes: brief.notes,
      mechanics: mecaniques(b), forbiddenNames: pris, uniqueName: true,
      ...(concept ? { concept: concept.concept, lexique: concept.lexique } : {}),
    }),
  }));

  // Illustration : un échec n'empêche pas la carte (Brouillon, image à refaire).
  let imageBase64: string | null = null;
  let imageErreur: string | undefined;
  let modeleProduit: string | null = null;
  if (texte.illustrationPrompt) {
    try {
      const img = await json(await fetch("/api/cards/generate-image", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ prompt: texte.illustrationPrompt, highRes: true, aspectRatio: "3:4", ...(imageModel ? { model: imageModel } : {}) }),
      }));
      imageBase64 = await compresser(img.imageBase64, img.mimeType);
      modeleProduit = typeof img.model === "string" ? img.model : null;
    } catch (e) {
      if (signal?.aborted) throw e;
      imageErreur = e instanceof Error ? e.message : "Illustration non générée";
    }
  }

  const champs = champsCarte(b);
  const ed = brief.edition;
  const saved = await json(await fetch("/api/cards/save", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({
      card: {
        ...champs,
        name: texte.name,
        // Vide exprès (arbitrage auteur 2026-10-13) : la carte affiche déjà la
        // description de ses capacités ; un texte généré la doublait.
        effect_text: null,
        flavor_text: texte.flavorText ?? null,
        illustration_prompt: texte.illustrationPrompt ?? null,
        style_guide_id: texte.styleGuideId ?? null,
        faction: p.faction, race: p.race, clan: p.clan,
        card_alignment: alignementAEnregistrer(p.faction, null),
        convocation_token_id: null, convocation_tokens: null, lycanthropie_token_id: null, entraide_race: null,
        set_id: ed.kind === "set" ? ed.setId : null,
        card_year: ed.kind === "limited" ? ed.year : null,
        card_month: ed.kind === "limited" ? ed.month ?? null : null,
        discoverable: true,
        equip_cost: null,
        status: "draft",
        gender: p.gender,
      },
      imageBase64,
      imageMimeType: imageBase64 ? "image/webp" : null,
      imageModel: modeleProduit,
    }),
  }));
  // Voix d'entrée en jeu (unités) : la réplique la plus proche de la carte parmi
  // celles de sa race / son clan / son genre. Un échec laisse le son générique.
  let voix: string | null = null;
  if (saved.id && !isSpell && b.cardType !== "item") {
    try {
      const r = await json(await fetch("/api/voice-sfx/assign", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ cardIds: [saved.id] }),
      }));
      voix = r.resultats?.[0]?.replique ?? null;
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  return { id: saved.id ?? null, name: texte.name, nameAdjusted: texte.nameAdjusted, imageOk: !!imageBase64, imageErreur, voix };
}
