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
  /** Which TTS engine/voice profile generated this scene's audio so all scenes stay 100% locked */
  voiceEngineUsed?: string;
  /** Whether to show the bottom word-by-word yellow subtitles on this scene */
  showBottomSubtitles: boolean;
  /** True only when a verified real archival photo of the subject (or user-uploaded media) is assigned; false when no real photo was found and the user should use the Kling AI prompt to draw */
  hasRealPhoto?: boolean;
  /** Title/source of the verified real archival photo if found */
  realPhotoTitle?: string;
  /** Complete ready-to-copy Standard Kling AI Prompt (Text-to-Image + 3-Beat Image-to-Video) in chronological order */
  klingStandardPrompt?: string;
}

export type TransitionStyle = 'crossfade' | 'dip-to-black' | 'film-glow' | 'cut';

export interface ProjectSettings {
  projectTitle: string;
  activePresetId: PresetId;
  referenceVideoUrl: string;
  aspectRatio: AspectRatioOption;
  /** Audio source mode: 'reference-video' uses the original sample video audio track; 'stitched-scenes' plays per-scene voiceovers + background music */
  audioMode: 'reference-video' | 'stitched-scenes';
  /** Smooth scene transition style between segments */
  transitionStyle?: TransitionStyle;
  /** Duration of crossfade/transition in seconds (default 0.75s) */
  transitionDurationSec?: number;
  /** Subtitle display language */
  subtitleLanguage: 'en' | 'vi' | 'bilingual';
  /** Locked voiceover language across all scenes ('vi' or 'en') so voice never switches language mid-video */
  voiceLanguage?: 'vi' | 'en';
  /** Locked TTS engine across the entire project so Scene 1 and Scene N never use different engines */
  lockedTtsEngine?: 'gemini-single-pass' | 'standard-locked';
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
