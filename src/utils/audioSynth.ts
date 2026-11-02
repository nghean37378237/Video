/**
 * Studio Documentary Soundtrack Player, Procedural Synthesizer & Master Audio Mixer
 * - Plays the authentic extracted "Life Legends / Will Sampson" stereo fingerpicked acoustic guitar
 *   & warm piano soundtrack (/assets/aistudio/life_legends_bg_music.mp3) for 'western-acoustic'.
 * - Routes both scene voiceovers and background music through masterGain -> destNode
 *   so exported videos ALWAYS contain crystal-clear voiceover + warm background music.
 */

export const DEFAULT_LIFE_LEGENDS_BG_MUSIC_URL = '/assets/aistudio/life_legends_bg_music.mp3';

export type BgMusicStyleOption =
  | 'western-acoustic'
  | 'emotional-piano'
  | 'cinematic-strings'
  | 'vintage-americana'
  | 'custom'
  | 'none';

export class DocumentaryAudioEngine {
  private ctx: AudioContext | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;
  private masterGain: GainNode | null = null;
  private speakerGain: GainNode | null = null;
  private bgGain: GainNode | null = null;
  private bgAudioEl: HTMLAudioElement | null = null;
  private connectedElements = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private isPlayingBg = false;
  private currentStyle: BgMusicStyleOption = 'western-acoustic';
  private targetBgVolume = 0.25;
  private isPreMixedVoiceActive = false;
  private loopTimer: number | null = null;
  private previewStopTimer: number | null = null;
  private stepIndex = 0;

  public init(): {
    ctx: AudioContext;
    destNode: MediaStreamAudioDestinationNode;
    masterGain: GainNode;
  } {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.destNode = this.ctx.createMediaStreamDestination();
      this.masterGain = this.ctx.createGain();
      this.speakerGain = this.ctx.createGain();
      this.bgGain = this.ctx.createGain();

      this.bgGain.gain.value = this.targetBgVolume;
      this.masterGain.gain.value = 1.0;
      this.speakerGain.gain.value = 1.0;

      // bgGain -> masterGain
      this.bgGain.connect(this.masterGain);
      // masterGain -> destNode (recording stream ALWAYS receives full unmuted audio!)
      this.masterGain.connect(this.destNode);
      // masterGain -> speakerGain -> ctx.destination (live speakers)
      this.masterGain.connect(this.speakerGain);
      this.speakerGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return {
      ctx: this.ctx,
      destNode: this.destNode!,
      masterGain: this.masterGain!,
    };
  }

  private ensureBgAudioElement(): HTMLAudioElement {
    const { ctx } = this.init();
    if (!this.bgAudioEl) {
      const el = new Audio(DEFAULT_LIFE_LEGENDS_BG_MUSIC_URL);
      el.crossOrigin = 'anonymous';
      el.loop = true;
      el.preload = 'auto';
      try {
        const srcNode = ctx.createMediaElementSource(el);
        srcNode.connect(this.bgGain!);
        this.connectedElements.set(el, srcNode);
      } catch (err) {
        console.warn('Could not connect bgAudioEl to AudioContext:', err);
      }
      this.bgAudioEl = el;
    }
    return this.bgAudioEl;
  }

  public setSpeakerMuted(muted: boolean) {
    const { ctx } = this.init();
    if (this.speakerGain) {
      this.speakerGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    }
  }

  /**
   * When playing a pre-mixed reference clip (like ws_scene_*.mp3 that already contains the background music),
   * temporarily duck the separate background music track so it doesn't double-play.
   * For all AI-generated TTS voiceovers (data:audio/wav or data:audio/mpeg), keep the background music playing warmly underneath!
   */
  public setPreMixedVoiceActive(active: boolean) {
    this.isPreMixedVoiceActive = active;
    if (this.bgGain && this.ctx) {
      const effectiveVol = active ? 0.0 : this.targetBgVolume;
      this.bgGain.gain.setTargetAtTime(effectiveVol, this.ctx.currentTime, 0.08);
    }
  }

