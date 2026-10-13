// Orchestration côté navigateur : un pool de Web Workers qui se partagent une
// file de parties. Chaque worker reçoit les parties par petits paquets, ce qui
// répartit la charge même quand certaines parties sont longues.
import type { CatalogueSim, DeckFige, PartieJouee, PartiePlan } from "./deck-test";
import type { EntreeJournal } from "./simulate";

export interface Pool {
  jouer(parties: PartiePlan[], surPartie: (p: PartieJouee) => void, surErreur?: (k: number, m: string) => void): Promise<void>;
  journal(partie: PartiePlan): Promise<{ partie: PartieJouee; journal: EntreeJournal[] }>;
  /** Vide la file du `jouer` en cours : les parties déjà lancées se terminent. */
  annuler(): void;
  arreter(): void;
  taille: number;
}

const PAQUET = 4;

export async function creerPool(catalogue: CatalogueSim, decks: DeckFige[], taille?: number): Promise<Pool> {
  const n = Math.max(1, Math.min(8, taille ?? ((navigator.hardwareConcurrency || 4) - 1)));
  const workers = Array.from({ length: n }, () => new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" }));
  await Promise.all(workers.map((w) => new Promise<void>((ok, ko) => {
    w.onmessage = (e) => { if (e.data?.type === "pret") ok(); else if (e.data?.type === "erreur") ko(new Error(e.data.message)); };
    w.onerror = (e) => ko(new Error(e.message || "worker en échec"));
    w.postMessage({ type: "init", catalogue, decks });
  })));
  let arrete = false;
  let fileCourante: PartiePlan[] = [];
  // Worker DÉDIÉ au rejeu, créé à la demande : rejouer une partie pendant un
  // test ne doit pas détourner les messages des workers de calcul.
  let rejeu: Worker | null = null;

  return {
    taille: n,
    annuler() { fileCourante.length = 0; },
    arreter() { arrete = true; workers.forEach((w) => w.terminate()); rejeu?.terminate(); },
    jouer(parties, surPartie, surErreur) {
      const file = [...parties];
      fileCourante = file;
      return new Promise<void>((fini) => {
        let actifs = 0;
        const servir = (w: Worker) => {
          if (arrete || !file.length) { if (actifs === 0) fini(); return; }
          actifs++;
          w.postMessage({ type: "jouer", parties: file.splice(0, PAQUET) });
        };
        for (const w of workers) {
          w.onmessage = (e) => {
            const m = e.data;
            if (m.type === "partie") surPartie(m.partie);
            else if (m.type === "erreur") surErreur?.(m.k, m.message);
            else if (m.type === "lot_fini") { actifs--; servir(w); if (actifs === 0 && !file.length) fini(); }
          };
          servir(w);
        }
      });
    },
    async journal(partie) {
      if (!rejeu) {
        const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
        await new Promise<void>((ok, ko) => {
          w.onmessage = (e) => { if (e.data?.type === "pret") ok(); };
          w.onerror = (e) => ko(new Error(e.message || "worker en échec"));
          w.postMessage({ type: "init", catalogue, decks });
        });
        rejeu = w;
      }
      const w = rejeu;
      return new Promise((ok, ko) => {
        let res: { partie: PartieJouee; journal: EntreeJournal[] } | null = null;
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === "partie") res = { partie: m.partie, journal: m.journal ?? [] };
          else if (m.type === "erreur") ko(new Error(m.message));
          else if (m.type === "lot_fini") { if (res) ok(res); else ko(new Error("partie introuvable")); }
        };
        w.postMessage({ type: "jouer", parties: [partie], journal: true });
      });
    },
  };
}
