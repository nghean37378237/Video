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
  Download,
  Trash2,
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
  tiktokId?: string;
  tiktokUrl?: string;
  instagramId?: string;
  instagramUrl?: string;
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
  sourcePlatform?: 'shorts' | 'tiktok' | 'instagram' | 'youtube' | 'archive' | 'dailymotion';
  platformBadge?: string;
  isDirectCuttable?: boolean;
  matchedSourceTitle?: string;
}

export interface CutYouTubeResultItem {
  id: string;
  targetSceneId?: string;
  characterName?: string;
  sourceVideoUrl?: string;
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
  frameMode?: string;
  focusX?: string;
  sourceLabel: string;
  matchedSourceTitle?: string;
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
    customTrimEndSec: number,
    skipServerCut?: boolean
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
  settings,
  vaultItems,
  onClose,
  onSelectVideoForScene,
  onSelectPhotoForScene,
  onInsertCutYouTubeClips,
  onUploadLocalFileForScene,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'youtube' | 'all' | 'video' | 'image'>(initialTab);
  const [videoSourceSubFilter, setVideoSourceSubFilter] = useState<
    | 'all'
    | 'cuttable-100'
    | 'dailymotion'
    | 'short-all'
    | 'shorts'
    | 'tiktok'
    | 'instagram'
    | 'youtube-long'
    | 'archive'
  >('all');
  const [searchDepth, setSearchDepth] = useState<
    'all' | 'cinema' | 'interview' | 'rare' | 'archive' | 'social'
  >('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isLoadingArchival, setIsLoadingArchival] = useState<boolean>(false);
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
  const [previewUseDirectMp4, setPreviewUseDirectMp4] = useState<Record<string, boolean>>({});
  const [ytPlayheadSec, setYtPlayheadSec] = useState<Record<string, number>>({});
  const [ytActualDurationSec, setYtActualDurationSec] = useState<Record<string, number>>({});
  const ytVideoRefs = React.useRef<Record<string, HTMLVideoElement | null>>({});

  // Archival video & photo results
  const [videoOptions, setVideoOptions] = useState<SceneVideoOption[]>([]);
  const [photoOptions, setPhotoOptions] = useState<ScenePhotoOption[]>([]);
  const [customTrimStarts, setCustomTrimStarts] = useState<Record<string, number>>({});
  const [customTrimEnds, setCustomTrimEnds] = useState<Record<string, number>>({});
  const [videoPlayheadSec, setVideoPlayheadSec] = useState<Record<string, number>>({});
  const [videoActualDurationSec, setVideoActualDurationSec] = useState<Record<string, number>>({});
  const [previewingArchivalId, setPreviewingArchivalId] = useState<string | null>(null);
  const archivalVideoRefs = React.useRef<Record<string, HTMLVideoElement | null>>({});
  const resultsBodyRef = React.useRef<HTMLDivElement | null>(null);

  // Persistent Saved Cuts Library (allows downloading MP4 to computer or replacing into any scene)
  const [savedCuts, setSavedCuts] = useState<CutYouTubeResultItem[]>(() => {
    try {
      const raw = localStorage.getItem('legendcut_saved_cuts_list_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [savedCutTargetScenes, setSavedCutTargetScenes] = useState<Record<string, string>>({});
  const [justCutBanner, setJustCutBanner] = useState<string | null>(null);
  const [latestAcceptedCut, setLatestAcceptedCut] = useState<CutYouTubeResultItem | null>(null);
  const [showSavedCutsDrawer, setShowSavedCutsDrawer] = useState<boolean>(false);
  const [archivalTargetScenes, setArchivalTargetScenes] = useState<Record<string, string>>({});

  // 3:4 HD Anti-Blur Framing Controls (720x960 Lanczos + Unsharp)
  const [cutFrameMode, setCutFrameMode] = useState<'3:4-sharp' | '3:4-cinema' | '3:4-full-wide'>(
    '3:4-sharp'
  );
  const [cutFocusX, setCutFocusX] = useState<'center' | 'left' | 'right'>('center');
  const [show34Guide, setShow34Guide] = useState<boolean>(true);

  // Local Video File Upload & Precision Segment Trimmer (100% immune to YouTube/Cloud IP blocks)
  const [localCutFile, setLocalCutFile] = useState<File | null>(null);
  const [localCutPreviewUrl, setLocalCutPreviewUrl] = useState<string | null>(null);
  const [localCutStartSec, setLocalCutStartSec] = useState<number>(0);
  const [localCutEndSec, setLocalCutEndSec] = useState<number>(10);
  const [localCutActualDur, setLocalCutActualDur] = useState<number>(0);
  const [localCutTargetSceneId, setLocalCutTargetSceneId] = useState<string>('');
  const localCutVideoRef = React.useRef<HTMLVideoElement | null>(null);

  const formatMmSs = (sec: number): string => {
    const clean = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(clean / 60);
    const s = clean % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const getPlayableCutVideoSrc = (cut: CutYouTubeResultItem): string => {
    const rawUrl = cut.videoUrl || '';
    const basePart = rawUrl.split('#')[0];
    if (basePart.includes('/api/youtube/cut-file/')) {
      return basePart;
    }
    if (basePart.includes('/api/archival/video-stream')) {
      return `${basePart}#t=${cut.originalStartSec},${cut.originalEndSec}`;
    }
    return basePart;
  };

  const buildDownloadMp4Href = (rawUrl: string, fileName: string): string => {
    const cleanUrl = (rawUrl || '').split('#')[0];
    if (!cleanUrl) return '';
    if (cleanUrl.includes('/api/youtube/cut-file/')) {
      return `${cleanUrl}?download=1&name=${encodeURIComponent(fileName)}`;
    }
    if (cleanUrl.includes('/api/archival/video-stream')) {
      const sep = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${sep}download=1&name=${encodeURIComponent(fileName)}`;
    }
    return cleanUrl;
  };

  const triggerMp4Download = async (
    e: React.MouseEvent<HTMLAnchorElement>,
    rawUrl: string,
    fileName: string
  ) => {
    const href = buildDownloadMp4Href(rawUrl, fileName);
    if (!href) return;
    e.preventDefault();
    try {
      const resp = await fetch(href);
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!resp.ok || (!ct.includes('video') && !ct.includes('octet-stream'))) {
        setJustCutBanner(
          '⚠️ Đường dẫn này chưa có luồng MP4 hoàn chỉnh để tải xuống. Hãy bấm "✅ Chấp Nhận Cắt" để hệ thống tạo file MP4 3:4 HD trước!'
        );
        return;
      }
      const blob = await resp.blob();
      if (blob.size < 10000) {
        setJustCutBanner('⚠️ File video quá nhỏ hoặc chưa sẵn sàng. Vui lòng cắt lại đoạn này!');
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const tmp = document.createElement('a');
      tmp.href = blobUrl;
      tmp.download = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
      document.body.appendChild(tmp);
      tmp.click();
      tmp.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
    } catch {
      const tmp = document.createElement('a');
      tmp.href = href;
      tmp.download = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
      document.body.appendChild(tmp);
      tmp.click();
      tmp.remove();
    }
  };

  const cleanCharName = characterName.split('—')[0].split('-')[0].trim() || 'Clint Eastwood';

  const activeCharName = React.useMemo(() => {
    const stripped = (searchQuery || '')
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/\b(18|19|20)\d{2}s?\b/g, '')
      .replace(
        /\b(shorts|short|tiktok|titock|instagram|ingram|insta|reels|reel|youtube|video|movie|clips|clip|scene|scenes|interview|tribute|trailer|actor|portrait|iconic|circa|early|late|young|birthplace)\b/gi,
        ''
      )
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.length >= 3 ? stripped : cleanCharName;
  }, [searchQuery, cleanCharName]);

  // Filter saved cuts to only show cuts belonging to the currently active character/subject (prevents showing Will Sampson's Cuckoo's Nest cut when working on Clint Eastwood!)
  const visibleSavedCuts = React.useMemo(() => {
    const lowerActive = activeCharName.toLowerCase();
    const otherKnownActors = [
      'will sampson',
      'chief bromden',
      "cuckoo's nest",
      'cuckoos nest',
      'the chief learns to dunk',
      'steve mcqueen',
      'bullitt',
      'clint eastwood',
      'john wayne',
      'bruce lee',
      'elvis presley',
      'audrey hepburn',
      'lorne greene',
      'clayton moore',
      'yul brynner',
    ];
    return savedCuts.filter((cut) => {
      const cutChar = (cut.characterName || '').toLowerCase();
      const cutTitle = (cut.title || '').toLowerCase();
      if (cutChar) {
        return cutChar.includes(lowerActive) || lowerActive.includes(cutChar);
      }
      // If legacy cut has no characterName tag, check if it explicitly belongs to a different known actor
      const belongsToOtherActor = otherKnownActors.some((actorKeyword) => {
        if (lowerActive.includes(actorKeyword)) return false;
        if (
          lowerActive.includes('will sampson') &&
          (actorKeyword === 'chief bromden' ||
            actorKeyword === "cuckoo's nest" ||
            actorKeyword === 'cuckoos nest' ||
            actorKeyword === 'the chief learns to dunk')
        ) {
          return false;
        }
        if (lowerActive.includes('steve mcqueen') && actorKeyword === 'bullitt') {
          return false;
        }
        return cutTitle.includes(actorKeyword);
      });
      return !belongsToOtherActor;
    });
  }, [savedCuts, activeCharName]);

  // Eligible visual scenes on the Timeline that can receive a cut video
  const selectableScenes = React.useMemo(() => {
    const list = allScenes.filter((s) => s.sceneType !== 'outro' && s.sceneType !== 'quote');
    if (list.length > 0) return list;
    return scene ? [scene] : [];
  }, [allScenes, scene]);

  const [selectedModalSceneId, setSelectedModalSceneId] = useState<string>(
    scene?.id || activeSceneId || selectableScenes[0]?.id || ''
  );

  const effectiveScene = React.useMemo(() => {
    return (
      allScenes.find((s) => s.id === selectedModalSceneId) ||
      scene ||
      allScenes.find((s) => s.id === activeSceneId) ||
      selectableScenes[0] ||
      null
    );
  }, [allScenes, selectedModalSceneId, scene, activeSceneId, selectableScenes]);

  const sceneDur = Math.max(5, Math.round(effectiveScene?.durationSec || 9));

  const videoScenesOnly = React.useMemo(() => {
    const vList = selectableScenes.filter((s) => s.sceneType === 'video');
    return vList.length > 0 ? vList : selectableScenes;
  }, [selectableScenes]);

  const getSceneDurationById = (sId: string): number => {
    const found =
      allScenes.find((s) => s.id === sId) ||
      (effectiveScene?.id === sId ? effectiveScene : undefined);
    return Math.max(5, Math.round(found?.durationSec || 9));
  };

  const getSceneBadgeById = (sId: string): string => {
    const found =
      allScenes.find((s) => s.id === sId) ||
      (effectiveScene?.id === sId ? effectiveScene : undefined);
    if (!found) return 'Đoạn Đang Chọn';
    return `Đoạn #${String(found.order).padStart(2, '0')} (${Math.round(found.durationSec || 8)}s)`;
  };

  const sceneSpecificQuery = React.useMemo(() => {
    if (!effectiveScene) return '';
    const kw = (effectiveScene.archivalKeywords || '').trim();
    if (kw && kw.toLowerCase() !== cleanCharName.toLowerCase()) {
      return kw.toLowerCase().includes(cleanCharName.toLowerCase())
        ? kw
        : `${cleanCharName} ${kw}`;
    }
    return '';
  }, [effectiveScene, cleanCharName]);

  const suggestedQueries = React.useMemo(() => {
    const isFilmMode = settings?.storyMode === 'film-cast';
    const list: string[] = [
      cleanCharName,
      ...(sceneSpecificQuery ? [sceneSpecificQuery] : []),
      ...(isFilmMode
        ? [
            `${cleanCharName} best scenes`,
            `${cleanCharName} cast then and now`,
            `${cleanCharName} shorts`,
            `${cleanCharName} tiktok`,
            `${cleanCharName} instagram reels`,
            `${cleanCharName} behind the scenes`,
          ]
        : [
            `${cleanCharName} shorts`,
            `${cleanCharName} tiktok`,
            `${cleanCharName} instagram reels`,
          ]),
    ];
    if (!isFilmMode) {
      const lowerChar = cleanCharName.toLowerCase();
      if (lowerChar.includes('will sampson')) {
        list.push(
          `Will Sampson One Flew Over the Cuckoo's Nest`,
          `Will Sampson The Outlaw Josey Wales`,
          `Will Sampson Interview Tribute`
        );
      } else if (lowerChar.includes('lorne greene')) {
        list.push(`${cleanCharName} Bonanza Ben Cartwright`, `${cleanCharName} Ponderosa`);
      } else if (lowerChar.includes('clayton moore')) {
        list.push(`${cleanCharName} The Lone Ranger`, `${cleanCharName} Lone Ranger interview`);
      } else if (lowerChar.includes('yul brynner')) {
        list.push(`${cleanCharName} The Magnificent Seven`, `${cleanCharName} The King and I`);
      } else {
        list.push(`${cleanCharName} movie clips`, `${cleanCharName} interview`);
      }
    }
    return Array.from(new Set(list)).slice(0, 8);
  }, [cleanCharName, sceneSpecificQuery, settings?.storyMode]);

  const handleSelectPartScene = (targetSc: StoryScene, runPartSearch = false) => {
    setSelectedModalSceneId(targetSc.id);
    // Assign all cards to target this chosen part/scene immediately
    setYtTargetSceneIds((prev) => {
      const next = { ...prev };
      youtubeVideos.forEach((v) => {
        next[v.id] = targetSc.id;
      });
      return next;
    });
    setArchivalTargetScenes((prev) => {
      const next = { ...prev };
      videoOptions.forEach((v) => {
        next[v.id] = targetSc.id;
      });
      return next;
    });
    if (runPartSearch) {
      const kw = (targetSc.archivalKeywords || '').trim();
      const qToSearch =
        kw && kw.toLowerCase() !== cleanCharName.toLowerCase()
          ? kw.toLowerCase().includes(cleanCharName.toLowerCase())
            ? kw
            : `${cleanCharName} ${kw}`
          : cleanCharName;
      setSearchQuery(qToSearch);
      executeSearch(qToSearch, cycleOffset, targetSc.id);
    }
  };

  const executeSearch = async (
    queryToRun: string,
    nextCycle = 0,
    overrideSceneId?: string,
    appendMode = false,
    overrideDepth?: 'all' | 'cinema' | 'interview' | 'rare' | 'archive' | 'social'
  ) => {
    const activeDepth = overrideDepth || searchDepth;
    if (appendMode) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setIsLoadingArchival(true);
    setPreviewingYtId(null);
    const effectiveQuery = queryToRun.trim() || cleanCharName;
    const strippedSubject = effectiveQuery
      .replace(/https?:\/\/[^\s]+/gi, '')
      .replace(/\b(18|19|20)\d{2}s?\b/g, '')
      .replace(
        /\b(shorts|short|tiktok|titock|instagram|ingram|insta|reels|reel|youtube|video|movie|clips|clip|scene|scenes|interview|tribute|trailer|actor|portrait|iconic|circa|early|late|young|birthplace|documentary|rare|footage|behind|the|quotes|life|biography|best)\b/gi,
        ''
      )
      .replace(/\s+/g, ' ')
      .trim();
    const effectiveCharForSearch = strippedSubject.length >= 3 ? strippedSubject : cleanCharName;

    // Clear any stale accepted cut banner if it belongs to a different character
    setLatestAcceptedCut((prev) => {
      if (!prev) return null;
      const prevChar = (prev.characterName || prev.title || '').toLowerCase();
      if (!prevChar.includes(effectiveCharForSearch.toLowerCase())) {
        setJustCutBanner(null);
        return null;
      }
      return prev;
    });

    const targetSceneForDefault =
      overrideSceneId ||
      selectedModalSceneId ||
      scene?.id ||
      activeSceneId ||
      selectableScenes[0]?.id ||
      '';

    const getYtDedupKey = (item: YouTubeSearchVideoItem) =>
      item.youtubeId
        ? `yt:${item.youtubeId}`
        : item.tiktokId
        ? `tt:${item.tiktokId}`
        : item.instagramId
        ? `ig:${item.instagramId}`
        : item.dmId
        ? `dm:${item.dmId}`
        : item.archiveMp4Url
        ? `arc:${item.archiveMp4Url}`
        : `id:${item.id}`;

    const applyYtList = (ytList: YouTubeSearchVideoItem[]) => {
      let mergedList: YouTubeSearchVideoItem[] = ytList;
      if (appendMode) {
        setYoutubeVideos((prev) => {
          const seen = new Set(prev.map(getYtDedupKey));
          const uniqueAdditions = ytList.filter((item) => {
            const key = getYtDedupKey(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          mergedList = [...prev, ...uniqueAdditions];
          return mergedList;
        });
      } else {
        setYoutubeVideos(ytList);
      }

      const shuffledScenePool = [
        ...(videoScenesOnly.length > 0 ? videoScenesOnly : selectableScenes),
      ].sort(() => Math.random() - 0.5);

      const newStarts: Record<string, number> = {};
      const newEnds: Record<string, number> = {};
      const newTargetScenes: Record<string, string> = {};

      ytList.forEach((v, idx) => {
        const randomPoolScene =
          shuffledScenePool.length > 0
            ? shuffledScenePool[idx % shuffledScenePool.length]?.id
            : undefined;
        const defaultTargetScene =
          targetSceneForDefault ||
          randomPoolScene ||
          activeSceneId ||
          selectableScenes[0]?.id ||
          '';
        const targetDur = getSceneDurationById(defaultTargetScene);
        const sSec =
          typeof v.suggestedTrimStartSec === 'number' && v.suggestedTrimStartSec >= 0
            ? v.suggestedTrimStartSec
            : 18 + (idx % 6) * 20;
        newStarts[v.id] = sSec;
        newEnds[v.id] = sSec + targetDur;
        newTargetScenes[v.id] = defaultTargetScene;
      });

      if (appendMode) {
        setYtTrimStarts((prev) => ({ ...newStarts, ...prev }));
        setYtTrimEnds((prev) => ({ ...newEnds, ...prev }));
        setYtTargetSceneIds((prev) => ({ ...newTargetScenes, ...prev }));
      } else {
        setYtTrimStarts(newStarts);
        setYtTrimEnds(newEnds);
        setYtTargetSceneIds(newTargetScenes);
      }
    };

    // 1. Fire Archival Videos & Photos search in parallel (Archive.org MP4 + Wikimedia Commons)
    fetch('/api/archival/search-scene-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: effectiveQuery,
        characterName: effectiveCharForSearch,
        sceneDurationSec: sceneDur,
        limit: 20,
        videoLimit: 14,
        cycleOffset: nextCycle,
      }),
    })
      .then(async (archRes) => {
        if (!archRes.ok) return;
        const data = await archRes.json();
        const vids: SceneVideoOption[] = Array.isArray(data?.videoOptions)
          ? data.videoOptions
          : [];
        const imgs: ScenePhotoOption[] = Array.isArray(data?.photoOptions)
          ? data.photoOptions
          : [];

        if (appendMode) {
          setVideoOptions((prev) => {
            const seen = new Set(prev.map((p) => p.videoUrl || p.id));
            const extra = vids.filter((v) => {
              const key = v.videoUrl || v.id;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return [...prev, ...extra];
          });
          setPhotoOptions((prev) => {
            const seen = new Set(prev.map((p) => p.dataUrl || p.id));
            const extra = imgs.filter((im) => {
              const key = im.dataUrl || im.id;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            return [...prev, ...extra];
          });
        } else {
          setVideoOptions(vids);
          setPhotoOptions(imgs);
        }

        const initialTrims: Record<string, number> = {};
        const initialTrimEnds: Record<string, number> = {};
        const nextArchTargets: Record<string, string> = {};
        const defaultDur = getSceneDurationById(targetSceneForDefault);
        vids.forEach((v) => {
          initialTrims[v.id] = v.trimStartSec;
          initialTrimEnds[v.id] = v.trimStartSec + defaultDur;
          if (targetSceneForDefault) {
            nextArchTargets[v.id] = targetSceneForDefault;
          }
        });
        if (appendMode) {
          setCustomTrimStarts((prev) => ({ ...initialTrims, ...prev }));
          setCustomTrimEnds((prev) => ({ ...initialTrimEnds, ...prev }));
          if (targetSceneForDefault) {
            setArchivalTargetScenes((prev) => ({ ...nextArchTargets, ...prev }));
          }
        } else {
          setCustomTrimStarts(initialTrims);
          setCustomTrimEnds(initialTrimEnds);
          if (targetSceneForDefault) {
            setArchivalTargetScenes(nextArchTargets);
          }
        }

        vids.slice(0, 4).forEach((v) => {
          captureRealVideoFrameThumbnail(v.videoUrl, v.trimStartSec, 7500).then((frameUrl) => {
            if (!frameUrl) return;
            setVideoOptions((prev) =>
              prev.map((item) => (item.id === v.id ? { ...item, dataUrl: frameUrl } : item))
            );
          });
        });
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingArchival(false);
      });

    // 2. Fetch Deep Multi-Source External Videos (YouTube 7 angles + Shorts + TikTok + Instagram + Archive.org MP4 + Dailymotion)
    try {
      let ytList: YouTubeSearchVideoItem[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const ytRes = await fetch('/api/youtube/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: effectiveQuery,
            characterName: effectiveCharForSearch,
            limit: 60,
            cycleOffset: nextCycle,
            searchDepth: activeDepth,
          }),
        });
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          ytList = Array.isArray(ytData?.videos) ? ytData.videos : [];
          if (ytList.length > 0) break;
        }
      }
      applyYtList(ytList);
    } catch {
      // Keep existing options
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const loadSavedCutsFromServer = async () => {
    try {
      const res = await fetch('/api/youtube/saved-cuts');
      if (res.ok) {
        const data = await res.json();
        const serverList = Array.isArray(data?.savedCuts)
          ? data.savedCuts
          : Array.isArray(data?.cuts)
          ? data.cuts
          : [];
        if (serverList.length > 0) {
          setSavedCuts(serverList);
          try {
            localStorage.setItem('legendcut_saved_cuts_list_v1', JSON.stringify(serverList));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      const initSceneId = scene?.id || activeSceneId || selectableScenes[0]?.id || '';
      setSelectedModalSceneId(initSceneId);
      const defaultQuery = cleanCharName;
      setSearchQuery(defaultQuery);
      setFilterTab(initialTab);
      setSearchDepth('all');
      setVideoSourceSubFilter('all');
      setPreviewUseDirectMp4({});
      setCycleOffset(0);
      setQueuedSegments([]);
      setPreviewingYtId(null);
      setPreviewRemainingSec(0);
      setLatestAcceptedCut(null);
      setJustCutBanner(null);
      setShowSavedCutsDrawer(false);
      loadSavedCutsFromServer();
      executeSearch(defaultQuery, 0, initSceneId, false, 'all');
    }
  }, [isOpen, scene?.id, initialTab, cleanCharName]);

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
      effectiveScene?.id ||
      activeSceneId ||
      selectableScenes[0]?.id ||
      '';
    const targetDur = getSceneDurationById(chosenSceneId);
    const eSec = Math.max(sSec + 3, ytTrimEnds[yt.id] ?? sSec + targetDur);
    const clipLen = Math.max(3, eSec - sSec);
    const isSocialCard =
      yt.sourcePlatform === 'shorts' ||
      yt.sourcePlatform === 'tiktok' ||
      yt.sourcePlatform === 'instagram';
    setPreviewRemainingSec(isSocialCard ? Math.max(25, clipLen) : clipLen);

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
  }, [previewingYtId, youtubeVideos, ytTrimStarts, ytTrimEnds, ytTargetSceneIds, effectiveScene?.id, activeSceneId]);

  if (!isOpen) return null;

  const sceneNumLabel = effectiveScene ? `#${String(effectiveScene.order).padStart(2, '0')}` : null;

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

  // Cut and replace from a Replacement Video card (Section 0) via FFmpeg & save into Kho Đã Cắt
  const handleAcceptCutFromReplacementVideo = async (
    vid: SceneVideoOption,
    chosenSceneId: string,
    startSec: number,
    endSec: number,
    closeAfter = false
  ) => {
    if (isCuttingYouTube || !chosenSceneId) return;
    const cleanStreamUrl = (vid.videoUrl || '').split('#')[0];
    let archiveMp4Url = cleanStreamUrl;
    if (cleanStreamUrl.includes('/api/archival/video-stream?url=')) {
      const uParam = cleanStreamUrl.split('url=')[1];
      if (uParam) archiveMp4Url = decodeURIComponent(uParam.split('&')[0]);
    }
    const dur = Math.max(3, endSec - startSec);

    setIsCuttingYouTube(true);
    setCuttingCardId(vid.id);
    const cutCtrl = new AbortController();
    const cutTimeout = setTimeout(() => cutCtrl.abort(), 110000);
    try {
      const res = await fetch('/api/youtube/cut-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: cutCtrl.signal,
        body: JSON.stringify({
          characterName: activeCharName,
          searchQuery: searchQuery || activeCharName,
          frameMode: cutFrameMode,
          focusX: cutFocusX,
          clips: [
            {
              id: vid.id,
              targetSceneId: chosenSceneId,
              title: vid.title,
              archiveMp4Url,
              preferArchiveMp4: true,
              thumbnailUrl: vid.dataUrl,
              trimStartSec: startSec,
              trimEndSec: endSec,
              durationSec: dur,
              frameMode: cutFrameMode,
              focusX: cutFocusX,
            },
          ],
        }),
      });
      clearTimeout(cutTimeout);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.cuts) && data.cuts.length > 0 && onInsertCutYouTubeClips) {
          const cutObj: CutYouTubeResultItem = {
            ...data.cuts[0],
            characterName: activeCharName,
            targetSceneId: chosenSceneId,
          };
          onInsertCutYouTubeClips([cutObj], chosenSceneId);

          const nextSaved: CutYouTubeResultItem[] =
            Array.isArray(data?.savedCuts) && data.savedCuts.length > 0
              ? data.savedCuts
              : [
                  cutObj,
                  ...savedCuts.filter((sc) => sc.id !== cutObj.id),
                ];
          setSavedCuts(nextSaved);
          try {
            localStorage.setItem('legendcut_saved_cuts_list_v1', JSON.stringify(nextSaved));
          } catch {
            // ignore
          }
          setLatestAcceptedCut(cutObj);
          setSavedCutTargetScenes((prev) => ({ ...prev, [cutObj.id]: chosenSceneId }));
          setSelectedModalSceneId(chosenSceneId);
          setJustCutBanner(
            `✅ ĐÃ CHẤP NHẬN CẮT (${startSec}s → ${endSec}s) & THAY VÀO ${getSceneBadgeById(chosenSceneId).toUpperCase()}! Bạn có thể xem lại đoạn vừa cắt ngay bên dưới, bấm đổi sang Phần khác chỉ với 1-Click, hoặc bấm "Đóng & Xem Ngay Trên Timeline".`
          );
          if (closeAfter) {
            onClose();
            return;
          }
          resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      } else {
        const errData = await res.json().catch(() => null);
        setJustCutBanner(
          errData?.error ||
            '⚠️ Không thể tải luồng MP4 từ video này để cắt. Hãy chọn video có nhãn "✂️ Cắt Trực Tiếp MP4" (Dailymotion / TikTok / Archive) hoặc up file MP4 từ máy để cắt chuẩn 100%!'
        );
        resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      setJustCutBanner(
        '⏱️ Quá thời gian chờ tải nguồn video để cắt. Hãy chọn video "✂️ Cắt Trực Tiếp MP4" hoặc up file MP4 từ máy!'
      );
      resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      clearTimeout(cutTimeout);
      setIsCuttingYouTube(false);
      setCuttingCardId(null);
    }
  };

  const handleCutLocalUploadedVideo = async (closeAfter = false) => {
    if (!localCutFile || isCuttingYouTube || !onInsertCutYouTubeClips) return;
    const chosenSceneId =
      localCutTargetSceneId ||
      effectiveScene?.id ||
      scene?.id ||
      activeSceneId ||
      selectableScenes[0]?.id ||
      '';
    const startSec = Math.max(0, Math.round(localCutStartSec));
    const endSec = Math.max(startSec + 3, Math.round(localCutEndSec));
    setIsCuttingYouTube(true);
    setCuttingCardId('__LOCAL_UPLOAD__');
    try {
      const params = new URLSearchParams({
        startSec: String(startSec),
        endSec: String(endSec),
        title: localCutFile.name.replace(/\.[^.]+$/, ''),
        targetSceneId: chosenSceneId,
        characterName: activeCharName,
        frameMode: cutFrameMode,
        focusX: cutFocusX,
      });
      const res = await fetch(`/api/youtube/cut-uploaded-raw?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: localCutFile,
      });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.cuts) && data.cuts.length > 0) {
        const cutObj: CutYouTubeResultItem = {
          ...data.cuts[0],
          characterName: activeCharName,
          targetSceneId: chosenSceneId,
        };
        onInsertCutYouTubeClips([cutObj], chosenSceneId);
        const nextSaved: CutYouTubeResultItem[] = Array.isArray(data?.savedCuts)
          ? data.savedCuts
          : [cutObj, ...savedCuts];
        setSavedCuts(nextSaved);
        try {
          localStorage.setItem('legendcut_saved_cuts_list_v1', JSON.stringify(nextSaved));
        } catch {}
        setLatestAcceptedCut(cutObj);
        setSavedCutTargetScenes((prev) => ({ ...prev, [cutObj.id]: chosenSceneId }));
        setSelectedModalSceneId(chosenSceneId);
        setJustCutBanner(
          `✅ ĐÃ CẮT VIDEO MÁY (${startSec}s → ${endSec}s) & THAY VÀO ${getSceneBadgeById(chosenSceneId).toUpperCase()}!`
        );
        if (closeAfter) {
          onClose();
          return;
        }
        resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setJustCutBanner(data?.error || '⚠️ Không thể cắt file video vừa tải lên.');
      }
    } catch {
      setJustCutBanner('⚠️ Lỗi kết nối khi gửi file video lên máy chủ để cắt.');
    } finally {
      setIsCuttingYouTube(false);
      setCuttingCardId(null);
    }
  };

  // Cut either a SINGLE card's segment OR the explicitly queued segments (each into its own targetSceneId!)
  const handleCutAndInsertYouTubeVideos = async (
    specificVideo?: YouTubeSearchVideoItem,
    closeAfter = false
  ) => {
    if (isCuttingYouTube || !onInsertCutYouTubeClips) return;

    let segmentsToCut: QueuedYouTubeSegment[] = [];
    if (specificVideo) {
      const startSec = ytTrimStarts[specificVideo.id] ?? specificVideo.suggestedTrimStartSec ?? 18;
      const chosenSceneId =
        ytTargetSceneIds[specificVideo.id] ||
        effectiveScene?.id ||
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
    const cutCtrl = new AbortController();
    const cutTimeout = setTimeout(() => cutCtrl.abort(), 110000);
    try {
      const clipsPayload = segmentsToCut.map((seg) => ({
        id: seg.video.id,
        targetSceneId: seg.targetSceneId,
        title: seg.video.title,
        youtubeId: seg.video.youtubeId,
        youtubeUrl: seg.video.youtubeUrl || '',
        videoUrl: seg.video.archiveMp4Url || '',
        tiktokUrl: seg.video.tiktokUrl || '',
        instagramUrl: seg.video.instagramUrl || '',
        dmId: seg.video.dmId,
        archiveMp4Url: seg.video.archiveMp4Url,
        preferArchiveMp4: true,
        thumbnailUrl: seg.video.thumbnailUrl,
        trimStartSec: seg.trimStartSec,
        trimEndSec: seg.trimEndSec,
        durationSec: Math.max(3, seg.trimEndSec - seg.trimStartSec),
        frameMode: cutFrameMode,
        focusX: cutFocusX,
      }));

      const res = await fetch('/api/youtube/cut-clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: cutCtrl.signal,
        body: JSON.stringify({
          clips: clipsPayload,
          characterName: activeCharName,
          searchQuery: searchQuery || activeCharName,
          frameMode: cutFrameMode,
          focusX: cutFocusX,
        }),
      });
      clearTimeout(cutTimeout);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.cuts) && data.cuts.length > 0) {
          const targetIdForSingle =
            segmentsToCut.length === 1 ? segmentsToCut[0].targetSceneId : null;
          onInsertCutYouTubeClips(data.cuts, targetIdForSingle);

          // Update persistent Saved Cuts list so user sees the cut video immediately and can download or re-insert
          const nextSaved: CutYouTubeResultItem[] = Array.isArray(data?.savedCuts) && data.savedCuts.length > 0
            ? data.savedCuts
            : [
                ...data.cuts,
                ...savedCuts.filter((sc) => !data.cuts.some((nc: CutYouTubeResultItem) => nc.id === sc.id)),
              ];
          setSavedCuts(nextSaved);
          try {
            localStorage.setItem('legendcut_saved_cuts_list_v1', JSON.stringify(nextSaved));
          } catch {
            // ignore
          }

          const firstCut: CutYouTubeResultItem = {
            ...data.cuts[0],
            characterName: activeCharName,
            targetSceneId:
              data.cuts[0].targetSceneId ||
              targetIdForSingle ||
              effectiveScene?.id ||
              scene?.id ||
              '',
          };
          setLatestAcceptedCut(firstCut);
          if (firstCut.targetSceneId) {
            setSavedCutTargetScenes((prev) => ({
              ...prev,
              [firstCut.id]: firstCut.targetSceneId!,
            }));
            setSelectedModalSceneId(firstCut.targetSceneId);
          }

          setQueuedSegments([]);
          const cutSummary = data.cuts
            .map(
              (c: CutYouTubeResultItem) =>
                `${getSceneBadgeById(c.targetSceneId || targetIdForSingle || scene?.id || '')} (${c.originalStartSec}s→${c.originalEndSec}s)`
            )
            .join(', ');
          const matchedNote = data.cuts[0]?.matchedSourceTitle
            ? ` [Nguồn MP4 khớp: "${data.cuts[0].matchedSourceTitle}"]`
            : '';
          setJustCutBanner(
            `✅ ĐÃ CHẤP NHẬN CẮT & THAY THẾ THÀNH CÔNG (${cutSummary})${matchedNote}! Bạn có thể xem trước đoạn vừa cắt ngay bên dưới, bấm 1-Click để chuyển/gắn sang bất kỳ Phần nào, hoặc tải MP4 về máy!`
          );
          if (closeAfter) {
            onClose();
            return;
          }
          resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          setJustCutBanner(
            '⚠️ Không thể tải luồng MP4 từ video này để cắt. Hãy chọn video có nhãn "✂️ Cắt Trực Tiếp MP4" (Dailymotion / Archive) hoặc up file MP4 từ máy!'
          );
          resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        const errData = await res.json().catch(() => null);
        setJustCutBanner(
          errData?.error ||
            '⚠️ Máy chủ nguồn video phản hồi chậm hoặc đang bận. Vui lòng thử cắt lại hoặc chọn video khác!'
        );
        resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch {
      setJustCutBanner(
        '⏱️ Quá thời gian chờ tải nguồn video. Hệ thống đã tự ngắt để không bị treo — bạn hãy thử bấm cắt lại hoặc chọn video có nhãn "✂️ Cắt Trực Tiếp MP4"!'
      );
      resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      clearTimeout(cutTimeout);
      setIsCuttingYouTube(false);
      setCuttingCardId(null);
    }
  };

  const handleDeleteSavedCut = async (cutId: string) => {
    setSavedCuts((prev) => {
      const next = prev.filter((c) => c.id !== cutId);
      try {
        localStorage.setItem('legendcut_saved_cuts_list_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    try {
      await fetch(`/api/youtube/saved-cuts/${encodeURIComponent(cutId)}`, { method: 'DELETE' });
    } catch {
      // ignore
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

  const nonCompositeSoloRegex =
    /\b(collage|montage|grid|composite|split|diptych|triptych|comparison|before[\s_-]?and[\s_-]?after|then[\s_-]?and[\s_-]?now|mugshot|grave|tombstone|poster|cover|magazine|newspaper|reunion|reuni[aã]o|meeting|ceremony|group|crowd|audience|couple|cast|digital[\s_-]?art|digital[\s_-]?painting|premium[\s_-]?ai|seaart|craiyon|midjourney|ai[\s_-]?art)\b/i;

  const combinedPhotos = [
    ...photoOptions,
    ...vaultPhotoExtras.filter((vp) => !photoOptions.some((po) => po.dataUrl === vp.dataUrl)),
  ]
    .filter((p) => {
      if (nonCompositeSoloRegex.test(p.title || '')) return false;
      const w = p.width || 720;
      const h = p.height || 960;
      if (w / Math.max(1, h) > 1.32) return false;
      return true;
    })
    .sort((a, b) => {
      const ra = (a.width || 720) / Math.max(1, a.height || 960);
      const rb = (b.width || 720) / Math.max(1, b.height || 960);
      const sa = ra >= 0.55 && ra <= 0.95 ? 1 : 0;
      const sb = rb >= 0.55 && rb <= 0.95 ? 1 : 0;
      return sb - sa;
    });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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

            {effectiveScene && photoOptions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const chosenPhoto =
                    photoOptions.find(
                      (p) =>
                        p.dataUrl !== effectiveScene.mediaUrl &&
                        p.dataUrl !== effectiveScene.characterRefPhotoUrl
                    ) || photoOptions[0];
                  if (chosenPhoto) {
                    onSelectPhotoForScene(effectiveScene.id, chosenPhoto, 'keep-video-grok-ref');
                    onClose();
                  }
                }}
                title="Nếu đoạn này chưa có video thật ưng ý, bấm để giữ Ảnh Thật Gốc + Bộ Prompt Grok/Kling AI để bạn vẽ video sau"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>🖼️ Để Ảnh Gốc + Prompt Vẽ Sau</span>
              </button>
            )}

            {effectiveScene && onUploadLocalFileForScene && (
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Tải File Từ Máy</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      onUploadLocalFileForScene(effectiveScene.id, f);
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

        {/* PER-PART / PER-SCENE SELECTOR BAR (TÌM & THAY THẾ VIDEO CHO TỪNG PHẦN #01 -> #N) */}
        {selectableScenes.length > 0 && (
          <div className="px-5 py-2.5 bg-[#0C121E] border-b border-slate-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-400">
                  🎯 Tìm &amp; Thay Thế Video Cho Từng Phần (Chọn Phần / Cảnh cần làm):
                </span>
                {effectiveScene && (
                  <span className="text-[11px] text-slate-300 truncate max-w-md">
                    Đang chọn <strong className="text-amber-300">Phần #{String(effectiveScene.order).padStart(2, '0')}</strong> ({Math.round(effectiveScene.durationSec || 8)}s):{' '}
                    <em className="text-slate-400">"{effectiveScene.narrationText.slice(0, 65)}..."</em>
                  </span>
                )}
              </div>

              {effectiveScene && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectPartScene(effectiveScene, true)}
                    className="px-2.5 py-1 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 shadow transition-colors"
                    title="Tìm video đúng theo từ khóa và nội dung của riêng Phần đang chọn"
                  >
                    <Search className="w-3 h-3" />
                    <span>
                      🔍 Tìm Video Riêng Cho Phần #{String(effectiveScene.order).padStart(2, '0')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = cycleOffset + 1;
                      setCycleOffset(next);
                      executeSearch(searchQuery || cleanCharName, next, effectiveScene.id);
                    }}
                    className="px-2.5 py-1 rounded text-[11px] font-bold bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/50 flex items-center gap-1 transition-colors"
                    title="Tải lô Video Thay Thế khác cho Phần này"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingArchival ? 'animate-spin' : ''}`} />
                    <span>🔄 Đổi Video Thay Thế Khác</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {selectableScenes.map((sc) => {
                const isSelectedPart = effectiveScene?.id === sc.id;
                const hasRealVid = Boolean(sc.mediaUrl) && sc.mediaKind === 'video';
                const hasRealImg = Boolean(sc.mediaUrl) && sc.mediaKind !== 'video' && sc.hasRealPhoto !== false;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectPartScene(sc, false)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1.5 border shrink-0 transition-all ${
                      isSelectedPart
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow ring-2 ring-amber-400/40'
                        : hasRealVid
                        ? 'bg-sky-950/70 text-sky-200 border-sky-500/50 hover:border-amber-400'
                        : hasRealImg
                        ? 'bg-emerald-950/60 text-emerald-200 border-emerald-500/40 hover:border-amber-400'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-400'
                    }`}
                    title={`Bấm để chọn Phần #${String(sc.order).padStart(2, '0')}: ${sc.title} (${Math.round(sc.durationSec || 8)}s)`}
                  >
                    <span>Phần #{String(sc.order).padStart(2, '0')}</span>
                    <span className="text-[10px] opacity-85 font-normal max-w-[90px] truncate">
                      {sc.title}
                    </span>
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] font-mono ${
                        isSelectedPart
                          ? 'bg-slate-950/25 text-slate-950 font-extrabold'
                          : hasRealVid
                          ? 'bg-sky-500/30 text-sky-200'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {hasRealVid ? '🎬 Đã có MP4' : hasRealImg ? '📸 Ảnh gốc' : 'Cần video'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 3:4 HD ANTI-BLUR FRAMING BAR (CHUẨN KHUNG 3:4 SẮC NÉT 720x960 — CHỐNG MỜ KHI CẮT) */}
            <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-extrabold text-emerald-300 flex items-center gap-1">
                  <span>📐 Khung Chuẩn 3:4 HD (720×960 · Chống Mờ):</span>
                </span>
                <button
                  type="button"
                  onClick={() => setCutFrameMode('3:4-sharp')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                    cutFrameMode === '3:4-sharp'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-400'
                  }`}
                  title="Cắt chuẩn khung dọc 3:4 tràn viền (720x960 HD) + thuật toán Lanczos & Unsharp nâng nét quang học để video không bị mờ"
                >
                  ✨ Full Khung 3:4 Sắc Nét (Khử Mờ HD)
                </button>
                <button
                  type="button"
                  onClick={() => setCutFrameMode('3:4-cinema')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                    cutFrameMode === '3:4-cinema'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-400'
                  }`}
                  title="Giữ góc cảnh rộng hơn để không phóng to quá mức gây mờ, đồng thời phủ phông mờ 3:4 sang trọng ở viền trên/dưới"
                >
                  🎬 Khung 3:4 Cân Bằng (Rõ Mặt + Viền Mờ 3:4)
                </button>
                <button
                  type="button"
                  onClick={() => setCutFrameMode('3:4-full-wide')}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                    cutFrameMode === '3:4-full-wide'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-emerald-400'
                  }`}
                  title="Giữ nguyên 100% chiều ngang video gốc sắc nét tuyệt đối ở chính giữa khung 3:4 (720x960)"
                >
                  🖼️ Khung 3:4 Giữ 100% Góc Rộng (Nét Tuyệt Đối)
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-semibold">
                  Canh tâm 3:4:
                </span>
                {(
                  [
                    { id: 'left', label: '⬅ Trái' },
                    { id: 'center', label: '🎯 Giữa chuẩn' },
                    { id: 'right', label: 'Phải ➡' },
                  ] as const
                ).map((pos) => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setCutFocusX(pos.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                      cutFocusX === pos.id
                        ? 'bg-amber-500 text-slate-950 border-amber-300'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShow34Guide((prev) => !prev)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    show34Guide
                      ? 'bg-sky-500/25 text-sky-200 border-sky-400'
                      : 'bg-slate-900 text-slate-400 border-slate-700'
                  }`}
                  title="Bật/tắt khung ngắm tỉ lệ 3:4 trực tiếp trên từng ô video"
                >
                  {show34Guide ? '📐 Đang bật Khung Ngắm 3:4' : '📐 Bật Khung Ngắm 3:4'}
                </button>
              </div>
            </div>
          </div>
        )}

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
              const qRaw = searchQuery.trim();
              if (/\b(tiktok|titock)\b|tiktok\.com/i.test(qRaw)) {
                setFilterTab('youtube');
                setSearchDepth('social');
                setVideoSourceSubFilter('tiktok');
                setCycleOffset(0);
                executeSearch(qRaw, 0, effectiveScene?.id, false, 'social');
              } else if (/\b(instagram|ingram|reels|reel)\b|instagram\.com/i.test(qRaw)) {
                setFilterTab('youtube');
                setSearchDepth('social');
                setVideoSourceSubFilter('instagram');
                setCycleOffset(0);
                executeSearch(qRaw, 0, effectiveScene?.id, false, 'social');
              } else if (/\b(shorts|short)\b|youtube\.com\/shorts/i.test(qRaw)) {
                setFilterTab('youtube');
                setSearchDepth('social');
                setVideoSourceSubFilter('shorts');
                setCycleOffset(0);
                executeSearch(qRaw, 0, effectiveScene?.id, false, 'social');
              } else {
                if (filterTab !== 'youtube' && filterTab !== 'all') {
                  setFilterTab('youtube');
                }
                executeSearch(searchQuery, cycleOffset);
              }
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nhập tên nhân vật/từ khóa hoặc dán trực tiếp Link YouTube / Shorts / TikTok / Instagram Reels vào đây..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#070A10] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || isLoadingMore}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition-colors shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tìm chuyên sâu đa nguồn...</span>
                </>
              ) : (
                <>
                  <Youtube className="w-4 h-4" />
                  <span>🔍 Tìm Sâu Đa Nguồn (60+ Video)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isLoading || isLoadingMore}
              onClick={() => {
                const next = cycleOffset + 1;
                setCycleOffset(next);
                executeSearch(searchQuery, next, effectiveScene?.id, true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/35 disabled:opacity-50 text-emerald-300 border border-emerald-500/50 transition-colors shrink-0"
              title="Giữ nguyên các video đang có và tải thêm 50+ video mới từ trang tiếp theo"
            >
              {isLoadingMore ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>➕ Tải Thêm Video</span>
            </button>

            <button
              type="button"
              disabled={isLoading || isLoadingMore}
              onClick={() => {
                const next = cycleOffset + 1;
                setCycleOffset(next);
                executeSearch(searchQuery, next, effectiveScene?.id, false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-300 border border-sky-500/40 transition-colors shrink-0"
              title="Làm mới sang một lô kết quả hoàn toàn mới"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Đổi Lô Mới</span>
            </button>
          </form>

          {/* Deep Search Mode Selector Bar (Chế Độ Tìm Video Ngoài Chuyên Sâu) */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-amber-300 shrink-0">
              🔎 Tìm Chuyên Sâu:
            </span>
            {(
              [
                { id: 'all', label: '🚀 Tất Cả Nguồn Sâu', qSuffix: '' },
                { id: 'cinema', label: '🎬 Cảnh Phim Kinh Điển', qSuffix: 'best movie scenes clips' },
                { id: 'interview', label: '🎙️ Phỏng Vấn & Tư Liệu Hiếm', qSuffix: 'rare interview documentary' },
                { id: 'rare', label: '🕰️ Thời Trẻ & Hậu Trường', qSuffix: 'young behind the scenes rare footage' },
                { id: 'archive', label: '🎞️ Archive.org (MP4 Gốc)', qSuffix: '' },
                { id: 'social', label: '📱 Shorts / TikTok / Reels', qSuffix: 'shorts' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                disabled={isLoading || isLoadingMore}
                onClick={() => {
                  setSearchDepth(mode.id);
                  setFilterTab('youtube');
                  if (mode.id === 'archive') {
                    setVideoSourceSubFilter('archive');
                  } else if (mode.id === 'social') {
                    setVideoSourceSubFilter('short-all');
                  } else {
                    setVideoSourceSubFilter('all');
                  }
                  const targetQ = mode.qSuffix ? `${activeCharName} ${mode.qSuffix}` : activeCharName;
                  setSearchQuery(targetQ);
                  setCycleOffset(0);
                  executeSearch(targetQ, 0, effectiveScene?.id, false, mode.id);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${
                  searchDepth === mode.id
                    ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
                    : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-amber-400'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Quick Keyword Suggestions + Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 font-medium">
                Gợi ý giai đoạn:
              </span>
              {suggestedQueries.map((q, qIdx) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setSearchQuery(q);
                    setFilterTab('youtube');
                    if (/\b(tiktok|titock)\b/i.test(q)) {
                      setSearchDepth('social');
                      setVideoSourceSubFilter('tiktok');
                      setCycleOffset(0);
                      executeSearch(q, 0, effectiveScene?.id, false, 'social');
                    } else if (/\b(instagram|ingram|reels|reel)\b/i.test(q)) {
                      setSearchDepth('social');
                      setVideoSourceSubFilter('instagram');
                      setCycleOffset(0);
                      executeSearch(q, 0, effectiveScene?.id, false, 'social');
                    } else if (/\b(shorts|short)\b/i.test(q)) {
                      setSearchDepth('social');
                      setVideoSourceSubFilter('shorts');
                      setCycleOffset(0);
                      executeSearch(q, 0, effectiveScene?.id, false, 'social');
                    } else {
                      setSearchDepth('all');
                      setVideoSourceSubFilter('all');
                      setCycleOffset(0);
                      executeSearch(q, 0, effectiveScene?.id, false, 'all');
                    }
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                    searchQuery === q
                      ? 'bg-red-500/25 border-red-400 text-red-200'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {qIdx === 0 ? `🔥 Tổng hợp: ${q}` : q}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setFilterTab('video')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 ${
                  filterTab === 'video'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-sky-300 hover:text-sky-200 bg-sky-500/15 border border-sky-500/40'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>🔄 Video Thay Thế &amp; Thực Tế ({videoOptions.length})</span>
              </button>
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
                <span>Video Ngoài Đa Nguồn ({youtubeVideos.length})</span>
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
              {visibleSavedCuts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setShowSavedCutsDrawer((prev) => !prev);
                    resultsBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 border transition-colors ${
                    showSavedCutsDrawer
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                  }`}
                >
                  <Scissors className="w-3 h-3" />
                  <span>✂️ 💾 Kho Đã Cắt ({visibleSavedCuts.length})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Body */}
        <div ref={resultsBodyRef} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* ACCEPTED CUT STUDIO BOX (ĐOẠN CẮT VỪA CHẤP NHẬN — CHỌN PHẦN ĐỂ THAY THẾ NGAY) */}
          {(latestAcceptedCut || justCutBanner) && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/95 via-[#0F2422] to-[#0E1B2A] border-2 border-emerald-400 text-emerald-100 space-y-3 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-[260px]">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed font-semibold text-emerald-100">
                    {justCutBanner ||
                      '✅ Đã chấp nhận đoạn cắt! Chọn bất kỳ Phần nào bên dưới để lấy đoạn cắt này thay thế vào ngay.'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow transition-colors"
                  >
                    ✅ Hoàn Tất · Đóng &amp; Xem Trên Timeline
                  </button>
                </div>
              </div>

              {latestAcceptedCut && (
                <div className="p-3 rounded-lg bg-[#090E17]/95 border border-emerald-500/50 flex flex-col md:flex-row items-stretch gap-3.5">
                  <div className="relative w-36 md:w-44 aspect-[3/4] rounded-md overflow-hidden bg-black border-2 border-emerald-400 shadow-lg shrink-0 mx-auto md:mx-0">
                    <video
                      key={latestAcceptedCut.videoUrl}
                      src={getPlayableCutVideoSrc(latestAcceptedCut)}
                      poster={latestAcceptedCut.thumbnailUrl}
                      controls
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500 text-slate-950 shadow">
                      ✂️ {latestAcceptedCut.originalStartSec}s → {latestAcceptedCut.originalEndSec}s ({latestAcceptedCut.durationSec}s)
                    </span>
                    <span className="absolute bottom-9 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold bg-black/85 text-amber-300 border border-amber-400/50">
                      📐 Chuẩn 3:4 HD (720×960)
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wide">
                          🎬 Đoạn Cắt Đã Chấp Nhận:
                        </span>
                        <h4 className="text-xs font-bold text-white truncate max-w-xl" title={latestAcceptedCut.title}>
                          {latestAcceptedCut.title}
                        </h4>
                      </div>
                      <a
                        href={buildDownloadMp4Href(
                          latestAcceptedCut.videoUrl || '',
                          `Cut_${latestAcceptedCut.originalStartSec}s-${latestAcceptedCut.originalEndSec}s.mp4`
                        )}
                        download={`Cut_${latestAcceptedCut.originalStartSec}s-${latestAcceptedCut.originalEndSec}s.mp4`}
                        onClick={(e) =>
                          triggerMp4Download(
                            e,
                            latestAcceptedCut.videoUrl || '',
                            `Cut_${latestAcceptedCut.originalStartSec}s-${latestAcceptedCut.originalEndSec}s.mp4`
                          )
                        }
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>⬇ Tải File MP4 Đã Cắt</span>
                      </a>
                    </div>

                    {selectableScenes.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-sky-300">
                          📌 Bấm 1-Click để lấy đoạn đã cắt này thay vào Phần bạn ưng ý:
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {selectableScenes.map((sc) => {
                            const activeAssignedId =
                              savedCutTargetScenes[latestAcceptedCut.id] ||
                              latestAcceptedCut.targetSceneId ||
                              effectiveScene?.id ||
                              '';
                            const isAssignedHere = activeAssignedId === sc.id;
                            return (
                              <button
                                key={sc.id}
                                type="button"
                                onClick={() => {
                                  if (onInsertCutYouTubeClips) {
                                    const updatedCut = {
                                      ...latestAcceptedCut,
                                      targetSceneId: sc.id,
                                    };
                                    onInsertCutYouTubeClips([updatedCut], sc.id);
                                    setLatestAcceptedCut(updatedCut);
                                    setSavedCutTargetScenes((prev) => ({
                                      ...prev,
                                      [latestAcceptedCut.id]: sc.id,
                                    }));
                                    setSelectedModalSceneId(sc.id);
                                    setJustCutBanner(
                                      `✅ Đã lấy đoạn cắt (${latestAcceptedCut.originalStartSec}s → ${latestAcceptedCut.originalEndSec}s) thay thế vào Phần #${String(sc.order).padStart(2, '0')}: "${sc.title}"!`
                                    );
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1 border transition-all ${
                                  isAssignedHere
                                    ? 'bg-emerald-400 text-slate-950 border-emerald-200 shadow ring-2 ring-emerald-400/50'
                                    : 'bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-slate-200 border-slate-700 hover:border-amber-300'
                                }`}
                              >
                                {isAssignedHere ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                    <span>Đã Thay Vào Phần #{String(sc.order).padStart(2, '0')}</span>
                                  </>
                                ) : (
                                  <>
                                    <span>📌 Thay Vào Phần #{String(sc.order).padStart(2, '0')}</span>
                                    <span className="text-[10px] opacity-80 font-normal max-w-[75px] truncate">
                                      ({sc.title})
                                    </span>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PERSISTENT SAVED CUTS LIBRARY (KHO VIDEO ĐÃ CẮT & LƯU) */}
          {visibleSavedCuts.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#101929] border border-emerald-500/50 space-y-3 shadow">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSavedCutsDrawer((prev) => !prev)}
                    className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1 transition-colors"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>
                      💾 KHO VIDEO ĐÃ CẮT &amp; LƯU ({visibleSavedCuts.length} đoạn MP4 của {activeCharName}) —{' '}
                      {showSavedCutsDrawer ? 'Thu gọn ▲' : 'Bấm để Mở Xem / Tải MP4 Về Máy ▼'}
                    </span>
                  </button>
                  <span className="text-xs text-emerald-200/90">
                    Bấm <strong className="text-amber-300">"⬇ Lưu File MP4 Về Máy"</strong> hoặc <strong className="text-sky-300">"📌 Thay Vào Đoạn"</strong> bất kỳ lúc nào.
                  </span>
                </div>
                {scene && onUploadLocalFileForScene && (
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>⬆ Up File MP4 Đã Lưu Lên Thay Thế Cảnh {sceneNumLabel}</span>
                    <input
                      type="file"
                      accept="video/*,image/*"
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
              </div>

              {showSavedCutsDrawer && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                  {visibleSavedCuts.map((cut, cIdx) => {
                    const chosenTargetId =
                      savedCutTargetScenes[cut.id] ||
                      scene?.id ||
                      cut.targetSceneId ||
                      activeSceneId ||
                      selectableScenes[0]?.id ||
                      '';
                    const safeDownloadName = `Cut_${cIdx + 1}_${cut.originalStartSec}s-${cut.originalEndSec}s_${(
                      cut.title || 'video'
                    )
                      .replace(/[^a-zA-Z0-9_-]+/g, '_')
                      .slice(0, 32)}.mp4`;

                    return (
                      <div
                        key={cut.id}
                        className="rounded-lg bg-[#0B0F17] border border-emerald-500/50 p-2.5 flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="relative w-28 h-16 rounded overflow-hidden bg-black border border-slate-700 shrink-0">
                            <video
                              src={getPlayableCutVideoSrc(cut)}
                              poster={cut.thumbnailUrl}
                              controls
                              muted
                              playsInline
                              preload="metadata"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              ✂️ {cut.originalStartSec}s → {cut.originalEndSec}s ({cut.durationSec}s)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSavedCut(cut.id)}
                              title="Xóa đoạn cắt này khỏi kho lưu"
                              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <p
                            className="text-[11px] font-semibold text-slate-100 line-clamp-2 mt-1"
                            title={cut.title}
                          >
                            {cut.title}
                          </p>
                        </div>
                      </div>

                      {/* Target Scene Selector + Replace Button + Download MP4 Button */}
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-sky-300 font-semibold shrink-0">
                            Chèn vào:
                          </span>
                          <select
                            value={chosenTargetId}
                            onChange={(e) =>
                              setSavedCutTargetScenes((prev) => ({
                                ...prev,
                                [cut.id]: e.target.value,
                              }))
                            }
                            className="flex-1 bg-[#111827] border border-slate-700 rounded px-1.5 py-1 text-[10px] font-bold text-amber-300 focus:outline-none focus:border-amber-400 truncate"
                          >
                            {selectableScenes.map((s) => (
                              <option key={s.id} value={s.id}>
                                Cảnh #{String(s.order).padStart(2, '0')} (
                                {s.sceneType === 'video' ? 'VIDEO' : 'ẢNH'} ·{' '}
                                {Math.round(s.durationSec || 8)}s) — {s.title.slice(0, 24)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <a
                            href={buildDownloadMp4Href(cut.videoUrl || '', safeDownloadName)}
                            download={safeDownloadName}
                            onClick={(e) =>
                              triggerMp4Download(e, cut.videoUrl || '', safeDownloadName)
                            }
                            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 transition-colors"
                            title="Tải file video .MP4 đã cắt này về máy tính của bạn để lưu trữ hoặc upload lại bất cứ lúc nào"
                          >
                            <Download className="w-3 h-3 shrink-0" />
                            <span>⬇ Lưu File MP4</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              if (onInsertCutYouTubeClips) {
                                const updated = { ...cut, targetSceneId: chosenTargetId };
                                onInsertCutYouTubeClips([updated], chosenTargetId);
                                setLatestAcceptedCut(updated);
                                setSelectedModalSceneId(chosenTargetId);
                                setJustCutBanner(
                                  `✅ Đã lấy đoạn đã cắt (${cut.originalStartSec}s→${cut.originalEndSec}s) thay vào ${getSceneBadgeById(chosenTargetId).replace('Đoạn', 'Phần')}!`
                                );
                              }
                            }}
                            className="flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[10px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow transition-colors"
                            title="Gắn và thay thế đoạn video đã cắt này ngay vào Phần đang chọn"
                          >
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>
                              📌 Thay Vào{' '}
                              {getSceneBadgeById(chosenTargetId)
                                .split(' (')[0]
                                .replace('Đoạn', 'Phần')}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-300 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-red-400" />
              <p className="text-xs font-semibold">
                Đang tìm Video Thực Tế, YouTube Shorts, TikTok &amp; Cảnh Phim của "{searchQuery}"...
              </p>
            </div>
          ) : (
            <>
              {/* SECTION 0: REPLACEMENT VIDEOS & REAL ARCHIVAL VIDEOS (PHẦN VIDEO THAY THẾ TRỰC TIẾP CHO TỪNG PHẦN) */}
              {(filterTab === 'video' || filterTab === 'all' || filterTab === 'youtube') && (
                <div className="space-y-3 bg-[#0E1729] p-4 rounded-xl border border-sky-500/60 shadow">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <Film className="w-4 h-4 text-sky-400" />
                      <span>
                        🔄 PHẦN VIDEO THAY THẾ &amp; VIDEO THỰC TẾ CẮT SẴN CHO{' '}
                        {effectiveScene
                          ? `PHẦN #${String(effectiveScene.order).padStart(2, '0')} (${videoOptions.length} đoạn MP4)`
                          : `TỪNG PHẦN (${videoOptions.length} đoạn MP4)`}
                        :
                      </span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-300 hidden sm:inline">
                        Xem thử trực tiếp · Chỉnh giây cắt &amp; bấm 1-Click để Thay Thế vào Phần đang chọn
                      </span>
                      <button
                        type="button"
                        disabled={isLoadingArchival}
                        onClick={() => {
                          const next = cycleOffset + 1;
                          setCycleOffset(next);
                          executeSearch(searchQuery || cleanCharName, next, effectiveScene?.id);
                        }}
                        className="px-2.5 py-1 rounded text-[11px] font-bold bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 flex items-center gap-1 shadow transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingArchival ? 'animate-spin' : ''}`} />
                        <span>🔄 Đổi Lô Video Thay Thế Khác</span>
                      </button>
                    </div>
                  </div>

                  {isLoadingArchival && videoOptions.length === 0 ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-xs text-sky-200 bg-[#0B0F17]/80 rounded-lg border border-sky-500/30">
                      <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                      <span>
                        Đang chuẩn bị 6 đoạn Video Thay Thế cắt sẵn cho{' '}
                        {effectiveScene
                          ? `Phần #${String(effectiveScene.order).padStart(2, '0')}`
                          : cleanCharName}
                        ...
                      </span>
                    </div>
                  ) : videoOptions.length === 0 ? (
                    <div className="p-3 rounded-lg bg-[#0B0F17]/80 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                      <span>Chưa tải được lô video thay thế. Bấm nút bên cạnh để nạp lại ngay!</span>
                      <button
                        type="button"
                        onClick={() => executeSearch(cleanCharName, cycleOffset + 1, effectiveScene?.id)}
                        className="px-3 py-1 rounded bg-sky-500 text-slate-950 font-bold"
                      >
                        Tải Lại Video Thay Thế
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {videoOptions.map((vid, idx) => {
                        const chosenSceneId =
                          archivalTargetScenes[vid.id] ||
                          effectiveScene?.id ||
                          activeSceneId ||
                          selectableScenes[0]?.id ||
                          '';
                        const targetDur = getSceneDurationById(chosenSceneId);
                        const startSec = customTrimStarts[vid.id] ?? vid.trimStartSec ?? 18;
                        const endSec = Math.max(
                          startSec + 3,
                          customTrimEnds[vid.id] ?? startSec + targetDur
                        );
                        const cutLen = Math.max(3, endSec - startSec);
                        const cleanVidUrl = (vid.videoUrl || '').split('#')[0];
                        const curPlayhead = videoPlayheadSec[vid.id] ?? startSec;
                        const realTotalDur = videoActualDurationSec[vid.id] || 0;
                        const isCuttingThisCard = isCuttingYouTube && cuttingCardId === vid.id;
                        const partBadgeLabel = getSceneBadgeById(chosenSceneId)
                          .split(' (')[0]
                          .replace('Đoạn', 'Phần');

                        return (
                          <div
                            key={vid.id}
                            className={`rounded-lg bg-[#111827] border p-3 flex flex-col justify-between gap-2.5 transition-all ${
                              isCuttingThisCard
                                ? 'border-emerald-400 ring-2 ring-emerald-400/40'
                                : 'border-sky-500/50 hover:border-sky-400'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="relative h-40 rounded-md overflow-hidden bg-black border border-slate-800">
                                <video
                                  ref={(el) => {
                                    archivalVideoRefs.current[vid.id] = el;
                                  }}
                                  src={cleanVidUrl}
                                  poster={vid.dataUrl}
                                  controls
                                  preload="metadata"
                                  onLoadedMetadata={(e) => {
                                    const el = e.currentTarget;
                                    const dur = Math.floor(el.duration || 0);
                                    if (dur > 0) {
                                      setVideoActualDurationSec((prev) => ({
                                        ...prev,
                                        [vid.id]: dur,
                                      }));
                                      let initStart =
                                        customTrimStarts[vid.id] ?? vid.trimStartSec ?? 18;
                                      // Clamp if initial startSec exceeds actual video length (fixes jumping to end 2:44/2:44!)
                                      if (initStart >= Math.max(4, dur - targetDur - 1)) {
                                        initStart = Math.max(
                                          2,
                                          Math.min(
                                            Math.max(2, dur - targetDur - 2),
                                            Math.floor((dur * ((idx % 4) + 1)) / 6)
                                          )
                                        );
                                        setCustomTrimStarts((prev) => ({
                                          ...prev,
                                          [vid.id]: initStart,
                                        }));
                                        setCustomTrimEnds((prev) => ({
                                          ...prev,
                                          [vid.id]: Math.min(dur, initStart + targetDur),
                                        }));
                                      }
                                      try {
                                        el.currentTime = initStart;
                                      } catch {
                                        // ignore
                                      }
                                      setVideoPlayheadSec((prev) => ({
                                        ...prev,
                                        [vid.id]: initStart,
                                      }));
                                    }
                                  }}
                                  onTimeUpdate={(e) => {
                                    const el = e.currentTarget;
                                    const cur = Math.floor(el.currentTime || 0);
                                    setVideoPlayheadSec((prev) =>
                                      prev[vid.id] === cur ? prev : { ...prev, [vid.id]: cur }
                                    );
                                    // If user clicked "Xem thử đoạn cắt", auto-pause right at endSec
                                    if (
                                      previewingArchivalId === vid.id &&
                                      el.currentTime >= endSec
                                    ) {
                                      el.pause();
                                      setPreviewingArchivalId(null);
                                    }
                                  }}
                                  className={`w-full h-full ${
                                    cutFrameMode === '3:4-full-wide'
                                      ? 'object-contain'
                                      : 'object-cover'
                                  } ${
                                    cutFocusX === 'left'
                                      ? 'object-left'
                                      : cutFocusX === 'right'
                                      ? 'object-right'
                                      : 'object-center'
                                  }`}
                                />
                                {show34Guide && (
                                  <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 aspect-[3/4] h-full border-2 border-dashed border-emerald-400/80 shadow-[0_0_0_999px_rgba(0,0,0,0.45)] flex items-end justify-center pb-1">
                                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/90 text-slate-950 text-[9px] font-extrabold">
                                      Khung 3:4 HD
                                    </span>
                                  </div>
                                )}
                                <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500 text-slate-950 shadow">
                                  🔄 Video Thay Thế #{idx + 1}
                                </span>
                                {vid.year && (
                                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/80 text-amber-300">
                                    {vid.year}
                                  </span>
                                )}
                              </div>

                              {/* 1-Click Sync From Video Scrubber + Preview Cut Segment */}
                              <div className="flex items-center justify-between gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const el = archivalVideoRefs.current[vid.id];
                                    const pickedStart = Math.max(
                                      0,
                                      Math.floor(el ? el.currentTime : curPlayhead)
                                    );
                                    const pickedEnd =
                                      realTotalDur > 0
                                        ? Math.min(realTotalDur, pickedStart + targetDur)
                                        : pickedStart + targetDur;
                                    setCustomTrimStarts((prev) => ({
                                      ...prev,
                                      [vid.id]: pickedStart,
                                    }));
                                    setCustomTrimEnds((prev) => ({
                                      ...prev,
                                      [vid.id]: Math.max(pickedStart + 3, pickedEnd),
                                    }));
                                  }}
                                  className="flex-1 px-2 py-1 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/50 flex items-center justify-center gap-1 transition-colors"
                                  title="Tua thanh video phía trên tới cảnh bạn thích rồi bấm nút này để lấy đúng giây đó làm điểm bắt đầu cắt"
                                >
                                  <span>
                                    📍 Lấy mốc đang xem ({formatMmSs(curPlayhead)} = {curPlayhead}s)
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const el = archivalVideoRefs.current[vid.id];
                                    if (!el) return;
                                    if (previewingArchivalId === vid.id && !el.paused) {
                                      el.pause();
                                      setPreviewingArchivalId(null);
                                      return;
                                    }
                                    try {
                                      el.currentTime = startSec;
                                      setPreviewingArchivalId(vid.id);
                                      el.play().catch(() => {});
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                  className="px-2 py-1 rounded text-[10px] font-bold bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/50 flex items-center gap-1 shrink-0 transition-colors"
                                  title="Phát thử đúng đoạn từ giây bắt đầu đến giây kết thúc (tự dừng khi hết đoạn cắt)"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>
                                    {previewingArchivalId === vid.id
                                      ? '⏹ Dừng'
                                      : `Xem thử (${startSec}s→${endSec}s)`}
                                  </span>
                                </button>
                              </div>

                              <p
                                className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug"
                                title={vid.title}
                              >
                                {vid.title}
                              </p>

                              {/* Target Scene Selector */}
                              {selectableScenes.length > 0 && (
                                <div className="flex items-center justify-between gap-1.5 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                  <span className="text-sky-300 font-semibold shrink-0">
                                    Thay thế vào:
                                  </span>
                                  <select
                                    value={chosenSceneId}
                                    onChange={(e) => {
                                      const nextScId = e.target.value;
                                      const nextDur = getSceneDurationById(nextScId);
                                      setArchivalTargetScenes((prev) => ({
                                        ...prev,
                                        [vid.id]: nextScId,
                                      }));
                                      setCustomTrimEnds((prev) => ({
                                        ...prev,
                                        [vid.id]: startSec + nextDur,
                                      }));
                                    }}
                                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-bold text-amber-300 truncate focus:outline-none focus:border-amber-400"
                                  >
                                    {selectableScenes.map((sc) => (
                                      <option key={sc.id} value={sc.id}>
                                        Phần #{String(sc.order).padStart(2, '0')} (
                                        {Math.round(sc.durationSec || 8)}s) — {sc.title}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {/* Start -> End Second Trimmer */}
                              <div className="flex items-center justify-between gap-1.5 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                <span className="text-slate-300 flex items-center gap-1 shrink-0">
                                  <Scissors className="w-3 h-3 text-sky-400" />
                                  <span>Đoạn cắt:</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={realTotalDur > 5 ? realTotalDur - 3 : 7200}
                                    step={1}
                                    value={startSec}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                      setCustomTrimStarts((prev) => ({
                                        ...prev,
                                        [vid.id]: val,
                                      }));
                                      setCustomTrimEnds((prev) => ({
                                        ...prev,
                                        [vid.id]: val + cutLen,
                                      }));
                                      const el = archivalVideoRefs.current[vid.id];
                                      if (el) {
                                        try {
                                          el.currentTime = val;
                                        } catch {
                                          // ignore
                                        }
                                      }
                                    }}
                                    className="w-14 px-1 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-amber-300"
                                    title="Giây bắt đầu cắt"
                                  />
                                  <span className="text-slate-400 font-mono">s →</span>
                                  <input
                                    type="number"
                                    min={startSec + 3}
                                    max={realTotalDur > 5 ? realTotalDur : 7200}
                                    step={1}
                                    value={endSec}
                                    onChange={(e) => {
                                      const val = Math.max(
                                        startSec + 3,
                                        parseInt(e.target.value || String(startSec + 8), 10)
                                      );
                                      setCustomTrimEnds((prev) => ({
                                        ...prev,
                                        [vid.id]: val,
                                      }));
                                    }}
                                    className="w-14 px-1 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-emerald-300"
                                    title="Giây kết thúc cắt"
                                  />
                                  <span className="text-slate-400 font-mono">
                                    s ({cutLen}s)
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Primary Action: Accept Cut & Replace into Chosen Part */}
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                disabled={isCuttingThisCard}
                                onClick={() =>
                                  handleAcceptCutFromReplacementVideo(
                                    vid,
                                    chosenSceneId,
                                    startSec,
                                    endSec,
                                    false
                                  )
                                }
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 shadow transition-colors"
                              >
                                {isCuttingThisCard ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                    <span>
                                      Đang cắt ({startSec}s→{endSec}s) &amp; thay vào {partBadgeLabel}...
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Scissors className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate">
                                      ✅ Chấp Nhận Cắt ({startSec}s→{endSec}s) &amp; Thay Vào {partBadgeLabel}
                                    </span>
                                  </>
                                )}
                              </button>

                              <div className="flex items-center gap-1.5">
                                <a
                                  href={buildDownloadMp4Href(
                                    cleanVidUrl,
                                    `Video_Thay_The_${idx + 1}.mp4`
                                  )}
                                  download={`Video_Thay_The_${idx + 1}.mp4`}
                                  onClick={(e) =>
                                    triggerMp4Download(
                                      e,
                                      cleanVidUrl,
                                      `Video_Thay_The_${idx + 1}.mp4`
                                    )
                                  }
                                  className="px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shrink-0"
                                  title="Tải file MP4 gốc này về máy"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>⬇ Lưu MP4</span>
                                </a>
                                  <button
                                  type="button"
                                  disabled={isCuttingThisCard}
                                  onClick={() =>
                                    handleAcceptCutFromReplacementVideo(
                                      vid,
                                      chosenSceneId,
                                      startSec,
                                      endSec,
                                      true
                                    )
                                  }
                                  className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-sky-500/20 hover:bg-sky-500/35 disabled:opacity-60 text-sky-200 border border-sky-400/50 transition-colors"
                                  title="Cắt đoạn này, thay thế vào Phần đang chọn và đóng cửa sổ để xem ngay trên Timeline"
                                >
                                  {isCuttingThisCard ? (
                                    <>
                                      <Loader2 className="w-3 h-3 animate-spin shrink-0 text-sky-300" />
                                      <span className="truncate">Đang cắt nhanh...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 shrink-0 text-sky-300" />
                                      <span className="truncate">
                                        ⚡ Cắt Thay Vào {partBadgeLabel} &amp; Đóng
                                      </span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION A: Aggregated YouTube Shorts + TikTok + Instagram Reels + YouTube Picker */}
              {(filterTab === 'youtube' || filterTab === 'all') && (
                <div className="space-y-3">
                  {/* Direct Local Video Upload & Segment Cutter Bar */}
                  <div className="p-3 rounded-lg bg-gradient-to-r from-[#0F1E2E] to-[#111827] border border-emerald-500/40 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                        <Scissors className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          ✂️ Cắt Trực Tiếp Từ Video Có Sẵn Trên Máy (MP4 / MOV / WebM — Chuẩn 100% Không Lo Chặn Mạng):
                        </span>
                      </div>
                      <label className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer flex items-center gap-1.5 shadow transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{localCutFile ? '🔄 Đổi Video Máy Khác' : '📁 Chọn Video MP4 Từ Máy Để Cắt'}</span>
                        <input
                          type="file"
                          accept="video/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (localCutPreviewUrl) URL.revokeObjectURL(localCutPreviewUrl);
                            const blobUrl = URL.createObjectURL(f);
                            const tgtId =
                              effectiveScene?.id ||
                              scene?.id ||
                              activeSceneId ||
                              selectableScenes[0]?.id ||
                              '';
                            const dur = getSceneDurationById(tgtId);
                            setLocalCutFile(f);
                            setLocalCutPreviewUrl(blobUrl);
                            setLocalCutStartSec(0);
                            setLocalCutEndSec(dur);
                            setLocalCutTargetSceneId(tgtId);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {localCutFile && localCutPreviewUrl && (
                      <div className="flex flex-col md:flex-row items-stretch gap-3 p-2.5 rounded-lg bg-[#090E17] border border-emerald-500/30">
                        <div className="w-full md:w-52 h-36 rounded overflow-hidden bg-black border border-slate-700 shrink-0">
                          <video
                            ref={localCutVideoRef}
                            src={localCutPreviewUrl}
                            controls
                            onLoadedMetadata={(e) => {
                              const d = Math.floor(e.currentTarget.duration || 0);
                              if (d > 0) {
                                setLocalCutActualDur(d);
                                const tgtId =
                                  localCutTargetSceneId || effectiveScene?.id || selectableScenes[0]?.id || '';
                                const targetDur = getSceneDurationById(tgtId);
                                setLocalCutEndSec(Math.min(d, targetDur));
                              }
                            }}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex-1 flex flex-col justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-bold text-slate-200 truncate">
                              🎞️ {localCutFile.name} {localCutActualDur > 0 ? `(${localCutActualDur}s)` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const cur = Math.max(0, Math.floor(localCutVideoRef.current?.currentTime || 0));
                                const tgtId =
                                  localCutTargetSceneId || effectiveScene?.id || selectableScenes[0]?.id || '';
                                const targetDur = getSceneDurationById(tgtId);
                                setLocalCutStartSec(cur);
                                setLocalCutEndSec(
                                  localCutActualDur > 0
                                    ? Math.min(localCutActualDur, cur + targetDur)
                                    : cur + targetDur
                                );
                              }}
                              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/50 text-[11px] font-bold"
                            >
                              📍 Lấy Mốc Đang Xem
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {selectableScenes.length > 0 && (
                              <select
                                value={localCutTargetSceneId || effectiveScene?.id || selectableScenes[0]?.id || ''}
                                onChange={(e) => {
                                  const nextId = e.target.value;
                                  const d = getSceneDurationById(nextId);
                                  setLocalCutTargetSceneId(nextId);
                                  setLocalCutEndSec(localCutStartSec + d);
                                }}
                                className="flex-1 min-w-[180px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-bold text-amber-300"
                              >
                                {selectableScenes.map((sc) => (
                                  <option key={sc.id} value={sc.id}>
                                    Phần #{String(sc.order).padStart(2, '0')} ({Math.round(sc.durationSec || 10)}s) — {sc.title}
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded px-2 py-1">
                              <span className="text-slate-400 text-[11px]">Từ</span>
                              <input
                                type="number"
                                min={0}
                                value={localCutStartSec}
                                onChange={(e) => {
                                  const v = Math.max(0, parseInt(e.target.value || '0', 10));
                                  const tgtId =
                                    localCutTargetSceneId || effectiveScene?.id || selectableScenes[0]?.id || '';
                                  setLocalCutStartSec(v);
                                  setLocalCutEndSec(v + getSceneDurationById(tgtId));
                                  if (localCutVideoRef.current) localCutVideoRef.current.currentTime = v;
                                }}
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-center font-mono font-bold text-amber-300"
                              />
                              <span className="text-slate-400 text-[11px]">s →</span>
                              <input
                                type="number"
                                min={localCutStartSec + 3}
                                value={localCutEndSec}
                                onChange={(e) => {
                                  const v = Math.max(localCutStartSec + 3, parseInt(e.target.value || '10', 10));
                                  setLocalCutEndSec(v);
                                }}
                                className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-center font-mono font-bold text-emerald-300"
                              />
                              <span className="text-slate-400 text-[11px]">s</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isCuttingYouTube}
                              onClick={() => handleCutLocalUploadedVideo(false)}
                              className="flex-1 py-1.5 px-3 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5"
                            >
                              {isCuttingYouTube && cuttingCardId === '__LOCAL_UPLOAD__' ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Đang cắt video máy 3:4 HD...</span>
                                </>
                              ) : (
                                <>
                                  <Scissors className="w-3.5 h-3.5" />
                                  <span>✂️ Cắt Video Máy ({localCutStartSec}s→{localCutEndSec}s) &amp; Chèn Vào Phần</span>
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isCuttingYouTube}
                              onClick={() => handleCutLocalUploadedVideo(true)}
                              className="py-1.5 px-3 rounded-md bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/50 font-bold text-xs"
                            >
                              ⚡ Cắt &amp; Đóng
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111827] px-3.5 py-2.5 rounded-lg border border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                        <Youtube className="w-4 h-4 text-red-500" />
                        <span>
                          Kho Video Thực Tế (Ưu tiên nguồn ✂️ Cắt Trực Tiếp MP4: Dailymotion · TikTok · Archive.org):
                        </span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setVideoSourceSubFilter('all')}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'all'
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-900 text-slate-300 border border-slate-700 hover:border-amber-400'
                          }`}
                        >
                          🔥 Tất Cả ({youtubeVideos.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoSourceSubFilter('cuttable-100')}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'cuttable-100'
                              ? 'bg-emerald-400 text-slate-950 shadow'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/50 hover:bg-emerald-500/25'
                          }`}
                        >
                          ✅ Cắt MP4 100% (
                          {
                            youtubeVideos.filter(
                              (v) =>
                                v.isDirectCuttable === true ||
                                v.sourcePlatform === 'dailymotion' ||
                                v.sourcePlatform === 'archive' ||
                                Boolean(v.dmId || v.tiktokUrl || v.instagramUrl || v.archiveMp4Url)
                            ).length
                          }
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoSourceSubFilter('dailymotion')}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'dailymotion'
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-slate-900 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/20'
                          }`}
                        >
                          🎬 Dailymotion MP4 (
                          {
                            youtubeVideos.filter(
                              (v) =>
                                v.sourcePlatform === 'dailymotion' ||
                                (Boolean(v.dmId) && !v.youtubeId)
                            ).length
                          }
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoSourceSubFilter('short-all')}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'short-all'
                              ? 'bg-gradient-to-r from-red-500 via-pink-500 to-fuchsia-500 text-white shadow'
                              : 'bg-slate-900 text-amber-300 border border-pink-500/40 hover:bg-pink-500/20'
                          }`}
                        >
                          📲 Video Ngắn (
                          {
                            youtubeVideos.filter(
                              (v) =>
                                v.sourcePlatform === 'shorts' ||
                                v.sourcePlatform === 'tiktok' ||
                                v.sourcePlatform === 'instagram'
                            ).length
                          }
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const hasShorts = youtubeVideos.some((v) => v.sourcePlatform === 'shorts');
                            setVideoSourceSubFilter('shorts');
                            if (!hasShorts) {
                              setSearchDepth('social');
                              const q = `${activeCharName} shorts`;
                              setSearchQuery(q);
                              executeSearch(q, 0, effectiveScene?.id, false, 'social');
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'shorts'
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-900 text-red-300 border border-red-500/40 hover:bg-red-500/20'
                          }`}
                        >
                          📱 YouTube Shorts (
                          {youtubeVideos.filter((v) => v.sourcePlatform === 'shorts').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const hasTt = youtubeVideos.some((v) => v.sourcePlatform === 'tiktok');
                            setVideoSourceSubFilter('tiktok');
                            if (!hasTt) {
                              setSearchDepth('social');
                              const q = `${activeCharName} tiktok`;
                              setSearchQuery(q);
                              executeSearch(q, 0, effectiveScene?.id, false, 'social');
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'tiktok'
                              ? 'bg-pink-600 text-white'
                              : 'bg-slate-900 text-pink-300 border border-pink-500/40 hover:bg-pink-500/20'
                          }`}
                        >
                          🎵 TikTok (
                          {youtubeVideos.filter((v) => v.sourcePlatform === 'tiktok').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const hasIg = youtubeVideos.some((v) => v.sourcePlatform === 'instagram');
                            setVideoSourceSubFilter('instagram');
                            if (!hasIg) {
                              setSearchDepth('social');
                              const q = `${activeCharName} instagram reels`;
                              setSearchQuery(q);
                              executeSearch(q, 0, effectiveScene?.id, false, 'social');
                            }
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'instagram'
                              ? 'bg-gradient-to-r from-fuchsia-600 to-amber-500 text-white'
                              : 'bg-slate-900 text-fuchsia-300 border border-fuchsia-500/40 hover:bg-fuchsia-500/20'
                          }`}
                        >
                          📸 Instagram Reels (
                          {youtubeVideos.filter((v) => v.sourcePlatform === 'instagram').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoSourceSubFilter('youtube-long')}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'youtube-long'
                              ? 'bg-sky-500 text-slate-950'
                              : 'bg-slate-900 text-sky-300 border border-sky-500/40 hover:bg-sky-500/20'
                          }`}
                        >
                          🎬 Cảnh Phim &amp; Phỏng Vấn (
                          {youtubeVideos.filter((v) => v.sourcePlatform === 'youtube').length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoSourceSubFilter('archive')}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                            videoSourceSubFilter === 'archive'
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-900 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/20'
                          }`}
                        >
                          🎞️ Archive.org MP4 (
                          {youtubeVideos.filter((v) => v.sourcePlatform === 'archive').length})
                        </button>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const filteredYoutubeList = youtubeVideos.filter((yt) => {
                      if (videoSourceSubFilter === 'cuttable-100') {
                        return (
                          yt.isDirectCuttable === true ||
                          yt.sourcePlatform === 'dailymotion' ||
                          yt.sourcePlatform === 'archive' ||
                          Boolean(yt.dmId || yt.tiktokUrl || yt.instagramUrl || yt.archiveMp4Url)
                        );
                      }
                      if (videoSourceSubFilter === 'dailymotion') {
                        return (
                          yt.sourcePlatform === 'dailymotion' ||
                          (Boolean(yt.dmId) && !yt.youtubeId)
                        );
                      }
                      if (videoSourceSubFilter === 'short-all') {
                        return (
                          yt.sourcePlatform === 'shorts' ||
                          yt.sourcePlatform === 'tiktok' ||
                          yt.sourcePlatform === 'instagram'
                        );
                      }
                      if (videoSourceSubFilter === 'shorts') {
                        return yt.sourcePlatform === 'shorts';
                      }
                      if (videoSourceSubFilter === 'tiktok') {
                        return yt.sourcePlatform === 'tiktok';
                      }
                      if (videoSourceSubFilter === 'instagram') {
                        return yt.sourcePlatform === 'instagram';
                      }
                      if (videoSourceSubFilter === 'youtube-long') {
                        return yt.sourcePlatform === 'youtube';
                      }
                      if (videoSourceSubFilter === 'archive') {
                        return yt.sourcePlatform === 'archive';
                      }
                      return true;
                    });

                    if (filteredYoutubeList.length === 0) {
                      return (
                        <div className="p-5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
                          <span>
                            {youtubeVideos.length === 0
                              ? 'Không tìm thấy kết quả cho từ khóa này. Hãy thử bấm các nút từ khóa gợi ý phía trên!'
                              : 'Chưa có video thuộc mục đang lọc trong lô kết quả cũ. Bấm nút bên phải để tải ngay video Shorts / TikTok / Instagram!'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchDepth('social');
                              const suffix =
                                videoSourceSubFilter === 'tiktok'
                                  ? 'tiktok'
                                  : videoSourceSubFilter === 'instagram'
                                  ? 'instagram reels'
                                  : 'shorts';
                              const q = `${activeCharName} ${suffix}`;
                              setSearchQuery(q);
                              setCycleOffset(0);
                              executeSearch(q, 0, effectiveScene?.id, false, 'social');
                            }}
                            className="px-3 py-1.5 rounded-md bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 text-white font-bold text-xs shadow shrink-0"
                          >
                            📱 Tìm Ngay Video Ngắn ({activeCharName})
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {filteredYoutubeList.map((yt, ytIdx) => {
                          const startSec =
                            ytTrimStarts[yt.id] ?? yt.suggestedTrimStartSec ?? 18;
                          const chosenSceneId =
                            ytTargetSceneIds[yt.id] ||
                            effectiveScene?.id ||
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
                          const isShortFormPlatform =
                            yt.sourcePlatform === 'shorts' ||
                            yt.sourcePlatform === 'tiktok' ||
                            yt.sourcePlatform === 'instagram';
                          const isDailymotionCard =
                            yt.sourcePlatform === 'dailymotion' ||
                            (Boolean(yt.dmId) && !yt.youtubeId);
                          const isCuttableDirect =
                            yt.isDirectCuttable === true ||
                            isDailymotionCard ||
                            yt.sourcePlatform === 'archive' ||
                            Boolean(
                              yt.dmId || yt.tiktokUrl || yt.instagramUrl || yt.archiveMp4Url
                            );
                          // CRITICAL: Only use direct MP4 scrubber when the card actually has an Archive MP4 URL (never poison Dailymotion/Shorts cards)
                          const useDirectMp4Scrubber = isShortFormPlatform || isDailymotionCard
                            ? previewUseDirectMp4[yt.id] === true
                            : previewUseDirectMp4[yt.id] !== false;
                          const cleanYtDirectUrl = yt.archiveMp4Url
                            ? `/api/archival/video-stream?url=${encodeURIComponent(
                                yt.archiveMp4Url
                              )}`
                            : '';
                          const curYtPlayhead = ytPlayheadSec[yt.id] ?? startSec;
                          const realYtTotalDur = ytActualDurationSec[yt.id] || 0;
                          const externalLinkUrl =
                            yt.tiktokUrl ||
                            yt.instagramUrl ||
                            (yt.dmId && !yt.youtubeId
                              ? `https://www.dailymotion.com/video/${yt.dmId}`
                              : yt.youtubeUrl);
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
                                  : isShortFormPlatform
                                  ? 'border-slate-800 hover:border-pink-500/70'
                                  : 'border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <div className="space-y-2">
                                {/* Video Preview Box: Short/TikTok/IG cards show real vertical thumbnail + real YouTube Short player; long/archive cards show direct MP4 scrubber */}
                                <div
                                  className={`relative ${
                                    isShortFormPlatform ? 'h-48' : 'h-40'
                                  } rounded-md overflow-hidden bg-black border border-slate-800`}
                                >
                                  {useDirectMp4Scrubber && cleanYtDirectUrl ? (
                                    <video
                                      ref={(el) => {
                                        ytVideoRefs.current[yt.id] = el;
                                      }}
                                      src={cleanYtDirectUrl}
                                      poster={yt.thumbnailUrl}
                                      controls
                                      preload="metadata"
                                      onLoadedMetadata={(e) => {
                                        const el = e.currentTarget;
                                        const dur = Math.floor(el.duration || 0);
                                        if (dur > 0) {
                                          setYtActualDurationSec((prev) => ({
                                            ...prev,
                                            [yt.id]: dur,
                                          }));
                                          let initStart =
                                            ytTrimStarts[yt.id] ?? yt.suggestedTrimStartSec ?? 18;
                                          if (initStart >= Math.max(4, dur - targetDur - 1)) {
                                            initStart = Math.max(
                                              2,
                                              Math.min(
                                                Math.max(2, dur - targetDur - 2),
                                                Math.floor((dur * ((ytIdx % 5) + 1)) / 7)
                                              )
                                            );
                                            setYtTrimStarts((prev) => ({
                                              ...prev,
                                              [yt.id]: initStart,
                                            }));
                                            setYtTrimEnds((prev) => ({
                                              ...prev,
                                              [yt.id]: Math.min(dur, initStart + targetDur),
                                            }));
                                          }
                                          try {
                                            el.currentTime = initStart;
                                          } catch {
                                            // ignore
                                          }
                                          setYtPlayheadSec((prev) => ({
                                            ...prev,
                                            [yt.id]: initStart,
                                          }));
                                        }
                                      }}
                                      onTimeUpdate={(e) => {
                                        const el = e.currentTarget;
                                        const cur = Math.floor(el.currentTime || 0);
                                        setYtPlayheadSec((prev) =>
                                          prev[yt.id] === cur ? prev : { ...prev, [yt.id]: cur }
                                        );
                                        if (
                                          previewingYtId === yt.id &&
                                          el.currentTime >= endSec
                                        ) {
                                          el.pause();
                                          setPreviewingYtId(null);
                                        }
                                      }}
                                      className={`w-full h-full ${
                                        cutFrameMode === '3:4-full-wide'
                                          ? 'object-contain'
                                          : 'object-cover'
                                      } ${
                                        cutFocusX === 'left'
                                          ? 'object-left'
                                          : cutFocusX === 'right'
                                          ? 'object-right'
                                          : 'object-center'
                                      }`}
                                    />
                                  ) : isPreviewing && (yt.youtubeId || yt.dmId) ? (
                                    <div className="relative w-full h-full bg-black">
                                      <iframe
                                        src={
                                          yt.dmId && !yt.youtubeId
                                            ? `https://www.dailymotion.com/embed/video/${yt.dmId}?start=${startSec}&autoplay=1`
                                            : `https://www.youtube.com/embed/${yt.youtubeId}?${
                                                isShortFormPlatform
                                                  ? 'autoplay=1&rel=0&playsinline=1'
                                                  : `start=${startSec}&end=${endSec}&autoplay=1&rel=0`
                                              }`
                                        }
                                        title={yt.title}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        className="w-full h-full border-0"
                                      />
                                      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between gap-1 pointer-events-auto">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewingYtId(null)}
                                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold shadow-lg flex items-center gap-1"
                                        >
                                          <span>⏹ Dừng ({previewRemainingSec}s)</span>
                                        </button>
                                        {cleanYtDirectUrl && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPreviewingYtId(null);
                                              setPreviewUseDirectMp4((prev) => ({
                                                ...prev,
                                                [yt.id]: true,
                                              }));
                                            }}
                                            className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold shadow-lg"
                                          >
                                            🎛️ Mở Stream MP4 Cắt
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="relative w-full h-full flex items-center justify-center bg-slate-950 overflow-hidden">
                                      {isShortFormPlatform && (
                                        <img
                                          src={yt.thumbnailUrl}
                                          alt=""
                                          aria-hidden="true"
                                          referrerPolicy="no-referrer"
                                          className="absolute inset-0 w-full h-full object-cover blur-md opacity-35 scale-110"
                                        />
                                      )}
                                      <img
                                        src={yt.thumbnailUrl}
                                        alt={yt.title}
                                        referrerPolicy="no-referrer"
                                        className={
                                          isShortFormPlatform
                                            ? 'relative z-[1] h-full aspect-[9/16] object-cover shadow-2xl border-x border-white/15'
                                            : 'w-full h-full object-cover'
                                        }
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (yt.youtubeId || yt.dmId) {
                                            setPreviewingYtId(yt.id);
                                          } else if (cleanYtDirectUrl) {
                                            setPreviewUseDirectMp4((prev) => ({
                                              ...prev,
                                              [yt.id]: true,
                                            }));
                                          }
                                        }}
                                        className="absolute inset-0 z-[2] bg-black/35 hover:bg-black/20 flex items-center justify-center transition-colors group"
                                        title={
                                          isShortFormPlatform
                                            ? 'Bấm để phát trực tiếp Video Ngắn (Shorts / TikTok / Reels)'
                                            : 'Bấm để xem trước đoạn video'
                                        }
                                      >
                                        <div
                                          className={`px-3 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-1.5 shadow-xl ${
                                            isDailymotionCard || yt.sourcePlatform === 'archive'
                                              ? 'bg-emerald-600 group-hover:bg-emerald-500'
                                              : yt.sourcePlatform === 'tiktok'
                                              ? 'bg-pink-600 group-hover:bg-pink-500'
                                              : yt.sourcePlatform === 'instagram'
                                              ? 'bg-fuchsia-600 group-hover:bg-fuchsia-500'
                                              : 'bg-red-600 group-hover:bg-red-500'
                                          }`}
                                        >
                                          <Play className="w-3.5 h-3.5 fill-current" />
                                          <span>
                                            {isShortFormPlatform
                                              ? 'Xem Video Ngắn'
                                              : `Xem Thử (${startSec}s→${endSec}s)`}
                                          </span>
                                        </div>
                                      </button>
                                      {cleanYtDirectUrl && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewUseDirectMp4((prev) => ({
                                              ...prev,
                                              [yt.id]: true,
                                            }));
                                          }}
                                          className="absolute bottom-1.5 left-1.5 z-[3] px-2 py-0.5 rounded bg-black/80 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/40 text-[9px] font-bold"
                                          title="Mở trình tua MP4 để căn giây cắt 3:4"
                                        >
                                          🎛️ Tua MP4 Cắt
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {show34Guide && useDirectMp4Scrubber && cleanYtDirectUrl && (
                                    <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 aspect-[3/4] h-full border-2 border-dashed border-emerald-400/80 shadow-[0_0_0_999px_rgba(0,0,0,0.45)] flex items-end justify-center pb-1">
                                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/90 text-slate-950 text-[9px] font-extrabold">
                                        Khung 3:4 HD
                                      </span>
                                    </div>
                                  )}

                                  {/* Top-Left Queue Segment Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleQueueSegment(yt)}
                                    className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 shadow ${
                                      isThisSegmentQueued
                                        ? 'bg-amber-500 text-slate-950'
                                        : 'bg-black/85 text-slate-100 hover:bg-amber-500 hover:text-slate-950'
                                    }`}
                                    title="Thêm đoạn (Start→End) này vào danh sách cắt riêng"
                                  >
                                    {isThisSegmentQueued ? (
                                      <>
                                        <CheckSquare className="w-3 h-3" />
                                        <span>Đã Chọn ({startSec}s→{endSec}s)</span>
                                      </>
                                    ) : (
                                      <>
                                        <Square className="w-3 h-3" />
                                        <span>
                                          + Chọn Đoạn
                                          {queuedCountForThisVideo > 0
                                            ? ` (${queuedCountForThisVideo})`
                                            : ''}
                                        </span>
                                      </>
                                    )}
                                  </button>

                                  {/* Top-Right Source Platform Badge */}
                                  <span
                                    className={`absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold shadow ${
                                      isDailymotionCard || yt.sourcePlatform === 'archive' || isCuttableDirect
                                        ? 'bg-emerald-600 text-white'
                                        : yt.sourcePlatform === 'tiktok'
                                        ? 'bg-pink-600 text-white'
                                        : yt.sourcePlatform === 'instagram'
                                        ? 'bg-gradient-to-r from-fuchsia-600 to-amber-500 text-white'
                                        : yt.sourcePlatform === 'shorts'
                                        ? 'bg-red-600 text-white'
                                        : 'bg-slate-900/90 text-sky-300 border border-sky-500/40'
                                    }`}
                                  >
                                    {yt.platformBadge ||
                                      (isDailymotionCard
                                        ? '✅ Cắt MP4 100% · Dailymotion'
                                        : yt.sourcePlatform === 'tiktok'
                                        ? '🎵 TikTok'
                                        : yt.sourcePlatform === 'instagram'
                                        ? '📸 Instagram Reels'
                                        : yt.sourcePlatform === 'archive'
                                        ? '🎞️ Archive.org MP4'
                                        : yt.sourcePlatform === 'shorts'
                                        ? '📱 YouTube Short'
                                        : '🎬 YouTube')}
                                  </span>
                                </div>

                                {/* 1-Click Sync Playhead From Scrubber + Preview Segment Button */}
                                {cleanYtDirectUrl && useDirectMp4Scrubber && (
                                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const el = ytVideoRefs.current[yt.id];
                                        const pickedStart = Math.max(
                                          0,
                                          Math.floor(el ? el.currentTime : curYtPlayhead)
                                        );
                                        const pickedEnd =
                                          realYtTotalDur > 0
                                            ? Math.min(realYtTotalDur, pickedStart + targetDur)
                                            : pickedStart + targetDur;
                                        setYtTrimStarts((prev) => ({
                                          ...prev,
                                          [yt.id]: pickedStart,
                                        }));
                                        setYtTrimEnds((prev) => ({
                                          ...prev,
                                          [yt.id]: Math.max(pickedStart + 3, pickedEnd),
                                        }));
                                      }}
                                      className="flex-1 px-2 py-1 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/50 flex items-center justify-center gap-1 transition-colors"
                                      title="Tua thanh video phía trên tới cảnh bạn thích rồi bấm nút này để lấy đúng giây đó làm điểm bắt đầu cắt"
                                    >
                                      <span>
                                        📍 Lấy mốc đang xem ({formatMmSs(curYtPlayhead)} = {curYtPlayhead}s)
                                      </span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const el = ytVideoRefs.current[yt.id];
                                        if (!el) return;
                                        if (previewingYtId === yt.id && !el.paused) {
                                          el.pause();
                                          setPreviewingYtId(null);
                                          return;
                                        }
                                        try {
                                          el.currentTime = startSec;
                                          setPreviewingYtId(yt.id);
                                          el.play().catch(() => {});
                                        } catch {
                                          // ignore
                                        }
                                      }}
                                      className="px-2 py-1 rounded text-[10px] font-bold bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/50 flex items-center gap-1 shrink-0 transition-colors"
                                      title="Phát thử đúng đoạn từ giây bắt đầu đến giây kết thúc (tự dừng khi hết đoạn cắt)"
                                    >
                                      <Play className="w-3 h-3 fill-current" />
                                      <span>
                                        {previewingYtId === yt.id
                                          ? '⏹ Dừng'
                                          : `Xem thử (${startSec}s→${endSec}s)`}
                                      </span>
                                    </button>

                                    {isShortFormPlatform && yt.youtubeId && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPreviewUseDirectMp4((prev) => ({
                                            ...prev,
                                            [yt.id]: false,
                                          }))
                                        }
                                        className="px-2 py-1 rounded text-[10px] font-bold bg-pink-500/20 hover:bg-pink-500/35 text-pink-200 border border-pink-400/50 shrink-0 transition-colors"
                                        title="Quay lại xem Video Ngắn gốc (Shorts / TikTok / Reels)"
                                      >
                                        📱 Video Ngắn Gốc
                                      </button>
                                    )}
                                  </div>
                                )}

                                <div>
                                  <p
                                    className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug"
                                    title={yt.title}
                                  >
                                    {yt.title}
                                  </p>
                                  <div className="flex items-center justify-between gap-2 mt-0.5">
                                    <p className="text-[10px] text-slate-400 truncate">
                                      Kênh: {yt.channel} {yt.viewsLabel ? `· ${yt.viewsLabel}` : ''}
                                      {yt.durationSec > 0 ? ` · ${formatMmSs(yt.durationSec)}` : ''}
                                    </p>
                                    {externalLinkUrl && (
                                      <a
                                        href={externalLinkUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 shrink-0 underline"
                                        title="Mở xem link gốc trên Dailymotion / YouTube / TikTok"
                                      >
                                        ↗ Link gốc
                                      </a>
                                    )}
                                  </div>
                                  {!isCuttableDirect && (
                                    <div className="mt-1 flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-amber-950/50 border border-amber-500/30 text-[10px] text-amber-200">
                                      <span className="truncate">
                                        🔍 YouTube chỉ xem trước — bấm cắt sẽ tự tìm bản MP4 khớp
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setVideoSourceSubFilter('cuttable-100')}
                                        className="px-1.5 py-0.5 rounded bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 font-bold shrink-0 border border-emerald-400/40"
                                      >
                                        Kho MP4 100%
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Target Scene Selector (Chọn Đoạn/Cảnh Đích Bất Kỳ Trên Timeline) */}
                                {selectableScenes.length > 0 && (
                                  <div className="flex items-center justify-between gap-1.5 bg-[#0B0F17] px-2.5 py-1.5 rounded border border-slate-800 text-[11px]">
                                    <span className="text-sky-300 font-semibold shrink-0">
                                      Vị trí chèn:
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
                                          Phần #{String(sc.order).padStart(2, '0')} (
                                          {Math.round(sc.durationSec || 8)}s) — {sc.title}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const pool =
                                          selectableScenes.length > 1
                                            ? selectableScenes.filter((s) => s.id !== chosenSceneId)
                                            : selectableScenes;
                                        const randSc =
                                          pool[Math.floor(Math.random() * pool.length)] ||
                                          selectableScenes[0];
                                        if (!randSc) return;
                                        const nextDur = getSceneDurationById(randSc.id);
                                        const isShortCard =
                                          yt.sourcePlatform === 'shorts' ||
                                          yt.sourcePlatform === 'tiktok' ||
                                          yt.sourcePlatform === 'instagram';
                                        const maxDurBound = isShortCard
                                          ? Math.min(48, Math.max(24, yt.durationSec || 45))
                                          : realYtTotalDur > 20
                                          ? realYtTotalDur
                                          : yt.durationSec || 180;
                                        const maxValidStart = Math.max(
                                          4,
                                          Math.min(isShortCard ? 30 : 240, maxDurBound - nextDur - 2)
                                        );
                                        const randStart =
                                          (isShortCard ? 2 : 12) +
                                          Math.floor(Math.random() * maxValidStart);
                                        setYtTargetSceneIds((prev) => ({
                                          ...prev,
                                          [yt.id]: randSc.id,
                                        }));
                                        setYtTrimStarts((prev) => ({
                                          ...prev,
                                          [yt.id]: randStart,
                                        }));
                                        setYtTrimEnds((prev) => ({
                                          ...prev,
                                          [yt.id]: randStart + nextDur,
                                        }));
                                        const el = ytVideoRefs.current[yt.id];
                                        if (el) {
                                          try {
                                            el.currentTime = randStart;
                                          } catch {
                                            // ignore
                                          }
                                        }
                                      }}
                                      title="Đổi ngẫu nhiên sang một vị trí Phần bất kỳ trên Timeline và chọn ngẫu nhiên giây cắt"
                                      className="px-1.5 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/35 text-violet-200 border border-violet-500/40 text-[10px] font-bold shrink-0"
                                    >
                                      🎲 Ngẫu nhiên
                                    </button>
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
                                      max={
                                        realYtTotalDur > 5
                                          ? realYtTotalDur - 3
                                          : Math.max(300, yt.durationSec - 4)
                                      }
                                      step={1}
                                      value={startSec}
                                      onChange={(e) => {
                                        const val = Math.max(0, parseInt(e.target.value || '0', 10));
                                        setYtTrimStarts((prev) => ({ ...prev, [yt.id]: val }));
                                        setYtTrimEnds((prev) => ({
                                          ...prev,
                                          [yt.id]: val + cutDur,
                                        }));
                                        const el = ytVideoRefs.current[yt.id];
                                        if (el) {
                                          try {
                                            el.currentTime = val;
                                          } catch {
                                            // ignore
                                          }
                                        }
                                      }}
                                      className="w-14 px-1 py-0.5 text-center font-mono font-bold bg-slate-900 border border-slate-700 rounded text-amber-300"
                                      title="Giây bắt đầu cắt (Start)"
                                    />
                                    <span className="text-slate-400 font-mono">s →</span>
                                    <input
                                      type="number"
                                      min={startSec + 3}
                                      max={
                                        realYtTotalDur > 5
                                          ? realYtTotalDur
                                          : Math.max(startSec + 25, yt.durationSec, 7200)
                                      }
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

                              {/* 1-Click Accept Cut & Replace Into Chosen Part */}
                              <div className="space-y-1.5">
                                <button
                                  type="button"
                                  disabled={isCuttingYouTube && cuttingCardId === yt.id}
                                  onClick={() => {
                                    if (isCuttingYouTube) return;
                                    handleCutAndInsertYouTubeVideos(yt, false);
                                  }}
                                  className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-colors ${
                                    isCuttingYouTube && cuttingCardId === yt.id
                                      ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-300'
                                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                                  }`}
                                >
                                  {isCuttingYouTube && cuttingCardId === yt.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                                      <span>
                                        Đang cắt ({startSec}s→{endSec}s) &amp; thay vào{' '}
                                        {getSceneBadgeById(chosenSceneId)
                                          .split(' (')[0]
                                          .replace('Đoạn', 'Phần')}
                                        ...
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <Scissors className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">
                                        {isCuttableDirect
                                          ? `✅ Chấp Nhận Cắt (${startSec}s→${endSec}s) & Thay Vào `
                                          : `✂️ Tìm Bản MP4 Khớp & Cắt (${startSec}s→${endSec}s) → `}
                                        {getSceneBadgeById(chosenSceneId)
                                          .split(' (')[0]
                                          .replace('Đoạn', 'Phần')}
                                      </span>
                                    </>
                                  )}
                                </button>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleQueueSegment(yt)}
                                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1 border shrink-0 transition-colors ${
                                      isThisSegmentQueued
                                        ? 'bg-amber-500/25 text-amber-200 border-amber-400'
                                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                                    }`}
                                    title="Thêm đoạn này vào danh sách cắt nhiều đoạn"
                                  >
                                    {isThisSegmentQueued ? (
                                      <>
                                        <CheckSquare className="w-3 h-3 text-amber-300" />
                                        <span>Đã chọn</span>
                                      </>
                                    ) : (
                                      <>
                                        <Square className="w-3 h-3" />
                                        <span>+ Chọn thêm</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    disabled={isCuttingYouTube && cuttingCardId === yt.id}
                                    onClick={() => {
                                      if (isCuttingYouTube) return;
                                      handleCutAndInsertYouTubeVideos(yt, true);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold bg-sky-500/20 hover:bg-sky-500/35 disabled:opacity-60 text-sky-200 border border-sky-400/50 transition-colors"
                                    title="Cắt đoạn này, thay thế vào Phần đang chọn và đóng cửa sổ ngay"
                                  >
                                    {isCuttingYouTube && cuttingCardId === yt.id ? (
                                      <>
                                        <Loader2 className="w-3 h-3 animate-spin shrink-0 text-sky-300" />
                                        <span className="truncate">Đang cắt nhanh...</span>
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-3 h-3 shrink-0 text-sky-300" />
                                        <span className="truncate">
                                          ⚡ Cắt Thay Vào{' '}
                                          {getSceneBadgeById(chosenSceneId)
                                            .split(' (')[0]
                                            .replace('Đoạn', 'Phần')}{' '}
                                          &amp; Đóng
                                        </span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {youtubeVideos.length > 0 && (
                    <div className="pt-2 flex items-center justify-center">
                      <button
                        type="button"
                        disabled={isLoading || isLoadingMore}
                        onClick={() => {
                          const next = cycleOffset + 1;
                          setCycleOffset(next);
                          executeSearch(searchQuery, next, effectiveScene?.id, true);
                        }}
                        className="px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 disabled:opacity-50 text-slate-950 shadow-lg flex items-center gap-2 transition-all"
                      >
                        {isLoadingMore ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Đang tìm thêm hàng loạt video ngoài...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            <span>
                              ➕ Tải Thêm Nhiều Video Hơn (Trang #{cycleOffset + 2} · Đang có {youtubeVideos.length} video)
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION B: Real Photos (when scene needs an image or Grok/Kling reference photo) */}
              {(filterTab === 'all' || filterTab === 'image') && effectiveScene && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span>
                        Chọn Ảnh Đơn Sạch Đẹp Để Vẽ Video (Đã Lọc Bỏ Ảnh Tổng Hợp / Ghép) — Cảnh {sceneNumLabel} ({combinedPhotos.length} ảnh)
                      </span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {combinedPhotos.map((photo, idx) => {
                      const isPortraitRatio = (photo.width || 720) <= (photo.height || 960) * 1.02;
                      return (
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
                              className="w-full h-full object-cover object-top"
                            />
                            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-600/90 text-white">
                              Ảnh Đơn #{idx + 1}
                            </span>
                            {isPortraitRatio && (
                              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/80 text-amber-300 border border-amber-400/40">
                                ✨ Vẽ Video Đẹp
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[11px] font-semibold text-slate-200 line-clamp-1"
                            title={photo.title}
                          >
                            {photo.title}
                          </p>
                        </div>

                        <div className="space-y-1">
                          {effectiveScene.sceneType === 'video' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectPhotoForScene(
                                    effectiveScene.id,
                                    photo,
                                    'keep-video-grok-ref'
                                  );
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
                                  onSelectPhotoForScene(
                                    effectiveScene.id,
                                    photo,
                                    'set-as-image-scene'
                                  );
                                  onClose();
                                }}
                                className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-colors"
                              >
                                <ImageIcon className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  Dùng Làm Ảnh Tĩnh Cảnh {sceneNumLabel}
                                </span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectPhotoForScene(
                                  effectiveScene.id,
                                  photo,
                                  'set-as-image-scene'
                                );
                                onClose();
                              }}
                              className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                Chọn Ảnh Này Cho Cảnh {sceneNumLabel}
                              </span>
                            </button>
                          )}
                        </div>
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
