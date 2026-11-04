import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  Film,
  Image as ImageIcon,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Scissors,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ProjectSettings, StoryScene, VaultItem } from '../types';
import { buildStandardKlingDrawPrompt } from '../utils/fullFrameHelper';
import { captureRealVideoFrameThumbnail } from '../utils/realActorVideoTrimmer';

export interface SceneVideoOption {
  id: string;
  mediaKind: 'video';
  title: string;
  videoUrl: string;
  dataUrl: string;
  trimStartSec: number;
  trimEndSec: number;
  width: number;
  height: number;
  year?: number | null;
  sourceLabel?: string;
}

export interface ScenePhotoOption {
  id: string;
  mediaKind: 'image';
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  year?: number | null;
}

interface SceneMediaSearchModalProps {
  isOpen: boolean;
  scene: StoryScene | null;
  totalScenes: number;
  characterName: string;
  settings: ProjectSettings;
  vaultItems: VaultItem[];
  onClose: () => void;
  onSelectVideoForScene: (
    sceneId: string,
    videoOpt: SceneVideoOption,
    customTrimStartSec: number,
    customTrimEndSec: number
  ) => void;
  onSelectPhotoForScene: (
    sceneId: string,
    photoOpt: ScenePhotoOption,
    mode: 'keep-video-grok-ref' | 'set-as-image-scene'
  ) => void;
  onUploadLocalFileForScene?: (sceneId: string, file: File) => void;
}

