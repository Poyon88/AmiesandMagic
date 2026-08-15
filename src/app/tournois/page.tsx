import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import TournamentSignup from "@/components/payments/TournamentSignup";

export const metadata = { title: "Tournois — Armies & Magic" };

interface TournamentRow {
  id: string;
  name: string;
  status: string;
  entry_price_cents: number;
  capacity: number;
  starts_at: string | null;
}

export default async function TournoisPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Les brouillons sont invisibles (policy RLS), les tournois publiés sont
  // lisibles par tous.
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, status, entry_price_cents, capacity, starts_at")
    .in("status", ["open", "running"])
    .order("starts_at", { ascending: true });

  const rows = (tournaments ?? []) as TournamentRow[];

  const { data: entries } = await supabase
    .from("tournament_entries")
    .select("tournament_id, user_id")
    .in("tournament_id", rows.length ? rows.map((r) => r.id) : ["00000000-0000-0000-0000-000000000000"]);

  const taken = new Map<string, number>();
  const mine = new Set<string>();
  for (const e of entries ?? []) {
    taken.set(e.tournament_id, (taken.get(e.tournament_id) ?? 0) + 1);
    if (e.user_id === user.id) mine.add(e.tournament_id);
  }

  return (
    <div className="min-h-screen bg-am-bg-0">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <AmHeading
          eyebrow="Circuit payant"
          subtitle="Les gains sont versés en pièces d'or, dépensables dans les enchères de cartes en édition limitée."
        >
          Tournois
        </AmHeading>

        {rows.length === 0 ? (
          <p className="mt-12 text-center text-sm text-am-ink-3">
            Aucun tournoi ouvert pour le moment.
          </p>
        ) : (
          <div className="mt-10 flex flex-col gap-5">
            {rows.map((tr) => {
              const used = taken.get(tr.id) ?? 0;
              return (
                <AmPanel key={tr.id} corners className="flex flex-wrap items-center justify-between gap-6 p-6">
                  <div>
                    <h3 className="font-display text-lg text-am-gold">{tr.name}</h3>
                    <p className="mt-1 text-xs text-am-ink-3">
                      {tr.capacity} joueurs
                      {tr.starts_at && ` · ${new Date(tr.starts_at).toLocaleString("fr-FR")}`}
                      {tr.status === "running" && " · en cours"}
                    </p>
                  </div>
                  {tr.status === "open" ? (
                    <TournamentSignup
                      tournamentId={tr.id}
                      entryPriceCents={tr.entry_price_cents}
                      seatsLeft={Math.max(0, tr.capacity - used)}
                      alreadyEntered={mine.has(tr.id)}
                    />
                  ) : (
                    <span className="text-sm text-am-ink-3">Inscriptions closes</span>
                  )}
                </AmPanel>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
