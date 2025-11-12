// src/entities/Sound.js
export default class Sound {
  constructor(src = '', { loop = false, volume = 1.0, playbackRate = 1.0 } = {}) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.loop = loop;
    this.setVolume(volume);
    this.setPlaybackRate(playbackRate);

    if (src) this.setSource(src);

    this._lastPlayPromise = null;
  }

  setSource(src) {
    this.audio.src = src;
  }

  async play() {
    try {
      this._lastPlayPromise = this.audio.play();
      await this._lastPlayPromise;
    } catch {
      // Autoplay bloqueado u otro error; lo ignoramos silenciosamente.
    }
  }

  pause() {
    try {
      this.audio.pause();
    } catch {
      // no-op
    }
  }

  stop() {
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {
      // no-op
    }
  }

  setVolume(v) {
    const vol = Math.max(0, Math.min(1, v ?? 0));
    this.audio.volume = vol;
  }

  setLoop(loop) {
    this.audio.loop = !!loop;
  }

  setPlaybackRate(rate) {
    this.audio.playbackRate = rate || 1.0;
  }

  setMuted(muted) {
    this.audio.muted = !!muted;
  }

  dispose() {
    this.stop();
    this.audio.src = '';
    this.audio.load();
  }
}
