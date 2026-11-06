// BARÈME DES TOURNOIS — source unique des valeurs (brief §3).
//
// La page /tournois calcule TOUS ses visuels (prize pools, podiums, tableaux)
// à partir de ces tables : changer un chiffre ici suffit, aucune image n'est à
// régénérer. Le versement des récompenses (lot 5) lira les mêmes tables via
// `computeReward` (rewards.ts) : ne jamais dupliquer ces valeurs ailleurs.
import { ESSENCE_CRAFT_COST } from "@/lib/economy/constants";

/** Phase 1 : aucun argent réel. Le montant est calculé partout, mais n'est
 *  AFFICHÉ (et plus tard versé) que si ce drapeau est vrai — le cadre
 *  juridique des cash prizes doit être instruit avant activation. */
export const CASH_PRIZES_ENABLED = true;

export const QUALIFICATION_SIZE = 32;
export const CREDIT_LIFETIME_DAYS = 30;
export const FORGE_COST = ESSENCE_CRAFT_COST;

/** Tailles possibles du grand tournoi : toujours une puissance de 2 (le
 *  surplus de qualifiés est reporté au mois suivant, jamais de bye). */
export const GRAND_MIN_SIZE = 16;
export const GRAND_SIZES = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096] as const;
/** Taille présélectionnée sur la page /tournois. */
export const GRAND_DEFAULT_SIZE: (typeof GRAND_SIZES)[number] = 256;

export interface QualificationReward {
  credits: number;
  essence: number;
  goldenTicket: boolean;
}

/** Tournoi de qualification — récompenses par nombre de victoires. */
export const QUALIFICATION_REWARDS: Record<number, QualificationReward> = {
  5: { credits: 200, essence: 2000, goldenTicket: true },
  4: { credits: 100, essence: 1000, goldenTicket: false },
  3: { credits: 50, essence: 500, goldenTicket: false },
  2: { credits: 20, essence: 250, goldenTicket: false },
  1: { credits: 0, essence: 100, goldenTicket: false },
  0: { credits: 0, essence: 0, goldenTicket: false },
};

/** Grand tournoi — argent, en euros, par nombre de victoires (dès 3). */
export const CASH_BY_WINS: Record<number, number> = {
  12: 35000, 11: 16000, 10: 8000, 9: 4000, 8: 2000,
  7: 1000, 6: 600, 5: 400, 4: 200, 3: 100,
};
/** Montant majoré si le joueur est le champion du tournoi. */
export const CASH_FIRST_PLACE: Record<number, number> = {
  12: 40000, 11: 20000, 10: 10000, 9: 5000, 8: 3000,
  7: 2000, 6: 1000, 5: 750, 4: 500,
};

/** Grand tournoi — monnaies, par nombre de victoires. */
export const GRAND_CREDITS_BY_WINS: Record<number, number> = {
  12: 5000, 11: 3500, 10: 2500, 9: 1750, 8: 1250, 7: 900,
  6: 600, 5: 400, 4: 300, 3: 200, 2: 150, 1: 120, 0: 100,
};
export const GRAND_ESSENCE_BY_WINS: Record<number, number> = {
  12: 8500, 11: 6500, 10: 5000, 9: 4000, 8: 3000, 7: 2250,
  6: 1600, 5: 1100, 4: 800, 3: 550, 2: 350, 1: 250, 0: 250,
};

/** Bonus de titre au champion, indexé sur le nombre de tours du tableau. */
export const CHAMPION_BONUS: Record<number, { credits: number; essence: number }> = {
  4: { credits: 200, essence: 700 },
  5: { credits: 300, essence: 1000 },
  6: { credits: 450, essence: 1400 },
  7: { credits: 650, essence: 2000 },
  8: { credits: 1000, essence: 2800 },
  9: { credits: 1500, essence: 4000 },
  10: { credits: 2500, essence: 5000 },
  11: { credits: 3500, essence: 7000 },
  12: { credits: 5000, essence: 10000 },
};

/** Cosmétiques remis à chaque participant du grand tournoi. */
export const GRAND_PARTICIPATION_COSMETICS = "Plateau + Héros en édition limitée";
