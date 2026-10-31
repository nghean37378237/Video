import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  ColorFilter,
  FrameStyle,
  MotionEffect,
  ProjectSettings,
  SceneType,
  StoryScene,
} from '../types';
import { getMediaDuration } from '../utils/frameExtractor';
import {
  buildFullFrameImagePrompt,
  buildFullFrameVideoPrompt,
  downloadFullFrameImageForGrok,
  generateScriptedVideoMotionPrompt,
  getAspectRatioSpec,
  KLING_NEGATIVE_PROMPT,
  VideoScriptStyle,
} from '../utils/fullFrameHelper';
import {
  masterAudioToConsistentStudioWav,
  resolveConsistentSceneText,
  VOICE_PERSONA_PROFILES,
} from '../utils/voiceConsistencyEngine';

interface SceneInspectorProps {
  activeScene: StoryScene | undefined;
  onUpdateScene: (sceneId: string, patch: Partial<StoryScene>) => void;
  onAddScene: (type: SceneType) => void;
  onDeleteScene: (sceneId: string) => void;
  settings: ProjectSettings;
  onUpdateSettings: (patch: Partial<ProjectSettings>) => void;
  onGenerateAllVoiceovers: () => Promise<void>;
  isGeneratingAllTTS: boolean;
  ttsProgressText: string;
  onOpenPromptStudio: () => void;
  onGenerateImageViaProxyForScene?: (scene: StoryScene) => Promise<void>;
  generatingImageSceneId?: string | null;
  onUploadFileForScene?: (sceneId: string, file: File) => void;
}

