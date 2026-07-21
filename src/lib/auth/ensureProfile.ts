import type { User } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/admin/requireAdmin";

/** Crée la ligne `profiles` d'un utilisateur qui n'en a pas.
 *
 *  ⚠️ Serveur uniquement — utilise la clé `service_role`. Ne jamais importer
 *  depuis un composant client. (`rls-hardening` interdit au client d'écrire sur
 *  `profiles`, cette table portant `role`.)
 *
 *  Le trigger `on_auth_user_created` est censé s'en charger. Il a été observé en
 *  échec en production — cause non identifiée à ce jour — et son filet
 *  (`exception when others`) le rend SILENCIEUX : le compte se crée, le profil
 *  non. L'application ne doit pas dépendre de sa réussite.
 *
 *  Un compte sans profil est bloqué de toutes les façons possibles : aucun
 *  aiguillage vers l'onboarding (les gardes exigent une ligne), aucune carte
 *  hors collection personnelle, et un enregistrement de faction qui ne modifie
 *  rien. Mieux vaut réparer que constater.
 *
 *  Idempotent et sans effet quand tout va bien : la seule écriture possible est
 *  la création de la ligne manquante. Silencieux en cas d'échec — c'est un
 *  filet, il ne doit jamais empêcher l'affichage d'une page.
 */
export async function ensureProfile(user: User): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const requested = typeof meta.username === "string" ? meta.username.trim() : "";
  const cgu = typeof meta.cgu_accepted_at === "string" ? meta.cgu_accepted_at : null;

  // Même repli que le trigger, pour que les deux chemins produisent le même
  // pseudo provisoire : identifiant tronqué, unique par construction.
  const fallback = `Player_${user.id.slice(0, 8)}`;
  const candidates = requested.length >= 3 ? [requested, fallback] : [fallback];

  const supabase = getAdminClient();
  for (const username of candidates) {
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      username,
      // Un pseudo rattrapé n'a été validé par personne : l'onboarding le
      // redemandera.
      username_confirmed: false,
      ...(cgu ? { cgu_accepted_at: cgu } : {}),
    });
    if (!error) return;
    // 23505 sur l'id = la ligne existe déjà (course entre deux rendus) : rien à
    // faire. Sur le pseudo = il est pris, on retente avec le repli.
    if (error.code !== "23505") return;
    const { data } = await supabase.from("profiles").select("id").eq("id", user.id).single();
    if (data) return;
  }
}
