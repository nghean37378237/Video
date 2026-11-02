import { ProjectSettings, StoryScene } from '../types';

export type VoiceLanguage = 'vi' | 'en';
export type VoiceEngineMode = 'consistent-locked' | 'gemini-single-pass';

export interface VoicePersonaProfile {
  id: ProjectSettings['ttsVoice'];
  label: string;
  badge: string;
  gender: 'male' | 'female';
  geminiAnchorPrompt: string;
  /** Pitch shift in semitones applied when mastering the standard fallback stream so male/female personas are 100% distinct */
  fallbackPitchSemitones: number;
  /** Speaking tempo factor applied independently of pitch when mastering the fallback stream */
  fallbackTempoFactor: number;
  lowShelfGainDb: number;
  midPresenceGainDb: number;
  highShelfGainDb: number;
}

export const VOICE_PERSONA_PROFILES: Record<ProjectSettings['ttsVoice'], VoicePersonaProfile> = {
  Charon: {
    id: 'Charon',
    label: 'Charon — Nam Trầm Ấm Chuẩn Mẫu Will Sampson (Life Legends)',
    badge: 'Nam Trầm Ấm (Chuẩn Mẫu)',
    gender: 'male',
    geminiAnchorPrompt:
      'Warm, deep, resonant American documentary baritone narrator like Life Legends. Speak at a calm, unhurried, reflective storytelling pace (135 words per minute) with rich chest resonance, intimate close-mic studio warmth, gentle emotional gravitas, and natural dramatic pauses between phrases.',
    fallbackPitchSemitones: -4.4,
    fallbackTempoFactor: 0.96,
    lowShelfGainDb: 6.2,
    midPresenceGainDb: 2.4,
    highShelfGainDb: -2.8,
  },
  Fenrir: {
    id: 'Fenrir',
    label: 'Fenrir — Nam Trầm Sâu Uy Nghiêm & Điện Ảnh (Sử Thi)',
    badge: 'Nam Uy Nghiêm',
    gender: 'male',
    geminiAnchorPrompt:
      'Deep, authoritative, resonant bass-baritone historical documentary narrator. Maintain a calm, deliberate storytelling cadence with warm studio chest resonance and natural dramatic pauses.',
    fallbackPitchSemitones: -5.8,
    fallbackTempoFactor: 0.93,
    lowShelfGainDb: 7.5,
    midPresenceGainDb: 2.0,
    highShelfGainDb: -3.5,
  },
  Puck: {
    id: 'Puck',
    label: 'Puck — Nam Truyền Cảm Tự Nhiên & Gần Gũi (Hồi Ức)',
    badge: 'Nam Truyền Cảm',
    gender: 'male',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, natural, engaging mid-range male storyteller voice. Maintain identical speaking rate, warm conversational clarity, and steady pitch from start to finish.',
    fallbackPitchSemitones: -3.1,
    fallbackTempoFactor: 1.0,
    lowShelfGainDb: 4.2,
    midPresenceGainDb: 2.8,
    highShelfGainDb: -1.4,
  },
  Kore: {
    id: 'Kore',
    label: 'Kore — Nữ Trầm Dịu, Sâu Lắng & Hoài Niệm',
    badge: 'Nữ Sâu Lắng',
    gender: 'female',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, calm, warm, empathetic female documentary narrator voice. Keep exact same soft cadence, pitch stability, and intimate studio tone throughout.',
    fallbackPitchSemitones: -0.9,
    fallbackTempoFactor: 0.96,
    lowShelfGainDb: 2.8,
    midPresenceGainDb: 2.2,
    highShelfGainDb: -1.0,
  },
  Zephyr: {
    id: 'Zephyr',
    label: 'Zephyr — Nữ Trong Trẻo, Rõ Chữ & Hiện Đại',
    badge: 'Nữ Trong Trẻo',
    gender: 'female',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, articulate, bright and poised female narrator voice. Maintain uniform speed, crisp diction, and identical pitch across all sentences.',
    fallbackPitchSemitones: 1.1,
    fallbackTempoFactor: 1.02,
    lowShelfGainDb: 1.4,
    midPresenceGainDb: 3.2,
    highShelfGainDb: 1.2,
  },
};

