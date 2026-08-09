// `SfxEngine.playChain` — sons joués À LA SUITE, sans chevauchement.
//
// C'est ce qui réalise « le son de pose passe d'abord, celui de la capacité
// s'enchaîne juste après ». Les trois garde-fous testés ici ne sont pas
// cosmétiques : sans le chrono de secours, un fichier dont `ended` ne part
// jamais (onglet en arrière-plan, lecture refusée) gèlerait toute la suite.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import SfxEngine from "./SfxEngine";

/** Journal des lectures RÉELLES : `{src, el}` à l'instant du `play()`.
 *
 *  Indispensable — le pool de `SfxEngine` RÉUTILISE ses éléments d'un test à
 *  l'autre en réécrivant leur `src`. Inspecter les objets après coup ne dirait
 *  donc pas ce qui a été joué, mais seulement le dernier état de chacun. */
const plays: Array<{ src: string; el: FakeAudio }> = [];

/** Faux élément audio : on contrôle à la main le moment du `ended`. */
class FakeAudio {
  src = "";
  volume = 1;
  paused = true;
  ended = false;
  duration = NaN; // métadonnées non chargées, comme au premier chargement réel
  private listeners: Record<string, Array<() => void>> = {};

  constructor(src?: string) { if (src) this.src = src; }
  play() { this.paused = false; plays.push({ src: this.src, el: this }); return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(type: string, cb: () => void) { (this.listeners[type] ??= []).push(cb); }
  removeEventListener(type: string, cb: () => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== cb);
  }
  cloneNode() { return new FakeAudio(this.src); }
  /** Simule la fin naturelle du son. */
  finish() {
    this.ended = true;
    for (const cb of [...(this.listeners["ended"] ?? [])]) cb();
  }
}

const playedSources = () => plays.map((p) => p.src);
/** Dernier élément joué pour cette URL — celui dont on peut déclencher `ended`. */
const elementFor = (src: string) => plays.filter((p) => p.src === src).at(-1)?.el;

describe("playChain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    plays.length = 0;
    (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;
    const engine = SfxEngine.getInstance();
    engine.setMuted(false);
    engine.setVolume(1);
    engine.cancelChain();
  });
  afterEach(() => { vi.useRealTimers(); });

  it("joue le deuxième son SEULEMENT quand le premier se termine", () => {
    SfxEngine.getInstance().playChain(["a.mp3", "b.mp3"]);

    // Le premier part tout de suite ; le second attend.
    expect(playedSources()).toEqual(["a.mp3"]);

    elementFor("a.mp3")!.finish();

    expect(playedSources()).toContain("b.mp3");
  });

  it("un son qui ne se termine JAMAIS n'empêche pas la suite (chrono de secours)", () => {
    SfxEngine.getInstance().playChain(["bloque.mp3", "suivant.mp3"]);
    expect(playedSources()).toEqual(["bloque.mp3"]);

    // Aucun `ended` n'est émis — seul le chrono peut débloquer.
    vi.advanceTimersByTime(5000);

    expect(playedSources()).toContain("suivant.mp3");
  });

  it("le chrono ne double PAS le son quand `ended` a déjà avancé la chaîne", () => {
    SfxEngine.getInstance().playChain(["a.mp3", "b.mp3", "c.mp3"]);
    elementFor("a.mp3")!.finish();
    const apresEnded = playedSources().filter((s) => s === "b.mp3").length;

    vi.advanceTimersByTime(5000);

    // « b » ne doit pas repartir une seconde fois par le chrono du maillon 1.
    expect(playedSources().filter((s) => s === "b.mp3").length).toBe(apresEnded);
  });

  it("une nouvelle chaîne annule la précédente", () => {
    const engine = SfxEngine.getInstance();
    engine.playChain(["vieux1.mp3", "vieux2.mp3"]);
    engine.playChain(["neuf.mp3"]);

    // La suite de l'ancienne chaîne ne doit plus jamais partir.
    vi.advanceTimersByTime(10000);

    expect(playedSources()).toContain("neuf.mp3");
    expect(playedSources()).not.toContain("vieux2.mp3");
  });

  it("chaîne tronquée au-delà de la limite", () => {
    SfxEngine.getInstance().playChain(["1", "2", "3", "4", "5", "6"]);
    for (let i = 0; i < 10; i++) vi.advanceTimersByTime(5000);

    // 4 maillons max : une fin de tour à huit capacités ne joue pas une minute
    // de bruitages.
    expect(playedSources()).not.toContain("5");
  });

  it("son muet ⇒ rien ne part", () => {
    const engine = SfxEngine.getInstance();
    engine.setMuted(true);
    engine.playChain(["a.mp3"]);
    expect(playedSources()).toEqual([]);
    engine.setMuted(false);
  });
});
