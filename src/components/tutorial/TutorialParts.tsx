"use client";

// Briques du guide « Comment jouer », et sa section d'ouverture. À part du
// guide complet : la tuile d'accueil réutilise cette section en fond sans
// embarquer tout le guide et ses démonstrations.
import { useTranslations } from "next-intl";
import AmHeading from "@/components/ui/AmHeading";
import AmPanel from "@/components/ui/AmPanel";
import {
  FIRST_PLAYER_HAND_SIZE,
  HERO_MAX_HP,
  MAX_BOARD_SIZE,
  MAX_MANA,
  STARTING_HAND_SIZE,
  STARTING_MANA,
} from "@/lib/game/constants";
import { HERO_HP_MAX, HERO_HP_MIN } from "@/lib/game/hero-hp";

export const cinzel = "font-[family-name:var(--font-cinzel),serif]";
export const crimson = "font-[family-name:var(--font-crimson),serif]";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9 am-animate-rise">
      <AmHeading as="h2" align="left" className="mb-5">
        {title}
      </AmHeading>
      <AmPanel corners className="p-5 md:p-7">
        {children}
      </AmPanel>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className={`${crimson} text-am-ink/90 leading-[1.85] mb-4 last:mb-0`} style={{ fontSize: 17 }}>
      {children}
    </p>
  );
}

export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="am-gild-border rounded-[var(--am-r-md)] bg-am-bg-1 px-4 py-3 text-center">
      <div className={`${cinzel} am-foil-text font-bold`} style={{ fontSize: 22 }}>{value}</div>
      <div className={`${crimson} italic text-am-ink-soft mt-1`} style={{ fontSize: 13 }}>{label}</div>
    </div>
  );
}

export const Hi = ({ children }: { children: React.ReactNode }) => (
  <strong className="text-am-gold-bright font-semibold">{children}</strong>
);

/** « Le but du jeu » : les chiffres viennent des constantes du moteur. */
export function GoalSection() {
  const tt = useTranslations("tutorial");
  return (
    <Section title={tt("goal_title")}>
      <P>
        {tt.rich("goal_text", {
          min: HERO_HP_MIN,
          max: HERO_HP_MAX,
          usual: HERO_MAX_HP,
          zero: 0,
          hi: (chunks) => <Hi>{chunks}</Hi>,
        })}
      </P>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Stat value={tt("stat_hero_start_value", { min: HERO_HP_MIN, max: HERO_HP_MAX })} label={tt("stat_hero_start")} />
        <Stat value={tt("stat_starting_hand_value", { first: FIRST_PLAYER_HAND_SIZE, second: STARTING_HAND_SIZE })} label={tt("stat_starting_hand")} />
        <Stat value={`${STARTING_MANA} → ${MAX_MANA}`} label={tt("stat_mana_growth")} />
        <Stat value={`${MAX_BOARD_SIZE}`} label={tt("stat_max_board")} />
      </div>
    </Section>
  );
}