export const SceneMediaSearchModal: React.FC<SceneMediaSearchModalProps> = ({
  isOpen,
  scene,
  characterName,
  vaultItems,
  onClose,
  onSelectVideoForScene,
  onSelectPhotoForScene,
  onUploadLocalFileForScene,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'video' | 'image'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [cycleOffset, setCycleOffset] = useState<number>(0);
  const [videoOptions, setVideoOptions] = useState<SceneVideoOption[]>([]);
  const [photoOptions, setPhotoOptions] = useState<ScenePhotoOption[]>([]);
  const [customTrimStarts, setCustomTrimStarts] = useState<Record<string, number>>({});

  const cleanCharName = characterName.split('—')[0].split('-')[0].trim() || 'Will Sampson';
  const sceneDur = Math.max(5, Math.round(scene?.durationSec || 8));

  // Build smart keyword chips tailored to the selected scene
  const suggestedQueries = React.useMemo(() => {
    if (!scene) return [cleanCharName];
    const list: string[] = [cleanCharName];
    if (scene.archivalKeywords && scene.archivalKeywords.trim()) {
      list.push(scene.archivalKeywords.trim());
    }
    const lowerChar = cleanCharName.toLowerCase();
    if (lowerChar.includes('will sampson')) {
      list.push(
        `${cleanCharName} One Flew Over the Cuckoo's Nest`,
        `${cleanCharName} The Outlaw Josey Wales`,
        `${cleanCharName} White Buffalo 1977`,
        `${cleanCharName} portrait 1975`,
        `Rodeo cowboy bronc riding 1970s`,
        `Muscogee Creek Oklahoma historical`
      );
    } else if (lowerChar.includes('lorne greene')) {
      list.push(
        `${cleanCharName} Bonanza Ben Cartwright`,
        `${cleanCharName} Ponderosa portrait`,
        `${cleanCharName} Battlestar Galactica`
      );
    } else if (lowerChar.includes('clayton moore')) {
      list.push(
        `${cleanCharName} The Lone Ranger`,
        `${cleanCharName} Western cowboy mask`,
        `${cleanCharName} Silver horse`
      );
    } else if (lowerChar.includes('yul brynner')) {
      list.push(
        `${cleanCharName} The Magnificent Seven`,
        `${cleanCharName} The King and I`,
        `${cleanCharName} Ten Commandments`
      );
    } else {
      list.push(
        `${cleanCharName} portrait`,
        `${cleanCharName} movie still`,
        `${cleanCharName} young`,
        `${cleanCharName} classic film`
      );
    }
    return Array.from(new Set(list)).slice(0, 7);
  }, [scene, cleanCharName]);

  const executeSearch = async (queryToRun: string, nextCycle = 0) => {
    if (!scene) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/archival/search-scene-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryToRun.trim() || cleanCharName,
          characterName: cleanCharName,
          sceneDurationSec: sceneDur,
          limit: 12,
          cycleOffset: nextCycle,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const vids: SceneVideoOption[] = Array.isArray(data?.videoOptions) ? data.videoOptions : [];
        const imgs: ScenePhotoOption[] = Array.isArray(data?.photoOptions) ? data.photoOptions : [];
        setVideoOptions(vids);
        setPhotoOptions(imgs);

        const initialTrims: Record<string, number> = {};
        vids.forEach((v) => {
          initialTrims[v.id] = v.trimStartSec;
        });
        setCustomTrimStarts(initialTrims);

        // Background frame extraction so each video option displays its true video frame at trimStartSec
        vids.slice(0, 4).forEach((v) => {
          captureRealVideoFrameThumbnail(v.videoUrl, v.trimStartSec, 7500).then((frameUrl) => {
            if (!frameUrl) return;
            setVideoOptions((prev) =>
              prev.map((item) => (item.id === v.id ? { ...item, dataUrl: frameUrl } : item))
            );
          });
        });
      }
    } catch {
      // Keep existing options
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger initial search whenever modal opens for a scene
  useEffect(() => {
    if (isOpen && scene) {
      const defaultQuery = scene.archivalKeywords?.trim() || cleanCharName;
      setSearchQuery(defaultQuery);
      setFilterTab('all');
      setCycleOffset(0);
      executeSearch(defaultQuery, 0);
    }
  }, [isOpen, scene?.id]);

  if (!isOpen || !scene) return null;

  const sceneNumLabel = `#${String(scene.order).padStart(2, '0')}`;

  // Also include project's existing vault images so user can pick from already-fetched items
  const vaultPhotoExtras: ScenePhotoOption[] = vaultItems
    .filter((v) => v.type === 'image' && v.url)
    .slice(0, 6)
    .map((v) => ({
      id: `vault-extra-${v.id}`,
      mediaKind: 'image',
      title: v.name,
      dataUrl: v.url,
      width: v.width || 720,
      height: v.height || 900,
    }));

  const combinedPhotos = [
    ...photoOptions,
    ...vaultPhotoExtras.filter((vp) => !photoOptions.some((po) => po.dataUrl === vp.dataUrl)),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[90vh] bg-[#0B0F17] border border-slate-700/90 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 bg-[#111827] border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500 text-slate-950">
                Cảnh {sceneNumLabel} · {sceneDur}s
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                  scene.sceneType === 'video'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {scene.sceneType === 'video' ? '🎬 ĐOẠN VIDEO' : '🖼️ ĐOẠN ẢNH'}
              </span>
              <h2 className="text-sm font-bold text-slate-100 truncate">
                Tìm &amp; Đổi Ảnh / Video Thật Khác Cho Cảnh {sceneNumLabel}: {scene.title}
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">
              Nội dung lời đọc: <span className="text-amber-200/90 italic">"{scene.narrationText}"</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onUploadLocalFileForScene && (
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Tải File Từ Máy Vào Cảnh {sceneNumLabel}</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      onUploadLocalFileForScene(scene.id, f);
                      e.target.value = '';
                      onClose();
                    }
                  }}
                  className="hidden"
                />
              </label>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Bar + Suggested Keyword Chips */}
        <div className="px-5 py-3 bg-[#0E1420] border-b border-slate-800/80 space-y-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSearch(searchQuery, cycleOffset);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nhập từ khóa tìm ảnh hoặc video (VD: Will Sampson, Cuckoo's Nest, The Outlaw Josey Wales, Rodeo cowboy...)"
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#070A10] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-colors shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tìm...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Tìm Ảnh &amp; Video</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                const next = cycleOffset + 1;
                setCycleOffset(next);
                executeSearch(searchQuery, next);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-300 border border-sky-500/40 transition-colors shrink-0"
              title="Đổi sang các đoạn cắt giây khác của phim và lấy thêm bộ ảnh mới"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đổi Góc Cắt &amp; Lô Khác</span>
            </button>
          </form>

          {/* Quick Keyword Suggestions + Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">Gợi ý tìm nhanh:</span>
              {suggestedQueries.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setSearchQuery(q);
                    executeSearch(q, cycleOffset);
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                    searchQuery === q
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                  filterTab === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất Cả ({videoOptions.length + combinedPhotos.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('video')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                  filterTab === 'video' ? 'bg-sky-500 text-slate-950' : 'text-sky-300 hover:text-sky-200'
                }`}
              >
                🎬 Đoạn Video Thật ({videoOptions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('image')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                  filterTab === 'image'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-emerald-300 hover:text-emerald-200'
                }`}
              >
                📸 Ảnh Thật ({combinedPhotos.length})
              </button>
            </div>
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-300 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              <p className="text-xs font-semibold">
                Đang tìm kiếm các đoạn Video Thật &amp; Ảnh Tư Liệu Sạch Chữ cho "{searchQuery}"...
              </p>
            </div>
          ) : (
            <>
              {/* 1. Real Trimmed Video Options */}
              {(filterTab === 'all' || filterTab === 'video') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-sky-400" />
                      <span>
                        1. Chọn Đoạn Cắt Video Thật ({videoOptions.length} đoạn — Có thể chỉnh giây bắt đầu cắt tùy ý)
                      </span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Thời lượng Cảnh {sceneNumLabel}: <strong className="text-amber-300">{sceneDur} giây</strong>
                    </span>
                  </div>

                  {videoOptions.length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                      Không tìm thấy cuộn video công khai khớp từ khóa này. Bạn có thể chọn một <strong>Ảnh Thật</strong> bên dưới để làm <strong>Ảnh Gốc + Prompt vẽ video từ Grok / Kling AI</strong>!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {videoOptions.map((vid, idx) => {
                        const startSec = customTrimStarts[vid.id] ?? vid.trimStartSec;
                        const endSec = startSec + sceneDur;
                        const cleanStreamUrl = vid.videoUrl.split('#')[0];

                        return (
                          <div
                            key={vid.id}
                            className="rounded-lg bg-[#111827] border border-sky-500/40 hover:border-sky-400 p-3 flex flex-col justify-between gap-2.5 transition-all"
                          >
                            <div className="space-y-2">
                              <div className="relative h-36 rounded-md overflow-hidden bg-black border border-slate-800">
                                <video
                                  src={`${cleanStreamUrl}#t=${startSec},${endSec}`}
                                  poster={vid.dataUrl || undefined}
                                  controls
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="w-full h-full object-cover"
                                />
                                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-600/90 text-white">
                                  ✂️ Đoạn #{idx + 1}: {startSec}s → {endSec}s
                                </span>
                              </div>

                              <p className="text-xs font-bold text-slate-100 line-clamp-1" title={vid.title}>
                                {vid.title}
                              </p>

                              {/* Custom Trim Start Second Selector */}
                              <div className="flex items-center justify-between gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                <span className="text-slate-300 flex items-center gap-1">
                                  <Scissors className="w-3 h-3 text-amber-400" />
                                  <span>Cắt từ giây:</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={14}
                                    max={900}
                                    step={5}
                                    value={startSec}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value || '18', 10));
                                      setCustomTrimStarts((prev) => ({ ...prev, [vid.id]: val }));
                                    }}
                                    className="w-16 px-1.5 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-amber-300"
                                  />
                                  <span className="text-slate-400 font-mono">→ {endSec}s</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                onSelectVideoForScene(scene.id, vid, startSec, endSec);
                                onClose();
                              }}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Chèn Đoạn Video Này Vào Cảnh {sceneNumLabel}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Real Photo Options */}
              {(filterTab === 'all' || filterTab === 'image') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span>
                        2. Chọn Ảnh Thật Sạch Chữ Khác ({combinedPhotos.length} ảnh — Dùng làm Đoạn Ảnh hoặc Ảnh Gốc Vẽ Video Grok/Kling)
                      </span>
                    </h3>
                  </div>

                  {combinedPhotos.length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                      Chưa tìm thấy ảnh khớp từ khóa "{searchQuery}". Hãy bấm vào các từ khóa gợi ý phía trên hoặc thử từ khóa ngắn hơn!
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {combinedPhotos.map((photo, idx) => (
                        <div
                          key={photo.id}
                          className="rounded-lg bg-[#111827] border border-slate-800 hover:border-emerald-400/70 p-2.5 flex flex-col justify-between gap-2 transition-all"
                        >
                          <div className="space-y-1.5">
                            <div className="relative h-36 rounded overflow-hidden bg-black border border-slate-800">
                              <img
                                src={photo.dataUrl}
                                alt={photo.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-600/90 text-white">
                                Ảnh #{idx + 1}
                              </span>
                            </div>
                            <p
                              className="text-[11px] font-semibold text-slate-200 line-clamp-1"
                              title={photo.title}
                            >
                              {photo.title}
                            </p>
                          </div>

                          <div className="space-y-1">
                            {scene.sceneType === 'video' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectPhotoForScene(scene.id, photo, 'keep-video-grok-ref');
                                    onClose();
                                  }}
                                  className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[10px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors"
                                  title="Gắn ảnh này làm Ảnh Gốc tham chiếu + giữ nguyên bộ Prompt để bạn vẽ video trên Grok / Kling AI"
                                >
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span className="truncate">Làm Ảnh Gốc + Prompt Grok/Kling</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectPhotoForScene(scene.id, photo, 'set-as-image-scene');
                                    onClose();
                                  }}
                                  className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-colors"
                                >
                                  <ImageIcon className="w-3 h-3 shrink-0" />
                                  <span className="truncate">Dùng Làm Ảnh Tĩnh Cảnh {sceneNumLabel}</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectPhotoForScene(scene.id, photo, 'set-as-image-scene');
                                    onClose();
                                  }}
                                  className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">Chọn Ảnh Này Cho Cảnh {sceneNumLabel}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectPhotoForScene(scene.id, photo, 'keep-video-grok-ref');
                                    onClose();
                                  }}
                                  className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 transition-colors"
                                >
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span className="truncate">Đổi Sang Đoạn Video (Grok/Kling)</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
