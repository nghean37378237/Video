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
  targetSceneId?: string;
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

export interface QueuedYouTubeSegment {
  queueId: string;
  video: YouTubeSearchVideoItem;
  targetSceneId: string;
  trimStartSec: number;
  trimEndSec: number;
}

interface SceneMediaSearchModalProps {
  isOpen: boolean;
  scene: StoryScene | null;
  allScenes?: StoryScene[];
  activeSceneId?: string;
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
  allScenes = [],
  activeSceneId,
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
  const [cuttingCardId, setCuttingCardId] = useState<string | null>(null);
  const [cycleOffset, setCycleOffset] = useState<number>(0);

  // YouTube search results & per-card segment controls
  const [youtubeVideos, setYoutubeVideos] = useState<YouTubeSearchVideoItem[]>([]);
  const [queuedSegments, setQueuedSegments] = useState<QueuedYouTubeSegment[]>([]);
  const [ytTrimStarts, setYtTrimStarts] = useState<Record<string, number>>({});
  const [ytTrimEnds, setYtTrimEnds] = useState<Record<string, number>>({});
  const [ytTargetSceneIds, setYtTargetSceneIds] = useState<Record<string, string>>({});
  const [previewingYtId, setPreviewingYtId] = useState<string | null>(null);
  const [previewRemainingSec, setPreviewRemainingSec] = useState<number>(0);

  // Archival video & photo results
  const [videoOptions, setVideoOptions] = useState<SceneVideoOption[]>([]);
  const [photoOptions, setPhotoOptions] = useState<ScenePhotoOption[]>([]);
  const [customTrimStarts, setCustomTrimStarts] = useState<Record<string, number>>({});

  const cleanCharName = characterName.split('—')[0].split('-')[0].trim() || 'Will Sampson';
  const sceneDur = Math.max(5, Math.round(scene?.durationSec || 9));

  // Eligible visual scenes on the Timeline that can receive a cut video
  const selectableScenes = React.useMemo(() => {
    const list = allScenes.filter((s) => s.sceneType !== 'outro' && s.sceneType !== 'quote');
    if (list.length > 0) return list;
    return scene ? [scene] : [];
  }, [allScenes, scene]);

  const videoScenesOnly = React.useMemo(() => {
    const vList = selectableScenes.filter((s) => s.sceneType === 'video');
    return vList.length > 0 ? vList : selectableScenes;
  }, [selectableScenes]);

  const getSceneDurationById = (sId: string): number => {
    const found = allScenes.find((s) => s.id === sId) || (scene?.id === sId ? scene : undefined);
    return Math.max(5, Math.round(found?.durationSec || 9));
  };

  const getSceneBadgeById = (sId: string): string => {
    const found = allScenes.find((s) => s.id === sId) || (scene?.id === sId ? scene : undefined);
    if (!found) return 'Đoạn Đang Chọn';
    return `Đoạn #${String(found.order).padStart(2, '0')} (${Math.round(found.durationSec || 8)}s)`;
  };

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
        const nextStarts: Record<string, number> = {};
        const nextEnds: Record<string, number> = {};
        const nextTargetScenes: Record<string, string> = {};

