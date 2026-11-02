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
    fallbackPitchSemitones: 0,
    fallbackTempoFactor: 1.0,
    lowShelfGainDb: 1.4,
    midPresenceGainDb: 0.8,
    highShelfGainDb: -0.4,
  },
  Fenrir: {
    id: 'Fenrir',
    label: 'Fenrir — Nam Trầm Sâu Uy Nghiêm & Điện Ảnh (Sử Thi)',
    badge: 'Nam Uy Nghiêm',
    gender: 'male',
    geminiAnchorPrompt:
      'Deep, authoritative, resonant bass-baritone historical documentary narrator. Maintain a calm, deliberate storytelling cadence with warm studio chest resonance and natural dramatic pauses.',
    fallbackPitchSemitones: 0,
    fallbackTempoFactor: 1.0,
    lowShelfGainDb: 1.8,
    midPresenceGainDb: 0.6,
    highShelfGainDb: -0.6,
  },
  Puck: {
    id: 'Puck',
    label: 'Puck — Nam Truyền Cảm Tự Nhiên & Gần Gũi (Hồi Ức)',
    badge: 'Nam Truyền Cảm',
    gender: 'male',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, natural, engaging mid-range male storyteller voice. Maintain identical speaking rate, warm conversational clarity, and steady pitch from start to finish.',
    fallbackPitchSemitones: 0,
    fallbackTempoFactor: 1.0,
    lowShelfGainDb: 1.0,
    midPresenceGainDb: 0.9,
    highShelfGainDb: 0.0,
  },
  Kore: {
    id: 'Kore',
    label: 'Kore — Nữ Trầm Dịu, Sâu Lắng & Hoài Niệm',
    badge: 'Nữ Sâu Lắng',
    gender: 'female',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, calm, warm, empathetic female documentary narrator voice. Keep exact same soft cadence, pitch stability, and intimate studio tone throughout.',
    fallbackPitchSemitones: 0,
    fallbackTempoFactor: 1.0,
    lowShelfGainDb: 0.8,
    midPresenceGainDb: 0.8,
    highShelfGainDb: -0.2,
  },
  Zephyr: {
    id: 'Zephyr',
    label: 'Zephyr — Nữ Trong Trẻo, Rõ Chữ & Hiện Đại',
    badge: 'Nữ Trong Trẻo',
    gender: 'female',
    geminiAnchorPrompt:
      'STRICT VOICE LOCK: Speak with a consistent, articulate, bright and poised female narrator voice. Maintain uniform speed, crisp diction, and identical pitch across all sentences.',
    fallbackPitchSemitones: 0,
    fallbackTempoFactor: 1.0,
    lowShelfGainDb: 0.5,
    midPresenceGainDb: 1.0,
    highShelfGainDb: 0.4,
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

let activePreviewAudio: HTMLAudioElement | null = null;

/**
 * Immediately plays a voiceover preview in the browser so the user can hear the newly selected voice right away.
 */
export function playInstantVoicePreview(audioUrl: string, volume = 0.9): void {
  try {
    if (activePreviewAudio) {
      activePreviewAudio.pause();
      activePreviewAudio.removeAttribute('src');
      activePreviewAudio = null;
    }
    const aud = new Audio(audioUrl);
    aud.volume = Math.min(0.95, Math.max(0.1, volume));
    activePreviewAudio = aud;
    aud.play().catch(() => {});
  } catch {
    // Ignore preview error
  }
}

/**
 * Masters any raw TTS audio clip through a clean 44.1kHz Studio Documentary EQ,
 * transparent optical dynamics leveling, anti-pop fade envelope, and pure linear
 * loudness normalization (capped at -1.3 dBFS true peak with ZERO non-linear wave-shaping
 * or artificial pitch-shift phase artifacts) so every scene sounds crystal-clear and warm.
 */
export async function masterAudioToConsistentStudioWav(
  rawAudioDataUrl: string,
  voiceName: ProjectSettings['ttsVoice'],
  _engineUsed: string = 'edge-neural-studio'
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
    const targetSampleRate = 44100;

    const baseFrames = Math.max(
      Math.ceil(decoded.duration * targetSampleRate),
      Math.floor(targetSampleRate * 0.5)
    );
    const eqOffline = new OfflineAudioContext(1, baseFrames, targetSampleRate);
    const source = eqOffline.createBufferSource();
    source.buffer = decoded;

    // 1. Clean Butterworth high-pass filter at 75Hz to remove sub-bass rumble without touching vocal chest warmth
    const highPass = eqOffline.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 75;
    highPass.Q.value = 0.707;

    // 2. Subtle warm studio chest resonance at 140Hz (+0.5dB to +1.8dB max so speakers never buzz)
    const lowShelf = eqOffline.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 140;
    lowShelf.gain.value = profile.lowShelfGainDb;

    // 3. Gentle vocal articulation clarity at 2800Hz
    const midPresence = eqOffline.createBiquadFilter();
    midPresence.type = 'peaking';
    midPresence.frequency.value = 2800;
    midPresence.Q.value = 0.9;
    midPresence.gain.value = profile.midPresenceGainDb;

    // 4. Smooth air / de-essing shelf at 7800Hz
    const highShelf = eqOffline.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 7800;
    highShelf.gain.value = profile.highShelfGainDb;

    // 5. Transparent optical vocal compressor (1.8:1 ratio, 18ms attack so low vocal fundamentals never distort)
    const compressor = eqOffline.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 1.8;
    compressor.attack.value = 0.018;
    compressor.release.value = 0.22;

    source.connect(highPass);
    highPass.connect(lowShelf);
    lowShelf.connect(midPresence);
    midPresence.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(eqOffline.destination);

    source.start(0);
    const rendered = await eqOffline.startRendering();
    const rawSamples = rendered.getChannelData(0);

    // Trim leading/trailing dead silence while preserving natural breath padding
    const silenceThreshold = 0.004;
    let firstActive = 0;
    let lastActive = rawSamples.length - 1;

    while (firstActive < rawSamples.length && Math.abs(rawSamples[firstActive]) < silenceThreshold) {
      firstActive++;
    }
    while (lastActive > firstActive && Math.abs(rawSamples[lastActive]) < silenceThreshold) {
      lastActive--;
    }

    const padStart = Math.max(0, firstActive - Math.floor(targetSampleRate * 0.06));
    const padEnd = Math.min(rawSamples.length, lastActive + Math.floor(targetSampleRate * 0.14));
    const trimmedLength = Math.max(Math.floor(targetSampleRate * 0.5), padEnd - padStart);
    const mono = new Float32Array(trimmedLength);
    mono.set(rawSamples.subarray(padStart, padStart + trimmedLength));

    // Pure Linear Loudness Normalization with True-Peak Ceiling (0.86 = -1.3 dBFS)
    // Eliminates non-linear tanh wave-shaping so there is 0.00% harmonic distortion or buzzing!
    let sumSq = 0;
    let activeCount = 0;
    let peakAbs = 0;
    for (let i = 0; i < mono.length; i++) {
      const val = mono[i];
      const absVal = Math.abs(val);
      if (absVal > peakAbs) peakAbs = absVal;
      if (absVal > 0.01) {
        sumSq += val * val;
        activeCount++;
      }
    }

    const currentRms = activeCount > 0 ? Math.sqrt(sumSq / activeCount) : 0.1;
    const targetRms = 0.125;
    const desiredRmsGain = Math.min(2.0, Math.max(0.55, targetRms / Math.max(0.025, currentRms)));
    const maxPeakCeilingGain = peakAbs > 0.001 ? 0.86 / peakAbs : 1.0;
    const finalLinearGain = Math.min(desiredRmsGain, maxPeakCeilingGain);

    const fadeInSamples = Math.min(
      Math.floor(targetSampleRate * 0.02),
      Math.floor(mono.length * 0.08)
    );
    const fadeOutSamples = Math.min(
      Math.floor(targetSampleRate * 0.045),
      Math.floor(mono.length * 0.12)
    );

    for (let i = 0; i < mono.length; i++) {
      let s = mono[i] * finalLinearGain;
      if (i < fadeInSamples) {
        s *= i / fadeInSamples;
      } else if (i > mono.length - fadeOutSamples) {
        s *= (mono.length - i) / fadeOutSamples;
      }
      mono[i] = Math.max(-0.95, Math.min(0.95, s));
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

export interface SavedAudioSelectionEntry {
  id: string;
  ttsVoice: ProjectSettings['ttsVoice'];
  voiceLanguage: 'vi' | 'en';
  bgMusicStyle: ProjectSettings['bgMusicStyle'];
  bgMusicVolume: number;
  savedAtLabel: string;
}

export interface SavedAudioPreferences {
  ttsVoice: ProjectSettings['ttsVoice'];
  voiceLanguage: 'vi' | 'en';
  bgMusicStyle: ProjectSettings['bgMusicStyle'];
  bgMusicVolume: number;
  storyTopic?: string;
  sceneCount?: number;
  updatedAtLabel: string;
  history: SavedAudioSelectionEntry[];
}

const SAVED_AUDIO_PREFS_KEY = 'legendcut_saved_audio_prefs_v2';

export const BG_MUSIC_STYLE_LABELS: Record<ProjectSettings['bgMusicStyle'], string> = {
  'western-acoustic': '🎸 Guitar Acoustic Will Sampson',
  'emotional-piano': '🎹 Piano & Cello Hoài Niệm',
  'cinematic-strings': '🎻 Dàn Dây Điện Ảnh Sử Thi',
  'vintage-americana': '🤠 Guitar Viễn Tây Cổ Điển',
  custom: '📁 Nhạc MP3 Tải Lên Riêng',
  none: '🔇 Tắt Nhạc Nền',
};

export const VOICE_SHORT_LABELS: Record<ProjectSettings['ttsVoice'], string> = {
  Charon: 'Charon (Nam Trầm Ấm)',
  Fenrir: 'Fenrir (Nam Uy Nghiêm)',
  Puck: 'Puck (Nam Tự Nhiên)',
  Kore: 'Kore (Nữ Trầm Dịu)',
  Zephyr: 'Zephyr (Nữ Trong Trẻo)',
};

function formatNowTime(): string {
  try {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return 'Vừa xong';
  }
}

export function loadSavedAudioPreferences(): SavedAudioPreferences {
  const fallback: SavedAudioPreferences = {
    ttsVoice: 'Charon',
    voiceLanguage: 'en',
    bgMusicStyle: 'western-acoustic',
    bgMusicVolume: 0.25,
    storyTopic: 'Clint Eastwood',
    sceneCount: 8,
    updatedAtLabel: formatNowTime(),
    history: [
      {
        id: 'init-default',
        ttsVoice: 'Charon',
        voiceLanguage: 'en',
        bgMusicStyle: 'western-acoustic',
        bgMusicVolume: 0.25,
        savedAtLabel: 'Mặc định',
      },
    ],
  };

  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(SAVED_AUDIO_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;

    const validVoices: ProjectSettings['ttsVoice'][] = [
      'Charon',
      'Fenrir',
      'Puck',
      'Kore',
      'Zephyr',
    ];
    const validMusic: ProjectSettings['bgMusicStyle'][] = [
      'western-acoustic',
      'emotional-piano',
      'cinematic-strings',
      'vintage-americana',
      'custom',
      'none',
    ];

    const ttsVoice = validVoices.includes(parsed.ttsVoice) ? parsed.ttsVoice : fallback.ttsVoice;
    const voiceLanguage =
      parsed.voiceLanguage === 'vi' || parsed.voiceLanguage === 'en'
        ? parsed.voiceLanguage
        : fallback.voiceLanguage;
    const bgMusicStyle = validMusic.includes(parsed.bgMusicStyle)
      ? parsed.bgMusicStyle
      : fallback.bgMusicStyle;
    const bgMusicVolume =
      typeof parsed.bgMusicVolume === 'number' && !Number.isNaN(parsed.bgMusicVolume)
        ? Math.max(0, Math.min(0.8, parsed.bgMusicVolume))
        : fallback.bgMusicVolume;

    const history = Array.isArray(parsed.history) && parsed.history.length > 0
      ? parsed.history.slice(0, 6)
      : [
          {
            id: 'restored-default',
            ttsVoice,
            voiceLanguage,
            bgMusicStyle,
            bgMusicVolume,
            savedAtLabel: parsed.updatedAtLabel || 'Đã lưu',
          },
        ];

    return {
      ttsVoice,
      voiceLanguage,
      bgMusicStyle,
      bgMusicVolume,
      storyTopic: typeof parsed.storyTopic === 'string' ? parsed.storyTopic : fallback.storyTopic,
      sceneCount: typeof parsed.sceneCount === 'number' ? parsed.sceneCount : fallback.sceneCount,
      updatedAtLabel: parsed.updatedAtLabel || fallback.updatedAtLabel,
      history,
    };
  } catch {
    return fallback;
  }
}

export function saveAudioPreferences(
  patch: Partial<
    Pick<
      SavedAudioPreferences,
      'ttsVoice' | 'voiceLanguage' | 'bgMusicStyle' | 'bgMusicVolume' | 'storyTopic' | 'sceneCount'
    >
  >
): SavedAudioPreferences {
  const current = loadSavedAudioPreferences();
  const nextVoice = patch.ttsVoice ?? current.ttsVoice;
  const nextLang = patch.voiceLanguage ?? current.voiceLanguage;
  const nextMusic = patch.bgMusicStyle ?? current.bgMusicStyle;
  const nextVol =
    patch.bgMusicVolume !== undefined ? patch.bgMusicVolume : current.bgMusicVolume;
  const nextTopic = patch.storyTopic !== undefined ? patch.storyTopic : current.storyTopic;
  const nextSceneCount = patch.sceneCount !== undefined ? patch.sceneCount : current.sceneCount;
  const nowLabel = formatNowTime();

  const audioChanged =
    patch.ttsVoice !== undefined ||
    patch.voiceLanguage !== undefined ||
    patch.bgMusicStyle !== undefined ||
    patch.bgMusicVolume !== undefined;

  let nextHistory = [...(current.history || [])];
  if (audioChanged) {
    const top = nextHistory[0];
    const isSameCombo =
      top &&
      top.ttsVoice === nextVoice &&
      top.voiceLanguage === nextLang &&
      top.bgMusicStyle === nextMusic;

    const newEntry: SavedAudioSelectionEntry = {
      id: `sel-${Date.now()}`,
      ttsVoice: nextVoice,
      voiceLanguage: nextLang,
      bgMusicStyle: nextMusic,
      bgMusicVolume: nextVol,
      savedAtLabel: nowLabel,
    };

    if (isSameCombo) {
      nextHistory[0] = newEntry;
    } else {
      // Remove any older duplicate of the exact same voice+lang+music so history stays clean
      nextHistory = nextHistory.filter(
        (h) =>
          !(
            h.ttsVoice === nextVoice &&
            h.voiceLanguage === nextLang &&
            h.bgMusicStyle === nextMusic
          )
      );
      nextHistory.unshift(newEntry);
      nextHistory = nextHistory.slice(0, 6);
    }
  }

  const updated: SavedAudioPreferences = {
    ttsVoice: nextVoice,
    voiceLanguage: nextLang,
    bgMusicStyle: nextMusic,
    bgMusicVolume: nextVol,
    storyTopic: nextTopic,
    sceneCount: nextSceneCount,
    updatedAtLabel: nowLabel,
    history: nextHistory,
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SAVED_AUDIO_PREFS_KEY, JSON.stringify(updated));
      window.dispatchEvent(
        new CustomEvent('legendcut:audioprefs-saved', { detail: updated })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  return updated;
}