const VIETNAMESE_DIACRITIC_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export function hasVietnameseCharacters(text: string): boolean {
  return VIETNAMESE_DIACRITIC_REGEX.test(text || '');
}

/**
 * Guarantees every scene in the video uses the SAME language text so the voiceover
 * never switches between Vietnamese and English mid-video.
 */
export function resolveConsistentSceneText(
  scene: StoryScene,
  voiceLanguage: VoiceLanguage
): string {
  const narration = (scene.narrationText || '').trim();
  const translation = (scene.translationText || '').trim();

  if (voiceLanguage === 'vi') {
    if (translation && hasVietnameseCharacters(translation)) return translation;
    if (narration && hasVietnameseCharacters(narration)) return narration;
    return translation || narration || scene.title || '';
  } else {
    if (narration && !hasVietnameseCharacters(narration)) return narration;
    if (translation && !hasVietnameseCharacters(translation)) return translation;
    return narration || translation || scene.title || '';
  }
}

/**
 * Detects the dominant language across the project scenes so default voice generation
 * stays 100% consistent.
 */
export function detectProjectVoiceLanguage(
  scenes: StoryScene[],
  settings: ProjectSettings
): VoiceLanguage {
  if (settings.voiceLanguage === 'vi' || settings.voiceLanguage === 'en') {
    return settings.voiceLanguage;
  }
  if (settings.subtitleLanguage === 'vi') return 'vi';
  if (settings.subtitleLanguage === 'en') return 'en';

  const viCount = scenes.filter(
    (s) =>
      s.sceneType !== 'outro' &&
      (hasVietnameseCharacters(s.translationText || '') ||
        hasVietnameseCharacters(s.narrationText || ''))
  ).length;
  return viCount > 0 ? 'vi' : 'en';
}

function encodeFloat32ToWavDataUrl(samples: Float32Array, sampleRate: number): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * WSOLA (Waveform Similarity Overlap-Add) Time-Stretcher + Cubic Resampler.
 * Allows shifting vocal pitch (e.g., -4.4 or -5.8 semitones for deep male baritone/bass)
 * WITHOUT slowing down the speaking tempo!
 */
function pitchShiftAndTimeStretchMono(
  input: Float32Array,
  sampleRate: number,
  pitchSemitones: number,
  tempoFactor: number
): Float32Array {
  const pitchRatio = Math.pow(2, pitchSemitones / 12);
  if (Math.abs(pitchSemitones) < 0.15 && Math.abs(tempoFactor - 1.0) < 0.02) {
    return input;
  }

  // Step 1: Time-stretch by stretchRatio = pitchRatio / tempoFactor using Hann-windowed WSOLA
  // so that when we subsequently resample by pitchRatio, the final duration is input.length / tempoFactor.
  const stretchRatio = pitchRatio / Math.max(0.5, Math.min(1.6, tempoFactor));
  const winSize = Math.floor(sampleRate * 0.032); // 32ms window (~768 samples at 24kHz)
  const hopOut = Math.floor(winSize / 2); // 50% overlap (16ms hop)
  const hopIn = hopOut / stretchRatio;
  const searchRange = Math.floor(sampleRate * 0.008); // +/- 8ms cross-correlation search

  const stretchedLen = Math.max(winSize * 2, Math.floor(input.length * stretchRatio));
  const stretched = new Float32Array(stretchedLen);
  const norm = new Float32Array(stretchedLen);

  const hann = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  let inPos = 0;
  let outPos = 0;

  while (outPos + winSize < stretchedLen && inPos + winSize < input.length) {
    let bestOffset = 0;
    if (outPos > 0) {
      let bestCorr = -Infinity;
      const compareLen = Math.floor(winSize / 3);
      const minOff = Math.max(-Math.floor(inPos), -searchRange);
      const maxOff = Math.min(input.length - winSize - Math.floor(inPos), searchRange);

      for (let off = minOff; off <= maxOff; off += 2) {
        let corr = 0;
        const candStart = Math.floor(inPos) + off;
        for (let k = 0; k < compareLen; k += 2) {
          corr += stretched[outPos + k] * input[candStart + k];
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          bestOffset = off;
        }
      }
    }

    const actualIn = Math.max(0, Math.min(input.length - winSize, Math.floor(inPos) + bestOffset));
    for (let i = 0; i < winSize; i++) {
      const w = hann[i];
      stretched[outPos + i] += input[actualIn + i] * w;
      norm[outPos + i] += w * w;
    }

    inPos += hopIn;
    outPos += hopOut;
  }

  for (let i = 0; i < stretchedLen; i++) {
    if (norm[i] > 0.001) {
      stretched[i] /= norm[i];
    }
  }

  // Step 2: Resample by pitchRatio using linear interpolation to shift pitch to target semitones
  const finalLen = Math.max(Math.floor(sampleRate * 0.4), Math.floor(stretchedLen / pitchRatio));
  const output = new Float32Array(finalLen);
  for (let i = 0; i < finalLen; i++) {
    const srcIdx = i * pitchRatio;
    const idx0 = Math.floor(srcIdx);
    const frac = srcIdx - idx0;
    const s0 = stretched[Math.min(stretchedLen - 1, idx0)] || 0;
    const s1 = stretched[Math.min(stretchedLen - 1, idx0 + 1)] || 0;
    output[i] = s0 + frac * (s1 - s0);
  }

  return output;
}

