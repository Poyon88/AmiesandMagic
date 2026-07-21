import { createClient } from "@/lib/supabase/server";
import { entitlementsFromProfile } from "@/lib/game/collection";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import CollectionView from "@/components/cards/CollectionView";
import { localizeCardsInPlace } from "@/lib/cards/localizeCard";
import { normalizeLocale } from "@/i18n/config";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: cards }, { data: sets }, { data: formats }, { data: profile }, { data: userCollection }, { data: ownedPrints }] = await Promise.all([
    supabase
      .from("cards")
      .select("*")
      .order("mana_cost")
      .order("name"),
    supabase
      .from("sets")
      .select("*")
      .order("name"),
    supabase
      .from("formats")
      .select("*")
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("profiles")
      // select("*") volontaire : tant que la migration du modèle de droits
      // n'est pas appliquée, nommer les colonnes ferait ÉCHOUER la requête
      // entière — et le joueur perdrait aussi son `role` au passage.
      .select("*")
      .eq("id", user.id)
      .single(),
    supabase
      .from("user_collections")
      .select("card_id")
      .eq("user_id", user.id),
    supabase
      .from("card_prints")
      .select("id, card_id, print_number, max_prints")
      .eq("owner_id", user.id)
      .order("print_number"),
  ]);

  // i18n : sur cette surface d'affichage pur, on traduit nom + ambiance en
  // place selon la langue active (effect_text reste FR canonique).
  const locale = normalizeLocale(await getLocale());
  const localizedCards = await localizeCardsInPlace(supabase, cards ?? [], locale);

  const role = profile?.role ?? "player";
  const isSpecialRole = role === "testeur" || role === "admin";
  const printCardIds = (ownedPrints ?? []).map(r => r.card_id);
  const collectedCardIds = [...new Set([
    ...(userCollection ?? []).map(r => r.card_id),
    ...printCardIds,
  ])];

  return (
    <CollectionView
      cards={localizedCards}
      sets={sets ?? []}
      formats={formats ?? []}
      collectedCardIds={collectedCardIds}
      isTester={isSpecialRole}
      entitlements={entitlementsFromProfile(profile)}
      ownedPrints={isSpecialRole ? [] : (ownedPrints ?? []).map(p => ({
        id: p.id,
        card_id: p.card_id,
        print_number: p.print_number,
        max_prints: p.max_prints,
      }))}
    />
  );
}
