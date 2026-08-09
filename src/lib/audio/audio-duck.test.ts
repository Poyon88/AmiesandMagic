// L'alerte des 15 secondes doit FAIRE TAIRE la musique du plateau.
//
// `TurnTimer` appelle bien `AudioEngine.pause()` depuis toujours, mais la
// musique repartait quand même. Deux trous, tous deux vérifiés ici :
//
//   1. `pause()` ne coupait que `activeElement`. Pendant un fondu enchaîné, les
//      DEUX éléments jouent : le morceau entrant continuait tout seul.
//   2. `playPlaylist` / `playMusic` testaient « déjà en cours » via
//      `!activeElement.paused`. Une musique volontairement coupée n'était donc
//      plus « en cours » à leurs yeux, et le moindre re-rendu du pilote audio la
//      relançait — sur un autre morceau tiré au hasard, dans le cas d'une
//      playlist.
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import AudioEngine from "./AudioEngine";

class FakeAudio {
  src = "";
  volume = 1;
  loop = false;
  paused = true;
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener() {}
  removeEventListener() {}
}

/** L'élément qui SONNE réellement, s'il y en a un. */
function audible(engine: AudioEngine): string | null {
  const el = (engine as unknown as { activeElement: FakeAudio }).activeElement;
  return el.paused ? null : el.src;
}
function nextEl(engine: AudioEngine): FakeAudio {
  return (engine as unknown as { nextElement: FakeAudio }).nextElement;
}

describe("l'alerte du chrono fait taire la musique", () => {
  let engine: AudioEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;
    // Instance neuve à chaque test : le moteur est un singleton.
    (AudioEngine as unknown as { instance: AudioEngine | undefined }).instance = undefined;
    engine = AudioEngine.getInstance();
    engine.setMuted(false);
    engine.setVolume(1);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("un morceau simple se tait", () => {
    engine.playMusic("plateau.mp3");
    expect(audible(engine)).toBe("plateau.mp3");

    engine.pause();
    expect(audible(engine)).toBeNull();
  });

  it("un fondu ENCHAÎNÉ en cours se tait aussi — les deux éléments jouaient", () => {
    engine.playMusic("a.mp3");
    engine.playMusic("b.mp3"); // déclenche le fondu : a et b jouent ensemble
    expect(nextEl(engine).paused).toBe(false);

    engine.pause();

    // Ni le sortant ni l'entrant ne doivent subsister.
    expect(audible(engine)).toBeNull();
    expect(nextEl(engine).paused).toBe(true);
  });

  it("une playlist se tait et ne redémarre pas toute seule", () => {
    const liste = ["p1.mp3", "p2.mp3", "p3.mp3"];
    engine.playPlaylist(liste);
    expect(audible(engine)).not.toBeNull();

    engine.pause();
    expect(audible(engine)).toBeNull();

    // Le pilote audio re-rend et redemande la MÊME playlist : autrefois la
    // musique repartait ici, sur un morceau différent.
    engine.playPlaylist(liste);
    expect(audible(engine)).toBeNull();
  });

  it("le même morceau redemandé ne ressuscite pas la musique coupée", () => {
    engine.playMusic("plateau.mp3");
    engine.pause();

    engine.playMusic("plateau.mp3");

    expect(audible(engine)).toBeNull();
  });
});

describe("ce que la coupure ne doit PAS bloquer", () => {
  let engine: AudioEngine;
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { Audio: unknown }).Audio = FakeAudio;
    (AudioEngine as unknown as { instance: AudioEngine | undefined }).instance = undefined;
    engine = AudioEngine.getInstance();
    engine.setMuted(false);
    engine.setVolume(1);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("un CHANGEMENT de morceau prime — la fin de partie ne reste pas muette", () => {
    engine.playMusic("plateau.mp3");
    engine.pause();

    // Victoire / défaite : contexte différent, morceau différent.
    engine.playMusic("victoire.mp3", { loop: false });

    expect(audible(engine)).toBe("victoire.mp3");
    expect(engine.isDucked).toBe(false);
  });

  it("`resume()` rend la musique au tour suivant", () => {
    engine.playMusic("plateau.mp3");
    engine.pause();
    expect(engine.isDucked).toBe(true);

    engine.resume();

    expect(audible(engine)).toBe("plateau.mp3");
    expect(engine.isDucked).toBe(false);
  });

  it("un arrêt explicite lève la coupure — sinon un drapeau périmé rendrait muet", () => {
    engine.playMusic("plateau.mp3");
    engine.pause();
    engine.stopMusic(false);
    expect(engine.isDucked).toBe(false);

    engine.playMusic("suivant.mp3");
    expect(audible(engine)).toBe("suivant.mp3");
  });
});
