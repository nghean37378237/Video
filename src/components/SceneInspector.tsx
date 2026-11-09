import React, { useEffect, useState } from 'react';
import {
  Mic,
  Sparkles,
  Sliders,
  Type as TypeIcon,
  Loader2,
  Volume2,
  CheckCircle2,
  Trash2,
  Quote,
  Award,
  Image as ImageIcon,
  Copy,
  Check,
  Film,
  FileSpreadsheet,
  Download,
  Upload,
  ExternalLink,
  History,
  Search,
} from 'lucide-react';
import {
  ColorFilter,
  FrameStyle,
  MotionEffect,
  ProjectSettings,
  SceneType,
  StoryScene,
  VaultItem,
} from '../types';
import { getMediaDuration } from '../utils/frameExtractor';
import {
  buildFullFrameImagePrompt,
  buildFullFrameVideoPrompt,
  downloadFullFrameImageForGrok,
  generateScriptedVideoMotionPrompt,
  getAspectRatioSpec,
  getRealFootageGuideForScene,
  KLING_NEGATIVE_PROMPT,
  VideoScriptStyle,
} from '../utils/fullFrameHelper';
import {
  analyzeVoiceCloneDNAFromAudioFile,
  BG_MUSIC_STYLE_LABELS,
  loadActiveVoiceCloneDNA,
  loadSavedAudioPreferences,
  masterAudioToConsistentStudioWav,
  playInstantVoicePreview,
  resetToWillSampsonVoiceCloneDNA,
  resolveConsistentSceneText,
  saveAudioPreferences,
  SavedAudioPreferences,
  VOICE_PERSONA_PROFILES,
  VOICE_SHORT_LABELS,
  VoiceCloneDNAProfile,
  WILL_SAMPSON_SAMPLE_VOICE_URL,
} from '../utils/voiceConsistencyEngine';
import { soundEngine } from '../utils/audioSynth';
import {
  generateVideoPagePost,
  PagePostLanguage,
  PageTitleStyle,
} from '../utils/pagePostGenerator';
import { VideoThumbnailStudio } from './VideoThumbnailStudio';

interface SceneInspectorProps {
  scenes: StoryScene[];
  vaultItems?: VaultItem[];
  activeScene: StoryScene | undefined;
  onUpdateScene: (sceneId: string, patch: Partial<StoryScene>) => void;
  onAddScene: (type: SceneType) => void;
  onDeleteScene: (sceneId: string) => void;
  settings: ProjectSettings;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
  onGenerateAllVoiceovers: (
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideLang?: 'vi' | 'en'
  ) => Promise<void>;
  isGeneratingAllTTS: boolean;
  ttsProgressText: string;
  onOpenPromptStudio: () => void;
  onGenerateImageViaProxyForScene?: (scene: StoryScene) => Promise<void>;
  generatingImageSceneId?: string | null;
  onUploadFileForScene?: (sceneId: string, file: File) => void;
  onTriggerExport?: () => void;
  onFetchAndInsertTrimmedActorVideos?: (
    characterQuery?: string,
    desiredCount?: number,
    targetCurrentSceneOnly?: boolean
  ) => Promise<void>;
  isTrimmingRealVideos?: boolean;
  onOpenSceneMediaSearch?: (sceneId: string) => void;
}