        ytList.forEach((v, idx) => {
          const defaultTargetScene =
            scene?.id ||
            videoScenesOnly[idx % Math.max(1, videoScenesOnly.length)]?.id ||
            activeSceneId ||
            selectableScenes[0]?.id ||
            '';
          const targetDur = getSceneDurationById(defaultTargetScene);
          const sSec = v.suggestedTrimStartSec || 18;
          nextStarts[v.id] = sSec;
          nextEnds[v.id] = sSec + targetDur;
          nextTargetScenes[v.id] = defaultTargetScene;
        });
        setYtTrimStarts(nextStarts);
        setYtTrimEnds(nextEnds);
        setYtTargetSceneIds(nextTargetScenes);
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
      setQueuedSegments([]);
      setPreviewingYtId(null);
      setPreviewRemainingSec(0);
      executeSearch(defaultQuery, 0);
    }
  }, [isOpen, scene?.id, initialTab]);

  // Auto-stop the preview player inside the card right when the selected (startSec -> endSec) segment finishes!
  useEffect(() => {
    if (!previewingYtId) {
      setPreviewRemainingSec(0);
      return;
    }
    const yt = youtubeVideos.find((v) => v.id === previewingYtId);
    if (!yt) return;
    const sSec = ytTrimStarts[yt.id] ?? yt.suggestedTrimStartSec ?? 18;
    const chosenSceneId =
      ytTargetSceneIds[yt.id] ||
      scene?.id ||
      activeSceneId ||
      selectableScenes[0]?.id ||
      '';
    const targetDur = getSceneDurationById(chosenSceneId);
    const eSec = Math.max(sSec + 3, ytTrimEnds[yt.id] ?? sSec + targetDur);
    const clipLen = Math.max(3, eSec - sSec);
    setPreviewRemainingSec(clipLen);

    const timer = setInterval(() => {
      setPreviewRemainingSec((prev) => {
        if (prev <= 1) {
          setPreviewingYtId(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [previewingYtId, youtubeVideos, ytTrimStarts, ytTrimEnds, ytTargetSceneIds, scene?.id, activeSceneId]);

  if (!isOpen) return null;

  const sceneNumLabel = scene ? `#${String(scene.order).padStart(2, '0')}` : null;

  // Toggle or add a specific [video + startSec->endSec + targetSceneId] segment into the cut queue
  const handleToggleQueueSegment = (yt: YouTubeSearchVideoItem) => {
    const startSec = ytTrimStarts[yt.id] ?? yt.suggestedTrimStartSec ?? 18;
    const defaultTargetSceneId =
      ytTargetSceneIds[yt.id] ||
      scene?.id ||
      activeSceneId ||
      selectableScenes[0]?.id ||
      '';
    const targetDur = getSceneDurationById(defaultTargetSceneId);
    const endSec = ytTrimEnds[yt.id] ?? startSec + targetDur;

    const existingIdx = queuedSegments.findIndex(
      (q) =>
        q.video.id === yt.id &&
        q.trimStartSec === startSec &&
        q.trimEndSec === endSec &&
        q.targetSceneId === defaultTargetSceneId
    );

    if (existingIdx >= 0) {
      setQueuedSegments((prev) => prev.filter((_, i) => i !== existingIdx));
    } else if (scene) {
      // When opened for a specific single scene (e.g. Cảnh #01), strictly select ONLY 1 video at a time!
      setQueuedSegments([
        {
          queueId: `q-${yt.id}-${startSec}-${endSec}-${defaultTargetSceneId}-${Date.now()}`,
          video: yt,
          targetSceneId: defaultTargetSceneId,
          trimStartSec: startSec,
          trimEndSec: Math.max(startSec + 3, endSec),
        },
      ]);
    } else {
      setQueuedSegments((prev) => [
        // Replace any existing segment assigned to the same targetSceneId so 1 scene only gets 1 video
        ...prev.filter((q) => q.targetSceneId !== defaultTargetSceneId),
        {
          queueId: `q-${yt.id}-${startSec}-${endSec}-${defaultTargetSceneId}-${Date.now()}`,
          video: yt,
          targetSceneId: defaultTargetSceneId,
          trimStartSec: startSec,
          trimEndSec: Math.max(startSec + 3, endSec),
        },
      ]);
    }
  };

  const handleRemoveQueuedSegment = (queueId: string) => {
    setQueuedSegments((prev) => prev.filter((q) => q.queueId !== queueId));
  };

  // Cut either a SINGLE card's segment OR the explicitly queued segments (each into its own targetSceneId!)
  const handleCutAndInsertYouTubeVideos = async (specificVideo?: YouTubeSearchVideoItem) => {
    if (isCuttingYouTube || !onInsertCutYouTubeClips) return;

    let segmentsToCut: QueuedYouTubeSegment[] = [];
    if (specificVideo) {
      const startSec = ytTrimStarts[specificVideo.id] ?? specificVideo.suggestedTrimStartSec ?? 18;
      const chosenSceneId =
        ytTargetSceneIds[specificVideo.id] ||
        scene?.id ||
        activeSceneId ||
        selectableScenes[0]?.id ||
        '';
      const targetDur = getSceneDurationById(chosenSceneId);
      const endSec = Math.max(
        startSec + 3,
        ytTrimEnds[specificVideo.id] ?? startSec + targetDur
      );
      segmentsToCut = [
        {
          queueId: `single-${specificVideo.id}`,
          video: specificVideo,
          targetSceneId: chosenSceneId,
          trimStartSec: startSec,
          trimEndSec: endSec,
        },
      ];
      setCuttingCardId(specificVideo.id);
    } else {
      segmentsToCut = queuedSegments;
      setCuttingCardId('__QUEUE__');
    }

    if (segmentsToCut.length === 0) return;

    setIsCuttingYouTube(true);
    try {
      const clipsPayload = segmentsToCut.map((seg) => ({
        id: seg.video.id,
        targetSceneId: seg.targetSceneId,
        title: seg.video.title,
        youtubeId: seg.video.youtubeId,
        dmId: seg.video.dmId,
        archiveMp4Url: seg.video.archiveMp4Url,
        thumbnailUrl: seg.video.thumbnailUrl,
        trimStartSec: seg.trimStartSec,
        trimEndSec: seg.trimEndSec,
        durationSec: Math.max(3, seg.trimEndSec - seg.trimStartSec),
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
            segmentsToCut.length === 1 ? segmentsToCut[0].targetSceneId : null
          );
          onClose();
        }
      }
    } finally {
      setIsCuttingYouTube(false);
      setCuttingCardId(null);
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
                  Đang chọn Cảnh {sceneNumLabel} · {sceneDur}s
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-600 text-white flex items-center gap-1">
                  <Youtube className="w-3.5 h-3.5" />
                  <span>Kho Cắt Video Theo Từng Đoạn</span>
                </span>
              )}
              <h2 className="text-sm font-bold text-slate-100 truncate">
                {scene
                  ? `Cắt Riêng Đoạn Video YouTube / Chọn Ảnh Thật Cho Cảnh ${sceneNumLabel}: ${scene.title}`
                  : `Chọn & Cắt Riêng Từng Đoạn Video (Từ Giây → Đến Giây) Cho Từng Phân Cảnh Trên Timeline`}
              </h2>
            </div>
            {scene ? (
              <p className="text-xs text-slate-400 mt-1 truncate">
                Lời đọc Cảnh {sceneNumLabel}:{' '}
                <span className="text-amber-200/90 italic">"{scene.narrationText}"</span>
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Trên mỗi video bên dưới: Chọn <strong className="text-sky-300">Đoạn (Cảnh) muốn chèn</strong> + chỉnh <strong className="text-amber-300">Từ giây → Đến giây</strong> → Bấm <strong className="text-amber-300">✂️ Cắt Riêng Đoạn Này</strong> (hoặc thêm nhiều đoạn vào danh sách để cắt riêng từng đoạn).
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {queuedSegments.length > 0 && onInsertCutYouTubeClips && (
              <button
                type="button"
                disabled={isCuttingYouTube}
                onClick={() => handleCutAndInsertYouTubeVideos()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 shadow-lg transition-colors"
              >
                {isCuttingYouTube && cuttingCardId === '__QUEUE__' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang cắt riêng {queuedSegments.length} đoạn đã chọn...</span>
                  </>
                ) : (
                  <>
                    <Scissors className="w-4 h-4" />
                    <span>
                      ✂️ Cắt Riêng &amp; Chèn {queuedSegments.length} Đoạn Đã Chọn Vào Đúng Cảnh
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

        {/* Queued Segments Bar (Shows each individual segment [Video + Start->End + Target Scene] so user sees they are cut separately) */}
        {queuedSegments.length > 0 && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-amber-300 mr-1">
                ✂️ Các đoạn đã chọn để cắt riêng ({queuedSegments.length}):
              </span>
              {queuedSegments.map((seg, idx) => (
                <div
                  key={seg.queueId}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#111827] border border-amber-500/50 text-[11px]"
                >
                  <span className="font-mono font-bold text-amber-400">
                    #{idx + 1} [{getSceneBadgeById(seg.targetSceneId)}]
                  </span>
                  <span className="text-slate-200 max-w-[160px] truncate" title={seg.video.title}>
                    {seg.video.title}
                  </span>
                  <span className="font-mono font-bold text-emerald-300">
                    ({seg.trimStartSec}s → {seg.trimEndSec}s)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveQueuedSegment(seg.queueId)}
                    className="text-slate-400 hover:text-red-400 ml-0.5"
                    title="Bỏ đoạn này"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setQueuedSegments([])}
              className="text-[11px] text-slate-400 hover:text-red-300 underline shrink-0"
            >
              Xóa danh sách chọn
            </button>
          </div>
        )}

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
              {/* SECTION A: YouTube Per-Segment Picker & Auto-Cutter */}
              {(filterTab === 'youtube' || filterTab === 'all') && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                      <Youtube className="w-4 h-4 text-red-500" />
                      <span>
                        Chọn Đoạn Thời Gian (Từ Giây → Đến Giây) &amp; Cảnh Đích Để Cắt Riêng Từng Đoạn ({youtubeVideos.length} video)
                      </span>
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Mỗi đoạn bạn chọn sẽ được FFmpeg <strong className="text-emerald-300">cắt thành file .MP4 độc lập</strong> và gắn đúng vào <strong className="text-amber-300">Cảnh (Đoạn) bạn chỉ định</strong>
                    </span>
                  </div>

                  {youtubeVideos.length === 0 ? (
                    <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                      Không tìm thấy kết quả YouTube cho từ khóa này. Hãy thử bấm các từ khóa gợi ý màu đỏ phía trên!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {youtubeVideos.map((yt) => {
                        const startSec = ytTrimStarts[yt.id] ?? yt.suggestedTrimStartSec ?? 18;
                        const chosenSceneId =
                          ytTargetSceneIds[yt.id] ||
                          scene?.id ||
                          activeSceneId ||
                          selectableScenes[0]?.id ||
                          '';
                        const targetDur = getSceneDurationById(chosenSceneId);
                        const endSec = Math.max(
                          startSec + 3,
                          ytTrimEnds[yt.id] ?? startSec + targetDur
                        );
                        const cutDur = Math.max(3, endSec - startSec);
                        const isPreviewing = previewingYtId === yt.id;
                        const isThisSegmentQueued = queuedSegments.some(
                          (q) =>
                            q.video.id === yt.id &&
                            q.trimStartSec === startSec &&
                            q.trimEndSec === endSec &&
                            q.targetSceneId === chosenSceneId
                        );
                        const queuedCountForThisVideo = queuedSegments.filter(
                          (q) => q.video.id === yt.id
                        ).length;

                        return (
                          <div
                            key={yt.id}
                            className={`rounded-lg bg-[#111827] border p-3 flex flex-col justify-between gap-2.5 transition-all ${
                              isThisSegmentQueued || queuedCountForThisVideo > 0
                                ? 'border-amber-400 ring-2 ring-amber-400/40 bg-[#161F33]'
                                : 'border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <div className="space-y-2">
                              {/* Video Preview Box (Thumbnail OR Embedded YouTube Player at startSec -> endSec) */}
                              <div className="relative h-40 rounded-md overflow-hidden bg-black border border-slate-800">
                                {isPreviewing ? (
                                  <div className="relative w-full h-full">
                                    <iframe
                                      src={`https://www.youtube.com/embed/${yt.youtubeId}?start=${startSec}&end=${endSec}&autoplay=1&rel=0`}
                                      title={yt.title}
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                      className="w-full h-full border-0"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPreviewingYtId(null)}
                                      className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shadow-lg flex items-center gap-1"
                                    >
                                      <span>
                                        ⏹ Đang phát đoạn {startSec}s→{endSec}s (Dừng sau {previewRemainingSec}s)
                                      </span>
                                    </button>
                                  </div>
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
                                      title="Bấm để xem trước đúng đoạn từ giây Start đến giây End (tự dừng khi hết đoạn cắt)"
                                    >
                                      <div className="px-3 py-1.5 rounded-full bg-red-600 group-hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        <span>Xem Thử Riêng Đoạn ({startSec}s→{endSec}s)</span>
                                      </div>
                                    </button>
                                  </>
                                )}

                                {/* Top-Left Queue Segment Button */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleQueueSegment(yt)}
                                  className={`absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 shadow ${
                                    isThisSegmentQueued
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-black/85 text-slate-100 hover:bg-amber-500 hover:text-slate-950'
                                  }`}
                                  title="Thêm đoạn (Start→End) này vào danh sách cắt riêng"
                                >
                                  {isThisSegmentQueued ? (
                                    <>
                                      <CheckSquare className="w-3.5 h-3.5" />
                                      <span>Đã Chọn Đoạn ({startSec}s→{endSec}s)</span>
                                    </>
                                  ) : (
                                    <>
                                      <Square className="w-3.5 h-3.5" />
                                      <span>
                                        + Chọn Đoạn Này
                                        {queuedCountForThisVideo > 0
                                          ? ` (Đã có ${queuedCountForThisVideo})`
                                          : ''}
                                      </span>
                                    </>
                                  )}
                                </button>

                                {/* Bottom-Right Total Duration Badge */}
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/85 text-white">
                                  Tổng: {yt.durationLabel}
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

                              {/* Target Scene Selector (Chọn Đoạn/Cảnh Đích Trên Timeline) */}
                              {selectableScenes.length > 0 && (
                                <div className="flex items-center justify-between gap-2 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                  <span className="text-sky-300 font-semibold shrink-0">
                                    Chèn vào:
                                  </span>
                                  <select
                                    value={chosenSceneId}
                                    onChange={(e) => {
                                      const nextSceneId = e.target.value;
                                      const nextDur = getSceneDurationById(nextSceneId);
                                      setYtTargetSceneIds((prev) => ({
                                        ...prev,
                                        [yt.id]: nextSceneId,
                                      }));
                                      setYtTrimEnds((prev) => ({
                                        ...prev,
                                        [yt.id]: startSec + nextDur,
                                      }));
                                    }}
                                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-bold text-amber-300 truncate focus:outline-none focus:border-amber-400"
                                  >
                                    {selectableScenes.map((sc) => (
                                      <option key={sc.id} value={sc.id}>
                                        Cảnh #{String(sc.order).padStart(2, '0')} (
                                        {Math.round(sc.durationSec || 8)}s) — {sc.title}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Independent Start -> End Second Controls */}
                              <div className="flex items-center justify-between gap-1.5 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                <span className="text-slate-300 flex items-center gap-1 shrink-0">
                                  <Scissors className="w-3 h-3 text-amber-400" />
                                  <span>Đoạn cắt:</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={Math.max(30, yt.durationSec - 4)}
                                    step={2}
                                    value={startSec}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                      setYtTrimStarts((prev) => ({ ...prev, [yt.id]: val }));
                                      setYtTrimEnds((prev) => ({
                                        ...prev,
                                        [yt.id]: val + cutDur,
                                      }));
                                    }}
                                    className="w-14 px-1 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-amber-300"
                                    title="Giây bắt đầu cắt (Start)"
                                  />
                                  <span className="text-slate-400 font-mono">s →</span>
                                  <input
                                    type="number"
                                    min={startSec + 3}
                                    max={Math.max(startSec + 25, yt.durationSec)}
                                    step={1}
                                    value={endSec}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        startSec + 3,
                                        parseInt(e.target.value || String(startSec + 8), 10)
                                      );
                                      setYtTrimEnds((prev) => ({ ...prev, [yt.id]: val }));
                                    }}
                                    className="w-14 px-1 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-emerald-300"
                                    title="Giây kết thúc cắt (End)"
                                  />
                                  <span className="text-slate-400 font-mono">
                                    s ({cutDur}s)
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 1-Click Cut ONLY This Selected Segment Into Chosen Scene */}
                            <button
                              type="button"
                              disabled={isCuttingYouTube && cuttingCardId === yt.id}
                              onClick={() => {
                                if (isCuttingYouTube) return;
                                handleCutAndInsertYouTubeVideos(yt);
                              }}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-colors ${
                                isCuttingYouTube && cuttingCardId === yt.id
                                  ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                              }`}
                            >
                              {isCuttingYouTube && cuttingCardId === yt.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>
                                    Đang cắt riêng 1 video này ({startSec}s→{endSec}s)...
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Scissors className="w-3.5 h-3.5" />
                                  <span>
                                    ✂️ Chỉ Cắt 1 Video Này ({startSec}s→{endSec}s) Vào{' '}
                                    {getSceneBadgeById(chosenSceneId).split(' (')[0]}
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
