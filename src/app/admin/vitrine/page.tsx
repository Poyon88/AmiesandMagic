import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import VitrineManager, { type CarteCatalogue } from "@/components/admin/VitrineManager";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";
import { TEXTES_EDITABLES, lireCle } from "@/lib/vitrine/config";
import fr from "../../../../messages/fr.json";

export const metadata = { title: "Vitrine — Admin | Armies of Legends" };

export default async function AdminVitrinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Paginé : PostgREST rend 1 000 lignes au plus, en silence. Seules les
  // cartes jouables et illustrées peuvent paraître sur la page d'accueil.
  const cartes = await fetchAllRows<CarteCatalogue>(
    (from, to) =>
      supabase
        .from("cards")
        .select("id, name, rarity, faction, card_type, image_url, set_id, card_year")
        .eq("status", "playable")
        .not("image_url", "is", null)
        .order("name")
        .order("id")
        .range(from, to),
    { label: "Lecture du catalogue (vitrine)" },
  );

  // Texte d'origine de chaque champ, lu dans messages/fr.json : c'est ce que
  // la page affiche tant que l'admin n'a rien réécrit.
  const defauts: Record<string, string> = {};
  for (const t of TEXTES_EDITABLES) defauts[t.key] = lireCle(fr.landing, t.key) ?? "";

  return (
    <div style={{ height: "100%", overflow: "auto", background: "#f5f5f5" }}>
      <VitrineManager cartes={cartes} defauts={defauts} />
    </div>
  );
}
