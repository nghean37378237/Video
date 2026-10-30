/**
 * Procedural Web Audio API Documentary Soundtrack Generator & Audio Mixer
 * Generates warm nostalgic acoustic guitar & strings arpeggios inspired by
 * the "Life Legends / Bonanza" storytelling background music, and provides
 * a MediaStreamAudioDestinationNode for recording complete exported videos.
 */

export class DocumentaryAudioEngine {
  private ctx: AudioContext | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;
  private masterGain: GainNode | null = null;
  private bgGain: GainNode | null = null;
  private isPlayingBg = false;
  private loopTimer: number | null = null;
  private stepIndex = 0;

  public init(): { ctx: AudioContext; destNode: MediaStreamAudioDestinationNode; masterGain: GainNode } {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.destNode = this.ctx.createMediaStreamDestination();
      this.masterGain = this.ctx.createGain();
      this.bgGain = this.ctx.createGain();

      this.bgGain.gain.value = 0.22;
      this.masterGain.gain.value = 1.0;

      this.bgGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.connect(this.destNode);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return {
      ctx: this.ctx,
      destNode: this.destNode!,
      masterGain: this.masterGain!,
    };
  }

  public setBgVolume(volume: number) {
    if (this.bgGain && this.ctx) {
      this.bgGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.05);
    }
  }

  public startBackgroundMusic(style: 'western-acoustic' | 'emotional-piano' | 'custom' | 'none', volume = 0.22) {
    this.stopBackgroundMusic();
    if (style === 'none' || style === 'custom') return;

    const { ctx } = this.init();
    this.setBgVolume(volume);
    this.isPlayingBg = true;
    this.stepIndex = 0;

    // Warm nostalgic progression: G major -> Em7 -> Cmaj7 -> Dadd9
    const westernChords = [
      [196.0, 246.94, 293.66, 392.0], // G
      [164.81, 246.94, 293.66, 329.63], // Em7
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
      [146.83, 220.0, 293.66, 369.99], // D
    ];

    const pianoChords = [
      [220.0, 261.63, 329.63, 440.0], // Am
      [174.61, 220.0, 261.63, 349.23], // Fmaj7
      [130.81, 196.0, 261.63, 329.63], // C
      [196.0, 246.94, 293.66, 392.0], // G
    ];

    const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
    const stepMs = style === 'western-acoustic' ? 420 : 520;

    const playNote = () => {
      if (!this.isPlayingBg || !this.ctx || !this.bgGain) return;
      const now = ctx.currentTime;
      const chords = style === 'western-acoustic' ? westernChords : pianoChords;
      const chordIdx = Math.floor(this.stepIndex / 8) % chords.length;
      const noteIdx = pattern[this.stepIndex % pattern.length];
      const freq = chords[chordIdx][noteIdx];

      // Plucked acoustic / warm felt piano oscillator
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = style === 'western-acoustic' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(style === 'western-acoustic' ? 1400 : 900, now);
      filter.frequency.exponentialRampToValueAtTime(280, now + 1.4);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.6);

      osc.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.bgGain);

      osc.start(now);
      osc.stop(now + 1.65);

      // Subtle warm pad on beat 0 of each bar
      if (this.stepIndex % 8 === 0) {
        const padOsc = ctx.createOscillator();
        const padGain = ctx.createGain();
        padOsc.type = 'sine';
        padOsc.frequency.setValueAtTime(chords[chordIdx][0] * 0.5, now);
        padGain.gain.setValueAtTime(0.001, now);
        padGain.gain.linearRampToValueAtTime(0.08, now + 0.6);
        padGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
        padOsc.connect(padGain);
        padGain.connect(this.bgGain);
        padOsc.start(now);
        padOsc.stop(now + 3.3);
      }

      this.stepIndex++;
      this.loopTimer = window.setTimeout(playNote, stepMs);
    };

    playNote();
  }

  public stopBackgroundMusic() {
    this.isPlayingBg = false;
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public getRecordingStream(): MediaStream | null {
    const { destNode } = this.init();
    return destNode.stream;
  }
}

export const soundEngine = new DocumentaryAudioEngine();
