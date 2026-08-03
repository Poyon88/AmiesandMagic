import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import TutorialView, { type ClanVisual } from "@/components/tutorial/TutorialView";

export const metadata = { title: "Comment jouer | Armies & Magic" };

/** Ordre de préférence pour choisir la carte VITRINE d'un clan : on montre ce
 *  que la faction a de plus marquant. À rareté égale, le plus petit id gagne —
 *  la vitrine reste donc stable d'un rendu à l'autre, au lieu de changer au gré
 *  de l'ordre renvoyé par la base. */
const RARETE_RANG: Record<string, number> = {
  "Légendaire": 0, "Épique": 1, "Rare": 2, "Peu Commune": 3, "Commune": 4,
};

export default async function TutorielPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: wallet }, { data: illustrees }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
    // Vitrines de l'onglet « Factions & clans ». On ne remonte que les colonnes
    // d'affichage : cette page illustre, elle ne joue pas.
    supabase
      .from("cards")
      .select("id, name, clan, faction, rarity, image_url")
      .not("image_url", "is", null),
  ]);

  // Une vitrine par clan, plus quelques-unes par faction (utiles aux factions
  // sans clan, comme les Mercenaires). Un clan sans aucune carte illustrée reste
  // ABSENT de la table : l'onglet affiche alors un cadre en attente, sans casser
  // la grille — c'est le cas aujourd'hui de trois clans.
  const rang = (r?: string | null) => RARETE_RANG[r ?? "Commune"] ?? 9;
  const parClan: Record<string, ClanVisual> = {};
  const parFaction: Record<string, ClanVisual[]> = {};

  for (const c of illustrees ?? []) {
    const visuel: ClanVisual = {
      id: c.id, name: c.name, imageUrl: c.image_url as string, rarity: c.rarity,
    };
    if (c.clan) {
      const actuel = parClan[c.clan];
      if (!actuel || rang(c.rarity) < rang(actuel.rarity)
        || (rang(c.rarity) === rang(actuel.rarity) && c.id < actuel.id)) {
        parClan[c.clan] = visuel;
      }
    }
    if (c.faction) (parFaction[c.faction] ??= []).push(visuel);
  }

  const vitrinesFaction: Record<string, ClanVisual[]> = {};
  for (const [fid, liste] of Object.entries(parFaction)) {
    vitrinesFaction[fid] = liste
      .sort((a, b) => rang(a.rarity) - rang(b.rarity) || a.id - b.id)
      .slice(0, 3);
  }

  return (
    <TutorialView
      username={profile?.username ?? "Player"}
      goldBalance={wallet?.balance ?? 0}
      clanVisuals={parClan}
      factionVisuals={vitrinesFaction}
    />
  );
}
