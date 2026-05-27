// src/features/audio/soundManager.js

const SOUNDS = {
  SIX: "https://assets.mixkit.co/active_storage/sfx/2012/2012-preview.mp3", // Crowd cheer
  WICKET: "https://assets.mixkit.co/active_storage/sfx/253/253-preview.mp3", // Ohhh / Drop
  BOUNDARY: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3",
  DRUM_ROLL: "https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3"
};

class SoundManager {
  constructor() {
    this.audioCache = {};
    this.muted = false;
  }

  play(event) {
    if (this.muted) return;
    
    const url = SOUNDS[event];
    if (!url) return;

    try {
      if (!this.audioCache[url]) {
        this.audioCache[url] = new Audio(url);
      }
      
      const audio = this.audioCache[url];
      audio.currentTime = 0;
      audio.volume = 0.5;
      audio.play().catch(e => console.warn("Sound play failed", e));
    } catch (err) {
      console.error("SoundManager Error:", err);
    }
  }

  setMuted(val) {
    this.muted = val;
  }
}

export const soundManager = new SoundManager();
