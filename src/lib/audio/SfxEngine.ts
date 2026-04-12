/**
 * SfxEngine — singleton for concurrent SFX playback.
 * Uses a pool of HTMLAudioElement instances for fire-and-forget sounds.
 */

const INITIAL_POOL_SIZE = 8;
const MAX_POOL_SIZE = 16;

class SfxEngine {
  private static instance: SfxEngine;

  private pool: HTMLAudioElement[] = [];
  private preloaded = new Map<string, HTMLAudioElement>();
  private _volume = 0.5;
  private _muted = false;

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

  play(url: string) {
    if (this._muted || this._volume <= 0 || !url) return;

    // Try to use a preloaded element (clone it for concurrent playback)
    const preloaded = this.preloaded.get(url);
    if (preloaded) {
      const clone = preloaded.cloneNode(true) as HTMLAudioElement;
      clone.volume = this._volume;
      clone.play().catch(() => {});
      return;
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
