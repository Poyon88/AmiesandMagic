/**
 * AudioEngine — singleton managing music playback with crossfade support.
 * Uses two HTMLAudioElement instances to enable smooth transitions.
 */

const CROSSFADE_MS = 1500;
const FADE_INTERVAL_MS = 50;

class AudioEngine {
  private static instance: AudioEngine;

  private activeElement: HTMLAudioElement;
  private nextElement: HTMLAudioElement;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;

  private _volume = 0.5;
  /** Pause DÉLIBÉRÉE (alerte du chrono), à distinguer d'un élément simplement
   *  arrêté. Tant qu'elle dure, rien ne doit relancer la musique de soi-même. */
  private _paused = false;
  private _muted = false;
  private _currentUrl = "";
  private _playlist: string[] = [];
  private _playlistHandler: (() => void) | null = null;

  private constructor() {
    this.activeElement = this.createElement();
    this.nextElement = this.createElement();
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  private createElement(): HTMLAudioElement {
    const el = new Audio();
    el.preload = "auto";
    return el;
  }

  private applyVolume(el: HTMLAudioElement, volume?: number) {
    el.volume = Math.max(0, Math.min(1, this._muted ? 0 : (volume ?? this._volume)));
  }

  /**
   * Play a music track. If something is already playing, crossfade to it.
   */
  playMusic(url: string, options?: { loop?: boolean; fadeIn?: boolean }) {
    this.clearPlaylist();
    const loop = options?.loop ?? true;

    // Déjà sur ce morceau : ne rien faire. Le `_paused` couvre le cas d'une
    // musique volontairement coupée par l'alerte du chrono — la relancer ici la
    // ressusciterait au premier re-rendu du pilote audio.
    if (this._currentUrl === url && (!this.activeElement.paused || this._paused)) return;

    // Changement RÉEL de morceau (contexte victoire/défaite, bascule tendue…) :
    // il prime sur la coupure du chrono, sinon la fin de partie resterait muette.
    this._paused = false;

    if (!this.activeElement.paused && options?.fadeIn !== false) {
      this.crossfadeTo(url, loop);
      return;
    }

    this.stopFade();
    this._currentUrl = url;
    this.activeElement.src = url;
    this.activeElement.loop = loop;
    this.applyVolume(this.activeElement);
    this.activeElement.play().catch((err) => {
      console.warn("[AudioEngine] play blocked:", err.message);
    });
  }

  /**
   * Play a random track from a playlist; on end, pick another random one
   * (avoiding immediate repetition when more than one track is available).
   * Crossfades between tracks.
   */
  playPlaylist(urls: string[]) {
    const unique = urls.filter(Boolean);
    if (unique.length === 0) {
      this.clearPlaylist();
      this.stopMusic();
      return;
    }
    if (unique.length === 1) {
      this._playlist = unique;
      this.clearPlaylistHandler();
      this.playMusic(unique[0], { loop: true });
      this._playlist = unique;
      return;
    }

    const same =
      this._playlist.length === unique.length &&
      this._playlist.every((u, i) => u === unique[i]);
    // Même playlist déjà en place : ne rien faire. Le test portait sur
    // `!paused`, si bien qu'une playlist volontairement mise en pause par
    // l'alerte du chrono était RELANCÉE — sur un autre morceau tiré au hasard —
    // au premier re-rendu du pilote audio.
    if (same && (!this.activeElement.paused || this._paused)) return;

    this._playlist = unique;
    const first = this.pickNext();
    this.playOneFromPlaylist(first, !this.activeElement.paused);
  }

  private pickNext(): string {
    const list = this._playlist;
    if (list.length <= 1) return list[0] ?? "";
    const remaining = list.filter((u) => u !== this._currentUrl);
    const pool = remaining.length > 0 ? remaining : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private playOneFromPlaylist(url: string, crossfade: boolean) {
    this.clearPlaylistHandler();
    this._currentUrl = url;

    const onEnded = () => {
      if (this._playlist.length === 0) return;
      const next = this.pickNext();
      this.playOneFromPlaylist(next, true);
    };

    if (crossfade) {
      // Attach the 'ended' listener to nextElement BEFORE crossfade; after the
      // swap inside crossfadeTo this becomes activeElement, so the listener
      // travels with the audio without needing a setTimeout.
      this.nextElement.addEventListener("ended", onEnded);
      this._playlistHandler = onEnded;
      this.crossfadeTo(url, false);
    } else {
      this.stopFade();
      this.activeElement.src = url;
      this.activeElement.loop = false;
      this.applyVolume(this.activeElement);
      this.activeElement.play().catch((err) => {
        console.warn("[AudioEngine] play blocked:", err.message);
      });
      this.activeElement.addEventListener("ended", onEnded);
      this._playlistHandler = onEnded;
    }
  }

  private clearPlaylistHandler() {
    if (this._playlistHandler) {
      this.activeElement.removeEventListener("ended", this._playlistHandler);
      this.nextElement.removeEventListener("ended", this._playlistHandler);
      this._playlistHandler = null;
    }
  }

  private clearPlaylist() {
    this._playlist = [];
    this.clearPlaylistHandler();
  }

  /**
   * Crossfade from current track to a new one. The target volume is
   * re-evaluated on every tick so changes to `_muted` / `_volume` during the
   * fade are honored immediately.
   */
  crossfadeTo(url: string, loop = true) {
    this.stopFade();

    // Set up the next element
    this._currentUrl = url;
    this.nextElement.src = url;
    this.nextElement.loop = loop;
    this.nextElement.volume = 0;
    this.nextElement.play().catch(() => {});

    const steps = CROSSFADE_MS / FADE_INTERVAL_MS;
    const outStartVolume = this.activeElement.volume;
    let step = 0;

    this.fadeTimer = setInterval(() => {
      step++;
      const progress = Math.min(1, step / steps);
      const target = this._muted ? 0 : this._volume;
      this.activeElement.volume = Math.max(0, outStartVolume * (1 - progress));
      this.nextElement.volume = target * progress;

      if (step >= steps) {
        this.stopFade();
        this.activeElement.pause();
        this.activeElement.src = "";

        // Swap elements
        const tmp = this.activeElement;
        this.activeElement = this.nextElement;
        this.nextElement = tmp;
        // Lock-in the exact post-fade volume on the new active element.
        this.applyVolume(this.activeElement);
      }
    }, FADE_INTERVAL_MS);
  }

  /**
   * Stop current music with optional fade out.
   */
  stopMusic(fadeOut = true) {
    this.clearPlaylist();
    this.stopFade();
    // Arrêt explicite : la coupure du chrono n'a plus lieu d'être, et une
    // lecture ultérieure ne doit pas être bloquée par un drapeau périmé.
    this._paused = false;

    if (!fadeOut || this.activeElement.paused) {
      this._currentUrl = "";
      this.activeElement.pause();
      this.activeElement.src = "";
      return;
    }

    const steps = CROSSFADE_MS / FADE_INTERVAL_MS;
    const fadeOutStep = this.activeElement.volume / steps;
    let step = 0;

    this.fadeTimer = setInterval(() => {
      step++;
      this.activeElement.volume = Math.max(0, this.activeElement.volume - fadeOutStep);
      if (step >= steps) {
        this.stopFade();
        this.activeElement.pause();
        this.activeElement.src = "";
      }
    }, FADE_INTERVAL_MS);
  }

  setVolume(volume: number) {
    this._volume = Math.max(0, Math.min(1, volume));
    // During a crossfade the tick loop handles volumes itself; outside of it
    // we still want live-applied volume on whichever element is audible.
    if (this.fadeTimer) return;
    this.applyVolume(this.activeElement);
    this.applyVolume(this.nextElement);
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    if (this.fadeTimer) return;
    this.applyVolume(this.activeElement);
    this.applyVolume(this.nextElement);
  }

  get isPlaying(): boolean {
    return !this.activeElement.paused;
  }

  /**
   * Temporarily pause the current track (source kept intact). `resume()` will
   * continue where we left off. No fade — meant for short dramatic silences.
   */
  pause() {
    // Un fondu enchaîné fait jouer les DEUX éléments à la fois. `stopFade()`
    // ne coupe que le minuteur : sans finir la bascule, on ne mettait en pause
    // que le morceau SORTANT et l'entrant continuait — l'alerte des 15 s ne
    // faisait alors pas taire la musique du plateau.
    this.finishFadeNow();
    this._paused = true;
    this.activeElement.pause();
  }

  /**
   * Resume a paused track. Does nothing if no track is loaded.
   */
  resume() {
    this._paused = false;
    if (!this.activeElement.src) return;
    this.applyVolume(this.activeElement);
    this.activeElement.play().catch(() => {});
  }

  /** La musique est-elle en pause DÉLIBÉRÉE (alerte du chrono) ? Distinct d'un
   *  `activeElement.paused` fortuit : c'est ce qui permet de ne pas la faire
   *  repartir toute seule. */
  get isDucked(): boolean {
    return this._paused;
  }

  /** Termine immédiatement un fondu en cours : le morceau ENTRANT devient
   *  l'actif, le sortant est coupé. Sans ça, toute opération qui ne touche que
   *  `activeElement` (pause, volume) rate la moitié du son en vol. */
  private finishFadeNow() {
    if (!this.fadeTimer) return;
    this.stopFade();
    this.activeElement.pause();
    this.activeElement.src = "";
    const tmp = this.activeElement;
    this.activeElement = this.nextElement;
    this.nextElement = tmp;
    this.applyVolume(this.activeElement);
  }

  get currentSrc(): string {
    return this.activeElement.src;
  }

  private stopFade() {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }
}

export default AudioEngine;