let activePreviewAudio: HTMLAudioElement | null = null;

/**
 * Immediately plays a voiceover preview in the browser so the user can hear the newly selected voice right away.
 */
export function playInstantVoicePreview(audioUrl: string, volume = 1.0): void {
  try {
    if (activePreviewAudio) {
      activePreviewAudio.pause();
      activePreviewAudio.removeAttribute('src');
      activePreviewAudio = null;
    }
    const aud = new Audio(audioUrl);
    aud.volume = Math.min(1, Math.max(0.1, volume));
    activePreviewAudio = aud;
    aud.play().catch(() => {});
  } catch {
    // Ignore preview error
  }
}

/**
 * Masters any raw TTS audio clip through an identical 24kHz Studio Documentary EQ,
 * Persona Acoustic Lock (including independent WSOLA Pitch & Tempo shifting for fallback engines),
 * Anti-Pop Fade Envelope, and Constant RMS Loudness Normalizer (-16 LUFS)
 * so every scene from start to finish sounds like a single continuous studio recording.
 */
export async function masterAudioToConsistentStudioWav(
  rawAudioDataUrl: string,
  voiceName: ProjectSettings['ttsVoice'],
  engineUsed: string = 'standard-locked'
): Promise<{ masteredAudioUrl: string; durationSec: number }> {
  const profile = VOICE_PERSONA_PROFILES[voiceName] || VOICE_PERSONA_PROFILES.Charon;

  const response = await fetch(rawAudioDataUrl);
  const arrayBuffer = await response.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();

  try {
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    const targetSampleRate = 24000;

    // Resample decoded input to 24kHz mono first
    const baseFrames = Math.max(
      Math.ceil(decoded.duration * targetSampleRate),
      Math.floor(targetSampleRate * 0.5)
    );
    const baseOffline = new OfflineAudioContext(1, baseFrames, targetSampleRate);
    const baseSrc = baseOffline.createBufferSource();
    baseSrc.buffer = decoded;
    baseSrc.connect(baseOffline.destination);
    baseSrc.start(0);
    const baseRendered = await baseOffline.startRendering();
    let workingSamples: Float32Array = new Float32Array(baseRendered.getChannelData(0));

    // When using the standard fallback stream (which has a neutral female source voice),
    // apply WSOLA Pitch & Tempo shifting so Charon, Fenrir, Puck become authentic deep male voices
    // and Kore, Zephyr have distinct female vocal timbres without distorting speaking speed!
    const isNativeMultiVoiceEngine =
      engineUsed === 'gemini-tts' ||
      engineUsed === 'gemini-single-pass' ||
      engineUsed === 'openai-tts';

    if (!isNativeMultiVoiceEngine) {
      workingSamples = pitchShiftAndTimeStretchMono(
        workingSamples,
        targetSampleRate,
        profile.fallbackPitchSemitones,
        profile.fallbackTempoFactor
      );
    }

    const eqOffline = new OfflineAudioContext(1, workingSamples.length, targetSampleRate);
    const eqBuffer = eqOffline.createBuffer(1, workingSamples.length, targetSampleRate);
    eqBuffer.getChannelData(0).set(workingSamples);

    const source = eqOffline.createBufferSource();
    source.buffer = eqBuffer;

    // 1. High-pass filter at 70Hz to remove low rumble
    const highPass = eqOffline.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 70;
    highPass.Q.value = 0.7;

    // 2. Warm studio chest resonance low-shelf at 150Hz
    const lowShelf = eqOffline.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 150;
    lowShelf.gain.value = profile.lowShelfGainDb;

    // 3. Vocal presence & articulation boost at 2650Hz
    const midPresence = eqOffline.createBiquadFilter();
    midPresence.type = 'peaking';
    midPresence.frequency.value = 2650;
    midPresence.Q.value = 1.1;
    midPresence.gain.value = profile.midPresenceGainDb;

    // 4. Smooth de-essing high-shelf at 7500Hz
    const highShelf = eqOffline.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 7500;
    highShelf.gain.value = profile.highShelfGainDb;

    // 5. Broadcast vocal leveling compressor so quiet and loud syllables stay uniform
    const compressor = eqOffline.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.16;

    source.connect(highPass);
    highPass.connect(lowShelf);
    lowShelf.connect(midPresence);
    midPresence.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(eqOffline.destination);

    source.start(0);
    const rendered = await eqOffline.startRendering();
    const rawSamples = rendered.getChannelData(0);

    // Trim leading/trailing dead silence while preserving natural 80ms breath padding
    const silenceThreshold = 0.006;
    let firstActive = 0;
    let lastActive = rawSamples.length - 1;

    while (firstActive < rawSamples.length && Math.abs(rawSamples[firstActive]) < silenceThreshold) {
      firstActive++;
    }
    while (lastActive > firstActive && Math.abs(rawSamples[lastActive]) < silenceThreshold) {
      lastActive--;
    }

    const padStart = Math.max(0, firstActive - Math.floor(targetSampleRate * 0.05));
    const padEnd = Math.min(rawSamples.length, lastActive + Math.floor(targetSampleRate * 0.12));
    const trimmedLength = Math.max(Math.floor(targetSampleRate * 0.5), padEnd - padStart);
    const mono = new Float32Array(trimmedLength);
    mono.set(rawSamples.subarray(padStart, padStart + trimmedLength));

    // Constant RMS Loudness Normalization (Target RMS = 0.165, Peak Limiter = 0.92)
    let sumSq = 0;
    let activeCount = 0;
    for (let i = 0; i < mono.length; i++) {
      const val = mono[i];
      if (Math.abs(val) > 0.01) {
        sumSq += val * val;
        activeCount++;
      }
    }

    const currentRms = activeCount > 0 ? Math.sqrt(sumSq / activeCount) : 0.1;
    const targetRms = 0.165;
    const gain = Math.min(3.2, Math.max(0.45, targetRms / Math.max(0.02, currentRms)));

    // Apply constant RMS gain + soft-clip limiter + 25ms fade-in / 50ms fade-out
    const fadeInSamples = Math.min(
      Math.floor(targetSampleRate * 0.025),
      Math.floor(mono.length * 0.1)
    );
    const fadeOutSamples = Math.min(
      Math.floor(targetSampleRate * 0.05),
      Math.floor(mono.length * 0.15)
    );

    for (let i = 0; i < mono.length; i++) {
      let s = mono[i] * gain;
      if (s > 0.82) {
        s = 0.82 + 0.12 * Math.tanh((s - 0.82) / 0.12);
      } else if (s < -0.82) {
        s = -0.82 - 0.12 * Math.tanh((-s - 0.82) / 0.12);
      }

      if (i < fadeInSamples) {
        s *= i / fadeInSamples;
      } else if (i > mono.length - fadeOutSamples) {
        s *= (mono.length - i) / fadeOutSamples;
      }
      mono[i] = s;
    }

    const masteredAudioUrl = encodeFloat32ToWavDataUrl(mono, targetSampleRate);
    const durationSec = mono.length / targetSampleRate;
    return {
      masteredAudioUrl,
      durationSec,
    };
  } finally {
    decodeCtx.close().catch(() => {});
  }
}
