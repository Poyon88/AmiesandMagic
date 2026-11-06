// RÉCOMPENSES DES TOURNOIS — fonctions pures, testées.
//
// Tout est indexé sur le NOMBRE DE VICTOIRES : un joueur éliminé au tour r a
// gagné r−1 matchs, le rang exact ne sert jamais au calcul. Le même nombre de
// victoires rapporte donc le même montant quelle que soit la taille du
// tableau ; seul le champion touche davantage.
//
// `computeReward` servira tel quel au versement (lot 5) ; `rewardTable`,
// `prizePool` et `podium` alimentent les visuels de la page /tournois.
import {
  CASH_BY_WINS,
  CASH_FIRST_PLACE,
  CHAMPION_BONUS,
  GRAND_CREDITS_BY_WINS,
  GRAND_ESSENCE_BY_WINS,
  QUALIFICATION_REWARDS,
  QUALIFICATION_SIZE,
} from "./config";

export type TournamentKind = "qualification" | "grand";

export interface Reward {
  /** Euros (entiers). Toujours calculé, affiché/versé seulement si CASH_PRIZES_ENABLED. */
  cash: number;
  credits: number;
  essence: number;
  goldenTicket: boolean;
}

export interface RewardRow extends Reward {
  wins: number;
  rankLabel: string;
  /** Nombre de joueurs qui finissent avec ce nombre de victoires. */
  players: number;
  isChampion: boolean;
}

export interface PrizePool {
  cash: number;
  credits: number;
  essence: number;
  goldenTickets: number;
}

/** Nombre de tours d'un tableau à élimination directe (taille = puissance de 2). */
export function roundsFor(size: number): number {
  const r = Math.log2(size);
  if (!Number.isInteger(r) || r < 1) throw new Error(`Taille de tableau invalide : ${size}`);
  return r;
}

export function computeReward(opts: {
  kind: TournamentKind;
  wins: number;
  isChampion: boolean;
  /** Nombre de tours du tableau (grand tournoi). */
  totalRounds: number;
}): Reward {
  const { kind, wins, isChampion, totalRounds } = opts;
  if (kind === "qualification") {
    const r = QUALIFICATION_REWARDS[Math.min(wins, 5)] ?? QUALIFICATION_REWARDS[0];
    return { cash: 0, credits: r.credits, essence: r.essence, goldenTicket: r.goldenTicket };
  }
  // Le barème s'arrête à 12 victoires (4 096 joueurs) : erreur explicite plutôt
  // qu'un montant nul qui passerait inaperçu.
  if (wins > 12 || totalRounds > 12 || GRAND_CREDITS_BY_WINS[wins] === undefined) {
    throw new Error(`Barème du grand tournoi non défini pour ${wins} victoire(s) / ${totalRounds} tours`);
  }
  const bonus = isChampion ? CHAMPION_BONUS[totalRounds] : undefined;
  const cash = isChampion ? (CASH_FIRST_PLACE[wins] ?? CASH_BY_WINS[wins] ?? 0) : (CASH_BY_WINS[wins] ?? 0);
  return {
    cash,
    credits: GRAND_CREDITS_BY_WINS[wins] + (bonus?.credits ?? 0),
    essence: GRAND_ESSENCE_BY_WINS[wins] + (bonus?.essence ?? 0),
    goldenTicket: false,
  };
}

/** « 1er », « 2e », « 3e–4e », « 5e–8e »… pour `wins` victoires sur un tableau de `size`. */
export function rankLabel(wins: number, size: number): string {
  const rounds = roundsFor(size);
  if (wins >= rounds) return "1er";
  const lo = size / 2 ** (wins + 1) + 1;
  const hi = size / 2 ** wins;
  return lo === hi ? `${hi}e` : `${lo}e–${hi}e`;
}

/** Lignes du tableau des récompenses, par victoires décroissantes. */
export function rewardTable(kind: TournamentKind, size: number): RewardRow[] {
  const rounds = roundsFor(kind === "qualification" ? QUALIFICATION_SIZE : size);
  const n = 2 ** rounds;
  const rows: RewardRow[] = [];
  for (let wins = rounds; wins >= 0; wins--) {
    const isChampion = wins === rounds;
    rows.push({
      wins,
      rankLabel: rankLabel(wins, n),
      players: isChampion ? 1 : n / 2 ** (wins + 1),
      isChampion,
      ...computeReward({ kind, wins, isChampion, totalRounds: rounds }),
    });
  }
  return rows;
}

/** Lignes qui rapportent quelque chose (la maquette masque celles à zéro). */
export function rewardedRows(rows: RewardRow[], withCash: boolean): RewardRow[] {
  return rows.filter((r) => r.credits || r.essence || r.goldenTicket || (withCash && r.cash));
}

/** Totaux distribués sur tout le tableau. */
export function prizePool(kind: TournamentKind, size: number): PrizePool {
  return rewardTable(kind, size).reduce<PrizePool>(
    (acc, r) => ({
      cash: acc.cash + r.cash * r.players,
      credits: acc.credits + r.credits * r.players,
      essence: acc.essence + r.essence * r.players,
      goldenTickets: acc.goldenTickets + (r.goldenTicket ? r.players : 0),
    }),
    { cash: 0, credits: 0, essence: 0, goldenTickets: 0 },
  );
}

/** Les trois premières marches (1er, 2e, 3e–4e). */
export function podium(kind: TournamentKind, size: number): RewardRow[] {
  return rewardTable(kind, size).slice(0, 3);
}