export const SceneInspector: React.FC<SceneInspectorProps> = ({
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
}) => {
  const [activeTab, setActiveTab] = useState<'scene' | 'style'>('scene');
  const [isGeneratingSceneTTS, setIsGeneratingSceneTTS] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDownloadingFullFrame, setIsDownloadingFullFrame] = useState(false);
  const [isFetchingRealPhoto, setIsFetchingRealPhoto] = useState(false);

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
    if (!activeScene?.mediaUrl || isDownloadingFullFrame) return;
    setIsDownloadingFullFrame(true);
    try {
      await downloadFullFrameImageForGrok(
        activeScene.mediaUrl,
        activeScene.mediaKind,
        settings.aspectRatio,
        `Canh-${String(activeScene.order).padStart(2, '0')}-KlingAI`
      );
    } finally {
      setIsDownloadingFullFrame(false);
    }
  };

  const activeVoiceLang: 'vi' | 'en' =
    settings.voiceLanguage ||
    (settings.subtitleLanguage === 'en' ? 'en' : 'vi');

  const handleGenerateSceneTTS = async () => {
    if (!activeScene) return;
    setIsGeneratingSceneTTS(true);
    setTtsError(null);

    const voiceName = settings.ttsVoice || 'Charon';
    const persona = VOICE_PERSONA_PROFILES[voiceName] || VOICE_PERSONA_PROFILES.Charon;
    const textToSpeak = resolveConsistentSceneText(activeScene, activeVoiceLang);

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voiceName,
          language: activeVoiceLang,
          preferredEngine: settings.lockedTtsEngine,
          style: persona.geminiAnchorPrompt,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Không thể tạo giọng đọc AI.');
      }

      const engineUsed = data.engine || settings.lockedTtsEngine || 'standard-locked';
      try {
        const { masteredAudioUrl, durationSec } = await masterAudioToConsistentStudioWav(
          data.audioDataUrl,
          voiceName,
          engineUsed
        );
        onUpdateScene(activeScene.id, {
          voiceoverUrl: masteredAudioUrl,
          voiceEngineUsed: `${voiceName}:${activeVoiceLang}:${engineUsed}`,
          durationSec: Math.max(4, Math.ceil(durationSec * 10) / 10 + 0.35),
        });
      } catch {
        const exactDur = await getMediaDuration(data.audioDataUrl, 'audio');
        onUpdateScene(activeScene.id, {
          voiceoverUrl: data.audioDataUrl,
          voiceEngineUsed: `${voiceName}:${activeVoiceLang}:${engineUsed}`,
          durationSec: Math.max(4, Math.ceil(exactDur * 10) / 10 + 0.35),
        });
      }

      onUpdateSettings({
        audioMode: 'stitched-scenes',
        voiceLanguage: activeVoiceLang,
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
      <div className="p-3 border-b border-slate-800/80">
        <div className="flex items-center gap-1 p-1 bg-[#0B0F17] rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('scene')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'scene'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Cảnh #{activeScene?.order || 1} & Prompt
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'style'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TypeIcon className="w-3.5 h-3.5" />
            Phụ Đề Vàng & Huy Hiệu
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
                step={0.5}
                value={activeScene.durationSec}
                onChange={(e) =>
                  onUpdateScene(activeScene.id, {
                    durationSec: Math.max(2, parseFloat(e.target.value) || 5),
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

          {/* Ready-to-Copy Full-Frame Image & Video Prompts + Keyframe Image for this Segment */}
          {(activeScene.sceneType === 'video' || activeScene.sceneType === 'image') && (
            <div className="p-3 rounded-lg bg-[#090D15] border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-400">
                  {activeScene.sceneType === 'video'
                    ? `🎥 ẢNH GỐC & PROMPT VIDEO FULL KHUNG ${ratioSpec.ratio} (${ratioSpec.width}×${ratioSpec.height}):`
                    : `🖼️ ẢNH & PROMPT FULL KHUNG ${ratioSpec.ratio} (${ratioSpec.width}×${ratioSpec.height}):`}
                </span>
              </div>

              {/* Visual Full-Frame Reference Keyframe Preview */}
              {activeScene.mediaUrl && (
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#0B0F17] border border-slate-800">
                  <div
                    style={{ aspectRatio: ratioSpec.cssAspect }}
                    className="w-16 shrink-0 rounded overflow-hidden bg-black border border-slate-700 relative"
                  >
                    {activeScene.mediaKind === 'video' ? (
                      <video
                        src={activeScene.mediaUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <img
                        src={activeScene.mediaUrl}
                        alt={activeScene.title}
                        className="w-full h-full object-cover object-top"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold text-slate-200 truncate">
                      Ảnh Gốc Full Khung {ratioSpec.ratio} ({ratioSpec.width}×{ratioSpec.height}px)
                    </p>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Bấm tải ảnh chuẩn kích thước này đưa vào <strong>Kling AI (Image-to-Video)</strong> để tạo chuyển động người nổi tiếng mượt mà, không bị chặn.
                    </p>
                  </div>
                </div>
              )}

              {/* Direct 1-Click Upload / Replace New Image or Video into this Scene */}
              {onUploadFileForScene && (
                <label className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md cursor-pointer transition-colors shadow-sm">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chèn / Thay Ảnh Hoặc Video Mới Vào Cảnh #{activeScene.order}</span>
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

              {/* Quick Actions for Full-Frame Keyframe Image */}
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

              {activeScene.mediaUrl && (
                <button
                  onClick={handleDownloadFullFrame}
                  disabled={isDownloadingFullFrame}
                  className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded-md transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isDownloadingFullFrame
                    ? 'Đang xuất ảnh chuẩn...'
                    : `Tải Ảnh ${ratioSpec.width}×${ratioSpec.height}px Đưa Sang Kling AI Tạo Video`}
                </button>
              )}

              {/* Image Generation Prompt Box (Full-Frame) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-emerald-400">
                    1. Prompt Ảnh Gốc Full Khung ({ratioSpec.ratio} - {ratioSpec.width}×{ratioSpec.height}px):
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
                        Đã Copy Full {ratioSpec.ratio}
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

              {/* Video Animation Prompt Box (3-Beat Scripted Full-Frame for KLING AI) */}
              <div className="space-y-1.5 pt-1.5 border-t border-slate-800/80">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-sky-400">
                    2. Kịch Bản Video KLING AI 3 Nhịp (Chuẩn Người Nổi Tiếng):
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
                          Đã Copy Prompt Kling
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy Prompt Kling {ratioSpec.ratio}
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => copyPrompt(KLING_NEGATIVE_PROMPT, 'neg-vid')}
                      title="Copy Negative Prompt cho Kling AI để giữ nguyên khuôn mặt không bị biến dạng"
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

                {/* Quick 1-Click Scripted Motion Style Presets for Kling AI */}
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'narrative-hook', label: '🎬 Kling Tự sự & Nhép môi' },
                      { id: 'cinematic-action', label: '🐎 Kling Hành động' },
                      { id: 'emotional-closeup', label: '🌅 Kling Nội tâm' },
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
                  placeholder={`Kịch bản 3 nhịp [0-2s] -> [2-4s] -> [4-6s] cho Kling AI Image-to-Video Full Khung ${ratioSpec.ratio}...`}
                  className="w-full p-2 text-[11px] font-mono bg-[#0B0F17] border border-slate-800 rounded text-slate-300 leading-relaxed focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400 leading-snug">
                  💡 <strong>Chuẩn Kling AI Người Nổi Tiếng:</strong> Tải <em>Ảnh Gốc Full Khung</em> ở trên thả vào mục <strong>Image to Video</strong> của Kling AI + Dán Prompt này (đã tự động ẩn tên nhạy cảm & khóa giữ nguyên 100% khuôn mặt từ ảnh gốc).
                </p>
              </div>
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

          {/* AI Documentary Voiceover Generator & Custom Audio Upload */}
          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                Voice Đồng Nhất Từ Đầu Đến Cuối
              </span>
              {activeScene.voiceoverUrl && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                  <CheckCircle2 className="w-3 h-3" />
                  Đã chuẩn hóa ({activeScene.durationSec}s)
                </span>
              )}
            </div>

            <div className="px-2.5 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] text-emerald-300 leading-relaxed">
              🔒 Khóa đồng nhất 100%: Toàn bộ các cảnh dùng chung 1 giọng, 1 ngôn ngữ, cùng tốc độ và chuẩn hóa âm lượng phòng thu (-16 LUFS) xuyên suốt.
            </div>

            {/* Locked Voice Language + Voice Persona Selector */}
            <div className="grid grid-cols-5 gap-1.5">
              <select
                value={activeVoiceLang}
                onChange={(e) =>
                  onUpdateSettings({
                    voiceLanguage: e.target.value as 'vi' | 'en',
                  })
                }
                title="Khóa ngôn ngữ giọng đọc xuyên suốt từ đầu đến cuối"
                className="col-span-2 px-2 py-1.5 text-xs font-semibold bg-slate-900 border border-slate-700 rounded text-amber-300"
              >
                <option value="vi">🇻🇳 Đọc Tiếng Việt</option>
                <option value="en">🇺🇸 Đọc Tiếng Anh</option>
              </select>

              <select
                value={settings.ttsVoice}
                onChange={(e) =>
                  onUpdateSettings({
                    ttsVoice: e.target.value as ProjectSettings['ttsVoice'],
                  })
                }
                className="col-span-3 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200"
              >
                <option value="Charon">Charon (Nam trầm ấm Documentary)</option>
                <option value="Fenrir">Fenrir (Nam trầm uy nghiêm)</option>
                <option value="Puck">Puck (Truyền cảm tự nhiên)</option>
                <option value="Kore">Kore (Nữ dịu dàng sâu lắng)</option>
                <option value="Zephyr">Zephyr (Nữ trong trẻo kể chuyện)</option>
              </select>
            </div>

            {/* 1-Click Generate & Lock Uniform AI Voiceover for ALL scenes */}
            <button
              onClick={onGenerateAllVoiceovers}
              disabled={isGeneratingAllTTS}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {isGeneratingAllTTS ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-950" />
                  {ttsProgressText || 'Đang đồng bộ giọng đọc xuyên suốt...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Đồng Bộ Voice Đồng Nhất Từ Đầu Đến Cuối (1 Click)
                </>
              )}
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={handleGenerateSceneTTS}
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
                    Thu Lại Riêng Cảnh #{activeScene.order} (Giữ Đồng Nhất)
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
                  Kiểu chuyển cảnh giữa các đoạn (Smooth Transitions)
                </label>
                <select
                  value={settings.transitionStyle || 'crossfade'}
                  onChange={(e) =>
                    onUpdateSettings({
                      transitionStyle: e.target.value as ProjectSettings['transitionStyle'],
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                >
                  <option value="crossfade">
                    Mượt Đan Xen (Cross-Dissolve 60fps — Khuyên dùng)
                  </option>
                  <option value="dip-to-black">
                    Mờ Qua Đen Điện Ảnh (Cinema Dip-to-Black)
                  </option>
                  <option value="film-glow">
                    Ánh Chớp Phim Cổ Điển (Vintage Film Glow)
                  </option>
                  <option value="cut">
                    Cắt Trực Tiếp Làm Mềm Cạnh (Soft Cut)
                  </option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Độ mượt chuyển cảnh (Thời gian hòa trộn)</span>
                  <span className="font-mono-tabular text-amber-400">
                    {(settings.transitionDurationSec ?? 0.75).toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={1.5}
                  step={0.05}
                  value={settings.transitionDurationSec ?? 0.75}
                  onChange={(e) =>
                    onUpdateSettings({ transitionDurationSec: parseFloat(e.target.value) })
                  }
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div className="pt-1 border-t border-slate-800/80">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Giai điệu nhạc nền (Khi ghép video mới)
                </label>
                <select
                  value={settings.bgMusicStyle}
                  onChange={(e) =>
                    onUpdateSettings({
                      bgMusicStyle: e.target.value as ProjectSettings['bgMusicStyle'],
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100"
                >
                  <option value="western-acoustic">
                    Guitar Acoustic Thảo Nguyên (Phong cách Western)
                  </option>
                  <option value="emotional-piano">
                    Piano Trầm Lắng Tự Sự (Emotional Story)
                  </option>
                  <option value="none">Tắt nhạc nền</option>
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
