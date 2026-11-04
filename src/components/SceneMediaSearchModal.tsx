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
  Play,
  Youtube,
  CheckSquare,
  Square,
} from 'lucide-react';
import { ProjectSettings, StoryScene, VaultItem } from '../types';
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

export interface YouTubeSearchVideoItem {
  id: string;
  youtubeId: string;
  dmId: string;
  archiveMp4Url: string;
  title: string;
  channel: string;
  durationSec: number;
  durationLabel: string;
  viewsLabel: string;
  thumbnailUrl: string;
  youtubeUrl: string;
  suggestedTrimStartSec: number;
}

export interface CutYouTubeResultItem {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  trimStartSec: number;
  trimEndSec: number;
  originalStartSec: number;
  originalEndSec: number;
  durationSec: number;
  width: number;
  height: number;
  sourceLabel: string;
}

interface SceneMediaSearchModalProps {
  isOpen: boolean;
  scene: StoryScene | null;
  initialTab?: 'youtube' | 'all' | 'video' | 'image';
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
  onInsertCutYouTubeClips?: (
    cuts: CutYouTubeResultItem[],
    targetSceneId?: string | null
  ) => void;
  onUploadLocalFileForScene?: (sceneId: string, file: File) => void;
}

export const SceneMediaSearchModal: React.FC<SceneMediaSearchModalProps> = ({
  isOpen,
  scene,
  initialTab = 'youtube',
  characterName,
  vaultItems,
  onClose,
  onSelectVideoForScene,
  onSelectPhotoForScene,
  onInsertCutYouTubeClips,
  onUploadLocalFileForScene,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'youtube' | 'all' | 'video' | 'image'>(initialTab);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCuttingYouTube, setIsCuttingYouTube] = useState<boolean>(false);
  const [cycleOffset, setCycleOffset] = useState<number>(0);

  // YouTube search results & multi-select state
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeSearchVideoItem[]>([]);
  const [selectedYtIds, setSelectedYtIds] = useState<string[]>([]);
  const [ytTrimStarts, setYtTrimStarts] = useState<Record<string, number>>({});
  const [previewingYtId, setPreviewingYtId] = useState<string | null>(null);

  // Archival video & photo results
  const [videoOptions, setVideoOptions] = useState<SceneVideoOption[]>([]);
  const [photoOptions, setPhotoOptions] = useState<ScenePhotoOption[]>([]);
  const [customTrimStarts, setCustomTrimStarts] = useState<Record<string, number>>({});

  const cleanCharName = characterName.split('—')[0].split('-')[0].trim() || 'Will Sampson';
  const sceneDur = Math.max(5, Math.round(scene?.durationSec || 9));

  const suggestedQueries = React.useMemo(() => {
    const list: string[] = [cleanCharName];
    if (scene?.archivalKeywords && scene.archivalKeywords.trim()) {
      list.push(scene.archivalKeywords.trim());
    }
    const lowerChar = cleanCharName.toLowerCase();
    if (lowerChar.includes('will sampson')) {
      list.push(
        `Will Sampson One Flew Over the Cuckoo's Nest`,
        `Will Sampson The Outlaw Josey Wales`,
        `Will Sampson Interview 1975`,
        `Will Sampson White Buffalo 1977`,
        `Will Sampson Orca 1977`,
        `Rodeo cowboy bronc riding 1970s`
      );
    } else if (lowerChar.includes('lorne greene')) {
      list.push(
        `${cleanCharName} Bonanza Ben Cartwright`,
        `${cleanCharName} Ponderosa`,
        `${cleanCharName} Battlestar Galactica`
      );
    } else if (lowerChar.includes('clayton moore')) {
      list.push(
        `${cleanCharName} The Lone Ranger`,
        `${cleanCharName} Lone Ranger interview`,
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
        `${cleanCharName} movie scene`,
        `${cleanCharName} interview`,
        `${cleanCharName} trailer`
      );
    }
    return Array.from(new Set(list)).slice(0, 6);
  }, [scene, cleanCharName]);

  const executeSearch = async (queryToRun: string, nextCycle = 0) => {
    setIsLoading(true);
    setPreviewingYtId(null);
    const effectiveQuery = queryToRun.trim() || cleanCharName;

    try {
      const [ytRes, archRes] = await Promise.all([
        fetch('/api/youtube/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: effectiveQuery,
            characterName: cleanCharName,
            limit: 12,
          }),
        }),
        fetch('/api/archival/search-scene-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: effectiveQuery,
            characterName: cleanCharName,
            sceneDurationSec: sceneDur,
            limit: 12,
            cycleOffset: nextCycle,
          }),
        }),
      ]);

      if (ytRes.ok) {
        const ytData = await ytRes.json();
        const ytList: YouTubeSearchVideoItem[] = Array.isArray(ytData?.videos)
          ? ytData.videos
          : [];
        setYoutubeVideos(ytList);
        const nextYtTrims: Record<string, number> = {};
        ytList.forEach((v) => {
          nextYtTrims[v.id] = v.suggestedTrimStartSec || 18;
        });
        setYtTrimStarts(nextYtTrims);
        // Pre-select first 3 YouTube videos if opened in batch mode, or first 1 if opened for a single scene
        if (ytList.length > 0) {
          setSelectedYtIds(
            scene ? [ytList[0].id] : ytList.slice(0, 3).map((v) => v.id)
          );
        }
      }

      if (archRes.ok) {
        const data = await archRes.json();
        const vids: SceneVideoOption[] = Array.isArray(data?.videoOptions)
          ? data.videoOptions
          : [];
        const imgs: ScenePhotoOption[] = Array.isArray(data?.photoOptions)
          ? data.photoOptions
          : [];
        setVideoOptions(vids);
        setPhotoOptions(imgs);

        const initialTrims: Record<string, number> = {};
        vids.forEach((v) => {
          initialTrims[v.id] = v.trimStartSec;
        });
        setCustomTrimStarts(initialTrims);

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

  useEffect(() => {
    if (isOpen) {
      const defaultQuery =
        scene?.archivalKeywords?.trim() || `${cleanCharName} One Flew Over the Cuckoo's Nest`;
      setSearchQuery(defaultQuery);
      setFilterTab(initialTab);
      setCycleOffset(0);
      executeSearch(defaultQuery, 0);
    }
  }, [isOpen, scene?.id, initialTab]);

  if (!isOpen) return null;

  const sceneNumLabel = scene ? `#${String(scene.order).padStart(2, '0')}` : null;

  const toggleSelectYouTubeVideo = (id: string) => {
    setSelectedYtIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCutAndInsertYouTubeVideos = async (specificVideo?: YouTubeSearchVideoItem) => {
    if (isCuttingYouTube || !onInsertCutYouTubeClips) return;
    const targetVideos = specificVideo
      ? [specificVideo]
      : youtubeVideos.filter((v) => selectedYtIds.includes(v.id));
    if (targetVideos.length === 0) return;

    setIsCuttingYouTube(true);
    try {
      const clipsPayload = targetVideos.map((v) => ({
        id: v.id,
        title: v.title,
        youtubeId: v.youtubeId,
        dmId: v.dmId,
        archiveMp4Url: v.archiveMp4Url,
        thumbnailUrl: v.thumbnailUrl,
        trimStartSec: ytTrimStarts[v.id] ?? v.suggestedTrimStartSec ?? 18,
        durationSec: scene ? sceneDur : 9,
      }));

      const res = await fetch('/api/youtube/cut-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clips: clipsPayload,
          characterName: cleanCharName,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.cuts) && data.cuts.length > 0) {
          onInsertCutYouTubeClips(
            data.cuts,
            specificVideo && scene ? scene.id : scene ? scene.id : null
          );
          onClose();
        }
      }
    } finally {
      setIsCuttingYouTube(false);
    }
  };

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
      <div className="w-full max-w-6xl max-h-[92vh] bg-[#0B0F17] border border-slate-700/90 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-5 py-3.5 bg-[#111827] border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {sceneNumLabel ? (
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-amber-500 text-slate-950">
                  Cảnh {sceneNumLabel} · {sceneDur}s
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white flex items-center gap-1">
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Kho Cắt Video YouTube</span>
                </span>
              )}
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {scene
                  ? `Chọn Video YouTube / Ảnh Thật Để Cắt & Chèn Vào Cảnh ${sceneNumLabel}: ${scene.title}`
                  : `Chọn 1–3 Video Từ YouTube Để Tự Động Cắt & Chèn Thẳng Vào Timeline`}
              </h2>
            </div>
            {scene ? (
              <p className="text-xs text-slate-400 mt-1 truncate">
                Nội dung lời đọc: <span className="text-amber-200/90 italic">"{scene.narrationText}"</span>
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Tìm hoặc dán link YouTube bất kỳ → Tích chọn 1 vài video bạn ưng ý → Chỉnh giây muốn cắt → Bấm <strong className="text-amber-300">Cắt &amp; Chèn Vào Timeline</strong> là xong!
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedYtIds.length > 0 && onInsertCutYouTubeClips && (
              <button
                type="button"
                disabled={isCuttingYouTube}
                onClick={() => handleCutAndInsertYouTubeVideos()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 shadow-lg transition-colors"
              >
                {isCuttingYouTube ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang cắt {selectedYtIds.length} video bằng FFmpeg...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>
                      ✂️ Cắt &amp; Chèn Ngay {selectedYtIds.length} Video Đã Chọn{' '}
                      {sceneNumLabel ? `Vào Cảnh ${sceneNumLabel}` : 'Vào Timeline'}
                    </span>
                  </>
                )}
              </button>
            )}

            {scene && onUploadLocalFileForScene && (
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Tải File Từ Máy</span>
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
                placeholder="Nhập tên phim/diễn viên hoặc dán trực tiếp Link YouTube (https://www.youtube.com/watch?v=...) vào đây..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#070A10] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-colors shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tìm YouTube...</span>
                </>
              ) : (
                <>
                  <Youtube className="w-4 h-4" />
                  <span>Tìm Trên YouTube</span>
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
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đổi Lô Khác</span>
            </button>
          </form>

          {/* Quick Keyword Suggestions + Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">Tìm nhanh trên YouTube:</span>
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
                      ? 'bg-red-500/25 border-red-400 text-red-200'
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
                onClick={() => setFilterTab('youtube')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                  filterTab === 'youtube'
                    ? 'bg-red-600 text-white'
                    : 'text-red-300 hover:text-red-200'
                }`}
              >
                <Youtube className="w-3.5 h-3.5" />
                <span>Nguồn YouTube ({youtubeVideos.length})</span>
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
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                  filterTab === 'all'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất Cả
              </button>
            </div>
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-300 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-red-400" />
              <p className="text-xs font-semibold">
                Đang tìm kiếm nguồn video trên YouTube &amp; kho phim tư liệu cho "{searchQuery}"...
              </p>
            </div>
          ) : (
            <>
              {/* SECTION A: YouTube Video Picker & Auto-Cutter */}
              {(filterTab === 'youtube' || filterTab === 'all') && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                      <Youtube className="w-4 h-4 text-red-500" />
                      <span>
                        Chọn 1 Hoặc Nhiều Video Từ YouTube Để Hệ Thống Tự Cắt &amp; Chèn Vào Video ({youtubeVideos.length} kết quả)
                      </span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Đã tích chọn: <strong className="text-amber-300">{selectedYtIds.length} video</strong> · Độ dài mỗi đoạn cắt: <strong className="text-emerald-300">{scene ? sceneDur : 9} giây</strong>
                    </span>
                  </div>

                  {youtubeVideos.length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                      Không tìm thấy kết quả YouTube cho từ khóa này. Hãy thử bấm các từ khóa gợi ý màu đỏ phía trên!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {youtubeVideos.map((yt) => {
                        const isChecked = selectedYtIds.includes(yt.id);
                        const startSec = ytTrimStarts[yt.id] ?? yt.suggestedTrimStartSec ?? 18;
                        const cutDur = scene ? sceneDur : 9;
                        const endSec = startSec + cutDur;
                        const isPreviewing = previewingYtId === yt.id;

                        return (
                          <div
                            key={yt.id}
                            className={`rounded-lg bg-[#111827] border p-3 flex flex-col justify-between gap-2.5 transition-all ${
                              isChecked
                                ? 'border-amber-400 ring-2 ring-amber-400/40 bg-[#161F33]'
                                : 'border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* Video Preview Box (Thumbnail OR Embedded YouTube Player at startSec) */}
                              <div className="relative h-40 rounded-md overflow-hidden bg-black border border-slate-800">
                                {isPreviewing ? (
                                  <iframe
                                    src={`https://www.youtube.com/embed/${yt.youtubeId}?start=${startSec}&end=${endSec}&autoplay=1`}
                                    title={yt.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full border-0"
                                  />
                                ) : (
                                  <>
                                    <img
                                      src={yt.thumbnailUrl}
                                      alt={yt.title}
                                      referrerPolicy="no-referrer"
                                      className="w-full h-full object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPreviewingYtId(yt.id)}
                                      className="absolute inset-0 bg-black/45 hover:bg-black/25 flex items-center justify-center transition-colors group"
                                      title="Bấm để xem trước đoạn video YouTube này ngay tại giây muốn cắt"
                                    >
                                      <div className="px-3 py-1.5 rounded-full bg-red-600 group-hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>Xem Thử ({startSec}s→{endSec}s)</span>
                                      </div>
                                    </button>
                                  </>
                                )}

                                {/* Top-Left Checkbox Badge */}
                                <button
                                  type="button"
                                  onClick={() => toggleSelectYouTubeVideo(yt.id)}
                                  className={`absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 shadow ${
                                    isChecked
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-black/80 text-slate-200 hover:bg-black'
                                  }`}
                                >
                                  {isChecked ? (
                                    <>
                                      <CheckSquare className="w-3.5 h-3.5" />
                                      <span>Đã Chọn</span>
                                    </>
                                  ) : (
                                    <>
                                      <Square className="w-3.5 h-3.5" />
                                      <span>Tích Chọn</span>
                                    </>
                                  )}
                                </button>

                                {/* Bottom-Right Total Duration Badge */}
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/85 text-white">
                                  {yt.durationLabel}
                                </span>
                              </div>

                              <div>
                                <p
                                  className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug"
                                  title={yt.title}
                                >
                                  {yt.title}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                                  Kênh: {yt.channel} {yt.viewsLabel ? `· ${yt.viewsLabel}` : ''}
                                </p>
                              </div>

                              {/* Trim Start Second Control */}
                              <div className="flex items-center justify-between gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                <span className="text-slate-300 flex items-center gap-1">
                                  <Scissors className="w-3 h-3 text-amber-400" />
                                  <span>Cắt từ giây:</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={5}
                                    max={Math.max(30, yt.durationSec - 6)}
                                    step={5}
                                    value={startSec}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value || '15', 10));
                                      setYtTrimStarts((prev) => ({ ...prev, [yt.id]: val }));
                                    }}
                                    className="w-16 px-1.5 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-amber-300"
                                  />
                                  <span className="text-slate-400 font-mono">→ {endSec}s</span>
                                </div>
                              </div>
                            </div>

                            {/* 1-Click Cut & Insert This Single Video */}
                            <button
                              type="button"
                              disabled={isCuttingYouTube}
                              onClick={() => handleCutAndInsertYouTubeVideos(yt)}
                              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-colors"
                            >
                              {isCuttingYouTube ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang cắt đoạn {startSec}s→{endSec}s...</span>
                                </>
                              ) : (
                                <>
                                  <Scissors className="w-3.5 h-3.5" />
                                  <span>
                                    ✂️ Cắt Đoạn {startSec}s→{endSec}s &amp; Chèn{' '}
                                    {sceneNumLabel ? `Vào Cảnh ${sceneNumLabel}` : 'Ngay'}
                                  </span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION B: Real Photos (when scene needs an image or Grok/Kling reference photo) */}
              {(filterTab === 'all' || filterTab === 'image') && scene && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span>
                        Chọn Ảnh Thật Sạch Chữ Khác Cho Cảnh {sceneNumLabel} ({combinedPhotos.length} ảnh)
                      </span>
                    </h3>
                  </div>

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
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION C: Direct Archival Video Cuts */}
              {(filterTab === 'all' || filterTab === 'video') && scene && videoOptions.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <h3 className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Film className="w-4 h-4 text-sky-400" />
                    <span>Kho Cuộn Phim Archive Cắt Sẵn ({videoOptions.length} đoạn)</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {videoOptions.map((vid, idx) => {
                      const startSec = customTrimStarts[vid.id] ?? vid.trimStartSec;
                      const endSec = startSec + sceneDur;
                      return (
                        <div
                          key={vid.id}
                          className="rounded-lg bg-[#111827] border border-sky-500/40 p-3 flex flex-col justify-between gap-2"
                        >
                          <p className="text-xs font-bold text-slate-100 truncate">
                            #{idx + 1}. {vid.title} ({startSec}s→{endSec}s)
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectVideoForScene(scene.id, vid, startSec, endSec);
                              onClose();
                            }}
                            className="w-full px-3 py-1.5 rounded text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950"
                          >
                            Chèn Đoạn Phim Này Vào Cảnh {sceneNumLabel}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
