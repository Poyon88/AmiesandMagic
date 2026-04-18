import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BoardCollectionView from "@/components/boards/BoardCollectionView";

export const dynamic = "force-dynamic";

export default async function BoardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: boards }, { data: ownedPrints }] = await Promise.all([
    supabase
      .from("game_boards")
      .select("id, name, image_url, rarity, max_prints, is_default, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("user_board_prints")
      .select("id, board_id, print_number, max_prints, is_tradeable")
      .eq("owner_id", user.id)
      .order("print_number"),
  ]);

  return (
    <BoardCollectionView
      boards={boards ?? []}
      ownedPrints={ownedPrints ?? []}
    />
  );
}
