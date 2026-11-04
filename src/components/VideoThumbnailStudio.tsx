import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Image as ImageIcon,
  Sparkles,
  Copy,
  Check,
  Upload,
  RefreshCw,
  Loader2,
  Eye,
} from 'lucide-react';
import { ProjectSettings, StoryScene, VaultItem } from '../types';
import {
  buildAiThumbnailGenerationPrompt,
  collectAvailableThumbnailImages,
  extractCharacterMetaForThumbnail,
  getThumbnailDimensions,
  getThumbnailHookPresets,
  renderVideoThumbnailToCanvas,
  ThumbnailAspectRatio,
  ThumbnailConfig,
  ThumbnailTemplateStyle,
} from '../utils/videoThumbnailGenerator';

interface VideoThumbnailStudioProps {
  scenes: StoryScene[];
  vaultItems?: VaultItem[];
  settings: ProjectSettings;
  compactMode?: boolean;
  onOpenFullThumbTab?: () => void;
}

export const VideoThumbnailStudio: React.FC<VideoThumbnailStudioProps> = ({
  scenes,
  vaultItems = [],
  settings,
  compactMode = false,
  onOpenFullThumbTab,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);

  const [thumbLang, setThumbLang] = useState<'vi' | 'en'>('vi');
  const [template, setTemplate] = useState<ThumbnailTemplateStyle>('cinema-gold');
  const [ratio, setRatio] = useState<ThumbnailAspectRatio>(
    (settings.aspectRatio as ThumbnailAspectRatio) || '3:4'
  );
  const [topBadgeText, setTopBadgeText] = useState<string>('★ HUYỀN THOẠI MÀN BẠC CHƯA KỂ ★');
  const [characterTitle, setCharacterTitle] = useState<string>('WILL SAMPSON (1933 – 1987)');
  const [hookHeadline, setHookHeadline] = useState<string>(
    'KHÔNG QUA TRƯỜNG LỚP — MỘT VAI DIỄN ĐỂ ĐỜI'
  );
  const [subHookText, setSubHookText] = useState<string>(
    'Từ Chàng Cao Bồi Rodeo Đến Biểu Tượng Bất Tử Của Hollywood'
  );
  const [showTextOverlay, setShowTextOverlay] = useState<boolean>(true);
  const [showChannelBadge, setShowChannelBadge] = useState<boolean>(true);
  const [autoHdrEnhance, setAutoHdrEnhance] = useState<boolean>(true);
  const [selectedBgUrl, setSelectedBgUrl] = useState<string>('');
  const [imageTick, setImageTick] = useState<number>(0);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isGeneratingAiBg, setIsGeneratingAiBg] = useState<boolean>(false);

  const availableImages = collectAvailableThumbnailImages(scenes, vaultItems);
  const hookPresets = getThumbnailHookPresets(scenes, settings, thumbLang);

  // Sync default hook text when project title or language changes
  useEffect(() => {
    const presets = getThumbnailHookPresets(scenes, settings, thumbLang);
    if (presets.length > 0) {
      setTopBadgeText(presets[0].topBadge);
      setCharacterTitle(presets[0].characterTitle);
      setHookHeadline(presets[0].hookHeadline);
      setSubHookText(presets[0].subHookText);
    }
  }, [settings.projectTitle, thumbLang]);

  // Pick first valid portrait image if none selected or when scenes update
  useEffect(() => {
    if (!selectedBgUrl && availableImages.length > 0) {
      setSelectedBgUrl(availableImages[0].url);
    } else if (
      selectedBgUrl &&
      availableImages.length > 0 &&
      !selectedBgUrl.startsWith('blob:') &&
      !selectedBgUrl.startsWith('data:image/png;base64,iVBOR') &&
      !availableImages.some((img) => img.url === selectedBgUrl)
    ) {
      setSelectedBgUrl(availableImages[0].url);
    }
  }, [availableImages, selectedBgUrl]);

  // Load selected background image into HTMLImageElement
  useEffect(() => {
    if (!selectedBgUrl) {
      loadedImageRef.current = null;
      setImageTick((t) => t + 1);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      loadedImageRef.current = img;
      setImageTick((t) => t + 1);
    };
    img.onerror = () => {
      loadedImageRef.current = null;
      setImageTick((t) => t + 1);
    };
    img.src = selectedBgUrl;
  }, [selectedBgUrl]);

  // Render canvas whenever config or loaded image updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const config: ThumbnailConfig = {
      template,
      ratio,
      topBadgeText,
      characterTitle,
      hookHeadline,
      subHookText,
      showTextOverlay,
      showChannelBadge,
      autoHdrEnhance,
      backgroundImageUrl: selectedBgUrl,
    };
    renderVideoThumbnailToCanvas(canvas, config, loadedImageRef.current);
  }, [
    template,
    ratio,
    topBadgeText,
    characterTitle,
    hookHeadline,
    subHookText,
    showTextOverlay,
    showChannelBadge,
    autoHdrEnhance,
    selectedBgUrl,
    imageTick,
  ]);

  const handleDownloadThumbnail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { characterName } = extractCharacterMetaForThumbnail(scenes, settings);
    const safeSlug = characterName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `Thumbnail-${safeSlug || 'video'}-${ratio.replace(':', 'x')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUploadCustomBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedBgUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerateAiPortraitBg = async () => {
    if (isGeneratingAiBg) return;
    setIsGeneratingAiBg(true);
    try {
      const prompt = buildAiThumbnailGenerationPrompt(scenes, settings, ratio);
      const res = await fetch('/api/proxy/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          aspectRatio: ratio,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.imageUrl) {
          setSelectedBgUrl(data.imageUrl);
        }
      }
    } catch {
      // Fallback: cycle to next available image
      if (availableImages.length > 1) {
        const curIdx = availableImages.findIndex((i) => i.url === selectedBgUrl);
        const nextIdx = (curIdx + 1) % availableImages.length;
        setSelectedBgUrl(availableImages[nextIdx].url);
      }
    } finally {
      setIsGeneratingAiBg(false);
    }
  };

  const aiThumbPrompt = buildAiThumbnailGenerationPrompt(scenes, settings, ratio);
  const dimSpec = getThumbnailDimensions(ratio);

  const handleCopyThumbPrompt = () => {
    navigator.clipboard.writeText(aiThumbPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1800);
  };

  return (
    <div className="p-3 rounded-lg bg-[#090D15] border border-amber-500/40 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Ảnh Thumbnail Bìa Video Chuẩn Đẹp ({dimSpec.width}×{dimSpec.height}px)</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Thiết kế tự động theo phong cách điện ảnh Hoàng Kim. Bấm tải PNG nét căng để đăng kèm Video lên Page / YouTube!
          </p>
        </div>
        {compactMode && onOpenFullThumbTab && (
          <button
            type="button"
            onClick={onOpenFullThumbTab}
            className="px-2 py-1 text-[10px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded shrink-0"
          >
            Tùy chỉnh sâu →
          </button>
        )}
      </div>

      {/* Live Canvas Preview + 1-Click Download */}
      <div className="flex flex-col items-center bg-[#05070C] border border-slate-800 rounded-lg p-2.5 space-y-2.5">
        <div
          className="relative w-full flex items-center justify-center overflow-hidden rounded-md shadow-xl border border-amber-500/30 bg-black"
          style={{
            maxHeight: compactMode ? '250px' : '330px',
          }}
        >
          <canvas
            ref={canvasRef}
            className="max-h-[245px] w-auto h-auto object-contain rounded"
          />
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 text-amber-300 border border-amber-500/40">
            {ratio} · {dimSpec.width}×{dimSpec.height}
          </span>
        </div>

        {/* Primary Action Buttons: Download PNG + Switch Photo + Language */}
        <div className="w-full grid grid-cols-1 gap-1.5">
          <button
            type="button"
            onClick={handleDownloadThumbnail}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors shadow-md"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Tải Ảnh Thumbnail Đẹp Nét Căng (.PNG {dimSpec.width}×{dimSpec.height})</span>
          </button>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (availableImages.length === 0) return;
                const curIdx = availableImages.findIndex((i) => i.url === selectedBgUrl);
                const nextIdx = (curIdx + 1) % availableImages.length;
                setSelectedBgUrl(availableImages[nextIdx].url);
              }}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded transition-colors"
              title="Đổi sang ảnh chân dung thật khác của nhân vật trong dự án"
            >
              <RefreshCw className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">Đổi Ảnh Nền ({availableImages.length})</span>
            </button>

            <label className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 rounded cursor-pointer transition-colors">
              <Upload className="w-3 h-3 shrink-0" />
              <span className="truncate">+Tải Ảnh Riêng</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadCustomBg}
                className="hidden"
              />
            </label>

            <button
              type="button"
              disabled={isGeneratingAiBg}
              onClick={handleGenerateAiPortraitBg}
              className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-300 border border-emerald-500/40 rounded transition-colors"
              title="Tạo ảnh chân dung điện ảnh mới bằng AI làm nền Thumbnail"
            >
              {isGeneratingAiBg ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span className="truncate">Đang vẽ...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">Vẽ Nền AI</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Filmstrip of Available Character Photos */}
      {availableImages.length > 1 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>Chọn nhanh ảnh chân dung thật làm nền Thumbnail:</span>
            <label className="flex items-center gap-1 cursor-pointer text-amber-300">
              <input
                type="checkbox"
                checked={autoHdrEnhance}
                onChange={(e) => setAutoHdrEnhance(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span>Tự làm nét &amp; HDR khuôn mặt</span>
            </label>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {availableImages.map((img, idx) => {
              const active = img.url === selectedBgUrl;
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedBgUrl(img.url)}
                  title={img.label}
                  className={`relative w-12 h-12 rounded overflow-hidden shrink-0 border-2 transition-all ${
                    active
                      ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105'
                      : 'border-slate-700 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 px-1 text-[8px] font-bold bg-black/80 text-white">
                    #{idx + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Template Style & Aspect Ratio Selectors */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-semibold text-slate-300 mb-1">
            Kiểu Thiết Kế Thumbnail:
          </label>
          <select
            value={template}
            onChange={(e) => {
              const val = e.target.value as ThumbnailTemplateStyle;
              setTemplate(val);
              if (val === 'clean-portrait') {
                setShowTextOverlay(false);
              } else {
                setShowTextOverlay(true);
              }
            }}
            className="w-full px-2 py-1.5 text-[11px] font-semibold bg-[#0B0F17] border border-slate-700 rounded text-amber-300 focus:outline-none focus:border-amber-500"
          >
            <option value="cinema-gold">✨ Điện Ảnh Hoàng Kim (Chuẩn Kênh)</option>
            <option value="viral-red-bar">🔥 Viral Đỏ-Vàng (Tăng Click Page/YT)</option>
            <option value="vintage-sepia-prestige">🎞️ Hoài Cổ Kinh Điển (Western/Retro)</option>
            <option value="clean-portrait">🖼️ Chỉ Ảnh Chân Dung Nét (Không Chữ)</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-slate-300 mb-1">
            Khung Hình Thumbnail:
          </label>
          <select
            value={ratio}
            onChange={(e) => setRatio(e.target.value as ThumbnailAspectRatio)}
            className="w-full px-2 py-1.5 text-[11px] font-semibold bg-[#0B0F17] border border-slate-700 rounded text-sky-300 focus:outline-none focus:border-amber-500"
          >
            <option value="3:4">3:4 Chuẩn Page / Reels (1080×1440)</option>
            <option value="16:9">16:9 Chuẩn YouTube / FB Ngang (1920×1080)</option>
            <option value="9:16">9:16 Dọc TikTok / Shorts (1080×1920)</option>
            <option value="1:1">1:1 Vuông Bài Đăng (1080×1080)</option>
          </select>
        </div>
      </div>

      {/* Language & Catchy Headline Presets */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-slate-300">
            Chữ Giật Tít Trên Thumbnail:
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setThumbLang('vi')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                thumbLang === 'vi'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              onClick={() => setThumbLang('en')}
              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                thumbLang === 'en'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setShowTextOverlay((v) => !v)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${
                showTextOverlay
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title="Bật/tắt chữ trên Thumbnail"
            >
              <Eye className="w-3 h-3 inline mr-0.5" />
              {showTextOverlay ? 'Có Chữ' : 'Ẩn Chữ'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1">
          {hookPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setShowTextOverlay(true);
                if (template === 'clean-portrait') setTemplate('cinema-gold');
                setTopBadgeText(preset.topBadge);
                setCharacterTitle(preset.characterTitle);
                setHookHeadline(preset.hookHeadline);
                setSubHookText(preset.subHookText);
              }}
              className="px-1.5 py-1 text-[10px] font-semibold bg-slate-900 hover:bg-amber-500/20 text-amber-200 border border-slate-800 hover:border-amber-500/50 rounded truncate transition-colors"
              title={preset.hookHeadline}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Editable Text Inputs (Shown in Full Tab or when Text Overlay is enabled) */}
      {!compactMode && showTextOverlay && (
        <div className="space-y-2 pt-1 border-t border-slate-800/80">
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">
                Nhãn Trên Cùng (Badge):
              </label>
              <input
                type="text"
                value={topBadgeText}
                onChange={(e) => setTopBadgeText(e.target.value)}
                className="w-full px-2 py-1 text-[11px] bg-[#0B0F17] border border-slate-700 rounded text-amber-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-0.5">
                Tên Nhân Vật &amp; Năm Sinh-Mất:
              </label>
              <input
                type="text"
                value={characterTitle}
                onChange={(e) => setCharacterTitle(e.target.value)}
                className="w-full px-2 py-1 text-[11px] font-bold bg-[#0B0F17] border border-slate-700 rounded text-amber-400 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">
              Tiêu Đề Lớn Giật Tít Giữa Thumbnail:
            </label>
            <input
              type="text"
              value={hookHeadline}
              onChange={(e) => setHookHeadline(e.target.value)}
              className="w-full px-2 py-1.5 text-xs font-bold bg-[#0B0F17] border border-slate-700 rounded text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">
              Dòng Phụ Đề Nhỏ Bên Dưới:
            </label>
            <input
              type="text"
              value={subHookText}
              onChange={(e) => setSubHookText(e.target.value)}
              className="w-full px-2 py-1 text-[11px] bg-[#0B0F17] border border-slate-700 rounded text-slate-300 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      )}

      {/* Prompt for AI Thumbnail Generation (Grok / ChatGPT / Kling) */}
      {!compactMode && (
        <div className="pt-2 border-t border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-emerald-400">
              Prompt Vẽ Ảnh Bìa Thumbnail Trên Grok / ChatGPT / Kling:
            </span>
            <button
              type="button"
              onClick={handleCopyThumbPrompt}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded transition-colors"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Đã Copy Prompt</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Prompt Thumbnail</span>
                </>
              )}
            </button>
          </div>
          <p className="p-2 rounded bg-[#0B0F17] border border-slate-800 text-[10px] font-mono text-slate-400 select-all leading-relaxed">
            {aiThumbPrompt}
          </p>
        </div>
      )}
    </div>
  );
};
