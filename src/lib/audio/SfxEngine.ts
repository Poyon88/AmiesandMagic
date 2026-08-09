/**
 * SfxEngine — singleton for concurrent SFX playback.
 * Uses a pool of HTMLAudioElement instances for fire-and-forget sounds.
 */

const INITIAL_POOL_SIZE = 8;
const MAX_POOL_SIZE = 16;
/** Maillons max d'une chaîne (cf. playChain) — au-delà, on tronque. */
const MAX_CHAIN_LENGTH = 4;
/** Blanc entre deux maillons : sans lui, les sons se touchent et se confondent. */
const CHAIN_GAP_MS = 60;
/** Durée supposée quand les métadonnées manquent. */
const CHAIN_FALLBACK_MS = 1200;
/** Plafond par maillon : un fichier très long ne doit pas bloquer la chaîne. */
const CHAIN_MAX_STEP_MS = 4000;

class SfxEngine {
  private static instance: SfxEngine;

  private pool: HTMLAudioElement[] = [];
  private preloaded = new Map<string, HTMLAudioElement>();
  private _volume = 0.5;
  private _muted = false;
  /** Chaîne en cours (cf. playChain). Le jeton invalide les rappels d'une
   *  chaîne annulée : sans lui, un `ended` en retard relancerait sa suite. */
  private chainToken = 0;
  private chainTimer: ReturnType<typeof setTimeout> | null = null;
  private chainEl: HTMLAudioElement | null = null;

  private constructor() {
    for (let i = 0; i < INITIAL_POOL_SIZE; i++) {
      this.pool.push(new Audio());
    }
  }

  static getInstance(): SfxEngine {
    if (!SfxEngine.instance) {
      SfxEngine.instance = new SfxEngine();
    }
    return SfxEngine.instance;
  }

  play(url: string): HTMLAudioElement | null {
    if (this._muted || this._volume <= 0 || !url) return null;

    // Try to use a preloaded element (clone it for concurrent playback)
    const preloaded = this.preloaded.get(url);
    if (preloaded) {
      const clone = preloaded.cloneNode(true) as HTMLAudioElement;
      clone.volume = this._volume;
      clone.play().catch(() => {});
      return clone;
    }

    // Find an idle element in the pool
    let el = this.pool.find((e) => e.paused || e.ended);

    if (!el) {
      // Expand pool if under max
      if (this.pool.length < MAX_POOL_SIZE) {
        el = new Audio();
        this.pool.push(el);
      } else {
        // Recycle the oldest element
        el = this.pool[0];
        el.pause();
      }
    }

    el.src = url;
    el.volume = this._volume;
    el.play().catch(() => {});
    return el;
  }

  /** Joue des sons À LA SUITE, sans chevauchement : chaque maillon démarre
   *  quand le précédent se termine.
   *
   *  Sert au bruitage des capacités : le son de pose (ou de mort) de la carte
   *  passe d'abord, celui de la capacité s'enchaîne juste après. `play()`
   *  resterait concurrent et les superposerait.
   *
   *  Trois garde-fous, tous nécessaires :
   *   • un CHRONO DE SECOURS par maillon — un fichier qui ne charge pas, ou dont
   *     `ended` ne part jamais (onglet en arrière-plan, lecture refusée), gèlerait
   *     sinon toute la suite de la chaîne ;
   *   • une seule chaîne à la fois — la précédente est coupée, sinon les sons
   *     s'empilent d'une action sur l'autre ;
   *   • une longueur BORNÉE — une fin de tour à huit capacités ne doit pas jouer
   *     une minute de bruitages.
   */
  playChain(urls: string[]): void {
    this.cancelChain();
    const list = urls.filter(Boolean).slice(0, MAX_CHAIN_LENGTH);
    if (list.length === 0 || this._muted || this._volume <= 0) return;

    const token = ++this.chainToken;
    const step = (i: number) => {
      if (i >= list.length || token !== this.chainToken) return;
      const el = this.play(list[i]);
      if (!el) return step(i + 1); // son injouable : on n'interrompt pas la chaîne
      this.chainEl = el;

      let advanced = false;
      const next = () => {
        if (advanced || token !== this.chainToken) return;
        advanced = true;
        clearTimeout(timer);
        el.removeEventListener("ended", next);
        step(i + 1);
      };
      el.addEventListener("ended", next);
      // `duration` est NaN tant que les métadonnées ne sont pas chargées : le
      // repli fixe couvre ce cas comme celui d'un fichier muet ou bloqué.
      const durationMs = Number.isFinite(el.duration) && el.duration > 0
        ? el.duration * 1000 + CHAIN_GAP_MS
        : CHAIN_FALLBACK_MS;
      const timer = setTimeout(next, Math.min(durationMs, CHAIN_MAX_STEP_MS));
      this.chainTimer = timer;
    };
    step(0);
  }

  /** Coupe la chaîne en cours (le son déjà lancé va au bout, seule la SUITE est
   *  abandonnée — couper net un son en cours s'entendrait comme un défaut). */
  cancelChain(): void {
    this.chainToken++;
    if (this.chainTimer) { clearTimeout(this.chainTimer); this.chainTimer = null; }
    this.chainEl = null;
  }

  /** Stop and reset a tracked SFX audio element returned by `play()`. */
  stop(el: HTMLAudioElement | null | undefined) {
    if (!el) return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch { /* ignore */ }
  }

  preload(urls: string[]) {
    for (const url of urls) {
      if (!url || this.preloaded.has(url)) continue;
      const el = new Audio();
      el.preload = "auto";
      el.src = url;
      this.preloaded.set(url, el);
    }
  }

  setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  setMuted(muted: boolean) {
    this._muted = muted;
  }
}

export default SfxEngine;
