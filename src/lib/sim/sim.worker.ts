// Web Worker du simulateur (/admin/simulator) : reçoit le catalogue et les
// decks une fois, puis joue les parties qu'on lui confie et renvoie leur
// résultat compact. Un worker par cœur : les parties sont indépendantes.
import { preparer, type CatalogueSim, type DeckFige, type PartiePlan } from "./deck-test";

type Entree =
  | { type: "init"; catalogue: CatalogueSim; decks: DeckFige[] }
  | { type: "jouer"; parties: PartiePlan[]; journal?: boolean };

// Le moteur journalise chaque bascule de tour : silence dans le worker.
console.log = () => {};
console.info = () => {};
console.warn = () => {};

let moteur: ReturnType<typeof preparer> | null = null;

self.onmessage = (ev: MessageEvent<Entree>) => {
  const m = ev.data;
  if (m.type === "init") {
    moteur = preparer(m.catalogue, m.decks);
    postMessage({ type: "pret" });
    return;
  }
  if (!moteur) { postMessage({ type: "erreur", k: -1, message: "worker non initialisé" }); return; }
  for (const p of m.parties) {
    try {
      const { partie, resultat } = moteur.jouer(p, m.journal === true);
      postMessage({ type: "partie", partie, ...(m.journal ? { journal: resultat.journal } : {}) });
    } catch (e) {
      postMessage({ type: "erreur", k: p.k, message: e instanceof Error ? e.message : String(e) });
    }
  }
  postMessage({ type: "lot_fini" });
};
