// Rate-limit des générations IA payantes (audit ③).
//
// Chaque route de génération facturée appelle enforceAiQuota(userId, kind)
// juste après l'authentification. La fonction Postgres check_ai_quota compte
// les générations de l'utilisateur sur 24 h et, si le quota n'est pas atteint,
// enregistre l'événement de façon atomique.
//
// Fail-open : si la fonction/table n'existe pas encore (migration non
// appliquée) ou si la DB répond une erreur, on AUTORISE la génération (on ne
// bloque jamais un utilisateur légitime à cause d'un souci d'infra) — un
// avertissement est loggé. Le code peut donc être déployé avant la migration.

import { NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/admin/requireAdmin';

export type AiGenerationKind =
  | 'figurine_3d'       // Meshy image-to-3D — le plus coûteux
  | 'hero_portrait'     // Imagen/Gemini image
  | 'hero_power_image'  // Gemini image
  | 'prompt_compose';   // Anthropic/Gemini texte — le moins coûteux

// Quotas par utilisateur sur une fenêtre glissante de 24 h.
const DAILY_LIMITS: Record<AiGenerationKind, number> = {
  figurine_3d: 5,
  hero_portrait: 40,
  hero_power_image: 40,
  prompt_compose: 80,
};

const WINDOW = '24 hours';

type QuotaResult = { ok: true } | { ok: false; response: NextResponse };

export async function enforceAiQuota(
  userId: string,
  kind: AiGenerationKind,
): Promise<QuotaResult> {
  const limit = DAILY_LIMITS[kind];
  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase.rpc('check_ai_quota', {
      p_user_id: userId,
      p_kind: kind,
      p_limit: limit,
      p_window: WINDOW,
    });

    if (error) {
      // Fail-open : quota indisponible (migration non appliquée, DB down…).
      console.warn(`[ai-quota] check_ai_quota indisponible (${kind}) — fail-open:`, error.message);
      return { ok: true };
    }

    if (data === false) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: `Limite de générations atteinte (${limit}/jour pour ce type). Réessaie plus tard.`,
            code: 'ai_quota_exceeded',
          },
          { status: 429, headers: { 'Retry-After': '3600' } },
        ),
      };
    }

    return { ok: true };
  } catch (e) {
    console.warn(`[ai-quota] erreur inattendue (${kind}) — fail-open:`, e);
    return { ok: true };
  }
}