export const SceneInspector: React.FC<SceneInspectorProps> = ({
  scenes,
  vaultItems = [],
  activeScene,
  onUpdateScene,
  onAddScene,
  onDeleteScene,
  settings,
  onUpdateSettings,
  onGenerateAllVoiceovers,
  isGeneratingAllTTS,
  ttsProgressText,
  onOpenPromptStudio,
  onGenerateImageViaProxyForScene,
  generatingImageSceneId,
  onUploadFileForScene,
  onTriggerExport,
  onFetchAndInsertTrimmedActorVideos,
  isTrimmingRealVideos = false,
  onOpenSceneMediaSearch,
}) => {
  const [activeTab, setActiveTab] = useState<'scene' | 'summary' | 'thumbnail' | 'style'>('scene');
  const [isGeneratingSceneTTS, setIsGeneratingSceneTTS] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDownloadingFullFrame, setIsDownloadingFullFrame] = useState(false);
  const [isFetchingRealPhoto, setIsFetchingRealPhoto] = useState(false);
  const [savedAudioPrefs, setSavedAudioPrefs] = useState<SavedAudioPreferences>(() =>
    loadSavedAudioPreferences()
  );
  const [voiceCloneDna, setVoiceCloneDna] = useState<VoiceCloneDNAProfile>(() =>
    loadActiveVoiceCloneDNA()
  );
  const [isAnalyzingVoiceClone, setIsAnalyzingVoiceClone] = useState(false);

  // Page Post Summary (200-300 words) state
  const [postLang, setPostLang] = useState<PagePostLanguage>('vi');
  const [titleStyle, setTitleStyle] = useState<PageTitleStyle>('documentary');
  const [customPostTitle, setCustomPostTitle] = useState<string>('');
  const [customSummaryText, setCustomSummaryText] = useState<string>('');
  const [customHashtags, setCustomHashtags] = useState<string>('');

  // Auto-generate 200-300 word post whenever project scenes, title, language, or style changes
  useEffect(() => {
    const generated = generateVideoPagePost(scenes, settings, postLang, titleStyle);
    setCustomPostTitle(generated.titles[titleStyle]);
    setCustomSummaryText(generated.summaryText);
    setCustomHashtags(generated.hashtags);
  }, [
    scenes,
    settings.projectTitle,
    settings.channelTitle,
    postLang,
    titleStyle,
  ]);

  const handleRegeneratePagePost = () => {
    const generated = generateVideoPagePost(scenes, settings, postLang, titleStyle);
    setCustomPostTitle(generated.titles[titleStyle]);
    setCustomSummaryText(generated.summaryText);
    setCustomHashtags(generated.hashtags);
  };

  const summaryWordCount = customSummaryText
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    ? customSummaryText
        .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ').length
    : 0;

  const fullFormattedPagePost = `${customPostTitle.trim()}\n\n${customSummaryText.trim()}\n\n${customHashtags.trim()}`;

  useEffect(() => {
    const onSaved = (e: Event) => {
      const custom = e as CustomEvent<SavedAudioPreferences>;
      if (custom.detail) {
        setSavedAudioPrefs(custom.detail);
      }
    };
    const onDnaUpdated = (e: Event) => {
      const custom = e as CustomEvent<VoiceCloneDNAProfile>;
      if (custom.detail) {
        setVoiceCloneDna(custom.detail);
      }
    };
    window.addEventListener('legendcut:audioprefs-saved', onSaved);
    window.addEventListener('legendcut:voice-clone-dna-updated', onDnaUpdated);
    return () => {
      window.removeEventListener('legendcut:audioprefs-saved', onSaved);
      window.removeEventListener('legendcut:voice-clone-dna-updated', onDnaUpdated);
    };
  }, []);

  const ratioSpec = getAspectRatioSpec(settings.aspectRatio);

  const copyPrompt = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleFetchRealPhotoForScene = async () => {
    if (!activeScene || isFetchingRealPhoto) return;
    setIsFetchingRealPhoto(true);
    try {
      const res = await fetch('/api/archival/match-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: settings.projectTitle,
          scenes: [
            {
              id: activeScene.id,
              title: activeScene.title,
              sceneType: activeScene.sceneType,
              archivalKeywords: activeScene.archivalKeywords || activeScene.title,
            },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const matched = data?.matchedBySceneId?.[activeScene.id];
        if (matched?.dataUrl) {
          onUpdateScene(activeScene.id, {
            mediaUrl: matched.dataUrl,
            mediaKind: 'image',
            frameStyle: 'full-bleed',
            showBottomSubtitles: true,
          });
        }
      }
    } finally {
      setIsFetchingRealPhoto(false);
    }
  };

  const handleDownloadFullFrame = async () => {
    const targetUrl =
      (activeScene?.hasRealPhoto && activeScene?.mediaUrl) ||
      activeScene?.characterRefPhotoUrl ||
      activeScene?.mediaUrl;
    if (!targetUrl || isDownloadingFullFrame || !activeScene) return;
    setIsDownloadingFullFrame(true);
    try {
      await downloadFullFrameImageForGrok(
        targetUrl,
        activeScene.mediaKind === 'video' && targetUrl === activeScene.mediaUrl
          ? 'video'
          : 'image',
        settings.aspectRatio,
        `Canh-${String(activeScene.order).padStart(2, '0')}-Grok-Kling`
      );
    } finally {
      setIsDownloadingFullFrame(false);
    }
  };

  const activeVoiceLang: 'vi' | 'en' =
    settings.voiceLanguage ||
    (settings.subtitleLanguage === 'en' ? 'en' : 'vi');

  const handleGenerateSceneTTS = async (
    overrideVoice?: ProjectSettings['ttsVoice'],
    overrideLang?: 'vi' | 'en',
    autoPlay = true
  ) => {
    if (!activeScene) return;
    setIsGeneratingSceneTTS(true);
    setTtsError(null);

    const voiceName = overrideVoice || settings.ttsVoice || 'Charon';
    const targetLang = overrideLang || activeVoiceLang;
    const persona = VOICE_PERSONA_PROFILES[voiceName] || VOICE_PERSONA_PROFILES.Charon;
    const textToSpeak = resolveConsistentSceneText(activeScene, targetLang);
    const activeDna = loadActiveVoiceCloneDNA();
    const clonePitch =
      voiceName === 'Charon'
        ? targetLang === 'vi'
          ? activeDna.ssmlPitchVi
          : activeDna.ssmlPitchEn
        : undefined;
    const cloneRate =
      voiceName === 'Charon'
        ? targetLang === 'vi'
          ? activeDna.ssmlRateVi
          : activeDna.ssmlRateEn
        : undefined;

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voiceName,
          language: targetLang,
          style: persona.geminiAnchorPrompt,
          clonePitch,
          cloneRate,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Không thể tạo giọng đọc AI.');
      }

      const engineUsed = data.engine || 'standard-locked';
      try {
        const { masteredAudioUrl, durationSec } = await masterAudioToConsistentStudioWav(
          data.audioDataUrl,
          voiceName,
          engineUsed
        );
        onUpdateScene(activeScene.id, {
          voiceoverUrl: masteredAudioUrl,
          voiceEngineUsed: `${voiceName}:${targetLang}:${engineUsed}`,
          durationSec: Math.max(5, Math.ceil(durationSec + 0.25)),
        });
        if (autoPlay) {
          playInstantVoicePreview(masteredAudioUrl, settings.voiceoverVolume);
        }
      } catch {
        const exactDur = await getMediaDuration(data.audioDataUrl, 'audio');
        onUpdateScene(activeScene.id, {
          voiceoverUrl: data.audioDataUrl,
          voiceEngineUsed: `${voiceName}:${targetLang}:${engineUsed}`,
          durationSec: Math.max(5, Math.ceil(exactDur + 0.25)),
        });
        if (autoPlay) {
          playInstantVoicePreview(data.audioDataUrl, settings.voiceoverVolume);
        }
      }

      onUpdateSettings({
        ttsVoice: voiceName,
        audioMode: 'stitched-scenes',
        voiceLanguage: targetLang,
        lockedTtsEngine: undefined,
      });
    } catch (err: any) {
      setTtsError(err?.message || 'Lỗi khi tạo giọng đọc.');
    } finally {
      setIsGeneratingSceneTTS(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111827] border-l border-slate-800/80">
      {/* Top Segmented Tabs */}
      <div className="p-2.5 border-b border-slate-800/80">
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#0B0F17] rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('scene')}
            className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
              activeTab === 'scene'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3 h-3 shrink-0" />
            <span>Cảnh #{activeScene?.order || 1}</span>
          </button>
          <button
            onClick={() => setActiveTab('thumbnail')}
            className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
              activeTab === 'thumbnail'
                ? 'bg-amber-500 text-slate-950'
                : 'text-amber-300 hover:text-amber-200 bg-amber-500/15 border border-amber-500/30'
            }`}
            title="Thiết kế & Tải Ảnh Thumbnail Bìa Video đẹp chuẩn đăng Page / YouTube / Reels"
          >
            <ImageIcon className="w-3 h-3 shrink-0" />
            <span>Ảnh Thumb</span>
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
              activeTab === 'summary'
                ? 'bg-amber-500 text-slate-950'
                : 'text-amber-300 hover:text-amber-200 bg-amber-500/10'
            }`}
            title="Bài tóm tắt 200-300 từ + Tiêu đề + Ảnh Thumbnail đăng Page"
          >
            <FileSpreadsheet className="w-3 h-3 shrink-0" />
            <span>Tóm Tắt Page</span>
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap truncate ${
              activeTab === 'style'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TypeIcon className="w-3 h-3 shrink-0" />
            <span>Phụ Đề</span>
          </button>
        </div>
      </div>

      {activeTab === 'scene' && activeScene ? (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* Open Full Script & Prompt Matrix Button */}
          <button
            onClick={onOpenPromptStudio}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            Mở Bảng Prompt Toàn Bộ Kịch Bản + ChatGPT
          </button>

          {/* Scene Type & Duration */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Đoạn này cần nhập gì?
              </label>
              <select
                value={activeScene.sceneType}
                onChange={(e) => {
                  const newType = e.target.value as SceneType;
                  onUpdateScene(activeScene.id, {
                    sceneType: newType,
                    frameStyle: 'full-bleed',
                    showBottomSubtitles: newType === 'video' || newType === 'image',
                  });
                }}
                className="w-full px-2 py-1.5 text-xs font-semibold bg-[#0B0F17] border border-slate-700 rounded-md text-amber-300 focus:outline-none focus:border-amber-500"
              >
                <option value="video">🎥 CẦN VIDEO (Full Khung {ratioSpec.ratio})</option>
                <option value="image">🖼️ CẦN ẢNH TĨNH (Full Khung {ratioSpec.ratio})</option>
                <option value="quote">⬛ THẺ CHỮ ĐEN (Tự động dựng)</option>
                <option value="outro">🦅 LOGO KẾT CỐ ĐỊNH (LIFE LEGENDS — HM)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Thời lượng (s)
              </label>
              <input
                type="number"
                min={2}
                max={60}
                step={1}
                value={Math.ceil(activeScene.durationSec || 5)}
                onChange={(e) =>
                  onUpdateScene(activeScene.id, {
                    durationSec: Math.max(2, Math.round(parseFloat(e.target.value) || 5)),
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular bg-[#0B0F17] border border-slate-700 rounded-md text-amber-400 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {activeScene.sceneType === 'outro' && (
            <div className="p-3 rounded-lg bg-[#090D15] border border-amber-500/40 flex items-center gap-3">
              <div className="w-16 h-20 rounded overflow-hidden border border-amber-500/60 shrink-0 bg-[#070E1A]">
                <img
                  src="/assets/aistudio/image_4653598d.png"
                  alt="LIFE LEGENDS HM Fixed Logo"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 shrink-0" />
                  <span>Logo Cuối Đã Cố Định (HM — LIFE LEGENDS)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">
                  Mọi video tạo mới hoặc xuất file đều tự động gắn logo kết chuẩn <strong>LIFE LEGENDS • HM • THEIR LEGACY. YOUR INSPIRATION.</strong> với độ nét cao.
                </p>
              </div>
            </div>
          )}

          {/* Ready-to-Copy Full-Frame Image & Video Prompts (Grok / Kling AI) + Reference Keyframe Image for this Segment */}
          {(activeScene.sceneType === 'video' || activeScene.sceneType === 'image') && (
            <div className="p-3 rounded-lg bg-[#090D15] border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-400">
                  {activeScene.sceneType === 'video'
                    ? `🎥 ẢNH GỐC & PROMPT TẠO VIDEO (GROK / KLING AI — ${ratioSpec.ratio}):`
                    : `🖼️ ẢNH & PROMPT FULL KHUNG ${ratioSpec.ratio} (${ratioSpec.width}×${ratioSpec.height}):`}
                </span>
              </div>

              {activeScene.sceneType === 'video' && activeScene.mediaKind !== 'video' && (
                <div className="px-2.5 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-[11px] text-amber-200 leading-snug">
                  📸 <strong>Đoạn này chưa có Video thật:</strong> Đã gắn sẵn <strong>Ảnh Gốc Tham Chiếu</strong> &amp; <strong>Bộ Prompt chuẩn bên dưới</strong> để bạn tải ảnh và tạo video từ <strong>Grok</strong> hoặc <strong>Kling AI</strong>!
                </div>
              )}

              {/* Visual Full-Frame Reference Keyframe Preview (Supports both mediaUrl and characterRefPhotoUrl) */}
              {(activeScene.mediaUrl || activeScene.characterRefPhotoUrl) && (
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#0B0F17] border border-slate-800">
                  <div
                    style={{ aspectRatio: ratioSpec.cssAspect }}
                    className="w-16 shrink-0 rounded overflow-hidden bg-black border border-slate-700 relative"
                  >
                    {activeScene.mediaKind === 'video' && activeScene.mediaUrl ? (
                      <video
                        src={activeScene.mediaUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <img
                        src={
                          (activeScene.hasRealPhoto && activeScene.mediaUrl) ||
                          activeScene.characterRefPhotoUrl ||
                          activeScene.mediaUrl
                        }
                        alt={activeScene.title}
                        className="w-full h-full object-cover object-top"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold text-slate-200 truncate">
                      {activeScene.mediaKind === 'video'
                        ? `🎬 Video Thật Đã Gắn (${ratioSpec.ratio})`
                        : `📸 Ảnh Gốc Tham Chiếu (${ratioSpec.width}×${ratioSpec.height}px)`}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Bấm tải ảnh chuẩn kích thước này đưa vào <strong>Grok</strong> hoặc <strong>Kling AI (Image-to-Video)</strong> kèm Prompt bên dưới để tạo video.
                    </p>
                  </div>
                </div>
              )}

              {/* Direct 1-Click Upload / Replace New Image or Video into this Scene */}
              {onUploadFileForScene && (
                <label className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md cursor-pointer transition-colors shadow-sm">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chèn / Thay Ảnh Hoặc Video Vừa Tạo Vào Cảnh #{activeScene.order}</span>
                  <input
                    type="file"
                    accept="video/*,image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        onUploadFileForScene(activeScene.id, file);
                        e.target.value = '';
                      }
                    }}
                    className="hidden"
                  />
                </label>
              )}

              {/* Quick Actions for Per-Scene Video Search & Replacement Video */}
              <div className="p-2.5 rounded-lg bg-[#0E1729] border border-sky-500/40 space-y-1.5">
                <div className="text-[11px] font-bold text-sky-300 flex items-center gap-1">
                  <Film className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    🎬 Tìm Video Cho Phần #{String(activeScene.order).padStart(2, '0')} &amp; Video Thay Thế:
                  </span>
                </div>
                {onOpenSceneMediaSearch && (
                  <button
                    type="button"
                    onClick={() => onOpenSceneMediaSearch(activeScene.id)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md shadow transition-colors"
                  >
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      🔍 Tìm &amp; Chọn Video Thay Thế / Shorts / TikTok Cho Phần #{String(activeScene.order).padStart(2, '0')}
                    </span>
                  </button>
                )}
                {onFetchAndInsertTrimmedActorVideos && (
                  <button
                    type="button"
                    disabled={isTrimmingRealVideos}
                    onClick={() =>
                      onFetchAndInsertTrimmedActorVideos(
                        settings.projectTitle.split('—')[0].trim(),
                        1,
                        true
                      )
                    }
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 text-amber-200 border border-amber-400/50 rounded-md transition-colors"
                  >
                    {isTrimmingRealVideos ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Đang tự cắt &amp; thay thế video...</span>
                      </>
                    ) : (
                      <span>
                        🔄 Tự Cắt &amp; Thay Thế 1 Video Thật Khác Vào Phần #{String(activeScene.order).padStart(2, '0')} (1-Click)
                      </span>
                    )}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={handleFetchRealPhotoForScene}
                  disabled={isFetchingRealPhoto}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-md transition-colors"
                >
                  {isFetchingRealPhoto ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Đang tìm ảnh thật...
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-3 h-3" />
                      Lấy Ảnh Thực Tế
                    </>
                  )}
                </button>

                {onGenerateImageViaProxyForScene && (
                  <button
                    onClick={() => onGenerateImageViaProxyForScene(activeScene)}
                    disabled={generatingImageSceneId === activeScene.id}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-md transition-colors"
                  >
                    {generatingImageSceneId === activeScene.id ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Đang vẽ {ratioSpec.ratio}...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Vẽ Lại Bằng AI ({ratioSpec.ratio})
                      </>
                    )}
                  </button>
                )}
              </div>

              {(activeScene.mediaUrl || activeScene.characterRefPhotoUrl) && (
                <button
                  onClick={handleDownloadFullFrame}
                  disabled={isDownloadingFullFrame}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded-md transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isDownloadingFullFrame
                    ? 'Đang xuất ảnh chuẩn...'
                    : `Tải Ảnh Gốc ${ratioSpec.width}×${ratioSpec.height}px Đưa Sang Grok / Kling AI Tạo Video`}
                </button>
              )}

              {/* Image Generation Prompt Box (Full-Frame for Grok / ChatGPT / Kling) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-emerald-400">
                    1. Prompt Vẽ Ảnh Gốc (Grok / ChatGPT / Kling — {ratioSpec.ratio}):
                  </span>
                  <button
                    onClick={() =>
                      copyPrompt(
                        buildFullFrameImagePrompt(
                          activeScene.imagePrompt || activeScene.visualPrompt,
                          settings.aspectRatio
                        ),
                        'img'
                      )
                    }
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded transition-colors"
                  >
                    {copiedField === 'img' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        Đã Copy Prompt Ảnh
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Prompt Ảnh {ratioSpec.ratio}
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={buildFullFrameImagePrompt(
                    activeScene.imagePrompt || activeScene.visualPrompt,
                    settings.aspectRatio
                  )}
                  onChange={(e) =>
                    onUpdateScene(activeScene.id, { imagePrompt: e.target.value })
                  }
                  placeholder={`Prompt tiếng Anh tạo ảnh Full Khung ${ratioSpec.ratio}...`}
                  className="w-full p-2 text-[11px] font-mono bg-[#0B0F17] border border-slate-800 rounded text-slate-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Video Animation Prompt Box (3-Beat Scripted Full-Frame for GROK & KLING AI) */}
              <div className="space-y-1.5 pt-1.5 border-t border-slate-800/80">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-sky-400">
                    2. Prompt Tạo Video Chuyển Động (Grok / Kling AI):
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        copyPrompt(
                          buildFullFrameVideoPrompt(
                            activeScene.videoMotionPrompt,
                            activeScene.imagePrompt || activeScene.visualPrompt,
                            settings.aspectRatio,
                            activeScene.narrationText
                          ),
                          'vid'
                        )
                      }
                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 rounded transition-colors"
                    >
                      {copiedField === 'vid' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Đã Copy Prompt Grok/Kling
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy Prompt Grok / Kling
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => copyPrompt(KLING_NEGATIVE_PROMPT, 'neg-vid')}
                      title="Copy Negative Prompt cho Kling AI / Grok để giữ nguyên khuôn mặt không bị biến dạng"
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition-colors"
                    >
                      {copiedField === 'neg-vid' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Đã Copy Negative
                        </>
                      ) : (
                        <span>+Negative</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick 1-Click Scripted Motion Style Presets for Grok / Kling AI */}
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'narrative-hook', label: '🎬 Tự sự & Nhép môi (Grok/Kling)' },
                      { id: 'cinematic-action', label: '🐎 Hành động điện ảnh' },
                      { id: 'emotional-closeup', label: '🌅 Cận cảnh nội tâm' },
                    ] as { id: VideoScriptStyle; label: string }[]
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        onUpdateScene(activeScene.id, {
                          videoMotionPrompt: generateScriptedVideoMotionPrompt({
                            title: activeScene.title,
                            narrationText: activeScene.narrationText,
                            imagePrompt: activeScene.imagePrompt,
                            visualPrompt: activeScene.visualPrompt,
                            style: preset.id,
                            ratio: settings.aspectRatio,
                          }),
                        })
                      }
                      className="px-2 py-0.5 text-[10px] font-medium bg-slate-800/90 hover:bg-sky-500/25 text-sky-200 border border-slate-700 hover:border-sky-500/40 rounded transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={4}
                  value={buildFullFrameVideoPrompt(
                    activeScene.videoMotionPrompt,
                    activeScene.imagePrompt || activeScene.visualPrompt,
                    settings.aspectRatio,
                    activeScene.narrationText
                  )}
                  onChange={(e) =>
                    onUpdateScene(activeScene.id, { videoMotionPrompt: e.target.value })
                  }
                  placeholder={`Kịch bản 3 nhịp [0-2s] -> [2-4s] -> [4-6s] cho Grok / Kling AI Image-to-Video Full Khung ${ratioSpec.ratio}...`}
                  className="w-full p-2 text-[11px] font-mono bg-[#0B0F17] border border-slate-800 rounded text-slate-300 leading-relaxed focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400 leading-snug">
                  💡 <strong>Cách tạo Video bằng Grok hoặc Kling AI:</strong> Tải <em>Ảnh Gốc Tham Chiếu</em> ở trên đưa vào <strong>Grok</strong> hoặc mục <strong>Image to Video</strong> của <strong>Kling AI</strong> + Dán Prompt này để tạo video chuyển động chuẩn khuôn mặt nhân vật.
                </p>
              </div>

              {/* 3. Real Movie / Archival Footage Finder & In-App Video Clipper */}
              {(() => {
                const realGuide = getRealFootageGuideForScene({
                  sceneId: activeScene.id,
                  order: activeScene.order,
                  title: activeScene.title,
                  narrationText: activeScene.narrationText,
                  archivalKeywords: activeScene.archivalKeywords,
                  durationSec: activeScene.durationSec,
                  characterName: settings.projectTitle,
                });
                return (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold text-amber-400">
                        3. Gợi Ý Lấy &amp; Cắt Video Thật Từ Phim:
                      </span>
                      <button
                        type="button"
                        onClick={() => copyPrompt(realGuide.searchQueryEn, 'real-query')}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded transition-colors"
                      >
                        {copiedField === 'real-query' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Đã Copy Từ Khóa
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Từ Khóa Phim
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-2 rounded bg-[#0B0F17] border border-amber-500/30 space-y-1 text-[11px]">
                      <p className="font-semibold text-amber-200 leading-snug">
                        🎬 {realGuide.filmTitleVi}
                      </p>
                      <p className="text-slate-300 leading-snug">
                        ✂️ {realGuide.clipInstructionVi}
                      </p>
                    </div>

                    {onFetchAndInsertTrimmedActorVideos && (
                      <div className="grid grid-cols-1 gap-1.5">
                        <button
                          type="button"
                          disabled={isTrimmingRealVideos}
                          onClick={() =>
                            onFetchAndInsertTrimmedActorVideos(
                              settings.projectTitle.split('—')[0].trim(),
                              3,
                              false
                            )
                          }
                          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded transition-colors"
                        >
                          {isTrimmingRealVideos ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Đang tự lấy, cắt &amp; chèn Video Thật...</span>
                            </>
                          ) : (
                            <>
                              <Film className="w-3.5 h-3.5" />
                              <span>⚡ Tự Lấy, Cắt &amp; Chèn 3 Video Thật Vào 3 Cảnh (1-Click)</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isTrimmingRealVideos}
                          onClick={() =>
                            onFetchAndInsertTrimmedActorVideos(
                              settings.projectTitle.split('—')[0].trim(),
                              1,
                              true
                            )
                          }
                          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-200 border border-sky-500/40 rounded transition-colors"
                        >
                          ✂️ Lấy &amp; Cắt 1 Video Thật Chèn Riêng Vào Cảnh #{String(activeScene.order).padStart(2, '0')} Này
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5">
                      <a
                        href={realGuide.youtubeSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 rounded transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        YouTube Cảnh Phim
                      </a>
                      <a
                        href={realGuide.internetArchiveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 rounded transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        Archive.org (MP4)
                      </a>
                      <a
                        href={realGuide.wikimediaVideoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-500/40 rounded transition-colors"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        Wikimedia Video
                      </a>
                      <a
                        href="https://cobalt.tools/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 rounded transition-colors"
                      >
                        <Download className="w-3 h-3 shrink-0" />
                        Tải MP4 (Cobalt)
                      </a>
                    </div>

                    {/* In-App Video Trimmer */}
                    <div className="p-2 rounded bg-[#0B0F17] border border-slate-800 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-300">
                        ✂️ Cắt đoạn video thả vào:
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-slate-300">
                        <span>Từ giây</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={Math.round(activeScene.videoTrimStartSec || 0)}
                          onChange={(e) => {
                            const startVal = Math.max(0, Number(e.target.value) || 0);
                            onUpdateScene(activeScene.id, {
                              videoTrimStartSec: startVal,
                              videoTrimEndSec: startVal + Math.round(activeScene.durationSec || 8),
                            });
                          }}
                          className="w-12 px-1 py-0.5 text-[11px] font-mono bg-slate-900 border border-slate-700 rounded text-amber-300 text-center"
                        />
                        <span>→ {Math.round((activeScene.videoTrimStartSec || 0) + (activeScene.durationSec || 8))}s</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Narration & Subtitle Script */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Lời bình / Phụ đề Tiếng Anh (Tự động nhảy từng chữ vàng)
              </label>
              <textarea
                rows={3}
                value={activeScene.narrationText}
                onChange={(e) =>
                  onUpdateScene(activeScene.id, { narrationText: e.target.value })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Bản dịch / Phụ đề Tiếng Việt
              </label>
              <textarea
                rows={2}
                value={activeScene.translationText || ''}
                onChange={(e) =>
                  onUpdateScene(activeScene.id, { translationText: e.target.value })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Visual Effects: Ken Burns Motion, Color Filter, Frame Style */}
          {(activeScene.sceneType === 'image' || activeScene.sceneType === 'video') && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Chuyển động máy quay
                  </label>
                  <select
                    value={activeScene.motionEffect}
                    onChange={(e) =>
                      onUpdateScene(activeScene.id, {
                        motionEffect: e.target.value as MotionEffect,
                      })
                    }
                    className="w-full px-2 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100"
                  >
                    <option value="zoom-in">Zoom Vào Chậm</option>
                    <option value="zoom-out">Zoom Ra Chậm</option>
                    <option value="pan-right">Lia Máy Sang Phải</option>
                    <option value="pan-left">Lia Máy Sang Trái</option>
                    <option value="static">Giữ Tĩnh</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Màu phim tư liệu
                  </label>
                  <select
                    value={activeScene.colorFilter}
                    onChange={(e) =>
                      onUpdateScene(activeScene.id, {
                        colorFilter: e.target.value as ColorFilter,
                      })
                    }
                    className="w-full px-2 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100"
                  >
                    <option value="original">Màu Gốc</option>
                    <option value="bw-vintage">Đen Trắng Cổ Điển</option>
                    <option value="sepia">Màu Phim Xưa (Sepia)</option>
                    <option value="color-warm">Màu Nắng Ấm Hoài Cổ</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Kiểu khung hình (Chuẩn 3 video mẫu)
                </label>
                <select
                  value={activeScene.frameStyle}
                  onChange={(e) =>
                    onUpdateScene(activeScene.id, {
                      frameStyle: e.target.value as FrameStyle,
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100"
                >
                  <option value="full-bleed">Toàn màn hình dọc 3:4 (Full Bleed)</option>
                  <option value="rounded-frame">
                    Khung viền phim bo tròn (Như ảnh Yul Brynner & Lorne Greene)
                  </option>
                  <option value="cinema-letterbox">
                    Khung ngang Cinema Letterbox (Viền đen trên/dưới cho trích đoạn phim)
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* AI Documentary Voiceover & Background Music Selector */}
          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                Chọn Giọng Đọc &amp; Nhạc Nền (Tự Động Lưu)
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3" />
                Đã lưu ({savedAudioPrefs.updatedAtLabel})
              </span>
            </div>

            {/* Saved Selection Banner & Quick Restore History */}
            <div className="p-2 rounded bg-slate-900/90 border border-emerald-500/30 space-y-1.5">
              <div className="text-[10px] text-emerald-300 font-semibold leading-snug">
                💾 Đã lưu trước khi chạy:{' '}
                <span className="text-amber-300">
                  {VOICE_SHORT_LABELS[settings.ttsVoice]} ({activeVoiceLang.toUpperCase()})
                </span>{' '}
                +{' '}
                <span className="text-sky-300">
                  {BG_MUSIC_STYLE_LABELS[settings.bgMusicStyle]} ({Math.round(settings.bgMusicVolume * 100)}%)
                </span>
              </div>
              {savedAudioPrefs.history && savedAudioPrefs.history.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-800">
                  <div className="text-[9px] text-slate-400 flex items-center gap-1">
                    <History className="w-2.5 h-2.5 text-amber-400" />
                    Quá trình chọn gần đây (Bấm để chọn lại):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {savedAudioPrefs.history.slice(0, 4).map((item, idx) => {
                      const isCurrent =
                        item.ttsVoice === settings.ttsVoice &&
                        item.voiceLanguage === activeVoiceLang &&
                        item.bgMusicStyle === settings.bgMusicStyle;
                      return (
                        <button
                          key={item.id || idx}
                          type="button"
                          onClick={() => {
                            onUpdateSettings({
                              ttsVoice: item.ttsVoice,
                              voiceLanguage: item.voiceLanguage,
                              bgMusicStyle: item.bgMusicStyle,
                              bgMusicVolume: item.bgMusicVolume,
                              lockedTtsEngine: undefined,
                            });
                            saveAudioPreferences({
                              ttsVoice: item.ttsVoice,
                              voiceLanguage: item.voiceLanguage,
                              bgMusicStyle: item.bgMusicStyle,
                              bgMusicVolume: item.bgMusicVolume,
                            });
                            soundEngine.previewBackgroundMusic(
                              item.bgMusicStyle,
                              item.bgMusicVolume,
                              settings.customBgMusicUrl,
                              5000
                            );
                            handleGenerateSceneTTS(item.ttsVoice, item.voiceLanguage, true);
                          }}
                          className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                            isCurrent
                              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200 font-semibold'
                              : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {idx === 0 ? '★ ' : ''}
                          {VOICE_SHORT_LABELS[item.ttsVoice] || item.ttsVoice} ({item.voiceLanguage.toUpperCase()}) +{' '}
                          {item.bgMusicStyle === 'western-acoustic'
                            ? 'Guitar'
                            : item.bgMusicStyle === 'emotional-piano'
                            ? 'Piano'
                            : item.bgMusicStyle === 'cinematic-strings'
                            ? 'Dàn Dây'
                            : item.bgMusicStyle === 'vintage-americana'
                            ? 'Viễn Tây'
                            : item.bgMusicStyle === 'custom'
                            ? 'MP3'
                            : 'Tắt nhạc'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 1-Click Recommended Voice + Music Combos by Documentary Genre */}
            <div className="space-y-1.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-400">
                ✨ Gợi ý tổ hợp Giọng Đọc + Nhạc Nền phù hợp nhất (1-Click):
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  {
                    id: 'life-legends',
                    label: '⭐ Bản Đọc Chuẩn',
                    desc: 'Bản Đọc Chuẩn (103.4Hz) + Guitar Acoustic Ấm',
                    voice: 'Charon' as const,
                    music: 'western-acoustic' as const,
                    vol: 0.25,
                  },
                  {
                    id: 'epic-history',
                    label: '🎬 Sử Thi & Huyền Thoại',
                    desc: 'Nam Trầm Hùng Fenrir + Dàn Dây Điện Ảnh',
                    voice: 'Fenrir' as const,
                    music: 'cinematic-strings' as const,
                    vol: 0.22,
                  },
                  {
                    id: 'nostalgic-story',
                    label: '🎹 Hồi Ức Lắng Đọng',
                    desc: 'Nam Truyền Cảm Puck + Piano & Cello Ấm',
                    voice: 'Puck' as const,
                    music: 'emotional-piano' as const,
                    vol: 0.24,
                  },
                  {
                    id: 'gentle-female',
                    label: '🌸 Nữ Tự Sự Sâu Lắng',
                    desc: 'Nữ Dịu Dàng Kore + Piano & Cello Tự Sự',
                    voice: 'Kore' as const,
                    music: 'emotional-piano' as const,
                    vol: 0.2,
                  },
                ].map((combo) => {
                  const isSelected =
                    settings.ttsVoice === combo.voice && settings.bgMusicStyle === combo.music;
                  return (
                    <button
                      key={combo.id}
                      type="button"
                      onClick={() => {
                        onUpdateSettings({
                          ttsVoice: combo.voice,
                          bgMusicStyle: combo.music,
                          bgMusicVolume: combo.vol,
                          lockedTtsEngine: undefined,
                        });
                        saveAudioPreferences({
                          ttsVoice: combo.voice,
                          voiceLanguage: activeVoiceLang,
                          bgMusicStyle: combo.music,
                          bgMusicVolume: combo.vol,
                        });
                        soundEngine.previewBackgroundMusic(
                          combo.music,
                          combo.vol,
                          settings.customBgMusicUrl,
                          6000
                        );
                        handleGenerateSceneTTS(combo.voice, activeVoiceLang, true);
                      }}
                      className={`p-2 rounded-md border text-left transition-colors ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-slate-300'
                      }`}
                    >
                      <div className="text-[11px] font-bold leading-tight">{combo.label}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5 leading-tight">
                        {combo.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Locked Voice Language + Voice Persona Selector */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-[10px] font-semibold text-slate-300">
                  1. Giọng đọc thuyết minh (Chọn để lưu &amp; nghe thử ngay):
                </label>
                <button
                  type="button"
                  disabled={isGeneratingSceneTTS}
                  onClick={() => handleGenerateSceneTTS(settings.ttsVoice, activeVoiceLang, true)}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-300 border border-emerald-500/40 rounded transition-colors"
                >
                  {isGeneratingSceneTTS ? '⏳ Đang tạo giọng...' : '🔊 Nghe Thử Giọng Này'}
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                <select
                  value={activeVoiceLang}
                  onChange={(e) => {
                    const newLang = e.target.value as 'vi' | 'en';
                    onUpdateSettings({
                      voiceLanguage: newLang,
                      lockedTtsEngine: undefined,
                    });
                    saveAudioPreferences({ voiceLanguage: newLang });
                    handleGenerateSceneTTS(settings.ttsVoice, newLang, true);
                  }}
                  title="Khóa ngôn ngữ giọng đọc xuyên suốt từ đầu đến cuối"
                  className="col-span-2 px-2 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-700 rounded text-amber-300"
                >
                  <option value="vi">🇻🇳 Đọc Tiếng Việt</option>
                  <option value="en">🇺🇸 Đọc Tiếng Anh</option>
                </select>

                <select
                  value={settings.ttsVoice}
                  onChange={(e) => {
                    const newVoice = e.target.value as ProjectSettings['ttsVoice'];
                    onUpdateSettings({
                      ttsVoice: newVoice,
                      lockedTtsEngine: undefined,
                    });
                    saveAudioPreferences({ ttsVoice: newVoice, voiceLanguage: activeVoiceLang });
                    handleGenerateSceneTTS(newVoice, activeVoiceLang, true);
                  }}
                  className="col-span-3 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200"
                >
                  <option value="Charon">
                    ⭐ Bản Đọc Chuẩn — Giọng Nhân Bản Gốc (103.4Hz · 133 WPM)
                  </option>
                  <option value="Fenrir">
                    Fenrir — Nam Trầm Sâu Uy Nghiêm (Phim Tài Liệu Lịch Sử)
                  </option>
                  <option value="Puck">
                    Puck — Nam Truyền Cảm Tự Nhiên (Kể Chuyện Đời Thường)
                  </option>
                  <option value="Kore">
                    Kore — Nữ Trầm Dịu Sâu Lắng (Hồi Ức &amp; Tâm Sự)
                  </option>
                  <option value="Zephyr">
                    Zephyr — Nữ Trong Trẻo Truyền Cảm (Tiểu Sử Nghệ Thuật)
                  </option>
                </select>
              </div>
              <p className="text-[10px] text-emerald-300/90 leading-snug">
                🎙️ {VOICE_PERSONA_PROFILES[settings.ttsVoice]?.label}
              </p>

              {/* Voice Clone DNA Studio Box */}
              <div className="mt-1.5 p-2 rounded-lg bg-amber-950/30 border border-amber-500/40 space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] font-bold text-amber-300 truncate">
                    {voiceCloneDna.label}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-bold text-emerald-300 shrink-0">
                    Khớp {voiceCloneDna.similarityScore}% DNA
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-300 bg-slate-950/70 p-1 rounded border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">Tần số F0:</span>
                    <strong className="text-amber-300">{voiceCloneDna.medianF0Hz} Hz</strong>{' '}
                    <span className="text-slate-400">
                      ({voiceCloneDna.p25F0Hz}–{voiceCloneDna.p75F0Hz})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Nhịp đọc:</span>
                    <strong className="text-emerald-300">{voiceCloneDna.wpm} WPM</strong>{' '}
                    <span className="text-slate-400">({voiceCloneDna.ssmlRateEn})</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Âm sắc EQ:</span>
                    <strong className="text-sky-300">5 Dải Studio</strong>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      playInstantVoicePreview(
                        voiceCloneDna.sourceSampleUrl || WILL_SAMPSON_SAMPLE_VOICE_URL,
                        settings.voiceoverVolume
                      )
                    }
                    className="px-2 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-200 border border-amber-500/30 rounded transition-colors flex items-center justify-center gap-1"
                  >
                    🔊 Nghe Mẫu Gốc
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingSceneTTS}
                    onClick={() => {
                      onUpdateSettings({ ttsVoice: 'Charon', lockedTtsEngine: undefined });
                      saveAudioPreferences({ ttsVoice: 'Charon', voiceLanguage: activeVoiceLang });
                      handleGenerateSceneTTS('Charon', activeVoiceLang, true);
                    }}
                    className="px-2 py-1 text-[10px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-50 text-amber-200 border border-amber-500/40 rounded transition-colors flex items-center justify-center gap-1"
                  >
                    {isGeneratingSceneTTS ? '⏳ Đang phát...' : '🔊 Nghe ⭐ Bản Đọc Chuẩn'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-1.5 pt-0.5">
                  <label className="cursor-pointer flex-1 text-center px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[9px] font-semibold transition-colors">
                    {isAnalyzingVoiceClone
                      ? '⏳ Đang trích xuất DNA...'
                      : '+ Tải File Audio Khác Để Nhân Bản Giọng'}
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setIsAnalyzingVoiceClone(true);
                        try {
                          const dna = await analyzeVoiceCloneDNAFromAudioFile(file);
                          setVoiceCloneDna(dna);
                          onUpdateSettings({ ttsVoice: 'Charon', lockedTtsEngine: undefined });
                          saveAudioPreferences({ ttsVoice: 'Charon' });
                          handleGenerateSceneTTS('Charon', activeVoiceLang, true);
                        } finally {
                          setIsAnalyzingVoiceClone(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {voiceCloneDna.id !== 'will-sampson-original-dna' && (
                    <button
                      type="button"
                      onClick={() => {
                        const def = resetToWillSampsonVoiceCloneDNA();
                        setVoiceCloneDna(def);
                        handleGenerateSceneTTS('Charon', activeVoiceLang, true);
                      }}
                      className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 text-[9px] font-semibold"
                    >
                      Khôi phục gốc
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Background Music Selector right inside Tab 1 for fast pairing */}
            <div className="space-y-1.5 pt-1.5 border-t border-slate-800/80">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[10px] font-semibold text-slate-300">
                  2. Nhạc nền phim tài liệu ({Math.round(settings.bgMusicVolume * 100)}%):
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      soundEngine.previewBackgroundMusic(
                        settings.bgMusicStyle,
                        settings.bgMusicVolume,
                        settings.customBgMusicUrl,
                        7000
                      )
                    }
                    className="px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded transition-colors"
                  >
                    🔊 Nghe Thử Nhạc Nền
                  </button>
                  <button
                    type="button"
                    onClick={() => soundEngine.stopBackgroundMusic()}
                    className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800 rounded"
                  >
                    Dừng
                  </button>
                </div>
              </div>

              <select
                value={settings.bgMusicStyle}
                onChange={(e) => {
                  const newStyle = e.target.value as ProjectSettings['bgMusicStyle'];
                  onUpdateSettings({ bgMusicStyle: newStyle });
                  saveAudioPreferences({ bgMusicStyle: newStyle });
                  soundEngine.previewBackgroundMusic(
                    newStyle,
                    settings.bgMusicVolume,
                    settings.customBgMusicUrl,
                    6000
                  );
                }}
                className="w-full px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
              >
                <option value="western-acoustic">
                  🎸 Guitar Acoustic &amp; Piano Ấm (Chuẩn Mẫu Will Sampson - Khuyên dùng)
                </option>
                <option value="emotional-piano">
                  🎹 Piano &amp; Cello Hoài Niệm Sâu Lắng (Tiểu Sử Cảm Xúc)
                </option>
                <option value="cinematic-strings">
                  🎻 Dàn Dây Cello &amp; Violin Trầm Hùng (Huyền Thoại Lịch Sử)
                </option>
                <option value="vintage-americana">
                  🤠 Guitar Miền Viễn Tây Cổ Điển (Cao Bồi &amp; Thập Niên 60-70)
                </option>
                <option value="custom">
                  📁 Nhạc Nền MP3 Do Bạn Tải Lên ({settings.customBgMusicUrl ? 'Đã nạp' : 'Chưa chọn'})
                </option>
                <option value="none">🔇 Tắt nhạc nền</option>
              </select>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.02}
                  value={settings.bgMusicVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    onUpdateSettings({ bgMusicVolume: v });
                    saveAudioPreferences({ bgMusicVolume: v });
                    soundEngine.setBgVolume(v);
                  }}
                  className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <label className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded cursor-pointer shrink-0">
                  +Tải MP3 Nhạc Nền
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      onUpdateSettings({
                        bgMusicStyle: 'custom',
                        customBgMusicUrl: url,
                      });
                      saveAudioPreferences({ bgMusicStyle: 'custom' });
                      soundEngine.previewBackgroundMusic('custom', settings.bgMusicVolume, url, 7000);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* 1-Click Generate & Lock Uniform AI Voiceover for ALL scenes */}
            <button
              onClick={() => onGenerateAllVoiceovers(settings.ttsVoice, activeVoiceLang)}
              disabled={isGeneratingAllTTS}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isGeneratingAllTTS ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  {ttsProgressText || 'Đang đổi giọng đồng bộ toàn video...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Áp Dụng {VOICE_SHORT_LABELS[settings.ttsVoice]} ({activeVoiceLang === 'vi' ? 'Tiếng Việt' : 'Tiếng Anh'}) Cho Toàn Video
                </>
              )}
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => handleGenerateSceneTTS(settings.ttsVoice, activeVoiceLang, true)}
                disabled={isGeneratingSceneTTS}
                className="flex-1 px-2.5 py-1.5 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-50 text-amber-300 border border-amber-500/40 rounded transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {isGeneratingSceneTTS ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang thu âm cảnh #{activeScene.order}...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    Thu &amp; Nghe Ngay {VOICE_SHORT_LABELS[settings.ttsVoice]} Cho Cảnh #{activeScene.order}
                  </>
                )}
              </button>
            </div>

            {ttsError && <p className="text-[11px] text-rose-400">{ttsError}</p>}

            {/* Option 2: Upload External Voice File (.mp3 / .wav from ElevenLabs, CapCut, etc.) */}
            <div className="pt-1.5 border-t border-slate-800/80 space-y-2">
              <label className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Tải File Voice Ngoài (.mp3 / .wav) Gắn Vào Cảnh #{activeScene.order}</span>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const audioUrl = URL.createObjectURL(file);
                    try {
                      const { masteredAudioUrl, durationSec } =
                        await masterAudioToConsistentStudioWav(
                          audioUrl,
                          settings.ttsVoice,
                          'gemini-tts'
                        );
                      onUpdateScene(activeScene.id, {
                        voiceoverUrl: masteredAudioUrl,
                        durationSec: Math.max(3, Math.ceil(durationSec * 10) / 10 + 0.3),
                      });
                    } catch {
                      const exactDur = await getMediaDuration(audioUrl, 'audio');
                      onUpdateScene(activeScene.id, {
                        voiceoverUrl: audioUrl,
                        durationSec: Math.max(3, Math.ceil(exactDur * 10) / 10 + 0.3),
                      });
                    }
                    onUpdateSettings({ audioMode: 'stitched-scenes' });
                  }}
                  className="hidden"
                />
              </label>

              {activeScene.voiceoverUrl && (
                <div className="space-y-1.5 pt-1">
                  <audio
                    controls
                    src={activeScene.voiceoverUrl}
                    className="w-full h-8 rounded"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">
                      Đã chuẩn hóa âm lượng & khớp thời lượng cảnh
                    </span>
                    <a
                      href={activeScene.voiceoverUrl}
                      download={`Voice-Canh-${String(activeScene.order).padStart(2, '0')}.wav`}
                      className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Tải file âm thanh
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Add / Delete Scene */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              onClick={() => onAddScene('video')}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-[#0B0F17] hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Film className="w-3 h-3 text-sky-400" />
              +Cảnh Video
            </button>
            <button
              onClick={() => onAddScene('image')}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-[#0B0F17] hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <ImageIcon className="w-3 h-3 text-emerald-400" />
              +Cảnh Ảnh
            </button>
            <button
              onClick={() => onAddScene('quote')}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium bg-[#0B0F17] hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
            >
              <Quote className="w-3 h-3 text-amber-400" />
              +Thẻ Chữ Đen
            </button>
          </div>

          <button
            onClick={() => onDeleteScene(activeScene.id)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa Phân Cảnh Này
          </button>
        </div>
      ) : activeTab === 'summary' ? (
        /* 200-300 Word Video Summary & Ready-to-Post Page Caption Tab */
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* Header & 1-Click Copy Full Post CTA */}
          <div className="p-3 rounded-lg bg-[#090D15] border border-amber-500/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-amber-400">
                  Bài Tóm Tắt Video (200–300 Từ) Đăng Page / Reels / YouTube
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Tự động tổng hợp từ {scenes.filter((s) => s.sceneType !== 'outro').length} phân cảnh của dự án hiện tại. Làm xong video chỉ cần bấm Copy và đăng lên Page ngay!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => copyPrompt(fullFormattedPagePost, 'copy-full-page-post')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copiedField === 'copy-full-page-post' ? (
                <>
                  <Check className="w-4 h-4" />
                  Đã Copy Trọn Bộ (Tiêu Đề + Tóm Tắt {summaryWordCount} Từ + Hashtag)!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Trọn Bộ (Tiêu Đề + Tóm Tắt {summaryWordCount} Từ + Hashtag) Đăng Page Luôn
                </>
              )}
            </button>

            {onTriggerExport && (
              <button
                type="button"
                onClick={onTriggerExport}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Xuất File Video Hoàn Chỉnh Để Đăng Kèm Bài Viết Này
              </button>
            )}
          </div>

          {/* Embedded Quick Video Thumbnail Generator right inside Summary Tab */}
          <VideoThumbnailStudio
            scenes={scenes}
            vaultItems={vaultItems}
            settings={settings}
            compactMode={true}
            onOpenFullThumbTab={() => setActiveTab('thumbnail')}
          />

          {/* Language & Title Style Controls */}
          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                01. Ngôn Ngữ Bài Viết Đăng Page
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-900 rounded-md border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPostLang('vi')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                    postLang === 'vi'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tiếng Việt (VN)
                </button>
                <button
                  type="button"
                  onClick={() => setPostLang('en')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                    postLang === 'en'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  English (US/Global)
                </button>
                <button
                  type="button"
                  onClick={() => setPostLang('bilingual')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
                    postLang === 'bilingual'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Song Ngữ VI + EN
                </button>
              </div>
            </div>

            {/* Viral Title Selector & Input */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-[11px] font-semibold text-amber-300">
                  02. Tiêu Đề Video Đăng Page (Chọn 1 trong 3 kiểu tiêu đề thu hút):
                </label>
                <button
                  type="button"
                  onClick={() => copyPrompt(customPostTitle, 'copy-post-title')}
                  className="px-2 py-1 text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1 shrink-0"
                >
                  {copiedField === 'copy-post-title' ? (
                    <>
                      <Check className="w-3 h-3" />
                      Đã Copy Tiêu Đề!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy Tiêu Đề
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => setTitleStyle('documentary')}
                  className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
                    titleStyle === 'documentary'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Chuẩn Tài Liệu
                </button>
                <button
                  type="button"
                  onClick={() => setTitleStyle('viral-hook')}
                  className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
                    titleStyle === 'viral-hook'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Giật Tít Cảm Xúc
                </button>
                <button
                  type="button"
                  onClick={() => setTitleStyle('legacy-quote')}
                  className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
                    titleStyle === 'legacy-quote'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Trích Dẫn & Di Sản
                </button>
              </div>

              <textarea
                rows={2}
                value={customPostTitle}
                onChange={(e) => setCustomPostTitle(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-semibold bg-slate-950 border border-slate-700 rounded-md text-amber-200 focus:outline-none focus:border-amber-500 resize-none leading-snug"
                placeholder="Tiêu đề đăng Page..."
              />
            </div>

            {/* 200-300 Word Summary Textarea */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="text-[11px] font-semibold text-emerald-300">
                  03. Nội Dung Tóm Tắt Video ({summaryWordCount} từ · Chuẩn 200–300 từ)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRegeneratePagePost}
                    className="px-2 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded"
                    title="Tự cân chỉnh lại bài tóm tắt chuẩn 200-300 từ từ kịch bản hiện tại"
                  >
                    Làm Mới 250 Từ
                  </button>
                  <button
                    type="button"
                    onClick={() => copyPrompt(customSummaryText, 'copy-post-summary')}
                    className="px-2 py-1 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded flex items-center gap-1 shrink-0"
                  >
                    {copiedField === 'copy-post-summary' ? (
                      <>
                        <Check className="w-3 h-3" />
                        Đã Copy Tóm Tắt!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Tóm Tắt
                      </>
                    )}
                  </button>
                </div>
              </div>

              <textarea
                rows={11}
                value={customSummaryText}
                onChange={(e) => setCustomSummaryText(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-amber-500 leading-relaxed"
                placeholder="Nội dung tóm tắt 200-300 từ..."
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                <span>
                  Độ dài hiện tại: <strong className="text-amber-300">{summaryWordCount} từ</strong>
                  {' · '}
                  <span>
                    {summaryWordCount >= 200 && summaryWordCount <= 300
                      ? 'Đạt chuẩn vàng 200–300 từ đăng Page'
                      : 'Bạn có thể chỉnh sửa trực tiếp hoặc bấm Làm Mới 250 Từ'}
                  </span>
                </span>
              </div>
            </div>

            {/* Hashtags */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-[11px] font-semibold text-sky-300">
                  04. Bộ Hashtag Chuẩn Xu Hướng Kênh Life Legends:
                </label>
                <button
                  type="button"
                  onClick={() => copyPrompt(customHashtags, 'copy-post-hashtags')}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded flex items-center gap-1"
                >
                  {copiedField === 'copy-post-hashtags' ? (
                    <>
                      <Check className="w-3 h-3" />
                      Đã Copy
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy Hashtag
                    </>
                  )}
                </button>
              </div>
              <input
                type="text"
                value={customHashtags}
                onChange={(e) => setCustomHashtags(e.target.value)}
                className="w-full px-2.5 py-1.5 text-[11px] bg-slate-950 border border-slate-700 rounded text-sky-300 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      ) : activeTab === 'thumbnail' ? (
        /* Full Interactive Video Thumbnail Studio Tab */
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          <VideoThumbnailStudio
            scenes={scenes}
            vaultItems={vaultItems}
            settings={settings}
            compactMode={false}
          />
        </div>
      ) : (
        /* Global Subtitle, Music & Brand Crest Settings Tab */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-200 mb-2">
              01. Kiểu Phụ Đề Nhảy Từng Chữ (Karaoke Captions)
            </h3>
            <div className="space-y-3 p-3 rounded-lg bg-[#0B0F17] border border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Ngôn ngữ phụ đề hiển thị trên video
                </label>
                <select
                  value={settings.subtitleLanguage}
                  onChange={(e) =>
                    onUpdateSettings({
                      subtitleLanguage: e.target.value as ProjectSettings['subtitleLanguage'],
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                >
                  <option value="en">Tiếng Anh (EVERY HERO NEEDS A...)</option>
                  <option value="vi">Tiếng Việt (MỖI ANH HÙNG ĐỀU...)</option>
                  <option value="bilingual">Song Ngữ (Anh + Việt bên dưới)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Màu chữ đang đọc
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.activeWordColor}
                      onChange={(e) =>
                        onUpdateSettings({ activeWordColor: e.target.value })
                      }
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border border-slate-700"
                    />
                    <span className="text-xs font-mono-tabular text-slate-300">
                      {settings.activeWordColor}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Số chữ mỗi cụm
                  </label>
                  <select
                    value={settings.wordsPerLine}
                    onChange={(e) =>
                      onUpdateSettings({ wordsPerLine: Number(e.target.value) })
                    }
                    className="w-full px-2 py-1.5 text-xs font-mono-tabular bg-slate-900 border border-slate-700 rounded text-slate-100"
                  >
                    <option value={3}>3 chữ / dòng</option>
                    <option value={4}>4 chữ / dòng (Chuẩn mẫu)</option>
                    <option value={5}>5 chữ / dòng</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-200 mb-2">
              02. Hiệu Ứng Chuyển Cảnh Mượt & Nhạc Nền
            </h3>
            <div className="space-y-3 p-3 rounded-lg bg-[#0B0F17] border border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kiểu chuyển cảnh điện ảnh (Cinema Film Transitions)
                </label>
                <select
                  value={settings.transitionStyle || 'cinema-auto'}
                  onChange={(e) =>
                    onUpdateSettings({
                      transitionStyle: e.target.value as ProjectSettings['transitionStyle'],
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                >
                  <option value="cinema-auto">
                    🎬 Đạo Diễn Điện Ảnh Tự Động (Mượt Như Phim — Khuyên dùng)
                  </option>
                  <option value="crossfade">
                    ✨ Hòa Tan Tiêu Cự Mượt (Optical Focus Dissolve)
                  </option>
                  <option value="film-glow">
                    🎞️ Cháy Sáng Phim Nhựa 35mm (Warm Film Light Leak)
                  </option>
                  <option value="cinema-zoom">
                    🔍 Thu Phóng Tiêu Cự 3D (Smooth Lens Zoom)
                  </option>
                  <option value="cinema-pan">
                    ↔️ Lướt Máy Quay Điện Ảnh (Smooth Whip Pan)
                  </option>
                  <option value="dip-to-black">
                    🌑 Mờ Sâu Qua Đen Điện Ảnh (Velvet Cinema Fade)
                  </option>
                  <option value="cut">
                    ⚡ Cắt Trực Tiếp Làm Mềm Cạnh (Soft Cut)
                  </option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Độ mượt chuyển cảnh (Thời gian hòa trộn)</span>
                  <span className="font-mono-tabular text-amber-400">
                    {(settings.transitionDurationSec ?? 1.2).toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  value={settings.transitionDurationSec ?? 1.2}
                  onChange={(e) =>
                    onUpdateSettings({ transitionDurationSec: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="pt-1 border-t border-slate-800/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-300">
                    Nhạc dạo nền phim tài liệu
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      soundEngine.previewBackgroundMusic(
                        settings.bgMusicStyle,
                        settings.bgMusicVolume,
                        settings.customBgMusicUrl,
                        7000
                      )
                    }
                    className="px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded transition-colors"
                  >
                    🔊 Nghe Thử Nhạc Nền
                  </button>
                </div>
                <select
                  value={settings.bgMusicStyle}
                  onChange={(e) => {
                    const newStyle = e.target.value as ProjectSettings['bgMusicStyle'];
                    onUpdateSettings({ bgMusicStyle: newStyle });
                    soundEngine.previewBackgroundMusic(
                      newStyle,
                      settings.bgMusicVolume,
                      settings.customBgMusicUrl,
                      6000
                    );
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                >
                  <option value="western-acoustic">
                    🎸 Guitar Acoustic &amp; Piano Ấm (Chuẩn Mẫu Will Sampson - Khuyên dùng)
                  </option>
                  <option value="emotional-piano">
                    🎹 Piano &amp; Cello Hoài Niệm Sâu Lắng (Emotional Story)
                  </option>
                  <option value="cinematic-strings">
                    🎻 Dàn Dây Cello &amp; Violin Trầm Hùng (Epic Biography)
                  </option>
                  <option value="vintage-americana">
                    🤠 Guitar Miền Viễn Tây Cổ Điển (Americana 1960s)
                  </option>
                  <option value="custom">
                    📁 Nhạc Nền MP3 Tải Lên Riêng ({settings.customBgMusicUrl ? 'Đã nạp' : 'Chưa chọn'})
                  </option>
                  <option value="none">🔇 Tắt nhạc nền</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Âm lượng nhạc nền</span>
                  <span className="font-mono-tabular text-amber-400">
                    {Math.round(settings.bgMusicVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.8}
                  step={0.02}
                  value={settings.bgMusicVolume}
                  onChange={(e) =>
                    onUpdateSettings({ bgMusicVolume: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-300">
                  Sóng nhạc góc dưới phải & Bụi phim cổ điển
                </span>
                <button
                  onClick={() =>
                    onUpdateSettings({
                      showWaveformBadge: !settings.showWaveformBadge,
                      enableFilmGrain: !settings.enableFilmGrain,
                    })
                  }
                  className={`px-2.5 py-1 text-xs font-semibold rounded ${
                    settings.showWaveformBadge
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {settings.showWaveformBadge ? 'Đang Bật' : 'Đang Tắt'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-200">
                03. Logo Kênh Cố Định Cuối Video (Outro Crest)
              </h3>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    channelTitle: 'LIFE LEGENDS',
                    channelInitials: 'HM',
                    channelMotto: 'THEIR LEGACY. YOUR INSPIRATION.',
                  })
                }
                className="text-[10px] font-semibold text-amber-400 hover:text-amber-300"
              >
                Khóa chuẩn HM
              </button>
            </div>
            <div className="space-y-2.5 p-3 rounded-lg bg-[#0B0F17] border border-slate-800">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
                <img
                  src="/assets/aistudio/image_4653598d.png"
                  alt="LIFE LEGENDS HM"
                  className="w-12 h-14 rounded object-cover border border-amber-500/50 shrink-0"
                />
                <div className="text-[11px] text-slate-300 leading-snug">
                  Đã khóa mặc định logo <strong>LIFE LEGENDS — HM — THEIR LEGACY. YOUR INSPIRATION.</strong> ở cảnh kết thúc của toàn bộ video.
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tên kênh (Vòng cung trên)
                </label>
                <input
                  type="text"
                  value={settings.channelTitle}
                  onChange={(e) =>
                    onUpdateSettings({ channelTitle: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Chữ viết tắt
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={settings.channelInitials}
                    onChange={(e) =>
                      onUpdateSettings({ channelInitials: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-amber-400 font-bold text-center"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Khẩu hiệu (Motto)
                  </label>
                  <input
                    type="text"
                    value={settings.channelMotto}
                    onChange={(e) =>
                      onUpdateSettings({ channelMotto: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
