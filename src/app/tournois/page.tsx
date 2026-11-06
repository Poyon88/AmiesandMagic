import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import AmPanel from "@/components/ui/AmPanel";
import AmHeading from "@/components/ui/AmHeading";
import TournamentSignup from "@/components/payments/TournamentSignup";
import PageChrome from "@/components/shared/PageChrome";
import CircuitExplainer from "@/components/tournaments/CircuitExplainer";
import { GrandTournamentCard, QualificationCard } from "@/components/tournaments/TournamentRewardCards";
import { CASH_BY_WINS, CASH_PRIZES_ENABLED, CREDIT_LIFETIME_DAYS } from "@/lib/tournaments/config";

export async function generateMetadata() {
  const t = await getTranslations("tournaments");
  return { title: t("meta_title") };
}

interface TournamentRow {
  id: string;
  name: string;
  status: string;
  kind: "weekly" | "free" | "special";
  capacity: number;
  starts_at: string | null;
}

export default async function TournoisPage() {
  const t = await getTranslations("tournaments");
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, status, kind, capacity, starts_at")
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

  // Tickets utilisables du joueur. Lus ici, côté serveur, pour que le premier
  // rendu dise déjà la vérité — un décompte qui apparaît après coup ferait
  // clignoter le bouton entre « obtenir un ticket » et « s'inscrire ».
  const nowIso = new Date().toISOString();
  const { count: ticketsAvailable } = await supabase
    .from("tournament_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("spent_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso);

  const { data: wallet } = await supabase
    .from("wallets").select("ticket_debt").eq("user_id", user.id).maybeSingle();

  const tickets = ticketsAvailable ?? 0;
  const debt = wallet?.ticket_debt ?? 0;

  return (
    <PageChrome>
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <AmHeading
          eyebrow={t("page_eyebrow")}
          subtitle={t("page_subtitle")}
        >
          {t("page_title")}
        </AmHeading>

        <p className="mt-6 text-center text-sm text-am-ink-soft">
          {t.rich("tickets_held", {
            count: tickets,
            b: (chunks) => <strong className="text-am-gold">{chunks}</strong>,
          })}{" "}
          ·{" "}
          <Link href="/boutique" className="underline hover:text-am-gold">{t("get_tickets")}</Link>
        </p>

        <h2 className="mt-12 font-display text-xl text-am-gold">{t("open_title")}</h2>
        {rows.length === 0 ? (
          <p className="mt-6 text-center text-sm text-am-ink-faint">
            {t("none_open")}
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            {rows.map((tr) => {
              const used = taken.get(tr.id) ?? 0;
              return (
                <AmPanel key={tr.id} corners className="flex flex-wrap items-center justify-between gap-6 p-6">
                  <div>
                    <h3 className="font-display text-lg text-am-gold">{tr.name}</h3>
                    <p className="mt-1 text-xs text-am-ink-faint">
                      {t(`kind_${tr.kind}`)} · {t("capacity", { count: tr.capacity })}
                      {tr.starts_at && ` · ${new Date(tr.starts_at).toLocaleString(locale)}`}
                      {tr.status === "running" && ` · ${t("running")}`}
                    </p>
                  </div>
                  {tr.status === "open" ? (
                    <TournamentSignup
                      tournamentId={tr.id}
                      // La règle « ce tournoi coûte-t-il un ticket ? » vient du
                      // type, comme en base (tournament_requires_ticket).
                      requiresTicket={tr.kind !== "free"}
                      seatsLeft={Math.max(0, tr.capacity - used)}
                      alreadyEntered={mine.has(tr.id)}
                      ticketsAvailable={tickets}
                      ticketDebt={debt}
                    />
                  ) : (
                    <span className="text-sm text-am-ink-faint">{t("registration_closed")}</span>
                  )}
                </AmPanel>
              );
            })}
          </div>
        )}

        <section className="mt-16">
          <AmHeading as="h2" eyebrow={t("circuit_eyebrow")}>{t("circuit_title")}</AmHeading>
          <div className="mt-8"><CircuitExplainer /></div>
        </section>

        <section className="mt-16">
          <AmHeading as="h2" eyebrow={t("rewards_eyebrow")}>{t("rewards_title")}</AmHeading>
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
            <QualificationCard />
            <GrandTournamentCard />
          </div>
          <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-am-ink-faint">
            {t.rich("footnote_rounds", { i: (chunks) => <i>{chunks}</i> })}{" "}
            {t("footnote_credits", { days: CREDIT_LIFETIME_DAYS })}
            {CASH_PRIZES_ENABLED && ` ${t("footnote_cash", { wins: Math.min(...Object.keys(CASH_BY_WINS).map(Number)) })}`}
            {" "}{t("footnote_all")}
          </p>
        </section>
      </div>
    </PageChrome>
  );
}