  /**
   * Routes any HTMLAudioElement / HTMLVideoElement (such as the scene voiceover player)
   * through the Web Audio masterGain so it plays to both the speakers AND the exported video stream.
   */
  public connectMediaElement(el: HTMLMediaElement | null | undefined) {
    if (!el) return;
    const { ctx, masterGain } = this.init();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (this.connectedElements.has(el)) {
      return;
    }
    try {
      const sourceNode = ctx.createMediaElementSource(el);
      sourceNode.connect(masterGain);
      this.connectedElements.set(el, sourceNode);
    } catch (err) {
      console.warn('Could not connect media element to AudioContext:', err);
    }
  }

  public setBgVolume(volume: number) {
    this.targetBgVolume = Math.max(0, Math.min(1, volume));
    if (this.bgGain && this.ctx) {
      const effectiveVol = this.isPreMixedVoiceActive ? 0.0 : this.targetBgVolume;
      this.bgGain.gain.setTargetAtTime(effectiveVol, this.ctx.currentTime, 0.05);
    }
  }

  public startBackgroundMusic(
    style: BgMusicStyleOption,
    volume = 0.25,
    customUrl?: string
  ) {
    this.stopBackgroundMusic();
    this.currentStyle = style;
    this.setBgVolume(volume);
    if (style === 'none') return;

    const { ctx } = this.init();
    this.isPlayingBg = true;

    // For 'western-acoustic' (default Chuẩn Mẫu Will Sampson / Life Legends) or 'custom',
    // play the real stereo acoustic guitar & warm piano instrumental track!
    if (style === 'western-acoustic' || style === 'custom') {
      const bgEl = this.ensureBgAudioElement();
      const targetSrc =
        style === 'custom' && customUrl ? customUrl : DEFAULT_LIFE_LEGENDS_BG_MUSIC_URL;
      if (!bgEl.src.endsWith(targetSrc) && bgEl.src !== targetSrc) {
        bgEl.src = targetSrc;
      }
      bgEl.play().catch(() => {
        // Fallback to procedural warm guitar if browser blocks or fails to load audio file
        this.startProceduralLoop('western-acoustic', ctx);
      });
      return;
    }

    // For 'emotional-piano', 'cinematic-strings', or 'vintage-americana', run the dedicated studio synthesizer
    this.startProceduralLoop(style, ctx);
  }

  /**
   * Plays an 8-second audition preview of the selected background music style even when the timeline is paused.
   */
  public previewBackgroundMusic(
    style: BgMusicStyleOption,
    volume = 0.35,
    customUrl?: string,
    durationMs = 8000
  ) {
    if (this.previewStopTimer !== null) {
      clearTimeout(this.previewStopTimer);
      this.previewStopTimer = null;
    }
    this.isPreMixedVoiceActive = false;
    this.startBackgroundMusic(style, Math.max(0.25, volume), customUrl);
    this.previewStopTimer = window.setTimeout(() => {
      this.stopBackgroundMusic();
      this.previewStopTimer = null;
    }, durationMs);
  }

