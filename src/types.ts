export type SceneType = 'video' | 'image' | 'quote' | 'outro';

export type MotionEffect = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'static';

export type ColorFilter = 'original' | 'bw-vintage' | 'sepia' | 'color-warm';

export type FrameStyle = 'full-bleed' | 'rounded-frame' | 'cinema-letterbox';

export type AspectRatioOption = '3:4' | '9:16' | '16:9';

export type PresetId = 'lorne-greene' | 'clayton-moore' | 'yul-brynner';

export interface VaultItem {
  id: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  url: string;
  thumbnailUrl?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  sourceTag: 'sample' | 'uploaded' | 'extracted';
  createdAt: string;
}

export interface StoryScene {
  id: string;
  order: number;
  title: string;
  sceneType: SceneType;
  /** ID of the item in VaultItem[] used for visual background */
  mediaId?: string;
  /** Direct media URL fallback or reference */
  mediaUrl?: string;
  mediaKind?: 'video' | 'image';
  /** If slicing a segment from a longer video in the vault */
  videoTrimStartSec?: number;
  videoTrimEndSec?: number;
  /** Duration of this scene in seconds */
  durationSec: number;
  /** Primary narration / subtitle text (split into word-by-word karaoke chunks) */
  narrationText: string;
  /** Optional Vietnamese / secondary translation text */
  translationText?: string;
  /** Brief Vietnamese description of what visual is needed here */
  visualPrompt?: string;
  /** Ready-to-copy English prompt for AI Image Generators (Midjourney, Flux, Imagen, ChatGPT DALL-E) */
  imagePrompt?: string;
  /** Ready-to-copy English prompt for AI Video Generators (Kling, Veo, Runway, Hailuo, Hedra) when sceneType === 'video' */
  videoMotionPrompt?: string;
  /** Search keywords for finding real historical photos/footage on Google/YouTube */
  archivalKeywords?: string;
  /** Ken Burns camera motion for images or videos */
  motionEffect: MotionEffect;
  /** Documentary color grading filter */
  colorFilter: ColorFilter;
  /** Rounded dark film border, Cinema Letterbox (black top/bottom bars), or Full bleed */
  frameStyle: FrameStyle;
  /** Custom AI TTS or uploaded voiceover audio URL for this specific scene */
  voiceoverUrl?: string;
  /** Whether to show the bottom word-by-word yellow subtitles on this scene */
  showBottomSubtitles: boolean;
}

export interface ProjectSettings {
  projectTitle: string;
  activePresetId: PresetId;
  referenceVideoUrl: string;
  aspectRatio: AspectRatioOption;
  /** Audio source mode: 'reference-video' uses the original sample video audio track; 'stitched-scenes' plays per-scene voiceovers + background music */
  audioMode: 'reference-video' | 'stitched-scenes';
  /** Subtitle display language */
  subtitleLanguage: 'en' | 'vi' | 'bilingual';
  /** Highlight color for active spoken word (default #FFD700 gold yellow) */
  activeWordColor: string;
  /** Number of words per subtitle phrase line */
  wordsPerLine: number;
  /** Subtitle vertical position (percentage from top, default 86) */
  subtitleYPercent: number;
  /** Enable vintage film dust & grain specks */
  enableFilmGrain: boolean;
  /** Show bottom-right mini audio waveform equalizer */
  showWaveformBadge: boolean;
  /** Background music style */
  bgMusicStyle: 'western-acoustic' | 'emotional-piano' | 'custom' | 'none';
  customBgMusicUrl?: string;
  bgMusicVolume: number;
  voiceoverVolume: number;
  ttsVoice: 'Charon' | 'Fenrir' | 'Puck' | 'Kore' | 'Zephyr';
  /** Outro Crest customization */
  channelTitle: string;
  channelInitials: string;
  channelMotto: string;
}
