// Association des voix d'entrée en jeu aux cartes (serveur, service role).
// Utilisé par /api/voice-sfx/assign. Voir voice-match.ts pour les candidates.
import type { SupabaseClient } from '@supabase/supabase-js';
import { candidatesVoix, priseMoinsUtilisee, repliquesVoix, type VoixCandidate } from './voice-match';

export const COLONNES_CARTE = 'id, name, card_type, race, clan, gender, rarity, keywords, flavor_text, illustration_prompt, sfx_play_url, status';

export interface CarteLue {
  id: number; name: string; card_type: string; race: string | null; clan: string | null; gender: string | null;
  rarity: string | null; keywords: string[] | null; flavor_text: string | null; illustration_prompt: string | null;
  sfx_play_url: string | null; status: string | null;
}

export interface ResultatVoix { id: number; name: string; replique?: string; voixId?: number; raison?: string; ignoree?: string }

async function toutesLesVoix(sb: SupabaseClient): Promise<VoixCandidate[]> {
  const { data, error } = await sb.from('voice_sfx').select('id, race, clan, gender, source_filename, file_path, file_url').order('id');
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Nombre de cartes par son, pour varier les prises. */
async function usageDesSons(sb: SupabaseClient): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('cards').select('sfx_play_url').not('sfx_play_url', 'is', null).order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) usage.set(c.sfx_play_url, (usage.get(c.sfx_play_url) ?? 0) + 1);
    if ((data?.length ?? 0) < 1000) break;
  }
  return usage;
}

/** Index de la réplique la plus proche de la carte, selon Claude. */
const VOIX_DE: Record<string, string> = { M: "voix d'homme", F: 'voix de femme', N: 'voix neutre' };

/** Index de la réplique la plus proche de la carte, ou -1 si aucune ne lui va
 *  (genre incompatible : une prêtresse ne reçoit pas une voix d'homme). */
async function choisirReplique(c: CarteLue, repliques: { texte: string; gender: string }[]): Promise<{ index: number; raison: string }> {
  // Genre connu et une seule réplique : rien à arbitrer (les candidates respectent déjà le genre).
  if (repliques.length === 1 && c.gender) return { index: 0, raison: 'seule réplique disponible' };
  const genre = c.gender ?? 'inconnu (déduis-le du nom et de l\'illustration)';
  const prompt = `Tu choisis la réplique VOCALE prononcée quand cette carte de jeu entre en jeu.

Carte : « ${c.name} »
Race : ${c.race ?? '—'} · Clan : ${c.clan ?? '—'} · Genre : ${genre} · Rareté : ${c.rarity ?? '—'}
Capacités : ${(c.keywords ?? []).join(', ') || 'aucune'}
Texte d'ambiance : ${c.flavor_text || '—'}
Illustration : ${(c.illustration_prompt ?? '—').slice(0, 600)}

Répliques possibles (texte tiré du nom de fichier, des préfixes de clan peuvent traîner) :
${repliques.map((r, i) => `${i}. ${r.texte} (${VOIX_DE[r.gender] ?? r.gender})`).join('\n')}

Choisis celle qui correspond le MIEUX au personnage : son rôle (guerrier, mage, artisan, éclaireur…), son ton, ses capacités.
Le GENRE de la voix doit être compatible avec le personnage (une voix neutre convient à tous). Si AUCUNE réplique n'a un genre compatible, réponds index -1.
Réponds UNIQUEMENT en JSON : {"index": <numéro ou -1>, "raison": "<une phrase courte en français>"}`;

  for (let essai = 0; essai < 3; essai++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 1000,
        output_config: { effort: 'low' },
        fallbacks: 'default',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    if (res.status === 529 || data.error?.type === 'overloaded_error') { await new Promise((r) => setTimeout(r, 2000 * (essai + 1))); continue; }
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${data.error?.message ?? 'erreur'}`);
    const brut: string = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
    const m = brut.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : null;
    const index = Number(j?.index);
    if (Number.isInteger(index) && index >= -1 && index < repliques.length) return { index, raison: String(j.raison ?? '') };
    throw new Error(`réponse inexploitable : ${brut.slice(0, 120)}`);
  }
  throw new Error('Anthropic surchargé');
}

/** `simuler` : choisit sans rien écrire (contrôle depuis un script). */
export async function associer(sb: SupabaseClient, cartes: CarteLue[], remplacer: boolean, simuler = false): Promise<ResultatVoix[]> {
  const [voix, usage] = await Promise.all([toutesLesVoix(sb), usageDesSons(sb)]);
  const plans = cartes.map((c) => {
    if (c.card_type !== 'creature') return { c, ignoree: 'pas une unité' };
    if (c.sfx_play_url && !remplacer) return { c, ignoree: 'a déjà un son' };
    const groupes = repliquesVoix(candidatesVoix(c, voix));
    if (!groupes.length) return { c, ignoree: 'aucune voix pour sa race / son clan / son genre' };
    return { c, groupes };
  });
  // Claude en parallèle ; les prises se répartissent ensuite DANS L'ORDRE pour que
  // deux cartes du même paquet ne reçoivent pas la même prise.
  const choix = await Promise.all(plans.map((p) => ('groupes' in p && p.groupes
    ? choisirReplique(p.c, p.groupes).catch((e: Error) => ({ erreur: e.message }))
    : Promise.resolve(null))));
  const out: ResultatVoix[] = [];
  for (const [i, p] of plans.entries()) {
    const ch = choix[i];
    if (!('groupes' in p) || !p.groupes) { out.push({ id: p.c.id, name: p.c.name, ignoree: p.ignoree }); continue; }
    if (!ch || 'erreur' in ch) { out.push({ id: p.c.id, name: p.c.name, ignoree: `choix impossible : ${ch && 'erreur' in ch ? ch.erreur : '?'}` }); continue; }
    if (ch.index < 0) { out.push({ id: p.c.id, name: p.c.name, ignoree: `aucune voix compatible : ${ch.raison}` }); continue; }
    const groupe = p.groupes[ch.index];
    const prise = priseMoinsUtilisee(groupe.prises, usage);
    if (simuler) {
      usage.set(prise.file_url, (usage.get(prise.file_url) ?? 0) + 1);
      out.push({ id: p.c.id, name: p.c.name, replique: groupe.texte, voixId: prise.id, raison: ch.raison });
      continue;
    }
    let maj = sb.from('cards').update({ sfx_play_url: prise.file_url }).eq('id', p.c.id);
    if (!remplacer) maj = maj.is('sfx_play_url', null);
    const { error } = await maj;
    if (error) { out.push({ id: p.c.id, name: p.c.name, ignoree: error.message }); continue; }
    usage.set(prise.file_url, (usage.get(prise.file_url) ?? 0) + 1);
    out.push({ id: p.c.id, name: p.c.name, replique: groupe.texte, voixId: prise.id, raison: ch.raison });
  }
  return out;
}

/** Unités sans son dont la race a au moins une voix (puis filtrées par candidates). */
export async function unitesSansSon(sb: SupabaseClient): Promise<CarteLue[]> {
  const voix = await toutesLesVoix(sb);
  const races = [...new Set(voix.map((v) => v.race))];
  if (!races.length) return [];
  const out: CarteLue[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('cards').select(COLONNES_CARTE)
      .eq('card_type', 'creature').is('sfx_play_url', null).in('race', races).neq('status', 'retired')
      .order('id').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as CarteLue[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out.filter((c) => candidatesVoix(c, voix).length > 0);
}

