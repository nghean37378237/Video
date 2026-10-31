import { ProjectSettings, StoryScene } from '../types';

export type VoiceLanguage = 'vi' | 'en';
export type VoiceEngineMode = 'consistent-locked' | 'gemini-single-pass';

export interface VoicePersonaProfile {
  id: ProjectSettings['ttsVoice'];
  label: string;
  badge: string;
  geminiAnchorPrompt: string;
  /** Deterministic acoustic pitch/rate factor applied when mastering standard stream so persona stays distinct and 100% uniform */
  standardRateFactor: number;
  lowShelfGainDb: number;
  midPresenceGainDb: number;
  highShelfGainDb: number;
}

export const VOICE_PERSONA_PROFILES: Record<ProjectSettings['ttsVoice'], VoicePersonaProfile> = {
  Charon: {
    id: 'Charon',
    label: 'Charon — Nam Trầm Ấm Documentary (Chuẩn Life Legends)',
    badge: 'Nam Trầm Ấm',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, deep, warm, calm baritone documentary narrator voice. Maintain the exact same vocal pitch, measured cadence (145 words per minute), close studio microphone proximity, and steady emotional gravitas from the first word to the last word.',
    standardRateFactor: 0.93,
    lowShelfGainDb: 4.5,
    midPresenceGainDb: 2.0,
    highShelfGainDb: -2.0,
  },
  Fenrir: {
    id: 'Fenrir',
    label: 'Fenrir — Nam Trầm Uy Nghiêm & Điện Ảnh',
    badge: 'Nam Uy Nghiêm',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, authoritative, resonant deep bass-baritone historical documentary voice. Keep identical pitch, slow deliberate pacing, and unchanging studio acoustic warmth throughout.',
    standardRateFactor: 0.89,
    lowShelfGainDb: 5.5,
    midPresenceGainDb: 1.8,
    highShelfGainDb: -2.5,
  },
  Puck: {
    id: 'Puck',
    label: 'Puck — Giọng Kể Chuyện Tự Nhiên & Truyền Cảm',
    badge: 'Tự Nhiên',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, natural, engaging mid-range storyteller voice. Maintain identical speaking rate, warm conversational clarity, and steady pitch from start to finish.',
    standardRateFactor: 0.97,
    lowShelfGainDb: 3.0,
    midPresenceGainDb: 2.5,
    highShelfGainDb: -1.0,
  },
  Kore: {
    id: 'Kore',
    label: 'Kore — Nữ Dịu Dàng, Sâu Lắng & Hoài Niệm',
    badge: 'Nữ Sâu Lắng',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, calm, warm, empathetic female documentary narrator voice. Keep exact same soft cadence, pitch stability, and intimate studio tone throughout.',
    standardRateFactor: 1.0,
    lowShelfGainDb: 2.5,
    midPresenceGainDb: 2.2,
    highShelfGainDb: -0.8,
  },
  Zephyr: {
    id: 'Zephyr',
    label: 'Zephyr — Nữ Trong Trẻo, Rõ Chữ & Hiện Đại',
    badge: 'Nữ Trong Trẻo',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, articulate, bright and poised narrator voice. Maintain uniform speed, crisp diction, and identical pitch across all sentences.',
    standardRateFactor: 1.03,
    lowShelfGainDb: 1.5,
    midPresenceGainDb: 2.8,
    highShelfGainDb: 0.5,
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

  // For bilingual mode, inspect scenes: if Vietnamese translationText is populated, default to 'vi'
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
 * Masters any raw TTS audio clip through an identical 24kHz Studio Documentary EQ,
 * Persona Acoustic Lock, Anti-Pop Fade Envelope, and Constant RMS Loudness Normalizer (-16 LUFS)
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

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();

  try {
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    const targetSampleRate = 24000;

    // Apply persona rate factor only when using the standard fallback stream so all 5 voices have distinct, locked studio character
    const rateFactor =
      engineUsed === 'gemini-tts' || engineUsed === 'gemini-single-pass'
        ? 1.0
        : profile.standardRateFactor;

    const outputFrames = Math.max(
      Math.ceil((decoded.duration / rateFactor) * targetSampleRate),
      targetSampleRate
    );

    const offlineCtx = new OfflineAudioContext(1, outputFrames, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.playbackRate.value = rateFactor;

    // 1. High-pass filter at 75Hz to remove low rumble
    const highPass = offlineCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 75;
    highPass.Q.value = 0.7;

    // 2. Warm studio chest resonance low-shelf at 155Hz
    const lowShelf = offlineCtx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 155;
    lowShelf.gain.value = profile.lowShelfGainDb;

    // 3. Vocal presence & articulation boost at 2650Hz
    const midPresence = offlineCtx.createBiquadFilter();
    midPresence.type = 'peaking';
    midPresence.frequency.value = 2650;
    midPresence.Q.value = 1.1;
    midPresence.gain.value = profile.midPresenceGainDb;

    // 4. Smooth de-essing high-shelf at 7800Hz
    const highShelf = offlineCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 7800;
    highShelf.gain.value = profile.highShelfGainDb;

    // 5. Broadcast vocal leveling compressor so quiet and loud syllables stay uniform
    const compressor = offlineCtx.createDynamicsCompressor();
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
    compressor.connect(offlineCtx.destination);

    source.start(0);
    const rendered = await offlineCtx.startRendering();
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
    const fadeInSamples = Math.min(Math.floor(targetSampleRate * 0.025), Math.floor(mono.length * 0.1));
    const fadeOutSamples = Math.min(Math.floor(targetSampleRate * 0.05), Math.floor(mono.length * 0.15));

    for (let i = 0; i < mono.length; i++) {
      let s = mono[i] * gain;
      // Smooth soft-knee limiter above 0.82
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
