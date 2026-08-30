import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin/requireAdmin";
import { sanitizeBalanceOverrides } from "@/lib/card-engine/balance";
import { redirect } from "next/navigation";
import CardForge from "@/components/card-forge/CardForge";

export const metadata = { title: "Card Forge — Admin | Armies & Magic" };

export default async function CardForgePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // BARÈME : lu ICI, côté serveur, et non par la forge une fois montée. Le
  // modèle de coût doit être en place AVANT le premier rendu, sinon la jauge et
  // le générateur affichent un instant les valeurs d'origine — un écart bref,
  // silencieux, et suffisant pour qu'un auteur juge une carte sur un mauvais
  // budget. Le passer en prop supprime la fenêtre au lieu de la raccourcir.
  //
  // Erreur avalée à dessein : la migration peut ne pas être passée sur cet
  // environnement. La forge s'ouvre alors sur les valeurs compilées, ce qui est
  // exactement son comportement d'avant la mise en base.
  let initialBalance = {};
  try {
    const { data } = await getAdminClient()
      .from("balance_overrides")
      .select("overrides")
      .eq("id", 1)
      .maybeSingle();
    initialBalance = sanitizeBalanceOverrides(data?.overrides);
  } catch {
    /* barème d'origine */
  }

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <CardForge initialBalance={initialBalance} />
    </div>
  );
}
