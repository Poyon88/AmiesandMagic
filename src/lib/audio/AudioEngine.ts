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

    // Already playing this track
    if (this._currentUrl === url && !this.activeElement.paused) return;

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
    if (same && !this.activeElement.paused) return;

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
   * Crossfade from current track to a new one.
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
    const fadeOutStep = this.activeElement.volume / steps;
    const fadeInTarget = this._muted ? 0 : this._volume;
    const fadeInStep = fadeInTarget / steps;
    let step = 0;

    this.fadeTimer = setInterval(() => {
      step++;
      this.activeElement.volume = Math.max(0, this.activeElement.volume - fadeOutStep);
      this.nextElement.volume = Math.min(fadeInTarget, this.nextElement.volume + fadeInStep);

      if (step >= steps) {
        this.stopFade();
        this.activeElement.pause();
        this.activeElement.src = "";

        // Swap elements
        const tmp = this.activeElement;
        this.activeElement = this.nextElement;
        this.nextElement = tmp;
      }
    }, FADE_INTERVAL_MS);
  }

  /**
   * Stop current music with optional fade out.
   */
  stopMusic(fadeOut = true) {
    this.clearPlaylist();
    this.stopFade();

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
    if (!this.activeElement.paused) {
      this.applyVolume(this.activeElement);
    }
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    if (!this.activeElement.paused) {
      this.applyVolume(this.activeElement);
    }
  }

  get isPlaying(): boolean {
    return !this.activeElement.paused;
  }

  /**
   * Temporarily pause the current track (source kept intact). `resume()` will
   * continue where we left off. No fade — meant for short dramatic silences.
   */
  pause() {
    this.stopFade();
    this.activeElement.pause();
  }

  /**
   * Resume a paused track. Does nothing if no track is loaded.
   */
  resume() {
    if (!this.activeElement.src) return;
    this.applyVolume(this.activeElement);
    this.activeElement.play().catch(() => {});
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
