export type Ping = "shot" | "hurt" | "upgrade" | "boss" | "win" | "lose" | "mallet";

export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer = 0;
  private musicOn = false;
  muted = false;
  music = false;
  private lastShot = 0;

  constructor(muted: boolean, music: boolean) {
    this.muted = muted;
    this.music = music;
  }

  unlock() {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
    this.syncMusic();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.22;
    this.syncMusic();
  }

  setMusic(music: boolean) {
    this.music = music;
    this.syncMusic();
  }

  play(ping: Ping) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (ctx.state === "suspended") return;
    const now = ctx.currentTime;
    if (ping === "shot" || ping === "mallet") {
      if (now - this.lastShot < 0.07) return;
      this.lastShot = now;
      if (ping === "mallet") this.thud(now, 90, 0.16);
      else this.blip(now, 520, 0.045, "triangle");
      return;
    }
    if (ping === "hurt") this.thud(now, 140, 0.18);
    if (ping === "upgrade") {
      this.blip(now, 523, 0.07, "sine");
      this.blip(now + 0.08, 659, 0.07, "sine");
      this.blip(now + 0.16, 784, 0.09, "sine");
    }
    if (ping === "boss") {
      this.blip(now, 196, 0.16, "sine");
      this.blip(now + 0.14, 262, 0.18, "sine");
    }
    if (ping === "win") this.blip(now, 660, 0.2, "sine");
    if (ping === "lose") this.thud(now, 90, 0.22);
  }

  dispose() {
    this.musicOn = false;
    window.clearInterval(this.musicTimer);
    void this.context?.close();
    this.context = null;
  }

  private ensure() {
    if (this.context) return this.context;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.22;
    master.connect(ctx.destination);
    this.context = ctx;
    this.master = master;
    return ctx;
  }

  private blip(when: number, frequency: number, duration: number, type: OscillatorType) {
    const ctx = this.ensure();
    if (!this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.35, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private thud(when: number, frequency: number, duration: number) {
    const ctx = this.ensure();
    if (!this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, when);
    osc.frequency.exponentialRampToValueAtTime(48, when + duration);
    gain.gain.setValueAtTime(0.4, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  private syncMusic() {
    window.clearInterval(this.musicTimer);
    this.musicOn = this.music && !this.muted;
    if (!this.musicOn) return;
    const notes = [262, 294, 330, 392, 330, 294];
    let step = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.musicOn || !this.context) return;
      this.blip(this.context.currentTime, notes[step % notes.length] ?? 262, 0.18, "sine");
      step += 1;
    }, 520);
  }
}