  private startProceduralLoop(
    style: 'western-acoustic' | 'emotional-piano' | 'cinematic-strings' | 'vintage-americana',
    ctx: AudioContext
  ) {
    this.stepIndex = 0;

    const westernChords = [
      [196.0, 246.94, 293.66, 392.0], // G
      [164.81, 246.94, 293.66, 329.63], // Em7
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
      [146.83, 220.0, 293.66, 369.99], // Dadd11
    ];

    const pianoChords = [
      [220.0, 261.63, 329.63, 440.0], // Am
      [174.61, 220.0, 261.63, 349.23], // Fmaj7
      [130.81, 196.0, 261.63, 329.63], // C
      [196.0, 246.94, 293.66, 392.0], // G
    ];

    const stringsChords = [
      [146.83, 220.0, 293.66, 349.23], // Dm
      [116.54, 174.61, 233.08, 293.66], // Bbmaj7
      [130.81, 196.0, 261.63, 329.63], // C
      [110.0, 164.81, 220.0, 277.18], // A7/Dm
    ];

    const americanaChords = [
      [164.81, 246.94, 329.63, 392.0], // Em
      [196.0, 293.66, 392.0, 493.88], // G
      [146.83, 220.0, 293.66, 369.99], // D
      [130.81, 196.0, 246.94, 329.63], // Cmaj7
    ];

    const pattern = [0, 1, 2, 3, 2, 1, 3, 2];
    const stepMs =
      style === 'cinematic-strings'
        ? 600
        : style === 'emotional-piano'
        ? 520
        : style === 'vintage-americana'
        ? 420
        : 460;

    const playNote = () => {
      if (!this.isPlayingBg || !this.ctx || !this.bgGain) return;
      const now = ctx.currentTime;
      const chords =
        style === 'cinematic-strings'
          ? stringsChords
          : style === 'emotional-piano'
          ? pianoChords
          : style === 'vintage-americana'
          ? americanaChords
          : westernChords;
      const chordIdx = Math.floor(this.stepIndex / 8) % chords.length;
      const noteIdx = pattern[this.stepIndex % pattern.length];
      const freq = chords[chordIdx][noteIdx];

      // Multi-harmonic warm plucked string / felt piano / bowed strings
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type =
        style === 'western-acoustic' || style === 'vintage-americana'
          ? 'triangle'
          : 'sine';
      osc1.frequency.setValueAtTime(freq, now);

      osc2.type = style === 'cinematic-strings' ? 'triangle' : 'sine';
      osc2.frequency.setValueAtTime(freq * 2, now);

      const osc2Gain = ctx.createGain();
      osc2Gain.gain.setValueAtTime(style === 'cinematic-strings' ? 0.08 : 0.06, now);
      osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        style === 'western-acoustic' || style === 'vintage-americana' ? 1600 : 1000,
        now
      );
      filter.frequency.exponentialRampToValueAtTime(320, now + 1.8);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(
        style === 'cinematic-strings' ? 0.14 : 0.2,
        now + (style === 'cinematic-strings' ? 0.18 : 0.025)
      );
      noteGain.gain.exponentialRampToValueAtTime(0.0008, now + 2.3);

      osc1.connect(filter);
      osc2.connect(osc2Gain);
      osc2Gain.connect(filter);
      filter.connect(noteGain);
      noteGain.connect(this.bgGain);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 2.35);
      osc2.stop(now + 2.35);

      // Warm sustained cello/string pad on beat 0 of each bar
      if (this.stepIndex % 8 === 0) {
        const padOsc = ctx.createOscillator();
        const padFifth = ctx.createOscillator();
        const padGain = ctx.createGain();
        padOsc.type = style === 'cinematic-strings' ? 'triangle' : 'sine';
        padFifth.type = 'sine';
        padOsc.frequency.setValueAtTime(chords[chordIdx][0] * 0.5, now);
        padFifth.frequency.setValueAtTime(chords[chordIdx][0] * 0.75, now);

        padGain.gain.setValueAtTime(0.001, now);
        padGain.gain.linearRampToValueAtTime(
          style === 'cinematic-strings' ? 0.16 : 0.09,
          now + 0.8
        );
        padGain.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        padOsc.connect(padGain);
        padFifth.connect(padGain);
        padGain.connect(this.bgGain);
        padOsc.start(now);
        padFifth.start(now);
        padOsc.stop(now + 3.9);
        padFifth.stop(now + 3.9);
      }

      this.stepIndex++;
      this.loopTimer = window.setTimeout(playNote, stepMs);
    };

    playNote();
  }

  public stopBackgroundMusic() {
    this.isPlayingBg = false;
    if (this.previewStopTimer !== null) {
      clearTimeout(this.previewStopTimer);
      this.previewStopTimer = null;
    }
    if (this.bgAudioEl) {
      this.bgAudioEl.pause();
    }
    if (this.loopTimer !== null) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public seekBackgroundMusic(timeSec: number) {
    if (this.bgAudioEl && this.bgAudioEl.duration && Number.isFinite(this.bgAudioEl.duration)) {
      const target = timeSec % this.bgAudioEl.duration;
      if (Math.abs(this.bgAudioEl.currentTime - target) > 0.6) {
        this.bgAudioEl.currentTime = target;
      }
    }
  }

  public getRecordingStream(): MediaStream | null {
    const { destNode } = this.init();
    return destNode.stream;
  }
}

export const soundEngine = new DocumentaryAudioEngine();
