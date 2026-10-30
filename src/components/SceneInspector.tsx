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
  getAspectRatioSpec,
} from '../utils/fullFrameHelper';

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
}) => {
  const [activeTab, setActiveTab] = useState<'scene' | 'style'>('scene');
  const [isGeneratingSceneTTS, setIsGeneratingSceneTTS] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isDownloadingFullFrame, setIsDownloadingFullFrame] = useState(false);

  const ratioSpec = getAspectRatioSpec(settings.aspectRatio);

  const copyPrompt = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleDownloadFullFrame = async () => {
    if (!activeScene?.mediaUrl || isDownloadingFullFrame) return;
    setIsDownloadingFullFrame(true);
    try {
      await downloadFullFrameImageForGrok(
        activeScene.mediaUrl,
        activeScene.mediaKind,
        settings.aspectRatio,
        `Canh-${String(activeScene.order).padStart(2, '0')}-Grok`
      );
    } finally {
      setIsDownloadingFullFrame(false);
    }
  };

  const handleGenerateSceneTTS = async () => {
    if (!activeScene) return;
    setIsGeneratingSceneTTS(true);
    setTtsError(null);

    const textToSpeak =
      settings.subtitleLanguage === 'vi' && activeScene.translationText
        ? activeScene.translationText
        : activeScene.narrationText;

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voiceName: settings.ttsVoice,
          style: 'Deep, warm, calm documentary storyteller voice with emotional gravitas',
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.audioDataUrl) {
        throw new Error(data.error || 'Không thể tạo giọng đọc AI.');
      }

      const exactDur = await getMediaDuration(data.audioDataUrl, 'audio');
      onUpdateScene(activeScene.id, {
        voiceoverUrl: data.audioDataUrl,
        durationSec: Math.max(4, Math.ceil(exactDur * 10) / 10 + 0.4),
      });
      onUpdateSettings({ audioMode: 'stitched-scenes' });
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
                <option value="outro">🦅 LOGO KẾT (Huy hiệu Life Legends)</option>
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

          {/* Ready-to-Copy Full-Frame Image & Video Prompts + Keyframe Image for this Segment */}
          {(activeScene.sceneType === 'video' || activeScene.sceneType === 'image') && (
            <div className="p-3 rounded-lg bg-[#090D15] border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-400">
                  {activeScene.sceneType === 'video'
                    ? `🎥 ẢNH GỐC & PROMPT VIDEO FULL KHUNG ${ratioSpec.ratio} (${ratioSpec.width}×${ratioSpec.height}):`
                    : `🖼️ ẢNH & PROMPT FULL KHUNG ${ratioSpec.ratio} (${ratioSpec.width}×{ratioSpec.height}):`}
                </span>
              </div>

              {/* Quick Actions for Full-Frame Keyframe Image */}
              <div className="grid grid-cols-2 gap-1.5">
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
                        Vẽ Ảnh Gốc {ratioSpec.ratio}
                      </>
                    )}
                  </button>
                )}

                {activeScene.mediaUrl && (
                  <button
                    onClick={handleDownloadFullFrame}
                    disabled={isDownloadingFullFrame}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded-md transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    {isDownloadingFullFrame
                      ? 'Đang xuất...'
                      : `Tải Ảnh ${ratioSpec.width}×${ratioSpec.height} Cho Grok`}
                  </button>
                )}
              </div>

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

              {/* Video Animation Prompt Box (Full-Frame) */}
              <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-sky-400">
                    2. Prompt Tạo Video Grok Full Khung ({ratioSpec.ratio} - {ratioSpec.width}×{ratioSpec.height}px):
                  </span>
                  <button
                    onClick={() =>
                      copyPrompt(
                        buildFullFrameVideoPrompt(
                          activeScene.videoMotionPrompt,
                          activeScene.imagePrompt || activeScene.visualPrompt,
                          settings.aspectRatio
                        ),
                        'vid'
                      )
                    }
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 rounded transition-colors"
                  >
                    {copiedField === 'vid' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        Đã Copy Full {ratioSpec.ratio}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Prompt Grok {ratioSpec.ratio}
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={buildFullFrameVideoPrompt(
                    activeScene.videoMotionPrompt,
                    activeScene.imagePrompt || activeScene.visualPrompt,
                    settings.aspectRatio
                  )}
                  onChange={(e) =>
                    onUpdateScene(activeScene.id, { videoMotionPrompt: e.target.value })
                  }
                  placeholder={`Prompt tiếng Anh tạo Video Grok Full Khung ${ratioSpec.ratio}...`}
                  className="w-full p-2 text-[11px] font-mono bg-[#0B0F17] border border-slate-800 rounded text-slate-300 focus:outline-none focus:border-amber-500"
                />
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

          {/* AI Documentary Voiceover Generator */}
          <div className="p-3 rounded-lg bg-[#0B0F17] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-amber-400" />
                Giọng Đọc Thuyết Minh AI (Gemini TTS)
              </span>
              {activeScene.voiceoverUrl && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Đã có giọng đọc
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={settings.ttsVoice}
                onChange={(e) =>
                  onUpdateSettings({
                    ttsVoice: e.target.value as ProjectSettings['ttsVoice'],
                  })
                }
                className="flex-1 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200"
              >
                <option value="Charon">Charon (Trầm ấm Documentary)</option>
                <option value="Fenrir">Fenrir (Nam trầm uy nghiêm)</option>
                <option value="Puck">Puck (Truyền cảm tự nhiên)</option>
                <option value="Kore">Kore (Nữ dịu dàng sâu lắng)</option>
                <option value="Zephyr">Zephyr (Trong trẻo kể chuyện)</option>
              </select>

              <button
                onClick={handleGenerateSceneTTS}
                disabled={isGeneratingSceneTTS}
                className="px-2.5 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                {isGeneratingSceneTTS ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    Đọc Cảnh Này
                  </>
                )}
              </button>
            </div>

            {ttsError && <p className="text-[11px] text-rose-400">{ttsError}</p>}

            <button
              onClick={onGenerateAllVoiceovers}
              disabled={isGeneratingAllTTS}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded border border-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              {isGeneratingAllTTS ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  {ttsProgressText || 'Đang tạo giọng đọc toàn bộ...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Tạo Giọng Đọc Cho Toàn Bộ Các Cảnh
                </>
              )}
            </button>
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
              02. Nhạc Nền Documentary & Hiệu Ứng Phim
            </h3>
            <div className="space-y-3 p-3 rounded-lg bg-[#0B0F17] border border-slate-800">
              <div>
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
            <h3 className="text-xs font-semibold text-slate-200 mb-2">
              03. Huy Hiệu Kênh Cuối Video (Outro Crest)
            </h3>
            <div className="space-y-2.5 p-3 rounded-lg bg-[#0B0F17] border border-slate-800">
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
